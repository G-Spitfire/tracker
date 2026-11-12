"""Actual Python Firestore uploader vs local emulator. Synthetic identities only."""
import copy
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/school-export'))
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore
import homework_upload as h
from test_homework_upload import snapshot, CONFIG, LINKS, NOW

if not os.environ.get('FIRESTORE_EMULATOR_HOST', '').startswith('127.0.0.1:'):
    raise SystemExit('Local Firestore emulator required')
client = firestore.Client(project='demo-leveli-release-check', credentials=AnonymousCredentials())
source = snapshot()
docs = h.prepare_docs(source, CONFIG, LINKS, now=NOW)
h.upload(client, docs)
ref = client.collection('schoolHomework').document('synthetic_A')
key = next(iter(docs['synthetic_A']['items']))
ref.update({'progress.' + key: True})
source['students']['polina']['homework'][0].update(id='123:new-content-hash', task_name='Изменённый текст')
edited = h.prepare_docs(source, CONFIG, LINKS, now=NOW)
h.upload(client, edited)
assert ref.get().to_dict()['progress'][key] is True
assert ref.get().to_dict()['items'][key]['text'] == 'Изменённый текст'
# Historical tasks cannot consume the lifetime progress limit.
ref.update({'progress': {key: True, **{('removed' + str(i)): True for i in range(2000)}}})
h.upload(client, edited)
assert ref.get().to_dict()['progress'] == {key: True}
# A checkbox committed while ingestion runs must survive either serialization.
for _ in range(3):
    ref.update({'progress.' + key: False})
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(h.upload, client, edited), pool.submit(ref.update, {'progress.' + key: True})]
        for job in jobs: job.result(timeout=30)
    assert ref.get().to_dict()['progress'][key] is True
# Both children are atomic even if an older snapshot is replayed for one child.
newer = copy.deepcopy(edited)
newer['synthetic_B']['syncedAt'] = '2026-11-12T13:00:00+00:00'
h.upload(client, newer)
older = copy.deepcopy(edited)
older['synthetic_A']['items'][key]['text'] = 'Не должно попасть в базу'
try:
    h.upload(client, older)
    raise AssertionError('older snapshot accepted')
except ValueError:
    pass
assert ref.get().to_dict()['items'][key]['text'] == 'Изменённый текст'
print('Python Firestore: actual transactional ingestion, edits, cleanup, concurrent checkbox, atomic stale rejection PASS')
