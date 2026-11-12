import asyncio
from contextlib import redirect_stdout, redirect_stderr
import io
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import unified_school as u


def payload(rows, pages=1, total=None):
    return {'data': {'items': rows, 'total_pages': pages,
                     'total_items': len(rows) if total is None else total}}


def rec(kind, eid, rows):
    selector = 'p_education' if kind == 'access' else 'p_educations[]'
    return {'method': 'GET', 'endpoint': u.PATHS[kind], 'status': 200,
            'query': [[selector, str(eid)]], 'response': payload(rows)}


def grade(eid=11, code='10000'):
    return {'id': 1, 'education_id': eid, 'date': '10.11.2026',
            'subject_id': 7, 'subject_name': 'Предмет',
            'estimate_type_code': code, 'estimate_value_name': 'по болезни'}


def lesson():
    return {'identity': {'id': 9}, 'datetime_from': '10.11.2026 08:00:00',
            'datetime_to': '10.11.2026 08:45:00', 'number': 1,
            'subject_id': 7, 'subject_name': 'Предмет',
            'tasks': [{'task_kind_code': 'homework', 'task_name': 'Задача',
                       'task_kind_name': 'Домашнее задание', 'files': []},
                      {'task_kind_code': 'classwork', 'task_name': 'В классе'}]}


class NormalizeTests(unittest.TestCase):
    def run_records(self, records):
        return u.replay(records, [{'education_id': 11, 'label': 'polina'},
                                  {'education_id': 22, 'label': 'matvey'}],
                        '2026-11-01', '2026-11-11')

    def test_normalization_and_isolation(self):
        records = [rec('grades', 11, [grade(), grade(code='30000')]),
                   rec('lessons', 11, [lesson()]), rec('schedule', 22, [lesson()]),
                   rec('access', 22, [{'identity': {'id': 'a'},
                                      'datetime': '11.11.2026 08:26:13', 'direction': 'input'}])]
        original = copy.deepcopy(records)
        out = self.run_records(records)
        a, b = out['students']['polina'], out['students']['matvey']
        self.assertEqual(len(a['attendance']), 1)
        self.assertEqual(a['attendance'][0]['estimate_value_name'], 'по болезни')
        self.assertEqual(a['grades'][0]['date_iso'], '2026-11-10')
        self.assertEqual(len(a['homework']), 1)
        self.assertEqual(a['homework'][0]['lesson_date'], '2026-11-10')
        self.assertIsNone(a['homework'][0]['due_at'])
        self.assertEqual(len(b['access']), 1)
        self.assertEqual(b['access'][0]['datetime_iso'], '2026-11-11T08:26:13+03:00')
        self.assertEqual(a['access'], [])
        self.assertEqual(b['grades'], [])
        self.assertFalse(out['complete_export'])
        self.assertEqual(records, original)

    def test_duplicate_and_outside_range(self):
        r = rec('lessons', 11, [lesson()])
        old = copy.deepcopy(r); old['response']['data']['items'][0]['datetime_from'] = '01.10.2026 08:00:00'
        out = self.run_records([r, r, old])
        self.assertEqual(len(out['students']['polina']['lessons']), 1)
        self.assertEqual(len(out['students']['polina']['homework']), 1)

    def test_wrong_child_not_saved(self):
        out = self.run_records([rec('grades', 11, [grade(22)])])
        self.assertEqual(out['students']['polina']['grades'], [])
        self.assertTrue(out['errors'])

    def test_bad_date_not_silent(self):
        row = lesson(); row['datetime_from'] = 'bad'
        out = self.run_records([rec('lessons', 11, [row])])
        self.assertTrue(out['errors'])

    def test_empty_valid_and_soft_error(self):
        good = rec('schedule', 11, [])
        bad = rec('lessons', 11, []); bad['response']['messages'] = ['error']
        out = self.run_records([good, bad])
        self.assertEqual(out['students']['polina']['schedule'], [])
        self.assertTrue(out['errors'])

    def test_malformed_task_is_reported_without_losing_other_sources(self):
        row = lesson(); row['tasks'] = [None]
        out = self.run_records([rec('lessons', 11, [row]), rec('grades', 22, [grade(22)])])
        self.assertTrue(out['errors'])
        self.assertEqual(len(out['students']['matvey']['grades']), 1)

    def test_malformed_identity_is_reported(self):
        row = lesson(); row['identity'] = 'bad'
        out = self.run_records([rec('lessons', 11, [row])])
        self.assertTrue(out['errors'])

    def test_task_cannot_override_child_or_stable_fields(self):
        row = lesson(); row['tasks'][0].update(education_id=22, id='unsafe', lesson_id=33,
                                             lesson_date='bad', due_at='invented')
        out = self.run_records([rec('lessons', 11, [row])])
        task = out['students']['polina']['homework'][0]
        self.assertEqual(task['education_id'], 11)
        self.assertEqual(task['lesson_id'], 9)
        self.assertEqual(task['lesson_date'], '2026-11-10')
        self.assertNotEqual(task['id'], 'unsafe')
        self.assertIsNone(task['due_at'])

    def test_config_and_range_validation(self):
        for students in ([{'education_id': 11, 'label': 'polina'}],
                         [{'education_id': 11, 'label': 'polina'}, {'education_id': 11, 'label': 'matvey'}]):
            with self.assertRaises(ValueError):u.validate_students(students)
        with self.assertRaises(ValueError):u.date_range('2026-11-11', '2026-11-01')


class PagingTests(unittest.IsolatedAsyncioTestCase):
    async def test_collect_all_sources_for_both_children_with_unpaginated_schedule(self):
        async def fetch(path, params):
            eid = int(params.get('p_education', params.get('p_educations[]')))
            if path == u.PATHS['grades']:
                return payload([grade(eid)])
            if path == u.PATHS['lessons']:
                return payload([lesson()])
            if path == u.PATHS['schedule']:
                return {'data': {'items': [lesson()], 'before': 1, 'current': 0,
                                 'last': 0, 'next': 0, 'total_pages': 0, 'total_items': 0},
                        'messages': [], 'validations': []}
            return payload([{'identity': {'id': 'a'},
                             'datetime': '11.11.2026 08:26:13', 'direction': 'input'}])
        with patch('socket.socket', side_effect=AssertionError('network forbidden')):
            out = await u.collect(fetch, [{'education_id': 11, 'label': 'polina'},
                                         {'education_id': 22, 'label': 'matvey'}],
                                  '2026-11-01', '2026-11-11')
        self.assertEqual(out['errors'], [])
        self.assertTrue(out['complete_export'])
        for label, eid in [('polina', 11), ('matvey', 22)]:
            for kind in ('grades', 'lessons', 'schedule', 'access', 'homework'):
                self.assertEqual(len(out['students'][label][kind]), 1)
                self.assertEqual(out['students'][label][kind][0]['education_id'], eid)

    async def test_schedule_week_windows_cover_range_and_preserve_other_queries(self):
        students = [{'education_id': 11, 'label': 'polina'},
                    {'education_id': 22, 'label': 'matvey'}]
        for start, end, windows in [
            ('2026-11-10', '2026-11-10', [('10.11.2026', '10.11.2026')]),
            ('2026-11-09', '2026-11-15', [('09.11.2026', '15.11.2026')]),
            ('2026-11-08', '2026-11-16', [('08.11.2026', '08.11.2026'),
              ('09.11.2026', '15.11.2026'), ('16.11.2026', '16.11.2026')]),
            ('2026-12-31', '2027-01-05', [('31.12.2026', '03.01.2027'),
                                                       ('04.01.2027', '05.01.2027')]),
            ('2026-09-01', '2026-11-15', [
              ('01.09.2026', '06.09.2026'), ('07.09.2026', '13.09.2026'),
              ('14.09.2026', '20.09.2026'), ('21.09.2026', '27.09.2026'),
              ('28.09.2026', '04.10.2026'), ('05.10.2026', '11.10.2026'),
              ('12.10.2026', '18.10.2026'), ('19.10.2026', '25.10.2026'),
              ('26.10.2026', '01.11.2026'), ('02.11.2026', '08.11.2026'),
              ('09.11.2026', '15.11.2026')]),
        ]:
            with self.subTest(start=start, end=end):
                calls = []
                async def fetch(path, params):
                    calls.append((path, params.copy()))
                    if path != u.PATHS['schedule']:
                        return payload([])
                    row = lesson()
                    row.pop('identity')  # Real schedule rows have no ID.
                    day = params['p_datetime_from'][:10]
                    row['datetime_from'] = day + ' 08:00:00'
                    row['datetime_to'] = day + ' 08:45:00'
                    return {'data': {'items': [row], 'total_pages': 0,
                        'total_items': 0, 'current': 0, 'last': 0, 'next': 0}}
                out = await u.collect(fetch, students, start, end)
                self.assertEqual(out['errors'], [])
                self.assertTrue(out['complete_export'])
                for label, eid in [('polina', '11'), ('matvey', '22')]:
                    queries = [p for path, p in calls if path == u.PATHS['schedule']
                               and p['p_educations[]'] == eid]
                    self.assertEqual(queries, [
                        {'p_educations[]': eid, 'p_datetime_from': a + ' 00:00:00',
                         'p_datetime_to': b + ' 23:59:59', 'p_page': '1'}
                        for a, b in windows])
                    self.assertEqual(len(out['students'][label]['schedule']), len(windows))
                    self.assertEqual({r['education_id'] for r in
                                      out['students'][label]['schedule']}, {int(eid)})
                for kind in ('grades', 'lessons', 'access'):
                    self.assertEqual(len([1 for path, p in calls if path == u.PATHS[kind]]), 2)
                lesson_query = next(p for path, p in calls if path == u.PATHS['lessons'])
                self.assertEqual(lesson_query['p_datetime_from'],
                                 u.date.fromisoformat(start).strftime('%d.%m.%Y') + ' 00:00:00')
                self.assertEqual(lesson_query['p_datetime_to'],
                                 u.date.fromisoformat(end).strftime('%d.%m.%Y') + ' 23:59:59')

    async def test_failed_schedule_week_does_not_claim_partial_source_complete(self):
        async def fetch(path, params):
            if path == u.PATHS['schedule']:
                if (params['p_educations[]'] == '11'
                        and params['p_datetime_from'] == '09.11.2026 00:00:00'):
                    raise u.CollectorError('http_status_400')
                row = lesson()
                row['datetime_from'] = '08.11.2026 08:00:00'
                row['datetime_to'] = '08.11.2026 08:45:00'
                return payload([row])
            return payload([])
        out = await u.collect(fetch, [{'education_id': 11, 'label': 'polina'},
                                     {'education_id': 22, 'label': 'matvey'}],
                              '2026-11-08', '2026-11-16')
        self.assertEqual(out['errors'], [{'child': 'polina', 'source': 'schedule',
                                         'error': 'http_status_400'}])
        self.assertFalse(out['complete_export'])
        self.assertEqual(out['students']['polina']['schedule'], [])
        self.assertFalse(out['students']['polina']['coverage']['schedule']['complete'])
        self.assertTrue(out['students']['matvey']['coverage']['schedule']['complete'])
        self.assertEqual(len(out['students']['matvey']['schedule']), 1)  # Deduplicated.
        self.assertTrue(out['students']['polina']['coverage']['access']['complete'])

    async def test_schedule_with_observed_zero_pagination_retains_rows(self):
        async def fetch(path, params):
            self.assertEqual(params['p_page'], '1')
            return {'data': {'items': [lesson()], 'before': 1, 'current': 0,
                             'last': 0, 'next': 0, 'total_pages': 0, 'total_items': 0},
                    'messages': [], 'validations': []}
        with patch('socket.socket', side_effect=AssertionError('network forbidden')):
            rows = await u.fetch_pages(fetch, u.PATHS['schedule'], {})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['subject_id'], 7)

    async def test_zero_totals_do_not_hide_other_sources_or_invalid_schedule(self):
        for path in u.PATHS.values():
            async def fetch(path, params):
                return payload([lesson()], 0, 0)
            with self.assertRaises(ValueError):
                await u.fetch_pages(fetch, path, {})

    async def test_collect_keeps_safe_failure_reason_for_all_eight_sources(self):
        async def fetch(path, params):
            return {'data': {}}
        out = await u.collect(fetch, [{'education_id': 11, 'label': 'polina'},
                                     {'education_id': 22, 'label': 'matvey'}],
                              '2026-11-01', '2026-11-11')
        self.assertEqual(len(out['errors']), 8)
        self.assertEqual({e['error'] for e in out['errors']}, {'invalid_items'})
        self.assertFalse(out['complete_export'])

    async def test_arbitrary_exception_text_is_never_exported(self):
        async def fetch(path, params):
            raise ValueError('private server body and credentials')
        out = await u.collect(fetch, [{'education_id': 11, 'label': 'polina'},
                                     {'education_id': 22, 'label': 'matvey'}],
                              '2026-11-01', '2026-11-11')
        self.assertEqual({e['error'] for e in out['errors']}, {'ValueError'})
        self.assertNotIn('private server', json.dumps(out))

    async def test_paging_and_request_parameters(self):
        calls = []
        async def fetch(path, params):
            calls.append((path, params.copy()))
            return payload([{'id': int(params['p_page'])}], 2, 2)
        rows = await u.fetch_pages(fetch, u.PATHS['access'], {'p_education': '11'})
        self.assertEqual(len(rows), 2)
        self.assertEqual([x[1]['p_page'] for x in calls], ['1', '2'])
        self.assertNotIn('p_datetime_from', calls[0][1])

    async def test_invalid_pages_totals_duplicates_and_errors(self):
        for data in (payload([], 2, 1), payload([{'id': 1}], 2, 2),
                     payload([], 999, 0), {'data': {}}, {'messages': ['bad'], 'data': {'items': []}}):
            async def fetch(path, params):return data
            with self.assertRaises(ValueError):await u.fetch_pages(fetch, '/', {})

    async def test_collect_failure_continues_other_child(self):
        async def fetch(path, params):
            eid = params.get('p_education', params.get('p_educations[]'))
            if eid == '11' and path == u.PATHS['lessons']:raise TimeoutError()
            return payload([])
        out = await u.collect(fetch, [{'education_id': 11, 'label': 'polina'},
                                     {'education_id': 22, 'label': 'matvey'}],
                              '2026-11-01', '2026-11-11')
        self.assertFalse(out['complete_export'])
        self.assertTrue(out['errors'])
        self.assertTrue(out['students']['matvey']['coverage']['lessons']['complete'])

    async def test_empty_success_and_inclusive_end(self):
        calls=[]
        async def fetch(path, params):calls.append((path,params));return payload([])
        out = await u.collect(fetch, [{'education_id': 11, 'label': 'polina'},
                                     {'education_id': 22, 'label': 'matvey'}],
                              '2026-11-01', '2026-11-11')
        self.assertTrue(out['complete_export'])
        p = next(p for path,p in calls if path == u.PATHS['lessons'])
        self.assertEqual(p['p_datetime_to'], '11.11.2026 23:59:59')


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_failures_have_safe_distinct_codes(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        for status, ctype, reason in (
                (401, 'application/json', 'session_rejected_401'),
                (403, 'text/html', 'session_rejected_403'),
                (302, 'text/html', 'http_redirect_302'),
                (503, 'text/html', 'http_status_503'),
                (200, 'text/html', 'non_json_response')):
            response = SimpleNamespace(status=status, headers={'content-type': ctype},
                                       json=AsyncMock(side_effect=AssertionError('body must stay unread')))
            context = SimpleNamespace(request=SimpleNamespace(get=AsyncMock(return_value=response)))
            with self.assertRaisesRegex(u.CollectorError, '^' + reason + '$'):
                await u.api_json(context, u.PATHS['grades'], {'p_page': '1'})
            response.json.assert_not_awaited()
            self.assertEqual(context.request.get.call_args.kwargs['max_redirects'], 0)

    async def test_json_decode_failure_does_not_export_body(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        response = SimpleNamespace(status=200, headers={'content-type': 'application/json'},
                                   json=AsyncMock(side_effect=ValueError('private body')))
        context = SimpleNamespace(request=SimpleNamespace(get=AsyncMock(return_value=response)))
        with self.assertRaisesRegex(u.CollectorError, '^invalid_json$'):
            await u.api_json(context, '/', {})

    async def test_request_matches_existing_headers_and_success_payload_is_unchanged(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        body = payload([grade()])
        response = SimpleNamespace(status=200, headers={'content-type': 'application/json; charset=utf-8'},
                                   json=AsyncMock(return_value=body))
        context = SimpleNamespace(request=SimpleNamespace(get=AsyncMock(return_value=response)))
        params = {'p_educations[]': '11', 'p_page': '1'}
        self.assertIs(await u.api_json(context, u.PATHS['grades'], params), body)
        context.request.get.assert_awaited_once_with(
            'https://' + u.HOST + u.PATHS['grades'], params=params,
            headers={'Accept': 'application/json'}, timeout=30000, max_redirects=0)


class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def run_session(self, *, missing=False, navigation_error=False, empty_pages=False, rejected=False):
        from types import SimpleNamespace
        state = {'opened': False, 'ready': False, 'checked': False, 'calls': 0}
        async def goto(url, **kwargs):
            self.assertEqual(url, 'https://' + u.HOST + '/estimate')
            self.assertEqual(kwargs, {'wait_until': 'domcontentloaded', 'timeout': 45000})
            state['opened'] = True
            if navigation_error:
                raise TimeoutError('private navigation error')
        async def wait(ms):
            self.assertEqual(ms, 1500)
            state['ready'] = True
        page = SimpleNamespace(goto=goto, wait_for_timeout=wait)
        async def new_page():
            return page
        async def get(url, **kwargs):
            self.assertTrue(state['opened'], 'API called before opening authorized page')
            if not navigation_error:
                self.assertTrue(state['ready'])
            if url.endswith('/person/related-child-list'):
                self.assertEqual(kwargs['params'], {'p_page': '1'})
                state['checked'] = True
                body = payload([{'educations': [{'education_id': 11},
                                               {'education_id': 33 if missing else 22}]}])
            else:
                self.assertTrue(state['checked'], 'data requested before children check')
                state['calls'] += 1
                body = payload([])
            async def response_json():
                return body
            return SimpleNamespace(status=401 if rejected else 200,
                                   headers={'content-type': 'application/json'}, json=response_json)
        context = SimpleNamespace(pages=[] if empty_pages else [page], new_page=new_page,
                                  request=SimpleNamespace(get=get))
        out = await u.collect_session(context, [{'label': 'polina', 'education_id': 11},
                                               {'label': 'matvey', 'education_id': 22}],
                                      '2026-11-01', '2026-11-11')
        return out, state

    async def test_bootstrap_precedes_all_source_requests(self):
        out, state = await self.run_session()
        self.assertTrue(out['complete_export'])
        self.assertEqual(state['calls'], 12)  # Three schedule weeks per child.

    async def test_navigation_timeout_still_checks_api_like_working_collector(self):
        out, state = await self.run_session(navigation_error=True, empty_pages=True)
        self.assertTrue(out['complete_export'])
        self.assertEqual(state['calls'], 12)  # Three schedule weeks per child.

    async def test_missing_configured_child_blocks_data_requests(self):
        out, state = await self.run_session(missing=True)
        self.assertFalse(out['complete_export'])
        self.assertEqual(state['calls'], 0)
        self.assertEqual(len(out['errors']), 8)
        self.assertEqual({e['error'] for e in out['errors']}, {'configured_child_unavailable'})

    async def test_rejected_session_blocks_data_and_preserves_safe_reason(self):
        out, state = await self.run_session(rejected=True)
        self.assertFalse(out['complete_export'])
        self.assertEqual(state['calls'], 0)
        self.assertEqual(len(out['errors']), 8)
        self.assertEqual({e['error'] for e in out['errors']}, {'session_rejected_401'})

    async def test_live_entry_uses_bootstrap_and_closes_context_offline(self):
        import sys
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        class Manager:
            async def __aenter__(self):
                return SimpleNamespace(chromium=SimpleNamespace(
                    launch_persistent_context=AsyncMock(return_value=context)))
            async def __aexit__(self, *args):
                return False
        context = SimpleNamespace(close=AsyncMock())
        expected = {'complete_export': False, 'errors': []}
        with tempfile.TemporaryDirectory() as tmp:
            args = SimpleNamespace(profile=Path(tmp), date_from='2026-11-01', date_to='2026-11-11')
            students = [{'label': 'polina', 'education_id': 11},
                        {'label': 'matvey', 'education_id': 22}]
            with patch.dict(sys.modules, {'playwright.async_api': SimpleNamespace(async_playwright=Manager)}), \
                    patch.object(u, 'collect_session', AsyncMock(return_value=expected)) as collect_session:
                self.assertEqual(await u.live(args, students), expected)
                collect_session.assert_awaited_once_with(context, students, '2026-11-01', '2026-11-11', checkpoint=None, network_guard=None)
            context.close.assert_awaited_once()


class ArchivedAccessContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_observed_access_format_two_pages_preserves_identity_and_direction(self):
        async def fetch(path, params):
            self.assertEqual(path, '/api/journal/acs/list')
            self.assertEqual(params['p_education'], '11')
            page = int(params['p_page'])
            return {'data': {'items': [{'identity': {'id': page},
                                       'datetime': '11.11.2026 08:26:13',
                                       'direction': 'input' if page == 1 else 'output'}],
                             'before': 1, 'current': page, 'last': 2,
                             'next': 2, 'total_pages': 2, 'total_items': 2},
                    'validations': [], 'messages': []}
        rows = await u.fetch_pages(fetch, u.PATHS['access'], {'p_education': '11', 'p_limit': '1'})
        normalized = u.normalize('access', rows, 11, '2026-11-01', '2026-11-11')
        self.assertEqual([r['id'] for r in normalized], [1, 2])
        self.assertEqual([r['direction'] for r in normalized], ['input', 'output'])
        self.assertEqual([r['education_id'] for r in normalized], [11, 11])

    async def test_invalid_access_items_is_never_empty_success(self):
        for items in (None, {}, 'private body'):
            async def fetch(path, params):
                return {'data': {'items': items}, 'validations': [], 'messages': []}
            with self.assertRaisesRegex(u.CollectorError, '^invalid_items$'):
                await u.fetch_pages(fetch, u.PATHS['access'], {'p_education': '11'})


class StorageTests(unittest.TestCase):
    def test_cli_offline_zip_never_opens_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = root/'config.json'
            config.write_text(json.dumps({'students': [
                {'education_id': 11, 'label': 'polina'},
                {'education_id': 22, 'label': 'matvey'}]}))
            archive = root/'capture.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('session/response-000001.json', json.dumps(rec('grades',11,[grade()])))
                z.writestr('__MACOSX/._response-000001.json', b'not json')
            with patch('socket.socket', side_effect=AssertionError('network forbidden')), redirect_stdout(io.StringIO()):
                status = u.main(['--archive', str(archive), '--config', str(config),
                                 '--date-from','2026-11-01','--date-to','2026-11-11',
                                 '--output-dir', str(root/'out')])
            self.assertEqual(status, 0)
            data = json.loads(next((root/'out').glob('*.json')).read_text())
            self.assertEqual(len(data['students']['polina']['grades']), 1)
            self.assertFalse(data['complete_export'])

    def test_live_requires_confirmation_before_reading_config(self):
        with patch.object(u, 'live', side_effect=AssertionError('must not start')), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as caught:
                u.main(['--live','--date-from','2026-11-01','--date-to','2026-11-11'])
        self.assertEqual(caught.exception.code, 2)

    def test_unique_private_output_never_overwrites(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'out.json'
            u.write_private(p, {'ok': True})
            with self.assertRaises(FileExistsError):u.write_private(p, {'ok': False})
            self.assertEqual(json.loads(p.read_text()), {'ok': True})
            self.assertEqual(p.stat().st_mode & 0o777, 0o600)

if __name__ == '__main__':unittest.main()
