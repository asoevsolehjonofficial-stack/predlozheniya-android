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

Отдельный APK можно собрать вручную через **Actions → Build APK for a user project → Run workflow**. Для запуска сборки прямо с сайта добавлен защищённый Cloudflare Worker (`backend/src/index.js`) и workflow **Deploy secure APK backend**. Эта функция остаётся отключённой до настройки владельцем Cloudflare, Turnstile, KV/R2 и GitHub Actions secrets/variables. Не помещайте GitHub-токены, пароли или API-ключи в HTML/JavaScript сайта.

## Бесплатный адрес сайта и публикация
Основной адрес сайта, который сейчас используется проектом на Cloudflare Pages:
**https://as-app-builder.pages.dev/**

Cloudflare Pages публикует статическую страницу из репозитория. После изменения файлов дождитесь завершения сборки/развёртывания в панели Cloudflare Pages, затем обновите сайт на телефоне. В репозитории также оставлен отдельный workflow GitHub Pages как альтернативный вариант публикации; для него владелец должен включить GitHub Pages в Settings → Pages → Source: GitHub Actions. Этот альтернативный workflow не развёртывает Cloudflare Worker и сам по себе не включает сборку APK с сайта.

Для безопасной сборки APK Worker должен разрешать точный origin `https://as-app-builder.pages.dev`. Домен `as-app-builder.pages.dev` также должен быть разрешён в настройках виджета Cloudflare Turnstile. Не публикуйте секретный ключ Turnstile или токены GitHub в репозитории и в HTML.

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
- `projects/` — примеры HTML-проектов для сборки APK;
- `backend/src/index.js` — защищённый API для запуска сборок, проверки статуса и выдачи APK;
- `backend/wrangler.toml` — конфигурация Cloudflare Worker;
- `.github/workflows/deploy-backend.yml` — развёртывание backend после настройки секретов;
- `.github/workflows/validate-web.yml` — автоматическая проверка сайта.

## Автоматическая проверка качества

Добавлен workflow `.github/workflows/validate-web.yml`. Он автоматически проверяет наличие обязательных файлов, JSON манифеста PWA, синтаксис JavaScript в `index.html` и service worker, а также случайные маркеры конфликтов при изменениях сайта. Результат проверки смотрите в **Actions → Validate web app**. Эта проверка снижает риск ошибок, но не заменяет тестирование на реальном Android-телефоне.

## Что требуется до полноценного публичного запуска

- **Публикация сайта:** основной адрес — Cloudflare Pages (`https://as-app-builder.pages.dev/`). GitHub Pages — только альтернативный ручной workflow; он не нужен для работы основного адреса.
- **APK для любого созданного посетителем проекта:** нужен отдельный HTTPS backend. В репозитории предусмотрены workflow и API-контракт, но сам backend не развёрнут автоматически этим репозиторием.
- **Секреты сборки:** в настройках Actions нужны переменная `AS_BUILDER_BUILD_API_URL` и секрет `AS_BUILDER_BUILD_SOURCE_SECRET`; backend должен реализовать `/api/internal/source` и `/api/internal/upload`, проверку Turnstile, ограничение частоты запросов, временное хранение, срок действия request ID и очистку APK. Не помещайте секреты в клиентский HTML.
- **ИИ по промпту:** текущая генерация выполняется локальными шаблонами. Для настоящей генерации кода через модели нужен серверный адаптер к выбранным AI API, лимиты расходов и защита ключей. Без ключей/серверов нельзя честно обещать полноценную AI-генерацию.
- **Производственная Android-сборка:** APK из текущего workflow — тестовая debug-сборка. Для распространения как обновляемого приложения требуется постоянный закрытый ключ подписи, тестирование совместимости и отдельный процесс release-сборки.

Нельзя считать проект готовым на 100% только потому, что файлы находятся в GitHub: статус сайта подтверждается успешным Pages deployment, а статус APK — успешной сборкой, проверкой подписи и установочным тестом на Android.



## Статус оставшихся действий владельца

Код backend и workflow развёртывания находятся в репозитории, но я не могу создать Cloudflare-ресурсы, увидеть значения секретов аккаунта или подтвердить развёртывание без доступа к панели Cloudflare. Чтобы включить сборку APK непосредственно на сайте, выполните шаги в [инструкции backend](backend/README.md), затем запустите **Actions → Deploy secure APK backend → Run workflow** и добавьте переменную `AS_BUILDER_BUILD_API_URL` по URL из лога.

Для альтернативной публикации через GitHub Pages вручную запустите workflow **Publish website** после включения Settings → Pages → Source: GitHub Actions. Основной сайт при этом продолжает публиковаться Cloudflare Pages.
