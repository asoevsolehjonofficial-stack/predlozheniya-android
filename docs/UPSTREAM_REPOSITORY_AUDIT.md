# Upstream repository audit and integration plan

**Audit date:** 2026-10-17  
**Target:** A.S. APP BUILDER  
**Target repository:** https://github.com/asoevsolehjonofficial-stack/predlozheniya-android

This audit records an initial README/license/architecture review. It is not a substitute for a full dependency, source-code, build, and security audit of every upstream repository.

## Decisions

| Upstream repository | License observed | Fit for this project | Decision |
|---|---|---|---|
| [iappyxOS](https://github.com/iappyx/iappyxOS) | MIT | Strong product-pattern fit: manual prompt → external AI → paste full HTML → preview/build; its native bridge and Flutter/on-device APK injection architecture is not a drop-in fit for our static HTML + WebView wrapper + GitHub Actions pipeline. | Reused the workflow idea only: added a manual HTML import fallback so the user can continue without an API key or generation quota. No upstream source code was copied. |
| [AI Website Builder](https://github.com/lab1207/AI-Website-Builder) | MIT | Strong feature reference for conversational edits, live preview, ZIP export, and project import; React/Vite/TypeScript components are not directly compatible with our single-file HTML application. | Keep as a design reference. Do not copy the React application wholesale. |
| [Appacadabra](https://github.com/dmvieira/appacadabra) | MIT | AI-generated HTML micro-apps in WebView; Expo/React Native, native capability modules, Firebase optional backend, and BYOK/OpenRouter assumptions differ from our architecture. | Use only as a future architecture reference for capability-gated native bridges. No code copied. |
| [AI App Builder](https://github.com/Etiip/ai-app-builder) | MIT | Next.js full-stack builder with database/auth/hosting assumptions; substantially heavier than our Pages/Worker MVP. | No direct merge. Revisit only if a separate full-stack deployment is approved. |
| [WebToApp Android](https://github.com/seigneurtsui/web-to-app-android) | Unlicense (per repository README/license) | Relevant to local/on-device APK packaging, but it is a separate Android builder with a much broader runtime. | No code copied; evaluate its build/signing architecture separately before any port. |
| [VibeApp](https://github.com/Skykai521/VibeApp) | GPL-3.0 | Similar goal of on-device app generation/builds, but GPL-3.0 has copyleft obligations and its Android 10+ local-build architecture is not our current web pipeline. | Do not merge source code unless the project owner explicitly accepts GPL-3.0 compatibility and distribution obligations. |
| [AIDaoPublic](https://github.com/IcyKokane/AIDaoPublic) | No LICENSE file found in the initial check | Useful architecture ideas (intent → project → CI build → repair loop), but without an explicit license we must not copy code. | Reference only; do not copy or redistribute source unless the author supplies a license. |

## Change made

- Added a **Manual mode without an API key** to the web interface.
- The user can copy the generated prompt, use any AI chat they already have access to, paste the resulting full HTML, and load it into the isolated preview.
- The import path checks for a complete HTML document and runs the existing structural checks. It does **not** prove that the code is safe or that every feature works.
- The manual path itself does not call an AI API, so it does not consume the A.S. generation quota or require a provider API key.
- Synchronized `app/src/main/assets/index.html` with the website's `index.html`.

## Compatibility and safety boundaries

1. Keep the existing static HTML/JavaScript frontend, Cloudflare Workers, and GitHub Actions APK build pipeline as the integration target.
2. Do not embed upstream API keys, signing keys, passwords, Firebase configuration secrets, or other credentials into generated HTML/APKs.
3. Treat all AI-produced or manually pasted code as untrusted. Preview sandboxing is only one defense; it is not a full security audit.
4. Do not claim that a WebView HTML prototype implements native Android capabilities unless a corresponding, reviewed native bridge exists.
5. Do not integrate GPL-3.0 or unlicensed code without a deliberate licensing decision.
6. Before a wider code port, verify the exact source files, transitive dependencies, license notices, build compatibility, and runtime permissions.

## Next integration sequence

1. Run syntax/quality checks on the new manual import flow and confirm the website and Android asset are identical.
2. Test manual import with valid HTML, incomplete HTML, Markdown-fenced HTML, and oversized/malformed input.
3. Verify preview sandboxing, HTML/PWA export, Android project ZIP export, save/load, and APK build submission.
4. Continue a separate Worker security review and a real AI generation test; a health check alone is not proof that inference works.
5. Only then consider isolated feature ports from MIT/Unlicense projects, with notices and tests where required.

## Second-pass review (2026-10-17)

The following repositories were checked after the first audit. This pass focused on whether their architecture can be safely transplanted into the existing Pages + Workers + WebView + GitHub Actions system.

| Repository | License/architecture finding | Decision for A.S. APP BUILDER |
|---|---|---|
| [bolt.diy](https://github.com/stackblitz-labs/bolt.diy) | MIT; provider abstraction and browser-first AI coding workflow, but Node 22/pnpm, a React/Remix-style application stack, multiple provider SDKs, and user-supplied model credentials are a substantial migration. | **Do not merge wholesale.** Use the product pattern for future provider adapters and iterative edits. Our current single-file mobile UI and Cloudflare Worker backend remain the target. |
| [ai-app-builder-open](https://github.com/totalumlabs/ai-app-builder-open) | MIT; live preview, code editor, visual editing, version history, GitHub sync and full-stack Next.js sandbox. Requires a much heavier full-stack deployment and model API access. | **Architecture reference only.** Its feature roadmap is useful; the full application is not a safe drop-in replacement for our static mobile-first product. |
| [Dyad](https://github.com/dyad-sh/dyad) | Apache-2.0 outside `src/pro/`; `src/pro/` is under Functional Source License 1.1 with Apache-2.0 changeover. Desktop/local-first product that expects local machine resources and model keys. | **Do not port its desktop-specific components.** It does not solve the user's phone-only hosted workflow. Check the path-specific license before any future port. |
| [Web2APK](https://github.com/bhawan-kavinda/Web2APK) | MIT; a configurable GitHub Actions workflow wraps web content with Capacitor and uploads APK artifacts. | **Do not add a parallel APK builder now.** Our existing queue already validates HTML, uses Turnstile and short-lived GitHub OIDC, applies rate limits, verifies artifact integrity, and uses a controlled signing service. Replacing it with another workflow would duplicate functionality and may weaken its trust boundaries. |
| [cemcoe/web-to-apk-action](https://github.com/cemcoe/web-to-apk-action) | A reusable Docker-based GitHub Action for Capacitor APK builds. | **Reference only.** Our current workflow already builds the WebView APK and manages private queued projects; adding a third-party action would expand the supply-chain surface without closing a verified gap. |
| [Narottam04/action-capacitor-android](https://github.com/Narottam04/action-capacitor-android) | MIT-described Marketplace action for Capacitor APK/AAB builds, requiring signing and access-token secrets for release publishing. | **Not integrated.** The existing custom signing flow avoids introducing another external action and secret-handling path. |

### Concrete integration made from this review

- Added `.github/scripts/manual-import-browser-test.mjs`, a real Chromium interaction test for manual HTML import.
- Expanded `.github/workflows/manual-import-smoke.yml` to install Playwright/Chromium and test the actual page UI. It verifies that incomplete HTML is rejected, Markdown-fenced complete HTML is accepted, the preview iframe remains sandboxed, export controls become enabled, and the page has no uncaught JavaScript errors.
- This adopts the **testing and live-preview workflow pattern**, not third-party source code. The test workflow must pass in GitHub Actions before this is considered verified.
- Kept the existing custom APK queue and signing pipeline; no third-party APK action was inserted into the production path.

### Remaining caution

MIT and Apache-2.0 do not remove the need to retain required notices and review dependencies. A repository-level license may not cover every nested directory or third-party asset. This is an engineering compatibility review, not legal advice.
