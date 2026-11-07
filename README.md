# Семейные приложения

Самостоятельные HTML-приложения, опубликованные на GitHub Pages. У каждого приложения своя папка и точка входа `index.html`.

[Открыть каталог приложений](https://g-spitfire.github.io/tracker/)

| Приложение | Назначение | Адрес | Документация |
| --- | --- | --- | --- |
| Левели | Школьные оценки и успеваемость | [Открыть](https://g-spitfire.github.io/tracker/leveli/) | [README](leveli/README.md) |
| Форма | Трекер тренировок | [Открыть](https://g-spitfire.github.io/tracker/forma/) | [README](forma/README.md) |
| WordScene | Изучение английских слов | [Открыть](https://g-spitfire.github.io/tracker/wordscene-17-lab/) | [README](wordscene-17-lab/README.md) |
| Покер с нуля | Интерактивная инструкция | [Открыть](https://g-spitfire.github.io/tracker/poker/) | [README](poker/README.md) |

## Данные и разработка

- Приложения независимы; их данные и возможности описаны в README внутри соответствующих папок.
- Правила разработки и публикации: [AGENTS.md](AGENTS.md).

Сборка не требуется: GitHub Pages отдаёт статические HTML, CSS, JavaScript и ресурсы.

## WordScene

Актуальная версия — [WordScene 17.0](wordscene-17-lab/README.md), единственная спецификация — [SPEC.md](wordscene-17-lab/SPEC.md). WordScene 16.17 выведена из эксплуатации, старый каталог `wordscene/` доступен только в истории Git. Новый адрес не меняется; сохранения на устройствах не очищаются и не переносятся. Firebase «Левели» используется для школьных оценок; старая интеграция WordScene удалена из интерфейса «Левели». Архивные данные и серверные правила не изменялись.

## Автоматические проверки (GitHub Actions)

Каталог [`.github/workflows/`](.github/workflows/) содержит сценарии автоматической проверки кода. Это не документы приложения и не часть публикуемого интерфейса; удалять каталог без замены проверок не следует.

| Сценарий | Что проверяет | Когда запускается |
| --- | --- | --- |
| [`leveli-model-tests.yml`](.github/workflows/leveli-model-tests.yml) | Синтаксис и модульные тесты модели оценок «Левели», браузерные проверки с искусственными данными | При изменениях `leveli/` в pull request и при push в `main` или специальную ветку |
| [`wordscene-audit.yml`](.github/workflows/wordscene-audit.yml) | Синтаксис `app.js` и `engine.js`, регрессионные тесты аудита WordScene | При изменениях WordScene в pull request и при push в ветку аудита (не при обычном push в `main`) |
| [`wordscene17-local-tests.yml`](.github/workflows/wordscene17-local-tests.yml) | Синтаксис и модульные тесты WordScene/«Левели», браузерные сценарии в Chromium/WebKit, проверка опубликованного сайта на PR, снимки экрана | При изменениях WordScene в `main`, при подходящих изменениях в pull request или вручную из GitHub Actions |

Результаты запусков доступны во вкладке [Actions](https://github.com/G-Spitfire/tracker/actions). Зелёный результат означает прохождение предусмотренных сценарием проверок, но не гарантирует отсутствия всех ошибок. Для статического сайта GitHub Pages отдельная сборка не нужна.
