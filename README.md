# A.S. APP BUILDER

**Your Idea. Your App. Your APK.**

Бесплатный MVP конструктора прототипов приложений, игр и сайтов по текстовому описанию. Интерфейс адаптирован для мобильных устройств.

## Что уже реализовано
- выбор типа проекта: Android-приложение, игра или сайт;
- поле описания и дополнительные требования;
- локальная генерация небольших HTML-прототипов по встроенным шаблонам;
- предпросмотр результата в iframe;
- просмотр и скачивание HTML;
- экспорт проекта в ZIP-пакет PWA (HTML, manifest, service worker, SVG-иконка и инструкция);
- создание технического задания для передачи внешнему ИИ;
- Android WebView-оболочка и workflow сборки APK конструктора;
- workflow **Build APK for a user project**: отдельная debug-сборка APK для HTML-проекта, заранее сохранённого в репозитории в `projects/<slug>/index.html`;
- демонстрационный проект-счётчик в `projects/demo/index.html`;
- прежний тренажёр предложений сохранён в `predlozheniya.html`.

## Честные ограничения текущей версии
Это **MVP, а не полноценный автономный AI-сервис**. Статическая страница не подключена к AI API: она создаёт прототипы по ограниченным локальным шаблонам. Для сложного приложения используйте генерацию ТЗ и внешнюю AI-систему для создания кода.

Отдельный APK можно собрать для HTML-проекта, добавленного в репозиторий: откройте **Actions → Build APK for a user project → Run workflow** и укажите slug папки проекта. Сайт пока не может запускать сборку APK для произвольных посетителей напрямую: для этого необходим защищённый серверный компонент с аутентификацией, ограничениями и очередью сборок. Не помещайте GitHub-токены, пароли или API-ключи в HTML/JavaScript сайта.

## Бесплатный адрес сайта и публикация
Планируемый бесплатный адрес GitHub Pages (без покупки домена):
**https://asoevsolehjonofficial-stack.github.io/predlozheniya-android/**

Этот адрес начнёт открываться только после включения GitHub Pages в настройках репозитория и успешной публикации. Сам коммит или файл в репозитории не может включить Pages, если GitHub не разрешает интеграции создать сайт.

1. Откройте [настройки GitHub Pages](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/settings/pages).
2. В **Build and deployment** выберите **Source: GitHub Actions**.
3. Сохраните настройку, если появится кнопка Save.
4. Откройте [журнал публикации сайта](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/workflows/deploy-pages.yml) и запустите **Publish website** через **Run workflow** либо дождитесь автоматического запуска после следующего коммита.
5. Убедитесь, что запуск завершился со статусом **Success**, затем откройте адрес выше.

В репозитории есть файл `.nojekyll`, чтобы GitHub Pages публиковал статические файлы без обработки Jekyll. Если публикация падает с `Resource not accessible by integration` или `Pages site not found`, проблема находится в настройке Pages/правах GitHub, а не в HTML-коде; её нельзя исправить новым коммитом без включения Pages в настройках.

## Как получить APK конструктора
Workflow **Build and publish A.S. APP BUILDER APK** собирает APK конструктора и публикует его в GitHub Release с тегом `latest-apk`. После успешной сборки ссылка на APK:
https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/releases/download/latest-apk/app-debug.apk

## Как получить APK отдельного проекта
1. Создайте папку `projects/<slug>/` и добавьте туда `index.html`.
2. Откройте **Actions → Build APK for a user project → Run workflow**.
3. Укажите slug папки, например `demo`, и запустите сборку.
4. После успеха скачайте artifact `project-<slug>-apk` из запуска Actions.
5. Установите APK вручную и подтвердите разрешение Android на установку из выбранного источника.

Это debug APK для тестирования, а не опубликованное приложение в Google Play. Сборка упаковывает HTML/CSS/JS в существующую WebView-оболочку; нативные Android API, произвольные библиотеки и игровые движки автоматически не генерируются. Проверяйте HTML перед сборкой: проверка на секреты в workflow не является полной проверкой безопасности.

## Файлы
- `index.html` — интерфейс конструктора;
- `predlozheniya.html` — тренажёр предложений;
- `app/` — Android WebView-оболочка;
- `.github/workflows/build-apk.yml` — сборка APK конструктора;
- `.github/workflows/build-user-project-apk.yml` — сборка APK отдельного проекта;
- `.github/workflows/deploy-pages.yml` — публикация сайта;
- `projects/` — примеры HTML-проектов для сборки APK.
