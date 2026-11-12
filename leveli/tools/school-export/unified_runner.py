#!/usr/bin/env python3
"""Isolated local scheduler. Never authorizes network access by installation."""
import argparse
import asyncio
from contextlib import contextmanager
import copy
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import plistlib
import re
import signal
import subprocess
import sys
import tempfile
import uuid
from zoneinfo import ZoneInfo

import unified_school as u

MOSCOW = ZoneInfo('Europe/Moscow')
LABEL = 'local.family.leveli-unified-school'
RUNTIME = Path.home() / 'Library/Application Support/LeveliUnifiedSchool'
DEFAULT_STATE = RUNTIME / 'data'
DEPENDENTS = {'grades': ('attendance',), 'lessons': ('homework',)}


def classify_vpn(connections, proxy, network):
    """Fail closed; do not mistake an inactive registered VPN for no tunnel."""
    if not connections.startswith('Available network connection services'):
        return 'unknown'
    for line in connections.splitlines()[1:]:
        if not line.strip():
            continue
        state = re.search(r'\(([^)]+)\)', line)
        if state is None:
            return 'unknown'
        if state.group(1) != 'Disconnected':
            return 'blocked' if state.group(1) in ('Connected', 'Connecting', 'Disconnecting') else 'unknown'
    if not proxy.strip().startswith('<dictionary> {') or not proxy.strip().endswith('}'):
        return 'unknown'
    for line in proxy.splitlines():
        if 'Enable' in line:
            match = re.search(r'\b\w*Enable\s*:\s*([01])\s*$', line)
            if match is None:
                return 'unknown'
            if match.group(1) == '1':
                return 'blocked'
    if 'Network information' not in network or 'registration failed' in network.lower():
        return 'unknown'
    active = re.search(r'^Network interfaces:\s*(.+)$', network, re.MULTILINE)
    if active is None or not active.group(1).strip():
        return 'unknown'
    interfaces = active.group(1).split()
    if 'VPN server' in network or any(re.match(r'(utun|tun|tap|ppp|ipsec)\d+', x) for x in interfaces):
        return 'blocked'
    if not all(re.fullmatch(r'(en|bridge)\d+', x) for x in interfaces):
        return 'unknown'
    return 'clear'


def vpn_state():
    outputs = []
    try:
        for option in ('--nc', '--proxy', '--nwi'):
            command = ['/usr/sbin/scutil', option] + (['list'] if option == '--nc' else [])
            result = subprocess.run(command, capture_output=True, text=True, timeout=3)
            if result.returncode != 0 or result.stderr.strip():
                return 'unknown'
            outputs.append(result.stdout)
    except (OSError, subprocess.TimeoutExpired):
        return 'unknown'
    return classify_vpn(*outputs)


def require_vpn_clear():
    state = vpn_state()
    if state != 'clear':
        raise u.CollectorError('vpn_' + state)


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(prefix='.unified-', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def log(root, event, **fields):
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = root / 'runner.jsonl'
    # Bound routine log growth; attempt snapshots and good data are never rotated.
    if path.exists() and path.stat().st_size > 2 * 1024 * 1024:
        os.replace(path, root / 'runner.previous.jsonl')
    with os.fdopen(os.open(str(path), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600), 'a') as stream:
        stream.write(json.dumps({'at': datetime.now(MOSCOW).isoformat(),
                                 'event': event, **fields}, ensure_ascii=False) + '\n')


@contextmanager
def locked(path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield None
        else:
            yield fd
    finally:
        os.close(fd)


def slot(now):
    now = now.astimezone(MOSCOW)
    if now.weekday() < 5 and 13 <= now.hour <= 19:
        return now.strftime('%Y-%m-%dT%H')
    return None


def claim_slot(root, key):
    path = root / 'slots.json'
    ledger = json.loads(path.read_text()) if path.exists() else {}
    if key in ledger:
        return False
    ledger = {k: v for k, v in ledger.items() if k[:10] >= key[:10]}
    ledger[key] = 'attempted'
    atomic(path, ledger)
    return True


def authorize(root, now):
    atomic(root / 'vpn-once.json', {'expires': (now + timedelta(minutes=10)).isoformat()})


def consume_permission(root, now):
    path = root / 'vpn-once.json'
    if not path.exists():
        return False
    try:
        token = json.loads(path.read_text())
        return now < datetime.fromisoformat(token['expires']) <= now + timedelta(minutes=10)
    except (ValueError, KeyError, TypeError):
        return False
    finally:
        path.unlink(missing_ok=True)


def save_checkpoint(root, attempt, out):
    # Every source checkpoint is durable even if a later source hangs or fails.
    atomic(root / ('attempt-' + attempt + '.json'), out)
    path = root / 'latest-good.json'
    good = json.loads(path.read_text()) if path.exists() else {'students': {}}
    good['mixed_snapshot'] = True
    good['complete_export'] = False
    for label, child in out['students'].items():
        saved = good['students'].setdefault(label, {'education_id': child['education_id'],
                                                   'source_updates': {}})
        if saved['education_id'] != child['education_id']:
            raise ValueError('configured_identity_changed')
        for kind in u.KINDS:
            if child['coverage'][kind]['complete']:
                for category in (kind, *DEPENDENTS.get(kind, ())):
                    saved[category] = copy.deepcopy(child[category])
                saved['source_updates'][kind] = {
                    'updated_at': out['updated_at'], 'range_from': out['range_from'],
                    'range_to': out['range_to'], 'attempt': attempt}
    atomic(path, good)
    if out['complete_export']:
        atomic(root / 'latest-complete.json', out)


def supervise(command, timeout, pass_fds=()):
    proc = subprocess.Popen(command, start_new_session=True, pass_fds=pass_fds,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    def stop(signum=None, frame=None):
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            pass
        finally:
            # Chromium descendants may outlive their Python parent.
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
        if signum is not None:
            raise SystemExit(128 + signum)
    previous = {s: signal.signal(s, stop) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        try:
            return proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            stop()
            return 124
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)


def prepare_runtime(runtime):
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ('unified_runner.py', 'unified_school.py', 'school_export.py', 'homework_upload.py'):
        source = Path(__file__).resolve().parent / name
        target = runtime / name
        if source != target:
            fd, tmp = tempfile.mkstemp(prefix='.runtime-', dir=str(runtime))
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(source.read_bytes())
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(tmp, target)
            finally:
                Path(tmp).unlink(missing_ok=True)
    return runtime / 'unified_runner.py'


def launch_agent(python, root, runner=None, auto_vpn=False, upload_homework=False):
    runner = runner or Path(__file__).resolve()
    return {
        'Label': LABEL,
        'ProgramArguments': [str(python), str(runner), '--state-dir', str(root)] + (['--auto-vpn'] if auto_vpn else []) + (['--upload-homework'] if upload_homework else []),
        'WorkingDirectory': str(runner.parent),
        'StartCalendarInterval': [{'Weekday': d, 'Hour': h, 'Minute': 0}
                                  for d in range(1, 6) for h in range(13, 20)],
        # Calendar is in host timezone; a heartbeat plus Moscow slot guard also
        # works after travel/timezone changes and coalesced wake events.
        'StartInterval': 300, 'RunAtLoad': True, 'ProcessType': 'Background',
        'ExitTimeOut': 10, 'Umask': 63,
        'StandardOutPath': str(root / 'launchd.log'),
        'StandardErrorPath': str(root / 'launchd-errors.log'),
    }


def arguments(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--install', action='store_true')
    modes.add_argument('--render-plist', type=Path)
    modes.add_argument('--authorize-next', action='store_true')
    modes.add_argument('--run-now', action='store_true')
    modes.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    p.add_argument('--vpn-off-confirmed', action='store_true')
    p.add_argument('--auto-vpn', action='store_true', help='User-authorized automatic local VPN gate')
    p.add_argument('--upload-homework', action='store_true', help='Opt-in homework-only Firebase upload after both lessons sources complete')
    p.add_argument('--offline-check', action='store_true')
    p.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    p.add_argument('--config', type=Path, default=u.BASE / 'collector-config.json')
    p.add_argument('--profile', type=Path, default=u.BASE / 'browser-profile')
    p.add_argument('--shared-lock', type=Path, default=u.BASE / 'retry/sync.lock')
    p.add_argument('--timeout', type=int, default=900)
    p.add_argument('--attempt', default='')
    args = p.parse_args(argv)
    if not 1 <= args.timeout <= 900:
        p.error('timeout must be between 1 and 900 seconds')
    if args.authorize_next and not args.vpn_off_confirmed:
        p.error('Сначала отключите VPN и подтвердите --vpn-off-confirmed')
    return args


def worker(args):
    # Parent permission is consumed before spawn; private worker entry is also gated.
    if not args.vpn_off_confirmed or not args.attempt:
        return 2
    students = u.validate_students(json.loads(args.config.read_text())['students'])
    today = datetime.now(MOSCOW).date()
    year = today.year if today.month >= 9 else today.year - 1
    args.date_from = str(year) + '-09-01'
    args.date_to = (today + timedelta(days=14)).isoformat()
    def checkpoint(out):
        save_checkpoint(args.state_dir, args.attempt, out)
    args.checkpoint = checkpoint
    if args.auto_vpn:
        args.network_guard = require_vpn_clear
        require_vpn_clear()
    out = asyncio.run(u.live(args, students))
    checkpoint(out)
    log(args.state_dir, 'collected', attempt=args.attempt, complete=out['complete_export'],
        errors=out['errors'], counts={label: {k: len(s[k]) for k in (*u.KINDS, 'attendance', 'homework')}
                                     for label, s in out['students'].items()})
    if args.upload_homework and all(child['coverage']['lessons']['complete'] for child in out['students'].values()):
        import homework_upload
        homework_upload.push(args.state_dir / 'latest-good.json', config=args.config)
        log(args.state_dir, 'homework_uploaded', attempt=args.attempt)
    return 0 if out['complete_export'] else 1


def run(args):
    root = args.state_dir.resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    now = datetime.now(MOSCOW)
    if args.render_plist or args.install:
        python = Path(sys.executable).absolute()  # preserve the venv path
        target = args.render_plist or Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
        target.parent.mkdir(parents=True, exist_ok=True)
        runner = prepare_runtime(RUNTIME) if args.install else None
        data = plistlib.dumps(launch_agent(python, root, runner=runner, auto_vpn=args.auto_vpn, upload_homework=args.upload_homework))
        target.write_bytes(data)
        target.chmod(0o600)
        subprocess.run(['/usr/bin/plutil', '-lint', str(target)], check=True)
        if args.install:
            service = 'gui/' + str(os.getuid())
            subprocess.run(['/bin/launchctl', 'bootout', service + '/' + LABEL],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['/bin/launchctl', 'bootstrap', service, str(target)], check=True)
        print(target)
        return 0
    if args.worker:
        return worker(args)
    with locked(root / 'runner.lock') as own:
        if own is None:
            return 0
        if args.authorize_next:
            authorize(root, now)
            log(root, 'vpn_permission_once_10_minutes')
            return 0
        key = slot(now)
        if not args.run_now and key is None:
            return 0
        # Offline/blocked ticks do not even open the old collector's lock.
        vpn = vpn_state() if args.auto_vpn and not args.offline_check else None
        if args.offline_check or (args.auto_vpn and vpn != 'clear') or not (args.auto_vpn or (args.run_now and args.vpn_off_confirmed)
                                      or (root / 'vpn-once.json').exists()):
            notice = root / 'blocked-slot.json'
            previous = json.loads(notice.read_text()) if notice.exists() else None
            notice_key = [key, vpn]
            if args.run_now or previous != notice_key:
                log(root, 'offline_check' if args.offline_check else 'blocked_vpn', slot=key, vpn=vpn)
                atomic(notice, notice_key)
            return 0
        with locked(args.shared_lock) as shared:
            if shared is None:
                log(root, 'busy_shared_profile')
                return 0
            ledger_path = root / 'slots.json'
            ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {}
            if not args.run_now and key in ledger:
                return 0
            confirmed = (args.auto_vpn and vpn == 'clear') or (args.run_now and args.vpn_off_confirmed) or consume_permission(root, now)
            if not confirmed:
                log(root, 'blocked_vpn', slot=key)
                return 0
            if not args.run_now:
                claim_slot(root, key)
            attempt = now.strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8]
            log(root, 'started', attempt=attempt, slot=key, timeout=args.timeout)
            command = [sys.executable, str(Path(__file__).resolve()), '--worker',
                       '--vpn-off-confirmed', '--attempt', attempt, '--state-dir', str(root),
                       '--config', str(args.config), '--profile', str(args.profile)]
            if args.auto_vpn:
                command.append('--auto-vpn')
            if args.upload_homework:
                command.append('--upload-homework')
            # Prevent idle sleep during this attempt, without changing Mac settings.
            if Path('/usr/bin/caffeinate').exists():
                command = ['/usr/bin/caffeinate', '-i'] + command
            code = supervise(command, args.timeout, (own, shared))
            log(root, 'timeout' if code == 124 else 'finished', attempt=attempt, exit_code=code)
            return code


def main():
    try:
        return run(arguments())
    except Exception as exc:
        # Never log arbitrary exception messages: may contain credentials/URLs.
        print('Ошибка локального запускателя:', type(exc).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
