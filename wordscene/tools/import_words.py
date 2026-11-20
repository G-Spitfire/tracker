#!/usr/bin/env python3
"""Safely add/update WordScene words from an Excel .xlsx or UTF-8 CSV file.

No third-party dependencies. Blank update cells leave existing values unchanged.
The original word order and stable English identifiers are preserved.
"""
import argparse
import copy
import csv
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

HEADERS = ('action', 'en', 'ru', 'ipa', 'cue', 'scene', 'hint', 'topics',
           'props', 'layout', 'container', 'source')
REQUIRED = ('ru', 'ipa', 'cue', 'scene')
EN = re.compile(r"^[a-z][a-z0-9' -]*$", re.I)
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}


def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            shared = [''.join(t.text or '' for t in si.findall('.//m:t', NS))
                      for si in root.findall('m:si', NS)]
        workbook = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = workbook.findall('m:sheets/m:sheet', NS)
        if not sheets:
            raise ValueError('Workbook has no sheets')
        rel_id = sheets[0].get('{%s}id' % NS['r'])
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target = next((x.get('Target') for x in rels
                       if x.get('Id') == rel_id), None)
        if not target:
            raise ValueError('Cannot find first worksheet')
        sheet_path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        sheet_path = sheet_path.replace('xl/xl/', 'xl/')
        root = ET.fromstring(z.read(sheet_path))
        rows = []
        for row in root.findall('.//m:sheetData/m:row', NS):
            cells = {}
            for c in row.findall('m:c', NS):
                ref = c.get('r', '')
                match = re.match(r'([A-Z]+)', ref)
                if not match:
                    continue
                col = 0
                for char in match.group(1):
                    col = col * 26 + ord(char) - 64
                typ = c.get('t')
                v = c.find('m:v', NS)
                if typ == 'inlineStr':
                    value = ''.join(x.text or '' for x in c.findall('.//m:t', NS))
                elif v is None:
                    value = ''
                elif typ == 's':
                    value = shared[int(v.text)]
                else:
                    value = v.text or ''
                cells[col - 1] = str(value).strip()
            if cells:
                rows.append([cells.get(i, '') for i in range(max(cells) + 1)])
        return rows


def read_rows(path):
    if path.suffix.lower() == '.xlsx':
        return read_xlsx(path)
    if path.suffix.lower() == '.csv':
        with path.open(encoding='utf-8-sig', newline='') as stream:
            return list(csv.reader(stream))
    raise ValueError('Supported formats: .xlsx and .csv')


def split_ids(text):
    return [s.strip() for s in text.split(';') if s.strip()]


def import_rows(catalog, rows, valid_symbols=None):
    if not rows:
        raise ValueError('Empty input file')
    headers = [h.strip().lower() for h in rows[0]]
    if 'en' not in headers or 'action' not in headers:
        raise ValueError('The first row must contain action and en columns')
    if len(set(headers)) != len(headers):
        raise ValueError('Duplicate column headers')
    unknown = set(headers) - set(HEADERS)
    if unknown:
        raise ValueError('Unknown columns: ' + ', '.join(sorted(unknown)))
    words = catalog['words']
    by_id = {w['en'].casefold(): w for w in words}
    if len(by_id) != len(words):
        raise ValueError('Existing catalog has duplicate English words')
    topic_by_id = {t['id']: t for t in catalog['topics']}
    seen = set()
    added = changed = 0
    for line, values in enumerate(rows[1:], 2):
        item = dict(zip(headers, [str(v).strip() for v in values]))
        if not any(item.values()):
            continue
        en = item.get('en', '').strip().lower()
        action = item.get('action', '').lower()
        if not EN.fullmatch(en):
            raise ValueError('Row %s: invalid English word: %r' % (line, en))
        if en in seen:
            raise ValueError('Row %s: duplicate operation for %s' % (line, en))
        seen.add(en)
        if action not in ('add', 'update'):
            raise ValueError('Row %s: action must be add or update' % line)
        exists = en in by_id
        if action == 'add' and exists:
            raise ValueError('Row %s: word already exists: %s' % (line, en))
        if action == 'update' and not exists:
            raise ValueError('Row %s: cannot update missing word: %s' % (line, en))
        word = by_id[en] if exists else {'en': en, 'id': en}
        for field in ('ru', 'ipa', 'cue', 'scene', 'hint', 'layout', 'source'):
            if item.get(field):
                word[field] = item[field]
        if item.get('container'):
            try:
                word['container'] = int(item['container'])
            except ValueError:
                raise ValueError('Row %s: container must be an integer' % line)
        if item.get('props'):
            word['props'] = split_ids(item['props'])
            if valid_symbols is not None:
                invalid = set(word['props']) - valid_symbols
                if invalid:
                    raise ValueError('Row %s: unknown SVG symbols: %s' % (line, ', '.join(sorted(invalid))))
        if item.get('topics'):
            topic_ids = split_ids(item['topics'])
            for topic in topic_ids:
                if topic not in topic_by_id:
                    raise ValueError('Row %s: unknown topic %s' % (line, topic))
            word['topics'] = topic_ids
        if not exists:
            missing = [field for field in REQUIRED if not word.get(field)]
            if missing:
                raise ValueError('Row %s: missing fields: %s' % (line, ', '.join(missing)))
            if not word.get('props') or len(word['props']) < 2:
                raise ValueError('Row %s: new word requires at least two SVG props' % line)
            if not word.get('topics'):
                raise ValueError('Row %s: new word needs a topic' % line)
            word.setdefault('layout', 'meet')
            word.setdefault('container', 0)
            word.setdefault('hint', 'Представь сцену и произнеси слово три раза.')
            words.append(word)
            by_id[en] = word
            added += 1
        else:
            changed += 1
    # Rebuild topic membership from canonical word data; keep topic order.
    for topic in catalog['topics']:
        topic_id = topic['id']
        wanted = {word['en'].casefold() for word in words if topic_id in word.get('topics', [])}
        original = [en for en in topic['words'] if en.casefold() in wanted]
        existing = {en.casefold() for en in original}
        additions = [word['en'] for word in words if word['en'].casefold() in wanted and word['en'].casefold() not in existing]
        topic['words'] = original + additions
    return added, changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Excel .xlsx or UTF-8 CSV')
    parser.add_argument('--catalog', type=Path, default=Path('wordscene/words.json'))
    parser.add_argument('--output', type=Path, help='Output JSON; defaults to --catalog')
    parser.add_argument('--check', action='store_true', help='Validate only, do not write')
    parser.add_argument('--illustrations', type=Path, default=Path('wordscene/illustrations.js'), help='SVG symbols source')
    args = parser.parse_args()
    original = json.loads(args.catalog.read_text(encoding='utf-8'))
    catalog = copy.deepcopy(original)
    # Parse the existing SVG registry; unknown image codes must not enter the catalog.
    illustrations = args.illustrations.read_text(encoding='utf-8')
    marker = 'const symbols='
    start = illustrations.find(marker)
    if start < 0:
        raise ValueError('SVG symbol registry not found')
    symbols, _ = json.JSONDecoder().raw_decode(illustrations[start + len(marker):])
    added, changed = import_rows(catalog, read_rows(args.input), set(symbols))
    print('OK: added=%s updated=%s total=%s' % (added, changed, len(catalog['words'])))
    if not args.check:
        target = args.output or args.catalog
        target.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n',
                          encoding='utf-8')
        print('Saved:', target)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as exc:
        print('ERROR:', exc, file=sys.stderr)
        sys.exit(1)
