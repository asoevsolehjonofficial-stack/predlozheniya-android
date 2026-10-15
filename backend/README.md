# A.S. APP BUILDER — private APK build backend

This Cloudflare Worker connects the public Cloudflare Pages UI to GitHub Actions while keeping the GitHub token, project source, and generated APK private. User HTML is stored temporarily in KV, fetched by a runner using a server-to-server secret, and removed from the job record. APK bytes are stored in a private R2 bucket, not in public repository branches or public Actions artifacts.

## Required accounts and services

- Cloudflare Workers, KV, R2, and Turnstile.
- A GitHub fine-grained token restricted to the single repository `asoevsolehjonofficial-stack/predlozheniya-android`.
- GitHub Actions enabled for the repository.

Never put any secret in `index.html`, browser storage, a public repository file, or a workflow input.

## 1. Create Turnstile

1. In Cloudflare, create a Turnstile widget.
2. Allow hostname `as-app-builder.pages.dev` (the currently used public site). If you later add a custom domain, allow that hostname too.
3. Copy the **site key** for the website UI and the **secret key** for the Worker.

The site key is public. The secret key must be stored as a Worker secret.

## 2. Create a least-privilege GitHub token

Create a fine-grained token restricted to this one repository. Grant only:
- **Actions: Read and write** — the Worker dispatches the build workflow and reads its run status.

The token does not need Contents access or repository write access. Do not use an account-wide classic token. Set an expiration date and rotate it if exposed.

## 3. Create storage resources

In Cloudflare, create:
- A KV namespace named `JOBS`.
- A KV namespace named `RATE_LIMITS`.
- A **private** R2 bucket named `as-app-builder-builds`. Do not enable public access.

Copy both KV namespace IDs. The deployment workflow injects them from GitHub Actions variables, so you do not need to edit the repository file directly.

## 4. Configure GitHub Actions and deploy

In repository **Settings → Secrets and variables → Actions**, add these repository secrets:

- `CLOUDFLARE_API_TOKEN` — scoped to the correct Cloudflare account with permission to deploy Workers and manage the configured KV/R2 bindings and Worker secrets.
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID.
- `AS_BUILDER_GITHUB_TOKEN` — a fine-grained GitHub token restricted to this repository, with only Actions: Read/Write.
- `TURNSTILE_SECRET` — the Turnstile secret key.
- `AS_BUILDER_BUILD_SOURCE_SECRET` — a long random value of at least 32 characters. The same value is used by the Worker and GitHub-hosted build runner.

Add these repository **variables**:

- `AS_BUILDER_JOBS_KV_ID` — the ID of the `JOBS` namespace.
- `AS_BUILDER_RATE_LIMITS_KV_ID` — the ID of the `RATE_LIMITS` namespace.
- `AS_BUILDER_TURNSTILE_SITE_KEY` — the public Turnstile site key.

Then open GitHub **Actions → Deploy secure APK backend → Run workflow**. The workflow installs Wrangler, deploys a bootstrap Worker, updates Worker secrets from protected repository secrets, injects the namespace/site-key settings at deploy time, and redeploys the Worker with the complete configuration. It does not commit secret values into the repository.

Copy the Worker URL printed in the deployment log, such as `https://as-app-builder-api.<account>.workers.dev`, and add a repository Actions variable named `AS_BUILDER_BUILD_API_URL` with that URL (no trailing slash). The Worker URL used on the website and in this variable must match. The Worker `SITE_ORIGIN` is configured for `https://as-app-builder.pages.dev`; if the public site domain changes, update that setting and the Turnstile hostname too.

## 5. Connect the website

Open the public A.S. APP BUILDER site at `https://as-app-builder.pages.dev/`. In **05 / Сборка APK проекта**:
1. Enter the Worker URL.
2. Enter the public Turnstile site key.
3. Press **Проверить сервер**.
4. Complete the Turnstile check.
5. Generate/preview a project and press **Собрать APK проекта**.

The website keeps only the Worker URL and public site key in browser storage. The per-build download token stays in page memory; reloading the page loses that token and the build result cannot be retrieved from that page session.

## Security behavior and limits

- CORS allows only the configured website origin.
- Turnstile verification checks the expected action and hostname.
- KV-based rate limits: at most 2 build requests per IP per hour and 10 builds globally per UTC day; simultaneous requests can briefly race.
- HTML is limited to 1 MiB and checked for common leaked credentials, external script/iframe sources, `javascript:` URLs, and custom CSP overrides.
- Project HTML is not committed to any repository branch. The runner fetches it through an authenticated internal endpoint, then the Worker removes the source from the KV job record.
- The build workflow has read-only repository permissions and disables checkout credential persistence.
- APKs are stored in a private R2 bucket. The Worker returns them only when a per-job access token is supplied, and checks SHA-256 both on upload and download.
- Job records and APK objects are cleaned up after 24 hours by KV TTL and the daily Worker cron.
- Generated APKs use a restrictive CSP: external network calls, frames, objects, and form submissions are blocked by default. Apps that need remote APIs require a separately reviewed, explicit networking design.
- The result is a **debug/test APK**. Production distribution requires a stable private signing key configured as protected Actions secrets and a separate release-signing review.
- GitHub Actions usage quotas, Cloudflare limits, and provider policies still apply.
- The Worker is not deployed merely because its source is in GitHub. A Cloudflare owner must complete the one-time setup above.

## Troubleshooting

- `503 Backend is not configured`: check both KV IDs, R2 binding, `SITE_ORIGIN`, `TURNSTILE_SITE_KEY`, and all Worker secrets.
- `403 Origin is not allowed`: the browser origin must exactly match `SITE_ORIGIN`.
- Turnstile fails: check the allowed hostname, site key, and matching secret.
- GitHub API `403`: confirm the token's repository selection and Contents/Actions permissions.
- Runner says missing variable/secret: configure `AS_BUILDER_BUILD_API_URL` and `AS_BUILDER_BUILD_SOURCE_SECRET` in repository Actions settings.
- Build failure: open the GitHub Actions run linked in the UI. The workflow rejects unsafe or oversized input and may reject features that require external network access.
