# Secure Android APK build for user projects

## Safe build path
1. Export a single-file HTML app from A.S. APP BUILDER.
2. Add it to this repository as `projects/<slug>/index.html`; slug must use 1–40 lowercase letters, digits or hyphens.
3. Open Actions → **Build APK for a user project** → Run workflow and enter the slug.
4. Download artifact `project-<slug>-apk`; it contains a debug-signed APK and SHA-256 checksum.

A push to `projects/*/index.html` also starts the build. The workflow has read-only repository permissions, uses a GitHub-hosted isolated runner, limits HTML to 1 MiB, checks for common credentials, rejects external script/iframe tags and javascript: URLs, verifies the APK signature, and keeps artifacts for 30 days.

## Security and limitations
- The public static website cannot safely dispatch GitHub Actions or upload arbitrary files without a server. Never put a GitHub token in website JavaScript.
- These are debug-signed test APKs, not Play Store release builds. For stable upgrades, configure protected signing secrets in GitHub Actions.
- Static checks are not a complete security audit. Review generated code and never put secrets or private data in HTML.
- One-click browser-to-APK requires an authenticated backend with rate limits, per-job isolation, upload validation, retention controls and server-side GitHub credentials stored as secrets.
- AI API keys entered in the browser are not saved to localStorage, but are visible to the browser session and sent directly to the provider. For a public service, proxy requests through a secured backend.
