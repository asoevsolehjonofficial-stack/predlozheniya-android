# A.S. APP BUILDER — secure APK build backend

This Worker is an optional backend for the public GitHub Pages UI. It keeps GitHub credentials server-side and builds a user project on an isolated temporary branch. User HTML is **not** committed to `main` or served from the GitHub Pages origin.

## Required accounts and services

- A Cloudflare account with Workers, KV, and Turnstile.
- A GitHub fine-grained personal access token restricted to the single repository `asoevsolehjonofficial-stack/predlozheniya-android`.
- The existing GitHub Actions workflow `.github/workflows/build-user-project-apk.yml`.

No token, signing key, or Turnstile secret belongs in `index.html`, browser storage, or a public GitHub file.

## 1. Create Turnstile

1. In Cloudflare, create a Turnstile widget.
2. Allow hostname `asoevsolehjonofficial-stack.github.io`.
3. Copy the **site key** for the website UI and the **secret key** for the Worker.

The site key is public. The secret key must be stored as a Worker secret.

## 2. Create a least-privilege GitHub token

Create a fine-grained token restricted to this one repository. Grant only:
- **Contents: Read and write** — create and delete temporary branches and commit the HTML on those branches.
- **Actions: Read and write** — dispatch the build workflow and read its run/artifact status.

Do not use an account-wide classic token. Set an expiration date and rotate it if exposed.

## 3. Create KV namespaces

From the `backend` folder, install Wrangler:

```sh
npm install
npx wrangler login
npx wrangler kv namespace create JOBS
npx wrangler kv namespace create RATE_LIMITS
```

Copy each returned namespace ID into `backend/wrangler.toml`, replacing:
- `REPLACE_WITH_JOBS_KV_NAMESPACE_ID`
- `REPLACE_WITH_RATE_LIMITS_KV_NAMESPACE_ID`

Set `SITE_ORIGIN` to the exact browser origin (not a path). The default is `https://asoevsolehjonofficial-stack.github.io`. Set `TURNSTILE_SITE_KEY` to the public Turnstile site key.

## 4. Add secrets and deploy

Run these commands from the `backend` folder:

```sh
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put TURNSTILE_SECRET
npm install
npx wrangler deploy
```

Enter the values interactively when prompted. Do not paste secrets into chat, source files, or the website. The deployment will print a Worker URL similar to `https://as-app-builder-api.<account>.workers.dev`.

## 5. Connect the website

Open the public A.S. APP BUILDER site. In **05 / Сборка APK проекта**:
1. Enter the Worker URL.
2. Enter the public Turnstile site key.
3. Press **Проверить сервер**.
4. Complete the Turnstile check.
5. Generate/preview a project and press **Собрать APK проекта**.

The website stores only the Worker URL and public site key in local browser storage. The GitHub token and Turnstile secret stay on the server.

## Security behavior and limits

- CORS allows only the configured website origin.
- Turnstile verification is required for every build request.
- Rate limit: at most 2 build requests per IP per hour (KV-based; simultaneous requests can briefly race).
- HTML is limited to 1 MiB and checked for common leaked credentials, external script/iframe sources, `javascript:` URLs, and custom CSP overrides.
- Each build uses a unique temporary branch. The Android build workflow has read-only repository permissions and disables checkout credential persistence.
- The APK's checksum is verified again by the Worker before returning the APK bytes to the browser.
- A daily Worker cron removes stale temporary branches older than 24 hours.
- Generated APKs have a restrictive CSP: external network calls, frames, objects, and form submissions are blocked by default. Apps that need remote APIs need a separately reviewed, explicit networking design.
- The build currently returns a **debug/test APK**. Production distribution requires a stable private signing key configured as protected Actions secrets and a separate release-signing review.
- GitHub Actions usage quotas, Cloudflare limits, and provider policies still apply.
- The Worker is not deployed merely because its source is in GitHub. A Cloudflare owner must complete the one-time setup above.

## Troubleshooting

- `503 Backend is not configured`: check both KV IDs, `SITE_ORIGIN`, `TURNSTILE_SITE_KEY`, and both Worker secrets.
- `403 Origin is not allowed`: the browser origin must exactly match `SITE_ORIGIN`.
- Turnstile fails: check the allowed hostname, site key, and matching secret.
- GitHub API `403`: confirm the token's repository selection and Contents/Actions permissions.
- Build failure: open the GitHub Actions run linked in the UI. The workflow rejects unsafe or oversized input and may reject features that require external network access.
