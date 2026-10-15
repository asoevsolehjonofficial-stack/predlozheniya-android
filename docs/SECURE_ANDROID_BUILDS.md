# Secure Android APK builds for user projects

## Website-to-APK build path
1. Generate and preview a project on the public website.
2. Configure the Cloudflare Worker backend by following [backend/README.md](../backend/README.md).
3. In the website section **05 / Сборка APK проекта**, enter the deployed Worker URL and public Turnstile site key, verify the service, complete Turnstile, and submit the project.
4. The backend stores source temporarily in KV, dispatches the build workflow, receives the APK into private R2 storage, checks the checksum, and returns the APK bytes only to the browser session holding the per-build token.
5. Source HTML is not committed to a repository branch or public artifact. KV job records and private R2 APKs expire after 24 hours.

User HTML is not committed to `main` or served from the GitHub Pages origin. The Worker source is present in this repository, but the service is not deployed until an owner completes the one-time Cloudflare setup.

The workflow validates slug/request IDs, fetches the source using a server-to-server secret, limits HTML to 1 MiB, checks for common credential patterns, rejects remote scripts/iframes and `javascript:` URLs, injects a restrictive Content Security Policy into the APK copy (including blocking `eval` and all network connections), verifies the APK signature and uploads the APK to private R2 storage. It does not publish user APKs as public Actions artifacts.

## Automated quality and release controls
- The `Quality and security checks` workflow compares the website HTML with the Android asset, parses the web manifest, checks inline JavaScript syntax, scans for common accidentally committed credentials, and asserts key WebView/CSP protections.
- APK build steps use read-only repository permissions and do not persist the checkout token. Only the separate release job receives `contents: write`, after the APK and SHA-256 checksum have been verified.
- The builder release artifact is retained for 7 days in Actions; the latest release download is published separately.

## Runtime protections
- The Android WebView blocks mixed content and cross-origin local-file access.
- WebView navigation is restricted to bundled `android_asset` files and `about:blank`; arbitrary local file URLs and unsupported schemes are blocked.
- Android app backup is disabled (`allowBackup=false`) to reduce accidental exposure of local app data.
- The native download bridge limits files to 8 MiB, sanitizes filenames, and permits only a fixed set of document/web-image extensions (not APK installers).
- HTTP/HTTPS navigation requires confirmation and opens in the external browser; unsupported URL schemes are blocked.
- The generated APK has Internet permission because the builder supports opt-in AI API calls. The default generated-project build CSP blocks network requests from generated app content, external frames, object embeds and form posts.
- These measures reduce risk but are not a complete sandbox or a security audit. Review generated code; do not put secrets or sensitive private data in HTML. Never install APKs from unknown sources.

## Honest limits and next step
- The public static GitHub Pages site cannot safely dispatch GitHub Actions or upload arbitrary projects without a server. Never put a GitHub token in website JavaScript.
- One-click upload-and-build is implemented in the website UI and Worker source, but it will not work publicly until the Cloudflare Worker is deployed and configured with KV namespaces, a private R2 bucket, Turnstile secrets, a least-privilege GitHub token, and the matching GitHub Actions variable/secret. The Worker cannot be deployed from this environment because Cloudflare account access and secrets are not available here.
- APKs are test/debug-signed builds, not production Play Store releases. Stable upgrades require a persistent signing key stored as protected GitHub Actions secrets.
- AI providers linked from the site open their own services. Direct API generation is implemented for Gemini and OpenAI-compatible endpoints; a provider may require billing, a valid key, and may reject browser requests due to CORS. The UI asks for confirmation before sending a key to a custom endpoint.
- The Worker provides CORS allowlisting, Turnstile verification, per-IP request limits, HTML validation, private source delivery, token-protected APK downloads, checksum validation, and scheduled KV/R2 cleanup. KV rate limiting is best-effort rather than atomic, and the service still needs real-world load/security testing before opening to the public.
- AI provider API calls from the builder are still direct browser-to-provider calls; provider keys entered by an individual user are not stored by the site, but are used in the browser and sent to the provider. A separate server-side AI proxy is not configured.
- No GitHub token or signing secret is embedded in the website.
