# A.S. APP BUILDER — Security Audit and Test Plan

**Date:** 2026-10-17  
**Branch:** `audit/opensource-repository-review`  
**Scope:** Static review of the current `main` branch source and CI configuration. This is not a penetration test and does not prove deployed Cloudflare settings or runtime behavior.

## Executive summary

The repository already has useful defensive controls: bounded request-body reading, strict Origin/CORS handling, Turnstile on the build submission flow, per-IP/global AI quotas, short-lived GitHub OIDC for the build queue, HTML size checks, a generated-APK Content Security Policy, WebView navigation restrictions, and automated regression workflows.

However, several controls are defense-in-depth rather than complete security boundaries. The current audit does not justify a claim of “fully secure” or “100% tested.”

## Findings and recommended priority

### F-01 — Bring-your-own AI keys remain in the browser runtime
**Priority: Medium; expected behavior, needs clearer threat model.**

The website sends a user-entered Gemini/OpenAI-compatible key directly to the configured provider. It is not written to localStorage by the inspected flow, but it is necessarily present in page memory and browser network requests. A user can also configure a custom HTTPS endpoint, which receives the key after an explicit confirmation.

**Mitigation:** keep this as an explicitly labelled advanced/BYOK mode; warn that provider billing applies; never log the key; do not store it; validate endpoint/provider; recommend the built-in server-side gateway for users who do not want a key in the browser. A future protected backend proxy must use server secrets, quotas, and provider-specific allowlists.

### F-02 — Origin/CORS is not authentication
**Priority: Medium.**

The built-in AI Worker rejects browser requests whose Origin does not match the Pages domain and enforces rate limits. CORS prevents ordinary browser scripts on other origins from reading the response, but non-browser clients can forge an Origin header. The quotas are the actual abuse-control layer and must be monitored.

**Mitigation:** retain quotas and request-size caps; consider Turnstile or a short-lived signed challenge for public inference; make quota updates atomic if the storage/service supports it; monitor global quota exhaustion and cost. KV counter read-modify-write is not an atomic rate limiter under concurrent traffic.

### F-03 — Generated HTML is executable content
**Priority: Medium; inherent to an app builder.**

The preview iframe uses a sandbox without `allow-same-origin`, and the APK build workflow injects a restrictive CSP that blocks network connections, frames, objects, forms and workers. Inline scripts remain enabled to support generated app behavior, so the HTML checks are not a general-purpose HTML sanitizer and cannot prove generated code safe.

**Mitigation:** preserve isolated previewing and restrictive CSP; validate again in the build workflow; never open generated code in a privileged top-level origin; do not add native bridges to untrusted generated content; test adversarial HTML and JavaScript payloads.

### F-04 — Android JavaScript bridge is a sensitive boundary
**Priority: Medium; mitigations present, needs device-level verification.**

The Android shell exposes a JavaScript download bridge. The inspected activity restricts WebView navigation, blocks mixed content, disables content-provider access, and constrains output filenames/extensions. Any JavaScript bridge remains security-sensitive if untrusted code can execute in the top-level WebView.

**Mitigation:** keep the top-level WebView restricted to bundled assets, do not navigate generated HTML as the top-level document, minimize bridge methods, validate arguments/size/MIME, and test on a real Android device.

### F-05 — Third-party source integration is not yet approved
**Priority: High as a release gate, not a reported vulnerability.**

The seven candidate repositories have different stacks and licenses. VibeApp is marked GPL-3.0 in the initial README-level check; the other reported license labels still require verification against each repository's full license file and dependency tree. No third-party source has been copied into the app in this branch.

**Mitigation:** use architecture ideas first; before code reuse, pin an upstream commit, review LICENSE and bundled dependency licenses, inspect dependencies/security advisories, run the project tests, and document attribution/obligations. Do not combine repositories wholesale.

### F-06 — End-to-end status must be distinguished from CI
**Priority: High for release readiness.**

The repository README links two successful CI runs from 2026-10-16. Those historical results validate specific commits, not the current branch or current live services. The latest run observed during this audit was the A.S. AUTO CHECK AI workflow for commit `4ea2cb433122fd3cd98cc71c4fdc9587001e1759`, completed successfully on 2026-10-17. It is not a substitute for an authenticated real build and installation test.

**Mitigation:** run current branch checks; verify deployed health endpoints; submit a benign test project through the public website; observe queue status; download and verify the APK; install and exercise it on Android; record results without exposing secrets.

## Static-review notes

- `backend/src/index.js`: incremental body size limits, strict configured Origin check, secret-pattern checks, short-lived GitHub OIDC validation, request identifiers and SHA-256 helpers are present.
- `backend/ai-worker.js`: prompt length/body limits, basic secret-pattern checks, IP/global quotas and no-store response headers are present; KV quotas are not concurrency-atomic.
- `index.html`: generated preview is sandboxed; saved projects use localStorage; custom AI endpoint and key are used only in the browser flow; the user-facing warning confirms the destination before sending a BYOK key.
- `.github/workflows/build-user-project-apk.yml`: the workflow uses minimal repository permissions, disables persisted checkout credentials, claims work using GitHub OIDC, validates identifiers and HTML, and injects a restrictive generated-app CSP.
- `app/src/main/java/tj/as/predlozheniya/MainActivity.java`: WebView navigation and download bridge restrictions are present; source inspection alone cannot prove runtime safety.
- Existing automated tests cover HTML validation, body limits, Origin/CORS, missing authentication, OIDC malformed-token rejection, quotas and stale-job recovery.

## Validation status

| Check | Result |
|---|---|
| Read current README and main source files | Completed |
| Static review of frontend, API worker, AI worker, Android shell and workflows | Completed at source-review level |
| Inspect all seven candidate projects' full source/dependency trees | Not completed |
| Verify all third-party licenses and transitive dependencies | Not completed |
| Run current-branch CI for this audit branch | Pending pull-request checks |
| Live public API/queue smoke test | Pending |
| Real build → APK download → signature/checksum verification | Pending |
| Install and exercise generated APK on a physical Android device | Pending |
| Penetration test / independent security review | Not performed |

## Required next gates

1. Open a draft PR for the audit and let automated checks run; do not merge automatically.
2. Resolve any failed or missing checks and add targeted regression tests for any code changes.
3. Integrate only one small, license-cleared capability at a time, in a separate commit with a rollback path.
4. Run an end-to-end smoke test through the actual deployed services.
5. Do not proceed to the next product-development stage until the test results are recorded and remaining risks are explicitly accepted.

**Current disposition:** proceed with audit and test setup only. No third-party implementation code has been merged into `main`; no live production configuration or secrets were changed.
