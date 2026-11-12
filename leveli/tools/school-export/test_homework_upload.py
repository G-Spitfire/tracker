import copy
import datetime as dt
import unittest
from pathlib import Path
import homework_upload as h
NOW = dt.datetime(2026, 11, 12, 12, tzinfo=dt.timezone.utc)
CONFIG = {'students': [{'label': 'polina', 'education_id': 101}, {'label': 'matvey', 'education_id': 202}]}
LINKS = {'version': 1, 'project_id': 'family-school-grades', 'uids': {'polina': 'synthetic_A', 'matvey': 'synthetic_B'}}
def snapshot():
    return {'mixed_snapshot': True, 'students': {c['label']: {
        'education_id': c['education_id'], 'source_updates': {'lessons': {
            'updated_at': NOW.isoformat(), 'range_from': '2026-11-01', 'range_to': '2026-11-26'}},
        'homework': [{'id': '123:abcdef', 'education_id': c['education_id'], 'lesson_id': 123,
                      'lesson_date': '2026-11-13', 'subject_name': 'Синтетический предмет',
                      'task_name': 'Страница 10', 'task_kind_code': 'homework',
                      'files': [{'url': 'https://private.invalid/secret'}]}]} for c in CONFIG['students']}}
class UploadTests(unittest.TestCase):
    def prepare(self, value): return h.prepare_docs(value, CONFIG, LINKS, now=NOW)
    def test_minimal_payload_stable_ids_no_progress_or_personal_fields(self):
        value = snapshot(); docs = self.prepare(value)
        self.assertEqual(set(docs), {'synthetic_A', 'synthetic_B'})
        doc = docs['synthetic_A']; key = next(iter(doc['items']))
        self.assertRegex(key, r'^[a-f0-9]{64}$')
        self.assertEqual(doc['items'][key], {'date': '2026-11-13', 'subject': 'Синтетический предмет', 'text': 'Страница 10'})
        self.assertNotIn('progress', doc)
        self.assertNotIn('secret', str(docs))
        self.assertEqual(docs, self.prepare(value))
    def test_rejects_wrong_child_stale_missing_source_invalid_dates_duplicates(self):
        for change in [
            lambda s: s['students']['polina'].update(education_id=999),
            lambda s: s['students']['polina']['homework'][0].update(education_id=202),
            lambda s: s['students']['polina']['source_updates'].clear(),
            lambda s: s['students']['polina']['source_updates']['lessons'].update(updated_at='2020-01-01T00:00:00Z'),
            lambda s: s['students']['polina']['homework'][0].update(lesson_date='2026-02-30'),
            lambda s: s['students']['polina']['homework'].append(copy.deepcopy(s['students']['polina']['homework'][0])),
        ]:
            with self.subTest(change=change):
                s = snapshot(); change(s)
                with self.assertRaises(ValueError): self.prepare(s)
    def test_transaction_preserves_current_checks_and_discards_only_removed_tasks(self):
        docs = self.prepare(snapshot()); calls = []; key = next(iter(docs['synthetic_A']['items']))
        class Snapshot:
            def to_dict(inner): return {'progress': {key: True, 'removed': True}}
        class Ref:
            def __init__(inner, uid): inner.uid = uid
            def get(inner, transaction):
                self.assertFalse(any(c[0] == 'write' for c in calls))
                calls.append(('read', inner.uid)); return Snapshot()
        class Transaction:
            def set(inner, ref, value): calls.append(('write', ref.uid, value))
        h.write_transaction(Transaction(), {uid: Ref(uid) for uid in docs}, docs)
        self.assertEqual([x[0] for x in calls], ['read', 'read', 'write', 'write'])
        self.assertEqual(calls[2][2]['progress'], {key: True})
    def test_teacher_edits_and_reordered_parts_keep_one_lesson_identity(self):
        s = snapshot(); original = self.prepare(s)['synthetic_A']['items']; key = next(iter(original))
        row = s['students']['polina']['homework'][0]
        row.update(id='123:changed-content-hash', task_name='Исправленное задание')
        s['students']['polina']['homework'].append({**row, 'id': '123:second-part', 'task_name': 'Ещё часть'})
        updated = self.prepare(s)['synthetic_A']['items']
        self.assertEqual(list(updated), [key])
        self.assertIn('Исправленное задание', updated[key]['text'])
        s['students']['polina']['homework'].reverse()
        self.assertEqual(updated, self.prepare(s)['synthetic_A']['items'])
    def test_null_title_with_attachments_keeps_lesson_and_source_unchanged(self):
        s = snapshot()
        original_key = next(iter(self.prepare(s)['synthetic_B']['items']))
        row = s['students']['matvey']['homework'][0]
        row.update(task_name=None, files=[{'file_name': 'worksheet.pdf', 'file_type': 'pdf', 'uuid': 'synthetic-private-file'}])
        before = copy.deepcopy(s)
        doc = self.prepare(s)['synthetic_B']
        self.assertEqual(list(doc['items']), [original_key])
        self.assertTrue(doc['items'][original_key]['text'].strip())
        self.assertIn('вложении', doc['items'][original_key]['text'])
        self.assertEqual(s, before)
        self.assertNotIn('synthetic-private-file', str(doc))
        row.update(id='123:edited-attachment', files=[{'file_name': 'replacement.pdf', 'uuid': 'replacement'}])
        self.assertEqual(list(self.prepare(s)['synthetic_B']['items']), [original_key])

    def test_malformed_titles_and_file_types_still_fail(self):
        for text, files in [(None, 'invalid'), (123, [{}])]:
            with self.subTest(text=text, files=files):
                s = snapshot()
                s['students']['matvey']['homework'][0].update(task_name=text, files=files)
                with self.assertRaisesRegex(ValueError, 'invalid_text'):
                    self.prepare(s)

    def test_absence_markers_skip_but_attachments_keep_identity(self):
        for text in ['не задано', 'Домашнее задание: не задано.', 'Д/З: нет', '  ', '', None]:
            with self.subTest(text=text):
                s = snapshot()
                for child in s['students'].values():
                    child['homework'][0].update(task_name=text, files=[])
                before = copy.deepcopy(s)
                self.assertTrue(all(not d['items'] for d in self.prepare(s).values()))
                self.assertEqual(s, before)
                for child in s['students'].values():
                    child['homework'][0]['files'] = [{'uuid': 'private'}]
                for doc in self.prepare(s).values():
                    self.assertEqual(next(iter(doc['items'].values()))['text'], 'Задание во вложении')
                    self.assertNotIn('private', str(doc))
        s = snapshot()
        row = s['students']['polina']['homework'][0]
        row['files'] = []
        s['students']['polina']['homework'].append({**row, 'id': '123:none', 'task_name': 'не задано'})
        self.assertEqual(next(iter(self.prepare(s)['synthetic_A']['items'].values()))['text'], 'Страница 10')

    def test_empty_successful_source_clears_tasks(self):
        s = snapshot(); s['students']['polina']['homework'] = []
        self.assertEqual(self.prepare(s)['synthetic_A']['items'], {})

class RunnerHookTests(unittest.TestCase):
    def test_hook_is_opt_in_propagated_and_copied_on_install(self):
        import unified_runner as r
        self.assertFalse(r.arguments([]).upload_homework)
        args = r.arguments(['--upload-homework'])
        self.assertTrue(args.upload_homework)
        agent = r.launch_agent('/synthetic/python', Path('/synthetic/data'), upload_homework=True)
        self.assertIn('--upload-homework', agent['ProgramArguments'])

class WorkerUploadTests(unittest.TestCase):
    def test_pushes_only_after_both_fresh_lesson_sources_even_if_unrelated_source_fails(self):
        import tempfile
        from unittest.mock import AsyncMock, patch
        import unified_runner as r
        import unified_school as u
        for enabled, lessons_ok in [(False, True), (True, True), (True, False)]:
            with self.subTest(enabled=enabled, lessons_ok=lessons_ok), tempfile.TemporaryDirectory() as tmp:
                config = Path(tmp) / 'config.json'; config.write_text(__import__('json').dumps(CONFIG))
                args = r.arguments(['--worker', '--vpn-off-confirmed', '--attempt', 'synthetic', '--state-dir', tmp, '--config', str(config)] + (['--upload-homework'] if enabled else []))
                out = u.package(CONFIG['students'], '2026-11-01', '2026-11-26', 'live')
                for child in out['students'].values(): child['coverage']['lessons']['complete'] = lessons_ok
                with patch.object(u, 'live', new=AsyncMock(return_value=out)), patch.object(h, 'push') as push:
                    self.assertEqual(r.worker(args), 1)  # unrelated sources remain incomplete
                    self.assertEqual(push.call_count, int(enabled and lessons_ok))

if __name__ == '__main__': unittest.main()
