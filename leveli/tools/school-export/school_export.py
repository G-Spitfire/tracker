#!/usr/bin/env python3
"""Local full-value school API capture. Never writes to diary, Firebase or grade files."""
import argparse
import asyncio
import json
import os
import re
import signal
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

HOST = 'dnevnik2.petersburgedu.ru'
BASE = Path.home() / 'Library/Application Support/SpbSchoolGradesProbe'
MAX_BODY = 16 * 1024 * 1024
SECRET_NAMES = frozenset("""password passwd passwordhash cookie cookies setcookie authorization
proxyauthorization credential credentials authentication auth authidentity externalidentity
secret clientsecret token accesstoken refreshtoken idtoken session sessionid sessionkey
sessiontoken sso ssotoken ssokey ssokeyurl csrf csrftoken xsrf xsrftoken apikey accesskey
privatekey signature sig jwt sid xamzsignature xamzcredential xamzsecuritytoken debug headers""".split())
MAX_PENDING = 4


def is_secret_name(name):
    return re.sub(r'[^a-z0-9]', '', name.lower()) in SECRET_NAMES


# Identity/configuration responses are irrelevant to this export.
EXCLUDED = {'user', 'person', 'esa', 'environment-config', 'auth', 'authentication', 'login', 'oauth'}


def clean_text(value):
    value = re.sub(r'(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+', '[AUTH REMOVED]', value)
    value = re.sub(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b', '[JWT REMOVED]', value)
    # Signed attachment URLs may contain credentials. Keep the resource and school parameters.
    def clean_url(match):
        raw = match.group(0)
        try:
            parts = urlsplit(raw)
            host = parts.hostname or ''
            if parts.port:
                host += ':' + str(parts.port)
            query = [(k, clean_text(v)) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                     if not is_secret_name(k)]
            return urlunsplit((parts.scheme, host, parts.path, urlencode(query), ''))
        except ValueError:
            return '[INVALID URL REMOVED]'
    return re.sub(r'https?://[^\s<>"\']+', clean_url, value)


def sanitize(value):
    """Retain all learning fields/values; remove credential fields recursively."""
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items() if not is_secret_name(k)}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return clean_text(value) if isinstance(value, str) else value


def request_metadata(url, method):
    parts = urlsplit(url)
    segments = parts.path.strip('/').split('/')
    if (parts.scheme != 'https' or parts.netloc != HOST or method not in {'GET', 'POST'}
            or len(segments) < 3 or segments[0] != 'api'
            or any(s.lower() in EXCLUDED or is_secret_name(s) for s in segments[1:])):
        return None
    # Observe only existing diary responses. Never save headers; JSON filters are sanitized.
    return {'method': method, 'endpoint': parts.path,
            'query': [[k, clean_text(v)] for k, v in parse_qsl(parts.query, keep_blank_values=True)
                      if not is_secret_name(k)]}


def make_record(url, method, status, body, post_data=None):
    meta = request_metadata(url, method)
    if meta is None:
        return None
    if post_data:
        try:
            parsed = json.loads(post_data)
            if not isinstance(parsed, (dict, list)):
                raise ValueError('Expected structured JSON')
            meta['json_body'] = sanitize(parsed)
        except (ValueError, RecursionError):
            meta['request_body_omitted'] = True
    meta.update(status=status, api_ok=(status == 200 and isinstance(body, dict) and isinstance(body.get('data'), (dict, list)) and not body.get('validations') and not body.get('messages')), captured_at=datetime.now(timezone.utc).isoformat(), response=sanitize(body))
    return meta


def field_paths(value, prefix=''):
    result = set()
    if isinstance(value, dict):
        for k, v in value.items():
            path = prefix + '.' + k if prefix else k
            result.add(path)
            result.update(field_paths(v, path))
    elif isinstance(value, list):
        for v in value:
            result.update(field_paths(v, prefix + '[]'))
    return result


def summarize(records):
    endpoints = {}
    successful = 0
    for r in records:
        successful += bool(r.get("api_ok"))
        key = (r['method'], r['endpoint'])
        e = endpoints.setdefault(key, {'method': key[0], 'endpoint': key[1], 'responses': 0,
                                      'fields': set(), 'statuses': set(), 'total_pages': set()})
        e['responses'] += 1
        e['statuses'].add(r['status'])
        e['fields'].update(field_paths(r['response']))
        data = r['response'].get('data', {}) if isinstance(r['response'], dict) else {}
        if isinstance(data, dict) and isinstance(data.get('total_pages'), int):
            e['total_pages'].add(data['total_pages'])
    return {'complete_export': False, 'successful_responses': successful,
            'note': 'Observed responses only. Children, date ranges and all pages must be verified separately.',
            'endpoints': [{k: sorted(v) if isinstance(v, set) else v for k, v in e.items()}
                          for e in endpoints.values()]}


def write_private(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        json.dump(data, out, ensure_ascii=False, indent=2)
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())


class CaptureSink:
    """Keep raw data on disk only; bounded capture, summary reads one response at a time."""
    def __init__(self, folder, max_responses=2000, max_bytes=128 * 1024 * 1024):
        self.folder = folder
        self.max_responses = max_responses
        self.max_bytes = max_bytes
        self.count = 0
        self.bytes = 0
        self.limit_reached = False
        self.all_ok = True

    def save(self, record):
        size = len((json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
        if self.count >= self.max_responses or self.bytes + size > self.max_bytes:
            self.limit_reached = True
            return False
        write_private(self.folder / ('response-%06d.json' % (self.count + 1)), record)
        self.count += 1
        self.bytes += size
        self.all_ok = self.all_ok and record.get('api_ok', False)
        return True

    def summary(self):
        result = summarize(json.loads(p.read_text(encoding='utf-8'))
                           for p in sorted(self.folder.glob('response-*.json')))
        result['limit_reached'] = self.limit_reached
        return result


async def capture(args):
    for key in ('DEBUG', 'PWDEBUG', 'DEBUG_FILE'):
        os.environ.pop(key, None)
    from playwright.async_api import async_playwright
    if not args.profile.is_dir():
        print('Существующий профиль не найден. Авторизация не менялась.')
        return 1
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    session = args.output_dir / ('school-export-' + stamp)
    session.mkdir(parents=True, mode=0o700)
    sink, pending = CaptureSink(session), set()
    stats = {'errors': 0, 'oversize': 0, 'non_json': 0, 'overload': 0}
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    async def receive(response):
        if request_metadata(response.url, response.request.method) is None:
            return
        try:
            content_type = await response.header_value('content-type') or ''
            if 'json' not in content_type.lower():
                stats['non_json'] += 1
                return
            length = await response.header_value('content-length')
            if length and int(length) > MAX_BODY:
                stats['oversize'] += 1
                return
            raw = await response.body()
            if len(raw) > MAX_BODY:
                stats['oversize'] += 1
                return
            record = make_record(response.url, response.request.method, response.status, json.loads(raw), response.request.post_data)
            # No await between assigning index and saving: concurrent responses cannot collide.
            if not sink.save(record):
                stop.set()
                return
            print('Сохранён ответ:', record['endpoint'], 'HTTP', record['status'], flush=True)
        except Exception as exc:
            stats['errors'] += 1
            print('Ответ не сохранён:', type(exc).__name__, flush=True)

    def schedule(response):
        if request_metadata(response.url, response.request.method) is None:
            return
        if len(pending) >= MAX_PENDING:
            stats['overload'] += 1
            return
        task = asyncio.create_task(receive(response))
        pending.add(task)
        task.add_done_callback(pending.discard)

    try:
        async with async_playwright() as pw:
            context = await pw.chromium.launch_persistent_context(
                str(args.profile), headless=args.probe, accept_downloads=False,
                viewport={'width': 1280, 'height': 900})
            try:
                if args.probe:
                    # One read-only check of the already known lesson API. Parameter template
                    # is a hypothesis, not evidence of the lesson selector or a complete export.
                    config = json.loads((BASE / 'collector-config.json').read_text())
                    for student in config['students']:
                        params = student['request_params']
                        response = await context.request.get(
                            'https://' + HOST + '/api/journal/lesson/list-by-dates',
                            params=params, timeout=30000)
                        ctype = response.headers.get('content-type', '')
                        if 'json' not in ctype:
                            print('API вернул не JSON; HTTP', response.status)
                            stats['non_json'] += 1
                            continue
                        record = make_record(response.url, 'GET', response.status, await response.json())
                        record['parameter_source'] = 'existing grade template; lesson selector unverified'
                        if not sink.save(record):
                            break
                        print('Проверка API:', response.status, flush=True)
                else:
                    context.on('response', schedule)
                    context.on('close', lambda *_: stop.set())
                    print('Сбор включён. В этом окне откройте дневник для обоих детей.', flush=True)
                    print('Расписание → урок с домашкой → посещаемость → вход/выход → контрольные.', flush=True)
                    print('Просмотрите все нужные страницы/даты. Для окончания Ctrl+C в терминале.', flush=True)
                    await stop.wait()
                    context.remove_listener('response', schedule)
                    if pending:
                        done, unfinished = await asyncio.wait(pending, timeout=15)
                        for task in unfinished:
                            task.cancel()
                        await asyncio.gather(*unfinished, return_exceptions=True)
                        stats['errors'] += len(unfinished)
            finally:
                await context.close()
    except Exception as exc:
        stats['errors'] += 1
        print('Браузер/API недоступен:', type(exc).__name__, '(секреты и URL ошибок не выводятся).')
    summary = sink.summary()
    summary['capture_stats'] = stats
    write_private(session / 'summary.json', summary)
    print('Локальные файлы:', session)
    print('Ответов:', sink.count, '; ошибки:', stats)
    return 0 if sink.count and sink.all_ok and not sink.limit_reached and not any(stats.values()) else 1


def extract_attendance(package):
    """Extract only the attendance type actually observed in the working grade export."""
    students = package.get('students')
    if not isinstance(students, dict) or not students:
        raise ValueError('Source must contain students')
    result = {'source_endpoint': '/api/journal/estimate/table',
              'source_updated_at': package.get('updated_at'),
              'range_from': package.get('range_from'), 'range_to': package.get('range_to'),
              'complete_export': False, 'source_record_count': 0, 'attendance_count': 0,
              'note': 'Attendance records from existing grade export only. Does not prove presence or passage times.',
              'students': {}}
    for eid, student in students.items():
        rows = student.get('grades')
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError('Invalid grade records')
        attendance = [sanitize(row) for row in rows if str(row.get('estimate_type_code')) == '30000']
        result['students'][eid] = {'label': student.get('label'), 'attendance': attendance,
                                   'attendance_count': len(attendance)}
        result['source_record_count'] += len(rows)
        result['attendance_count'] += len(attendance)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--capture', action='store_true', help='Пассивно сохранить полные учебные ответы при ручном просмотре')
    modes.add_argument('--probe', action='store_true', help='Два GET к известному API уроков через существующую сессию')
    modes.add_argument('--from-grades', type=Path, help='Выделить посещаемость из существующей выгрузки без браузера')
    modes.add_argument('--inspect', type=Path, help='Показать поля уже сохранённой папки без браузера')
    parser.add_argument('--profile', type=Path, default=BASE / 'browser-profile')
    parser.add_argument('--output-dir', type=Path, default=Path.home() / 'Documents/ChatGPT/Leveli/school-export-private')
    args = parser.parse_args()
    if args.from_grades:
        result = extract_attendance(json.loads(args.from_grades.read_text(encoding='utf-8')))
        path = args.output_dir / ('attendance-from-grades-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json')
        write_private(path, result)
        print('Записей посещаемости:', result['attendance_count'])
        print('Локальный файл:', path)
        return 0
    if args.inspect:
        records = (json.loads(p.read_text(encoding='utf-8')) for p in sorted(args.inspect.glob('response-*.json')))
        print(json.dumps(summarize(records), ensure_ascii=False, indent=2))
        return 0
    return asyncio.run(capture(args))


if __name__ == '__main__':
    raise SystemExit(main())
