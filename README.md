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

Сборка не требуется: GitHub Pages отдаёт статические HTML, CSS, JavaScript и ресурсы.

## WordScene

Актуальная версия — [WordScene 17.0](wordscene/README.md), единственная спецификация — [SPEC.md](wordscene/SPEC.md). WordScene 16.17 выведена из эксплуатации, старая версия 16.17 доступна только в истории Git. Постоянный адрес WordScene: `/tracker/wordscene/`. При переходе со старого `/tracker/wordscene-17-lab/` история и прогресс не переносятся: пользователи начинают заново. Firebase «Левели» используется для школьных оценок; старая интеграция WordScene удалена из интерфейса «Левели». Архивные данные и серверные правила не изменялись.
