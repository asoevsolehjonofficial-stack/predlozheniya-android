# Secure Android APK builds for user projects

## Current safe build path
1. Export a single-file HTML app from A.S. APP BUILDER.
2. Add it to this repository as `projects/<slug>/index.html`; slug must use 1–40 lowercase letters, digits or hyphens.
3. Open Actions → **Build APK for a user project** → Run workflow and enter the slug.
4. Download artifact `project-<slug>-apk`; it contains the test APK and SHA-256 checksum.

A push to `projects/*/index.html` also starts a build. The workflow has read-only repository permissions, uses an isolated GitHub-hosted runner, limits HTML to 1 MiB, checks for common credential patterns, rejects remote scripts/iframes and `javascript:` URLs, injects a restrictive Content Security Policy into the APK copy (including blocking `eval` and all network connections), verifies the APK signature and keeps artifacts for 30 days.

## Automated quality and release controls
- The `Quality and security checks` workflow compares the website HTML with the Android asset, parses the web manifest, checks inline JavaScript syntax, scans for common accidentally committed credentials, and asserts key WebView/CSP protections.
- APK build steps use read-only repository permissions and do not persist the checkout token. Only the separate release job receives `contents: write`, after the APK and SHA-256 checksum have been verified.
- The builder release artifact is retained for 7 days in Actions; the latest release download is published separately.

## Runtime protections
- The Android WebView blocks mixed content and cross-origin local-file access.
- WebView navigation is restricted to bundled `android_asset` files and `about:blank`; arbitrary local file URLs and unsupported schemes are blocked.
- Android app backup is disabled (`allowBackup=false`) to reduce accidental exposure of local app data.
- The native download bridge limits files to 8 MiB and sanitizes filenames.
- HTTP/HTTPS navigation requires confirmation and opens in the external browser; unsupported URL schemes are blocked.
- The generated APK has Internet permission because the builder supports opt-in AI API calls. The default generated-project build CSP blocks network requests from generated app content, external frames, object embeds and form posts.
- These measures reduce risk but are not a complete sandbox or a security audit. Review generated code; do not put secrets or sensitive private data in HTML. Never install APKs from unknown sources.

## Honest limits and next step
- The public static GitHub Pages site cannot safely dispatch GitHub Actions or upload arbitrary projects without a server. Never put a GitHub token in website JavaScript.
- The current workflow builds only HTML projects already committed under `projects/<slug>/index.html`. It does **not** yet provide one-click upload-and-build directly from the public website.
- APKs are test/debug-signed builds, not production Play Store releases. Stable upgrades require a persistent signing key stored as protected GitHub Actions secrets.
- AI providers linked from the site open their own services. Direct API generation is implemented for Gemini and OpenAI-compatible endpoints; a provider may require billing, a valid key, and may reject browser requests due to CORS. The UI asks for confirmation before sending a key to a custom endpoint.
- A full one-click service still requires an authenticated backend with rate limits, per-job isolation, upload validation, retention controls and server-side GitHub credentials stored as secrets. No GitHub token is embedded in the website. The attempt to provision a separate Replit backend was blocked by the connected Replit account requiring an active subscription, so no backend was falsely presented as deployed.
