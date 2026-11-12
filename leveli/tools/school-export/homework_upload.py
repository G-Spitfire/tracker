#!/usr/bin/env python3
"""Upload only homework from unified_runner's latest-good checkpoint.

Uses the existing ADC credentials and firebase-links.json. Never writes grades.
No network or changes to local collector installation unless explicitly invoked.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re

BASE = Path.home() / 'Library/Application Support/SpbSchoolGradesProbe'
STATE = Path.home() / 'Library/Application Support/LeveliUnifiedSchool/data'
PROJECT = 'family-school-grades'


def date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('invalid_date')
    return dt.date.fromisoformat(value)


def prepare_docs(snapshot, config, links, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    labels = {'polina', 'matvey'}
    uids = links.get('uids', {})
    if (links.get('version') != 1 or links.get('project_id') != PROJECT
            or set(uids) != labels or len(set(uids.values())) != 2
            or any(not isinstance(x, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', x) for x in uids.values())):
        raise ValueError('invalid_firebase_mapping')
    entries = config.get('students', [])
    if (len(entries) != 2 or {x.get('label') for x in entries} != labels
            or len({int(x['education_id']) for x in entries}) != 2):
        raise ValueError('invalid_config')
    students = snapshot.get('students', {})
    if snapshot.get('mixed_snapshot') is not True or set(students) != labels:
        raise ValueError('expected_runner_checkpoint')
    docs = {}
    for entry in entries:
        child = students[entry['label']]
        eid = int(entry['education_id'])
        if int(child['education_id']) != eid:
            raise ValueError('wrong_child')
        # Only a complete lessons source gets source_updates in latest-good.
        source = child.get('source_updates', {}).get('lessons', {})
        stamp = dt.datetime.fromisoformat(str(source.get('updated_at', '')).replace('Z', '+00:00'))
        if stamp.tzinfo is None or not -300 <= (now - stamp).total_seconds() <= 48 * 3600:
            raise ValueError('stale_lessons')
        lo, hi = date(source['range_from']), date(source['range_to'])
        if lo > hi:
            raise ValueError('invalid_range')
        rows = child.get('homework')
        if not isinstance(rows, list) or len(rows) > 2000:
            raise ValueError('invalid_homework')
        items, seen, parts = {}, set(), {}
        for row in rows:
            if int(row['education_id']) != eid or row.get('task_kind_code') != 'homework':
                raise ValueError('wrong_task')
            raw_id = row.get('id')
            if not isinstance(raw_id, str) or not raw_id or len(raw_id) > 256:
                raise ValueError('invalid_identity')
            if raw_id in seen:
                raise ValueError('duplicate_task')
            seen.add(raw_id)
            lesson_id = str(row.get('lesson_id', ''))
            if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', lesson_id):
                raise ValueError('invalid_lesson_identity')
            key = hashlib.sha256(('lesson:' + lesson_id).encode()).hexdigest()
            day = row['lesson_date']
            if not lo <= date(day) <= hi:
                raise ValueError('outside_range')
            subject, text = row.get('subject_name'), row.get('task_name')
            if not isinstance(subject, str) or not subject.strip() or len(subject) > 200:
                raise ValueError('invalid_subject')
            # The school API also returns attachment-only tasks with a null title.
            # Keep the lesson (and its progress ID); never alter source files.
            files = row.get('files')
            if text is None and isinstance(files, list) and files:
                text = 'Задание во вложении'
            if not isinstance(text, str) or not text.strip() or len(text) > 20000:
                raise ValueError('invalid_text')
            # Date is the lesson date, NOT a guessed due date. No child/teacher IDs,
            # tokens, HTML, attachment URLs, or unrelated school data go to cloud.
            if key in items and (items[key]['date'] != day or items[key]['subject'] != subject):
                raise ValueError('inconsistent_lesson')
            parts.setdefault(key, set()).add(text)
            combined = '\n\n'.join(sorted(parts[key]))
            if len(combined) > 20000:
                raise ValueError('lesson_text_too_large')
            items[key] = {'date': day, 'subject': subject, 'text': combined}
        doc = {'schemaVersion': 1, 'source': 'petersburgedu',
               'rangeFrom': source['range_from'], 'rangeTo': source['range_to'],
               'syncedAt': stamp.isoformat(), 'items': items}
        # Reserve >200 KiB for up to 2000 boolean progress fields + Firestore overhead.
        if len(json.dumps(doc, ensure_ascii=False).encode()) > 700000:
            raise ValueError('document_too_large')
        docs[uids[entry['label']]] = doc
    return docs


def write_transaction(transaction, refs, docs):
    # Read BOTH children before writing. Firestore retries on any concurrent
    # checkbox update, so a stale progress map is never committed over a new one.
    previous = {uid: ref.get(transaction=transaction).to_dict() or {} for uid, ref in refs.items()}
    for uid, payload in docs.items():
        old = previous[uid]
        if old.get('syncedAt') and dt.datetime.fromisoformat(old['syncedAt']) > dt.datetime.fromisoformat(payload['syncedAt']):
            raise ValueError('older_snapshot')
        progress = {key: done for key, done in old.get('progress', {}).items()
                    if key in payload['items'] and isinstance(done, bool)}
        # The source is complete. Removed tasks (including previous school years)
        # no longer need progress; current lesson IDs retain checks through edits.
        transaction.set(refs[uid], {**payload, 'progress': progress})


def upload(client, docs):
    from google.cloud import firestore
    refs = {uid: client.collection('schoolHomework').document(uid) for uid in docs}
    firestore.transactional(write_transaction)(client.transaction(max_attempts=5), refs, docs)


def push(snapshot=STATE / 'latest-good.json', config=BASE / 'collector-config.json', links=BASE / 'firebase-links.json', validate=False):
    read = lambda p: json.loads(Path(p).read_text(encoding='utf-8'))
    docs = prepare_docs(read(snapshot), read(config), read(links))
    if not validate:
        import google.auth
        from google.cloud import firestore
        credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
        upload(firestore.Client(project=PROJECT, credentials=credentials, database='(default)'), docs)
    return sum(len(d['items']) for d in docs.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--validate', action='store_true')
    mode.add_argument('--push', action='store_true')
    parser.add_argument('--snapshot', type=Path, default=STATE / 'latest-good.json')
    parser.add_argument('--config', type=Path, default=BASE / 'collector-config.json')
    parser.add_argument('--links', type=Path, default=BASE / 'firebase-links.json')
    args = parser.parse_args()
    try:
        count = push(args.snapshot, args.config, args.links, validate=args.validate)
        print(('Проверено' if args.validate else 'Загружено') + f' заданий: {count}.')
        return 0
    except Exception as exc:
        print('Домашка: ошибка ' + type(exc).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
