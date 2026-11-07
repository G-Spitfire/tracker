# Семейные приложения

Самостоятельные HTML-приложения, опубликованные на GitHub Pages. У каждого приложения своя папка и точка входа `index.html`.

[Открыть каталог приложений](https://g-spitfire.github.io/tracker/)

| Приложение | Назначение | Адрес | Документация |
| --- | --- | --- | --- |
| Левели | Школьные оценки и успеваемость | [Открыть](https://g-spitfire.github.io/tracker/leveli/) | [README](leveli/README.md) |
| Форма | Трекер тренировок | [Открыть](https://g-spitfire.github.io/tracker/forma/) | [README](forma/README.md) |
| WordScene | Изучение английских слов | [Открыть](https://g-spitfire.github.io/tracker/wordscene/) | [README](wordscene/README.md) |
| Покер с нуля | Интерактивная инструкция | [Открыть](https://g-spitfire.github.io/tracker/poker/) | [README](poker/README.md) |

## Данные и разработка

- Приложения независимы; их данные и возможности описаны в README внутри соответствующих папок.
- Правила разработки и публикации: [AGENTS.md](AGENTS.md).

Сборка не требуется: GitHub Pages отдаёт статические HTML, CSS, JavaScript и ресурсы.

## WordScene

Актуальная версия — [WordScene 17.0](wordscene/README.md), единственная спецификация — [SPEC.md](wordscene/SPEC.md). WordScene 16.17 выведена из эксплуатации, старая версия 16.17 доступна только в истории Git. Постоянный адрес WordScene: `/tracker/wordscene/`. При переходе со старого `/tracker/wordscene-17-lab/` история и прогресс не переносятся: пользователи начинают заново. Firebase «Левели» используется для школьных оценок; старая интеграция WordScene удалена из интерфейса «Левели». Архивные данные и серверные правила не изменялись.

## Автоматические проверки

В папке [`.github/workflows/`](.github/workflows/) оставлен один сценарий [`wordscene17-local-tests.yml`](.github/workflows/wordscene17-local-tests.yml) для WordScene и «Левели». Он проверяет синтаксис JavaScript, запускает модульные тесты и браузерные проверки на искусственных данных при изменении кода в pull request и при публикации в `main`; его также можно запустить вручную на вкладке [Actions](https://github.com/G-Spitfire/tracker/actions).

Дублирующие сценарии удалены. Проверка уже опубликованного сайта из pull request исключена: в этот момент на GitHub Pages ещё находится старая версия и такой тест может ошибочно падать. Публикация GitHub Pages работает отдельно от этого сценария. Изменения WordScene и «Левели» не затрагивают пользовательские данные.
