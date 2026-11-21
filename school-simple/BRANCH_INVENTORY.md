# Школа — инвентаризация веток GitHub

**Срез:** 21.11.2026. **Всего:** 47 веток. **Принцип:** не удалять по имени и не считать `diverged` признаком незавершённой работы: после squash-merge GitHub показывает отдельную историю коммитов.

## Сохранить без изменений
- `main` — рабочая ветка репозитория.
- `school-data` — зашифрованные снимки дневника; не удалять и не публиковать открытые данные.
- 12 веток `calendar-*` — другой проект; в рамках уборки «Школы» не трогать.
- 2 ветки `wordscene/*` — другой проект; не трогать.

## Текущая ветка инвентаризации
- `audit/school-repo-inventory-20261121` — рабочая ветка PR #189; не удалять до завершения PR.

## Школьные ветки — кандидаты на уборку после проверки PR
- `audit/school-final-ui-20261121`
- `audit/school-typography-docs-20261121`
- `chore/school-design-consistency-20261121`
- `chore/school-final-checklist-sync-20261121`
- `docs/school-art-and-icons-20261121`
- `docs/school-art-final-20261121`
- `docs/school-design-standard-20261121`
- `feat/school-approved-art-final-20261121`
- `feat/school-approved-monochrome-art-20261121`
- `feat/school-child-empty-illustrations-20261121`
- `feat/school-forecast-thin-bars-20261121`
- `fix/school-art-inset-68-20261121`
- `fix/school-art-optical-padding-20261121`
- `fix/school-art-safe-padding-20261121`
- `fix/school-homework-muted-art-20261121`
- `fix/school-muted-art-final-20261121`
- `fix/school-profile-close-icon-20261121`
- `refactor/school-icon-library-20261121`
- `style/school-homework-muted-doodles-20261121`
- `style/school-icons-cleanup-20261121`
- `style/school-kpi-icon-refinements-20261121`
- `style/school-kpi-lightning-20261121`
- `style/school-muted-doodles-after-library-20261121`
- `style/school-soft-minimal-icons-24px-20261121`
- `test/school-visual-consistency-20261121`

## Школьные ветки — отдельная функциональная проверка перед удалением
- `fix/school-collector-reliability` — сборщик и публикация; повышенная важность.
- `fix/school-holiday-regression-test-20261120` — регрессионный тест календаря.
- `fix/school-snapshot-freshness-150m` — свежесть снимков.
- `school-matvey-achievement-delta` — показатель достижений.
- `school-matvey-easter-egg` — сценарий поощрения ребёнка.

## Проверка незавершённых PR и функциональных веток

- PR #149 закрыт как избыточный: исправление `holidayInfo` уже присутствует в `main` в `regression.test.cjs`.
- PR #157 остаётся открытым: его дополнительные проверки геометрии и типографики отсутствуют в текущем `browser-audit.cjs`; ветка конфликтует с `main`. Не удалять `test/school-visual-consistency-20261121` до переноса или обоснованного отказа от проверок.
- `fix/school-collector-reliability` затрагивает `school-sync/publish.py`, установщик и клиент; сравнение с `main` показывает расхождение историй, но не доказывает отсутствие или наличие функциональности. Не удалять до построчной сверки.
- `fix/school-snapshot-freshness-150m` меняет клиент, Service Worker и версию. Требуется отдельная сверка поведения свежести снимка.
- `fix/school-holiday-regression-test-20261120`: проверить тесты относительно действующего `regression.test.cjs` до удаления.
- `school-matvey-achievement-delta` и `school-matvey-easter-egg`: сверить итоговое поведение с `main`, учитывая squash-merge.

## Сверка содержимого критичных веток

Проверены SHA файлов между ветками и `main`:
- `fix/school-collector-reliability`: `school-sync/publish.py` **полностью совпадает** с `main`; `school-sync/install-local-update.py` отличается, а `school-simple/index.html` также отличается. Отличие само по себе не означает недостающую функцию: текущий `main` содержит более поздние изменения. Построчная сверка установщика выполнена: `main` дополнительно загружает актуальный `publish.py` из GitHub, проверяет маркер содержимого и Python-синтаксис, делает резервные копии и атомарно заменяет три файла вместо двух. Старый установщик переносить нельзя. Остаточный риск: URL указывает на подвижную ветку `main`, а не закреплённый SHA; перед повторной установкой требуется проверка источника и актуальности.
- `fix/school-snapshot-freshness-150m`: `school-simple/school-sync-client.js` **полностью совпадает** с `main`; `index.html` отличается из-за последующих изменений. Ключевой клиентский модуль свежести уже присутствует в `main` побайтно.
- `fix/school-holiday-regression-test-20261120`: `regression.test.cjs` отличается от `main`, но исправление загрузки `holidayInfo` уже есть в действующем тесте.

Это позволяет исключить необходимость слепого переноса совпадающих файлов, но пока не даёт основания удалять ветки без проверки остальных изменений.

## Инвентаризация файлов `main`

Рекурсивное дерево GitHub на 21.11.2026: 40 путей в `school-simple/` и `school-sync/` вместе с каталогами. Видимые файлы относятся к приложению, его ресурсам, тестам, инструментам публикации и документации. Явных временных `.bak`, `.tmp`, `.old` и дублирующих корневых PNG в этих папках нет.

`icons.html` и `ui-catalog.html` — вспомогательные страницы предпросмотра, а не доказанный мусор. `browser-audit.cjs`, `browser-smoke.cjs`, `ui-stability.cjs`, `regression.test.cjs` — тесты; сохранять до проверки зависимостей CI. Отсутствие очевидных секретных файлов по именам **не является** аудитом содержимого или истории Git.

## Вывод
Инвентаризация охватывает 47 веток: 2 защищаемые по назначению, 14 других проектов, 25 школьных кандидатов на уборку, 5 школьных веток, требующих отдельной функциональной проверки, и текущую ветку PR #189. **Ветки пока не удалены.** Для безопасного удаления нужно сверить статусы PR и убедиться, что в ветках нет незавершённых изменений, отсутствующих в `main`.
