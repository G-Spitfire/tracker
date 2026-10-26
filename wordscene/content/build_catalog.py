"""Validate the editorial catalog; never mutate the published application."""
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent
read = lambda name: json.loads((ROOT / name).read_text())
catalog = json.loads((ROOT.parent / 'vocabulary-review.json').read_text())['words']
canonical = {w['en'].casefold(): w for w in catalog}
current = read('current-words.json')
current_by_word = {w['en'].casefold(): w for w in current}
decisions = []
for file in sorted(ROOT.glob('scene-candidates-0[1-5].json')):
    pack = json.loads(file.read_text())
    for kind in ('cards', 'deferred'):
        for entry in pack.get(kind, []):
            key = entry['en'].casefold()
            assert key in canonical, (file.name, key)
            entry = dict(entry)
            entry['en'] = canonical[key]['en']
            entry['sourceTranslation'] = canonical[key]['ru']
            entry['decision'] = 'scene-draft' if kind == 'cards' else 'deferred'
            entry['productionReady'] = False
            entry['sourcePack'] = file.name
            if kind == 'cards':
                for field in ('ru', 'cue', 'scene', 'learningType', 'illustrationBrief'):
                    assert entry.get(field, '').strip(), (key, field)
                assert 'Черновик:' not in entry['scene'], key
            else:
                assert entry.get('reason'), (key, 'missing reason')
            if key in current_by_word:
                entry['currentCardPreserved'] = True
            decisions.append(entry)
counts = Counter(x['en'].casefold() for x in decisions)
assert len(decisions) == 450, len(decisions)
assert all(v == 1 for v in counts.values()), [k for k,v in counts.items() if v != 1]
assert set(counts) == set(canonical), set(canonical) - set(counts)
assert 'cook' in counts and 'cooker' not in counts
assert not {'yacht','dairy','scary','scared'} & set(counts)
assert all(' ' not in x['en'] and '-' not in x['en'] for x in decisions)
by_word = {x['en'].casefold(): x for x in decisions}
decisions = [by_word[x['en'].casefold()] for x in catalog]
extra = [w['en'] for w in current if w['en'].casefold() not in canonical]
summary = {'reviewed':len(decisions), 'sceneDrafts':sum(x['decision']=='scene-draft' for x in decisions), 'deferred':sum(x['decision']=='deferred' for x in decisions), 'currentCardsPreserved':len(current), 'currentOutsideTarget':extra, 'productionReadyNew':0}
result = {'summary':summary, 'releaseStatus':'content preparation; images and pronunciation verification outstanding; not deployed', 'words':decisions}
(ROOT / 'vocabulary-plan.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
md = ['# WordScene — редакционный каталог', '', 'Это сценарии карточек, а не опубликованное обновление приложения. Новые иллюстрации и проверка произношения ещё требуются.', '', '## Итоги', '', f"Проверены все {summary['reviewed']} слов. Сценариев: {summary['sceneDrafts']}. Отложено: {summary['deferred']}. Существующих карточек сохраняем: {len(current)}.", '', '## Правила подключения', '', '- Сохранить существующий порядок слов: текущие занятия используют числовые индексы.', '- Не заменять уже знакомые образы автоматически.', '- Добавлять новые готовые карточки в конец; сохранить ключ word-scenes-v5.', '- Не включать в одну пятёрку одинаковые звуковые подсказки и общие опорные образы.', '- Созвучие не заменяет правильное произношение.', '- Для карточек из частей английского слова показать их значения явно.', '- До публикации проверить иллюстрации, произношение, восстановление прерванного занятия и офлайн-кэш.', '', '## Сценарии', '']
for w in decisions:
    if w['decision'] != 'scene-draft': continue
    md += [f"### {w['en']} — {w['ru']}", '', f"Опора: **{w['cue']}**. Тип: {w['learningType']}.", '', w['scene'], '']
md += ['## Отложенные слова', '', '| Слово | Перевод | Причина |', '|---|---|---|']
for w in decisions:
    if w['decision'] == 'deferred': md.append(f"| {w['en']} | {w['sourceTranslation']} | {w['reason'].replace('|','/')} |")
(ROOT / 'CONTENT-REVIEW.md').write_text('\n'.join(md)+'\n')
print(json.dumps(summary,ensure_ascii=False))
