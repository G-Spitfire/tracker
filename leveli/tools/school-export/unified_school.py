#!/usr/bin/env python3
"""Read-only local school export. Default operation is offline archive replay."""
import argparse
import asyncio
from datetime import date, datetime, timedelta
import hashlib
import json
from pathlib import Path
import zipfile

from school_export import BASE, HOST, sanitize, write_private

PATHS = {
    'grades': '/api/journal/estimate/table',
    'lessons': '/api/journal/lesson/list-by-education',
    'schedule': '/api/journal/schedule/list-by-education',
    'access': '/api/journal/acs/list',
}
KINDS = ('grades', 'lessons', 'schedule', 'access')
MAX_PAGES = 500
MAX_ITEMS = 50000
GRADE_FIELDS = ('id', 'date', 'education_id', 'estimate_comment', 'estimate_type_code',
                'estimate_type_name', 'estimate_value_code', 'estimate_value_name',
                'lesson_id', 'subject_id', 'subject_name')


class CollectorError(ValueError):
    """Only static, local reason codes; never server or exception text."""


def parse_date(value):
    value = str(value or '')
    for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%Y.%m.%d'):
        try:
            return datetime.strptime(value[:10], fmt).date()
        except ValueError:
            pass
    raise CollectorError('invalid_date')


def date_range(start, end):
    start, end = date.fromisoformat(start), date.fromisoformat(end)
    if end < start:
        raise CollectorError('reversed_range')
    return start, end


def timestamp(value):
    return datetime.strptime(value, '%d.%m.%Y %H:%M:%S').isoformat() + '+03:00'


def validate_students(students):
    if (not isinstance(students, list) or len(students) != 2
            or {s.get('label') for s in students} != {'polina', 'matvey'}
            or len({str(s.get('education_id')) for s in students}) != 2
            or any(not str(s.get('education_id', '')).isdigit() or int(s['education_id']) <= 0 for s in students)):
        raise CollectorError('expected_two_distinct_configured_children')
    return students


def unwrap(payload):
    if not isinstance(payload, dict) or payload.get('messages') or payload.get('validations'):
        raise CollectorError('api_error')
    data = payload.get('data')
    if not isinstance(data, dict) or not isinstance(data.get('items'), list):
        raise CollectorError('invalid_items')
    if any(not isinstance(row, dict) for row in data['items']):
        raise CollectorError('invalid_row')
    return data


def identity(row):
    nested = row.get('identity')
    if nested is not None and not isinstance(nested, dict):
        raise CollectorError('invalid_identity')
    return row.get('id', (nested or {}).get('id'))


def stable_key(kind, row):
    if kind == 'grades':
        return (str(row.get('id')), str(row.get('estimate_type_code')))
    if kind in ('lessons', 'access') and identity(row) is not None:
        return str(identity(row))
    # Schedule has no identity. All fields are relevant to distinct lessons.
    return json.dumps(row, sort_keys=True, ensure_ascii=False)


async def fetch_pages(fetch, path, params):
    rows, seen = [], set()
    expected_pages = expected_total = None
    for page in range(1, MAX_PAGES + 1):
        query = dict(params, p_page=str(page))
        data = unwrap(await fetch(path, query))
        try:
            pages, total = int(data['total_pages']), int(data['total_items'])
        except (KeyError, ValueError, TypeError):
            raise CollectorError('missing_or_invalid_pagination')
        if pages < 0 or pages > MAX_PAGES or total < 0 or total > MAX_ITEMS:
            raise CollectorError('pagination_limit')
        # This endpoint returns an unpaginated list with zero counters.
        unpaginated_schedule = (path == PATHS['schedule'] and pages == total == 0
                                and all(data.get(k) == 0 for k in ('current', 'last', 'next')))
        pages = max(1, pages)
        if expected_pages is None:
            expected_pages, expected_total = pages, total
        if (pages, total) != (expected_pages, expected_total):
            raise CollectorError('pagination_changed')
        if not data['items'] and (total or pages > 1):
            raise CollectorError('unexpected_empty_page')
        for row in data['items']:
            key = str(identity(row)) if identity(row) is not None else json.dumps(row, sort_keys=True)
            if key in seen:
                raise CollectorError('repeated_page_or_row')
            seen.add(key)
            rows.append(row)
        if len(rows) > MAX_ITEMS:
            raise CollectorError('item_limit')
        if page == pages:
            if not unpaginated_schedule and len(rows) != total:
                raise CollectorError('total_mismatch')
            return rows
    raise CollectorError('page_limit')


def package(students, start, end, mode):
    validate_students(students)
    date_range(start, end)
    return {'version': 1, 'source': HOST, 'mode': mode,
            'range_from': start, 'range_to': end,
            'updated_at': datetime.now().astimezone().isoformat(),
            'complete_export': False, 'errors': [],
            'students': {s['label']: {'education_id': s['education_id'],
                         **{k: [] for k in (*KINDS, 'attendance', 'homework')},
                         'coverage': {k: {'complete': False, 'status': 'not_observed'} for k in KINDS}}
                         for s in students}}


def normalize(kind, rows, eid, start, end):
    """Validate a whole source before adding it, so a mixed child response is rejected."""
    lo, hi = date_range(start, end)
    result = []
    for row in rows:
        if 'education_id' in row and str(row['education_id']) != str(eid):
            raise CollectorError('wrong_child')
        if row.get('education_ids') is not None and str(eid) not in map(str, row['education_ids']):
            raise CollectorError('wrong_child')
        raw_date = row.get('date') if kind == 'grades' else row.get('datetime' if kind == 'access' else 'datetime_from')
        day = parse_date(raw_date)
        if not lo <= day <= hi:
            continue
        if kind == 'grades':
            if row.get('id') is None or 'education_id' not in row:
                raise CollectorError('invalid_grade_identity')
            out = {k: row[k] for k in GRADE_FIELDS if k in row}
            out['date_iso'] = day.isoformat()
        elif kind == 'access':
            out = {'id': identity(row), 'datetime': row['datetime'],
                   'datetime_iso': timestamp(row['datetime']), 'direction': row.get('direction')}
        else:
            out = {k: row[k] for k in ('number', 'datetime_from', 'datetime_to',
                    'subject_id', 'subject_name', 'description', 'priority',
                    'override_by_priority', 'content_name', 'content_description',
                    'content_additional_material', 'tasks', 'estimates') if k in row}
            if kind == 'lessons':
                out['id'] = identity(row)
                if out['id'] is None:
                    raise CollectorError('missing_lesson_identity')
                if (not isinstance(out.get('tasks', []), list)
                        or any(not isinstance(t, dict) for t in out.get('tasks', []))):
                    raise CollectorError('invalid_tasks')
            out['date_iso'] = day.isoformat()
            out['starts_at'] = timestamp(row['datetime_from'])
            out['ends_at'] = timestamp(row['datetime_to'])
        # Child identity comes exclusively from the explicitly selected config entry.
        out['education_id'] = int(eid)
        result.append(sanitize(out))
    return result


def merge(child, kind, rows):
    existing = {stable_key(kind, r): r for r in child[kind]}
    for row in rows:
        existing[stable_key(kind, row)] = row
    child[kind] = sorted(existing.values(), key=lambda r: (
        r.get('date_iso', r.get('datetime_iso', '')), str(stable_key(kind, r))))


def finish(out):
    for child in out['students'].values():
        child['attendance'] = [dict(r) for r in child['grades'] if str(r.get('estimate_type_code')) == '30000']
        homework = {}
        for lesson in child['lessons']:
            for task in lesson.get('tasks', []):
                if not isinstance(task, dict):
                    raise CollectorError('invalid_task')
                if task.get('task_kind_code') != 'homework':
                    continue
                # Content-derived ID is stable across repeated capture and reordered tasks.
                digest = hashlib.sha256(json.dumps(task, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]
                key = str(lesson['id']) + ':' + digest
                homework[key] = {'id': key, 'education_id': child['education_id'],
                                 'lesson_id': lesson['id'], 'lesson_date': lesson['date_iso'],
                                 'subject_id': lesson.get('subject_id'),
                                 'subject_name': lesson.get('subject_name'),
                                 'due_at': None, **{k: sanitize(task[k]) for k in
                                     ('task_name', 'task_code', 'task_kind_code', 'task_kind_name', 'files')
                                     if k in task}}
        child['homework'] = sorted(homework.values(), key=lambda r: (r['lesson_date'], r['id']))
    out['complete_export'] = (out['mode'] == 'live' and not out['errors'] and
                             all(c['complete'] for s in out['students'].values() for c in s['coverage'].values()))
    return out


def error(out, label, kind, reason):
    # Never include server bodies, URLs, credentials or arbitrary exception messages.
    out['errors'].append({'child': label, 'source': kind, 'error': reason})


def replay(records, students, start, end):
    out = package(students, start, end, 'offline')
    selectors = {str(s['education_id']): s['label'] for s in students}
    paths = {p: k for k, p in PATHS.items()}
    for record in records:
        kind = paths.get(record.get('endpoint'))
        if kind is None:
            continue
        query = record.get('query', [])
        key = 'p_education' if kind == 'access' else 'p_educations[]'
        ids = {str(v) for k, v in query if k == key}
        if len(ids) != 1 or next(iter(ids)) not in selectors:
            error(out, None, kind, 'ambiguous_or_unknown_child'); continue
        eid = next(iter(ids)); label = selectors[eid]
        try:
            if record.get('status') != 200 or record.get('method') != 'GET':
                raise CollectorError('unsuccessful_record')
            data = unwrap(record.get('response'))
            rows = normalize(kind, data['items'], eid, start, end)
            merge(out['students'][label], kind, rows)
            out['students'][label]['coverage'][kind] = {
                'complete': False, 'status': 'observed_only',
                'note': 'Archive may contain filtered, overlapping or missing pages.'}
        except (ValueError, TypeError, KeyError):
            error(out, label, kind, 'invalid_archived_response')
    return finish(out)


async def collect(fetch, students, start, end, checkpoint=None):
    out = package(students, start, end, 'live')
    lo, hi = date_range(start, end)
    for student in students:
        label, eid = student['label'], str(student['education_id'])
        for kind, path in PATHS.items():
            if kind == 'access':
                params = {'p_education': eid, 'p_limit': '20'}
            elif kind == 'grades':
                params = {'p_educations[]': eid, 'p_date_from': lo.strftime('%d.%m.%Y'),
                          'p_date_to': hi.strftime('%d.%m.%Y'), 'p_limit': '100'}
            else:
                params = {'p_educations[]': eid,
                          'p_datetime_from': lo.strftime('%d.%m.%Y') + ' 00:00:00',
                          'p_datetime_to': hi.strftime('%d.%m.%Y') + ' 23:59:59'}
                if kind == 'lessons':
                    params['p_limit'] = '100'
            try:
                if kind == 'schedule':
                    # Archived successful schedule requests stay within one calendar week.
                    rows = []
                    window_start = lo
                    while True:
                        window_end = window_start + timedelta(
                            days=min(6 - window_start.weekday(), (hi - window_start).days))
                        query = dict(params,
                            p_datetime_from=window_start.strftime('%d.%m.%Y') + ' 00:00:00',
                            p_datetime_to=window_end.strftime('%d.%m.%Y') + ' 23:59:59')
                        rows.extend(await fetch_pages(fetch, path, query))
                        if len(rows) > MAX_ITEMS:
                            raise CollectorError('item_limit')
                        if window_end == hi:
                            break
                        window_start = window_end + timedelta(days=1)
                else:
                    rows = await fetch_pages(fetch, path, params)
                merge(out['students'][label], kind, normalize(kind, rows, eid, start, end))
                out['students'][label]['coverage'][kind] = {'complete': True, 'status': 'all_pages'}
            except Exception as exc:
                error(out, label, kind, str(exc) if isinstance(exc, CollectorError) else type(exc).__name__)
                out['students'][label]['coverage'][kind] = {'complete': False, 'status': 'failed'}
            if checkpoint is not None:
                checkpoint(finish(out))
    return finish(out)


def read_records(source):
    if source.is_dir():
        for path in sorted(source.glob('response-*.json')):
            yield json.loads(path.read_text(encoding='utf-8'))
    else:
        with zipfile.ZipFile(source) as archive:
            for info in sorted(archive.infolist(), key=lambda x: x.filename):
                parts = Path(info.filename).parts
                if ('__MACOSX' in parts or any(p.startswith('._') for p in parts)
                        or not Path(info.filename).name.startswith('response-')
                        or not info.filename.endswith('.json')):
                    continue
                if info.file_size > 16 * 1024 * 1024:
                    raise CollectorError('archive_response_limit')
                yield json.loads(archive.read(info))


async def api_json(context, path, params, network_guard=None):
    """Read through the existing session; retain only safe transport diagnostics."""
    if network_guard is not None:
        network_guard()
    response = await context.request.get('https://' + HOST + path,
        params=params, headers={'Accept': 'application/json'}, timeout=30000,
        max_redirects=0)
    status = response.status
    if status in (401, 403):
        raise CollectorError('session_rejected_' + str(status))
    if 300 <= status < 400:
        raise CollectorError('http_redirect_' + str(status))
    if status != 200:
        raise CollectorError('http_status_' + str(status))
    if 'json' not in response.headers.get('content-type', '').lower():
        raise CollectorError('non_json_response')
    try:
        return await response.json()
    except ValueError:
        raise CollectorError('invalid_json') from None


async def collect_session(context, students, start, end, checkpoint=None, network_guard=None):
    """Bootstrap the saved browser session in the working collector's order."""
    validate_students(students)
    date_range(start, end)
    try:
        if network_guard is not None:
            network_guard()
        page = context.pages[0] if context.pages else await context.new_page()
        try:
            await page.goto('https://' + HOST + '/estimate',
                            wait_until='domcontentloaded', timeout=45000)
            await page.wait_for_timeout(1500)
        except Exception:
            # As in school_sync: the API, not page navigation, decides validity.
            pass
        data = unwrap(await api_json(context, '/api/journal/person/related-child-list',
                                     {'p_page': '1'}, network_guard=network_guard))
        available = {str(edu['education_id']) for child in data['items']
                     if isinstance(child.get('educations'), list)
                     for edu in child['educations']
                     if isinstance(edu, dict)
                     and type(edu.get('education_id')) is int and edu['education_id'] > 0}
        if any(str(student['education_id']) not in available for student in students):
            raise CollectorError('configured_child_unavailable')
    except Exception as exc:
        out = package(students, start, end, 'live')
        reason = str(exc) if isinstance(exc, CollectorError) else type(exc).__name__
        for student in students:
            for kind in KINDS:
                error(out, student['label'], kind, reason)
                out['students'][student['label']]['coverage'][kind] = {
                    'complete': False, 'status': 'failed'}
        return finish(out)

    async def fetch(path, params):
        return await api_json(context, path, params, network_guard=network_guard)
    return await collect(fetch, students, start, end, checkpoint=checkpoint)


async def live(args, students):
    # Import only after explicit CLI opt-in. No setup, upload or grade-file writes.
    from playwright.async_api import async_playwright
    if not args.profile.is_dir():
        raise CollectorError('existing_profile_required')
    guard = getattr(args, 'network_guard', None)
    if guard is not None:
        guard()
    async with async_playwright() as pw:
        context = await pw.chromium.launch_persistent_context(
            str(args.profile), headless=True, accept_downloads=False,
            **({'service_workers': 'block'} if guard is not None else {}))
        try:
            if guard is not None:
                async def route_guard(route):
                    try:
                        guard()
                    except CollectorError:
                        await route.abort()
                    else:
                        await route.continue_()
                await context.route('**/*', route_guard)
            return await collect_session(context, students, args.date_from, args.date_to,
                                         checkpoint=getattr(args, 'checkpoint', None),
                                         network_guard=guard)
        finally:
            await context.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--archive', type=Path, help='Offline ZIP or captured directory')
    modes.add_argument('--live', action='store_true', help='Network: requires prior VPN confirmation')
    parser.add_argument('--vpn-off-confirmed', action='store_true')
    parser.add_argument('--config', type=Path, default=BASE / 'collector-config.json')
    parser.add_argument('--profile', type=Path, default=BASE / 'browser-profile')
    parser.add_argument('--date-from', required=True)
    parser.add_argument('--date-to', required=True)
    parser.add_argument('--output-dir', type=Path, default=Path.home() / 'Documents/ChatGPT/Leveli/school-export-private')
    args = parser.parse_args(argv)
    if args.live and not args.vpn_off_confirmed:
        parser.error('Сначала предупредите пользователя и получите подтверждение отключения VPN; затем --vpn-off-confirmed.')
    try:
        date_range(args.date_from, args.date_to)
        students = validate_students(json.loads(args.config.read_text(encoding='utf-8'))['students'])
        result = (asyncio.run(live(args, students)) if args.live else
                  replay(read_records(args.archive), students, args.date_from, args.date_to))
        path = args.output_dir / ('unified-school-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json')
        write_private(path, result)
        print('Локальный файл:', path)
        print('Полный сбор API:', result['complete_export'], '; ошибок:', len(result['errors']))
        return 0 if not result['errors'] and (not args.live or result['complete_export']) else 1
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile):
        print('Сбор не завершён; прежние выгрузки сохранены. Проверьте входные файлы и параметры.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
