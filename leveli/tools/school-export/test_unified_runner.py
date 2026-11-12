import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import contextlib
import io

import unified_school as u
try:
    import unified_runner as r
except ImportError:
    r = None


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(r, 'isolated launchd runner is missing')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_moscow_slots_independent_of_host_timezone(self):
        self.assertEqual(r.slot(datetime(2026, 11, 11, 10, tzinfo=timezone.utc)), '2026-11-11T13')
        self.assertIsNone(r.slot(datetime(2026, 11, 14, 10, tzinfo=timezone.utc)))
        self.assertIsNone(r.slot(datetime(2026, 11, 11, 17, tzinfo=timezone.utc)))
        self.assertEqual(len({r.slot(datetime(2026, 11, 11, h, tzinfo=timezone.utc)) for h in range(10, 17)}), 7)

    def test_partial_checkpoint_preserves_failed_source_and_derived_categories(self):
        students = [{'label': 'polina', 'education_id': 11}, {'label': 'matvey', 'education_id': 22}]
        old = u.package(students, '2026-09-01', '2026-11-15', 'live')
        for child in old['students'].values():
            for kind in u.KINDS:
                child['coverage'][kind] = {'complete': True, 'status': 'all_pages'}
            child['grades'] = [{'id': 1, 'estimate_type_code': '30000'}]
        old = u.finish(old)
        r.save_checkpoint(self.root, 'one', old)
        partial = u.package(students, '2026-09-01', '2026-11-15', 'live')
        partial['students']['polina']['coverage']['lessons'] = {'complete': True, 'status': 'all_pages'}
        r.save_checkpoint(self.root, 'two', u.finish(partial))
        latest = json.loads((self.root / 'latest-good.json').read_text())
        self.assertEqual(latest['students']['polina']['grades'], old['students']['polina']['grades'])
        self.assertEqual(latest['students']['polina']['attendance'], old['students']['polina']['attendance'])
        self.assertEqual(latest['students']['polina']['lessons'], [])
        self.assertEqual(json.loads((self.root / 'attempt-one.json').read_text()), old)
        self.assertTrue((self.root / 'latest-complete.json').exists())
        self.assertEqual((self.root / 'latest-good.json').stat().st_mode & 0o777, 0o600)

    def test_permission_single_use_and_expiring(self):
        now = datetime(2026, 11, 11, 10, tzinfo=timezone.utc)
        self.assertFalse(r.consume_permission(self.root, now))
        r.authorize(self.root, now)
        self.assertTrue(r.consume_permission(self.root, now))
        self.assertFalse(r.consume_permission(self.root, now))
        r.authorize(self.root, now)
        self.assertFalse(r.consume_permission(self.root, datetime(2026, 11, 11, 11, tzinfo=timezone.utc)))

    def test_real_lock_conflict_and_release(self):
        lock = self.root / 'sync.lock'
        with r.locked(lock) as fd:
            self.assertIsInstance(fd, int)
            with r.locked(lock) as other:
                self.assertIsNone(other)
        with r.locked(lock) as fd:
            self.assertIsInstance(fd, int)

    def test_real_timeout(self):
        result = r.supervise([sys.executable, '-c', 'import time; time.sleep(20)'], 0.1)
        self.assertEqual(result, 124)

    def test_launchd_calendar_and_heartbeat(self):
        p = r.launch_agent(Path(sys.executable), self.root)
        self.assertEqual(len(p['StartCalendarInterval']), 35)
        self.assertEqual({x['Hour'] for x in p['StartCalendarInterval']}, set(range(13, 20)))
        self.assertEqual({x['Weekday'] for x in p['StartCalendarInterval']}, set(range(1, 6)))
        self.assertEqual(p['StartInterval'], 300)
        self.assertFalse(p.get('KeepAlive', False))
        self.assertNotIn('--vpn-off-confirmed', p['ProgramArguments'])

    def test_slot_ledger_allows_next_hour_after_success_or_failure(self):
        for status in ('success', 'failed'):
            root = self.root / status
            root.mkdir()
            self.assertTrue(r.claim_slot(root, '2026-11-11T13'))
            r.log(root, status)
            self.assertFalse(r.claim_slot(root, '2026-11-11T13'))
            self.assertTrue(r.claim_slot(root, '2026-11-11T14'))

    def test_missing_permission_never_starts_worker(self):
        args = r.arguments(['--state-dir', str(self.root), '--shared-lock', str(self.root / 'shared.lock'), '--run-now'])
        self.assertEqual(r.run(args), 0)
        self.assertIn('blocked_vpn', (self.root / 'runner.jsonl').read_text())
        self.assertFalse((self.root / 'latest-good.json').exists())



class CheckpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_each_completed_source_saved_before_next_request(self):
        snapshots = []
        calls = []
        async def fetch(path, params):
            calls.append(path)
            if len(calls) > 1:
                self.assertEqual(len(snapshots), len(calls) - 1)
            return {'data': {'items': [], 'total_pages': 0, 'total_items': 0,
                             'current': 0, 'last': 0, 'next': 0}}
        result = await u.collect(fetch, [{'label': 'polina', 'education_id': 11},
                                        {'label': 'matvey', 'education_id': 22}],
                                 '2026-11-09', '2026-11-15',
                                 checkpoint=lambda out: snapshots.append(copy.deepcopy(out)))
        self.assertEqual(len(snapshots), 8)
        self.assertTrue(result['complete_export'])


class IntegrationTests(unittest.TestCase):
    def test_seven_independent_slots_even_after_success_failure_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            args = r.arguments(['--state-dir', folder, '--shared-lock', str(root / 'shared.lock')])
            class Clock(datetime):
                current = None
                @classmethod
                def now(cls, tz=None):
                    return cls.current.astimezone(tz)
            codes = iter([0, 1, 124, 0, 1, 0, 0])
            with patch.object(r, 'datetime', Clock), patch.object(r, 'supervise', side_effect=lambda *a: next(codes)) as run:
                for hour in range(10, 17):
                    Clock.current = datetime(2026, 11, 11, hour, tzinfo=timezone.utc)
                    r.authorize(root, Clock.current)
                    self.assertIn(r.run(args), (0, 1, 124))
                    self.assertEqual(r.run(args), 0)
                self.assertEqual(run.call_count, 7)
            self.assertEqual(len(json.loads((root / 'slots.json').read_text())), 7)

    def test_latest_complete_survives_later_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            students = [{'label': 'polina', 'education_id': 11}, {'label': 'matvey', 'education_id': 22}]
            out = u.package(students, '2026-09-01', '2026-11-15', 'live')
            for child in out['students'].values():
                for kind in u.KINDS:
                    child['coverage'][kind] = {'complete': True, 'status': 'all_pages'}
            r.save_checkpoint(root, 'ok', u.finish(out))
            before = (root / 'latest-complete.json').read_bytes()
            failed = u.package(students, '2026-09-01', '2026-11-15', 'live')
            failed['errors'] = [{'source': 'grades', 'error': 'TimeoutError'}]
            r.save_checkpoint(root, 'failed', failed)
            self.assertEqual((root / 'latest-complete.json').read_bytes(), before)
            self.assertTrue((root / 'attempt-failed.json').exists())

    def test_real_timeout_kills_descendant_group(self):
        with tempfile.TemporaryDirectory() as folder:
            pidfile = Path(folder) / 'child.pid'
            code = ('import subprocess,sys,time; '
                    'p=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"]); '
                    'open(sys.argv[1],"w").write(str(p.pid)); time.sleep(60)')
            self.assertEqual(r.supervise([sys.executable, '-c', code, str(pidfile)], 1), 124)
            pid = int(pidfile.read_text())
            # ps distinguishes a short-lived zombie from a running descendant.
            state = subprocess.run(['/bin/ps', '-o', 'stat=', '-p', str(pid)], capture_output=True, text=True).stdout.strip()
            self.assertTrue(not state or state.startswith('Z'), state)

class PermissionRecoveryTests(unittest.TestCase):
    def test_blocked_slot_can_be_authorized_later_same_hour(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            args = r.arguments(['--state-dir', folder, '--shared-lock', str(root / 'shared.lock')])
            class Clock(datetime):
                @classmethod
                def now(cls, tz=None):
                    return datetime(2026, 11, 11, 13, 5, tzinfo=r.MOSCOW).astimezone(tz)
            with patch.object(r, 'datetime', Clock), patch.object(r, 'supervise', return_value=0) as start:
                self.assertEqual(r.run(args), 0)
                r.authorize(root, Clock.now(r.MOSCOW))
                self.assertEqual(r.run(args), 0)
                self.assertEqual(start.call_count, 1)
                self.assertFalse((root / 'vpn-once.json').exists())

    def test_timeout_cannot_exceed_fifteen_minutes(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            r.arguments(['--timeout', '901'])



class RuntimeInstallTests(unittest.TestCase):
    def test_runtime_copy_avoids_documents_for_background_job(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime = Path(folder) / 'runtime'
            installed = r.prepare_runtime(runtime)
            self.assertEqual(installed, runtime / 'unified_runner.py')
            for name in ('unified_runner.py', 'unified_school.py', 'school_export.py'):
                self.assertEqual((runtime / name).read_bytes(), (Path(r.__file__).parent / name).read_bytes())
                self.assertEqual((runtime / name).stat().st_mode & 0o777, 0o600)
            p = r.launch_agent(Path(sys.executable), Path(folder) / 'data', runner=installed)
            self.assertEqual(p['ProgramArguments'][1], str(installed))
            self.assertEqual(p['WorkingDirectory'], str(runtime))




class ExpiredPermissionTests(unittest.TestCase):
    def test_expired_permission_does_not_consume_slot(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            args = r.arguments(['--state-dir', folder, '--shared-lock', str(root / 'shared.lock')])
            class Clock(datetime):
                @classmethod
                def now(cls, tz=None):
                    return datetime(2026, 11, 11, 13, 5, tzinfo=r.MOSCOW).astimezone(tz)
            with patch.object(r, 'datetime', Clock), patch.object(r, 'supervise', return_value=0) as start:
                r.authorize(root, Clock.now(r.MOSCOW) - r.timedelta(minutes=11))
                self.assertEqual(r.run(args), 0)
                r.authorize(root, Clock.now(r.MOSCOW))
                self.assertEqual(r.run(args), 0)
                self.assertEqual(start.call_count, 1)



class VpnAutoTests(unittest.TestCase):
    clear_nc = 'Available network connection services in the current set (*=enabled):\n* (Disconnected) ID VPN (provider) "VPN" [VPN:provider]\n'
    clear_proxy = '<dictionary> {\n FTPPassive : 1\n}\n'
    clear_nwi = 'Network information\nIPv4 network interface information\n en0 : flags : 0x5\nNetwork interfaces: en0\n'

    def test_strict_local_vpn_detection(self):
        self.assertEqual(r.classify_vpn(self.clear_nc, self.clear_proxy, self.clear_nwi), 'clear')
        self.assertEqual(r.classify_vpn(self.clear_nc.replace('Disconnected', 'Connected'), self.clear_proxy, self.clear_nwi), 'blocked')
        self.assertEqual(r.classify_vpn(self.clear_nc, self.clear_proxy, self.clear_nwi.replace('Network interfaces: en0', 'Network interfaces: utun8 en0')), 'blocked')
        self.assertEqual(r.classify_vpn(self.clear_nc, '<dictionary> {\n HTTPSProxyEnable : 1\n}', self.clear_nwi), 'blocked')
        self.assertEqual(r.classify_vpn(self.clear_nc, self.clear_proxy, 'nwi_state: registration failed (9)\nNo network information'), 'unknown')
        self.assertEqual(r.classify_vpn('', self.clear_proxy, self.clear_nwi), 'unknown')

    def test_auto_waits_for_vpn_without_claiming_hour_then_runs_once(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            args = r.arguments(['--auto-vpn', '--state-dir', folder, '--shared-lock', str(root / 'shared.lock')])
            class Clock(datetime):
                @classmethod
                def now(cls, tz=None):
                    return datetime(2026, 11, 11, 13, 5, tzinfo=r.MOSCOW).astimezone(tz)
            with patch.object(r, 'datetime', Clock), patch.object(r, 'vpn_state', return_value='blocked') as vpn, patch.object(r, 'supervise', return_value=0) as start:
                self.assertEqual(r.run(args), 0)
                self.assertEqual(start.call_count, 0)
                vpn.return_value = 'unknown'
                self.assertEqual(r.run(args), 0)
                self.assertEqual(start.call_count, 0)
                vpn.return_value = 'clear'
                self.assertEqual(r.run(args), 0)
                self.assertEqual(r.run(args), 0)
                self.assertEqual(start.call_count, 1)
                self.assertIn('--auto-vpn', start.call_args.args[0])

    def test_installed_autorun_checks_every_five_minutes(self):
        with tempfile.TemporaryDirectory() as folder:
            p = r.launch_agent(Path(sys.executable), Path(folder), auto_vpn=True)
            self.assertEqual(p['StartInterval'], 300)
            self.assertIn('--auto-vpn', p['ProgramArguments'])


class VpnRequestGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_vpn_reenabled_prevents_api_request(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        get = AsyncMock()
        context = SimpleNamespace(request=SimpleNamespace(get=get))
        def guard():
            raise u.CollectorError('vpn_blocked')
        with self.assertRaisesRegex(u.CollectorError, 'vpn_blocked'):
            await u.api_json(context, '/', {}, network_guard=guard)
        get.assert_not_awaited()



class BrowserVpnTests(unittest.IsolatedAsyncioTestCase):
    async def test_auto_browser_blocks_service_workers_and_aborts_when_vpn_returns(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        context = SimpleNamespace(close=AsyncMock(), route=AsyncMock())
        launch = AsyncMock(return_value=context)
        class Manager:
            async def __aenter__(self):
                return SimpleNamespace(chromium=SimpleNamespace(launch_persistent_context=launch))
            async def __aexit__(self, *args):
                return False
        blocked = False
        def guard():
            if blocked:
                raise u.CollectorError('vpn_blocked')
        students = [{'label': 'polina', 'education_id': 11}, {'label': 'matvey', 'education_id': 22}]
        with tempfile.TemporaryDirectory() as folder:
            args = SimpleNamespace(profile=Path(folder), date_from='2026-11-09', date_to='2026-11-15', network_guard=guard)
            with patch.dict(sys.modules, {'playwright.async_api': SimpleNamespace(async_playwright=Manager)}), patch.object(u, 'collect_session', AsyncMock(return_value={})):
                await u.live(args, students)
        self.assertEqual(launch.call_args.kwargs.get('service_workers'), 'block')
        handler = context.route.call_args.args[1]
        route = SimpleNamespace(abort=AsyncMock(), continue_=AsyncMock())
        await handler(route)
        route.continue_.assert_awaited_once()
        blocked = True
        await handler(route)
        route.abort.assert_awaited_once()
        self.assertEqual(route.continue_.await_count, 1)


if __name__ == '__main__':
    unittest.main()
