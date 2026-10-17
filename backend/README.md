# A.S. APP BUILDER — защищённый backend сборки APK

## Текущая архитектура

- Сайт: https://as-app-builder.pages.dev/
- Worker API: https://as-app-builder-api.asoev-solehjon-official.workers.dev
- GitHub Actions workflow очереди: `.github/workflows/build-user-project-apk.yml`
- Исходный код Worker: `backend/src/index.js`

Backend использует Cloudflare Worker, пространства KV `JOBS` и `RATE_LIMITS`, а также Cloudflare Turnstile. **R2 в текущей реализации не используется.** HTML-задание и APK хранятся временно в KV; APK сохраняется как Base64, ограничен 18 MiB и автоматически истекает через 24 часа.

## Настройки Worker

В Cloudflare должны существовать следующие bindings:

- `JOBS` — KV namespace для заданий и временных APK;
- `RATE_LIMITS` — KV namespace для лимитов;
- `SITE_ORIGIN` — `https://as-app-builder.pages.dev`;
- `TURNSTILE_SITE_KEY` — публичный site key;
- `TURNSTILE_SECRET` — секретный binding Cloudflare Worker.

Не выводите значение `TURNSTILE_SECRET` в чаты, файлы репозитория или логи. Site key публичный; secret key — нет.

## Как проходит сборка

1. Браузер отправляет запрос на `POST /api/build`.
2. Worker проверяет Origin, Turnstile, размер тела, HTML и частоту запросов.
3. Исходник помещается в `JOBS` с уникальным идентификатором и токеном доступа.
4. GitHub Actions запускает очередь примерно раз в пять минут.
5. Сборщик использует короткоживущий GitHub OIDC-токен для внутренних endpoint-ов Worker.
6. Сборщик проверяет HTML, создаёт APK, проверяет подпись APK и SHA-256.
7. APK загружается через внутренний endpoint и временно сохраняется в KV.
8. Браузер может проверить статус и скачать APK с токеном доступа к этому заданию.

Внутренние endpoint-ы: `/api/internal/claim`, `/api/internal/source`, `/api/internal/upload`, `/api/internal/fail`. Пользовательские endpoint-ы: `/api/health`, `/api/build`, `/api/status`, `/api/download`.

## Ограничения и защита

- HTML: максимум 1 MiB;
- тело запроса: максимум 6 MiB, размер ограничивается потоковым чтением;
- APK: максимум 18 MiB;
- лимиты по умолчанию: 2 запроса на IP в час и 10 сборок в сутки;
- Turnstile проверяется на сервере с проверкой action и hostname;
- CORS разрешает только настроенный сайт;
- внутренние запросы GitHub Actions проверяются по короткоживущему OIDC JWT, включая репозиторий и workflow;
- APK проверяется по SHA-256 при загрузке и скачивании;
- исходники и APK имеют срок хранения около 24 часов;
- сгенерированный APK использует ограничительную CSP: внешние сетевые запросы, iframe и отправка форм запрещены по умолчанию;
- APK является debug/test-сборкой, а не готовым релизом Google Play.

Лимиты KV и GitHub Actions применяются. KV — временное хранилище; оно не предназначено для долговременного хранения APK или больших проектов. Лимиты по IP и за сутки могут иметь небольшие гонки при одновременных запросах.

## Развёртывание

Worker уже развёрнут в аккаунте Cloudflare. Файл `wrangler.toml` содержит имена binding-ов, идентификаторы KV, origin и site key.

Workflow `.github/workflows/deploy-backend.yml` запускается вручную и использует GitHub Actions secrets `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`. Секрет `TURNSTILE_SECRET` должен оставаться настроенным в Cloudflare Worker отдельно. После любого развёртывания проверьте, что все bindings и секрет сохранены, затем проверьте `/api/health` и тестовую сборку.

В конфигурации Worker предусмотрена ежедневная очистка старых заданий по cron `17 3 * * *`. GitHub Actions запускает обработчик очереди примерно каждые пять минут.

## Регрессионные тесты

Выполнить из папки `backend`:

```bash
npm test
node --check src/index.js
```

Тесты проверяют безопасную валидацию HTML, проверку секретов, сравнение значений, Base64 и ограниченное чтение тела запроса. Успешные автоматические проверки не заменяют тестирование сборки и установки APK на реальном Android-устройстве.

## Следующие задачи

- сквозное тестирование реального запроса с сайта;
- проверка установки APK на Android;
- дальнейшая проверка гонок в rate limiting и очереди;
- стабильная подпись релизных APK;
- отдельная проверенная архитектура для приложений, которым нужен сетевой доступ;
- полноценная генерация и изменение кода через ИИ с защитой API-ключей и лимитами.


## DeepSeek AI provider

The AI Worker is deployed separately from the build API using `backend/wrangler-ai.toml`. To enable DeepSeek:

1. In Cloudflare Dashboard, open Workers & Pages → `as-app-builder-ai` → Settings → Variables and Secrets → Production.
2. Add `DEEPSEEK_API_KEY` as a **Secret**. Never place the key in `wrangler-ai.toml`, browser code, Git, or logs.
3. Deploy the updated AI Worker code. The secret is read server-side through `env.DEEPSEEK_API_KEY`.
4. When `AI_PROVIDER` is unset, the Worker selects DeepSeek when the secret exists; otherwise it uses Cloudflare AI. To force a provider, set the non-secret variable `AI_PROVIDER` to `deepseek` or `cloudflare`. An explicit invalid provider or a selected-but-unconfigured provider fails closed instead of silently switching.
5. Optional `DEEPSEEK_MODEL` accepts only `deepseek-flash` or `deepseek-v4-pro`; the default is `deepseek-flash`.

DeepSeek calls use `https://api.deepseek.com/chat/completions`, server-side bearer authentication, a 25-second timeout, bounded prompt/output sizes, and sanitized error responses. Existing origin checks and shared rate limits remain active. Upstream quota errors return a clear 429 response; there is no automatic paid-provider fallback.

The `/api/health` endpoint reports the selected provider/model and whether the provider is configured, without returning secret values. Automated tests mock the upstream request and do not require a real DeepSeek key or spend API credits. A successful mock test does not prove that the production secret is correct or that the provider account has available quota.

Official API documentation: https://api-docs.deepseek.com/api/create-chat-completion/
