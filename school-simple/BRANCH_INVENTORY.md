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

## Вывод
Инвентаризация охватывает 47 веток: 2 защищаемые по назначению, 14 других проектов, 25 школьных кандидатов на уборку, 5 школьных веток, требующих отдельной функциональной проверки, и текущую ветку PR #189. **Ветки пока не удалены.** Для безопасного удаления нужно сверить статусы PR и убедиться, что в ветках нет незавершённых изменений, отсутствующих в `main`.
