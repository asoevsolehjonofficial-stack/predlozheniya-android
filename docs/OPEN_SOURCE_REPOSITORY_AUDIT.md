# Open-source Repository Audit — A.S. APP BUILDER

**Date:** 2026-10-17  
**Scope:** Initial desk audit of seven candidate public repositories. This document records repository metadata and README-level claims; it is not a full source-code, dependency, security, or build audit.

## Current A.S. APP BUILDER baseline

The existing project is a mobile-friendly MVP with:
- HTML prototype templates, preview and HTML download;
- PWA ZIP export and external-AI task specification;
- direct Gemini and OpenAI-compatible API calls;
- Android WebView wrapper and APK build workflows;
- a Cloudflare Worker queue with Turnstile, rate limits, HTML checks and APK integrity checks;
- GitHub Actions quality/security workflows.

Known limitations recorded in the current README:
- direct client-side AI calls can expose a user's API key to the page/runtime;
- user-project APKs wrap HTML in a WebView shell and do not generate arbitrary native Android code;
- the hosted build queue and deployed services still require end-to-end verification;
- durable project storage/version history and a stable release-signing process remain open items.

## Candidate repositories

| Repository | README-level role | License shown by repository | Initial disposition |
|---|---|---|---|
| https://github.com/iappyx/iappyxOS | On-device Android APK creation; HTML/JS in a WebView shell; native bridges | MIT | Study architecture and bridge/spec design. Reuse only selected, reviewed components; this is a large Android/Flutter codebase, not a drop-in web module. |
| https://github.com/IcyKokane/AIDaoPublic | Android-first AI app-builder architecture; planning, GitHub workspace and CI/APK pipeline are described as milestones | Apache-2.0 | Treat as architecture/reference only at this stage; README says it is an early foundation, not an autonomous generator. |
| https://github.com/Skykai521/VibeApp | On-device native Android generation/build/repair pipeline | GPL-3.0 | High-value technical reference. Do not copy or combine source into a distributed product until GPL obligations and product licensing strategy are explicitly reviewed. |
| https://github.com/seigneurtsui/web-to-app-android | On-device website/project to APK builder, signing and runtime modules | Unlicense | Study APK packaging/runtime architecture. Verify upstream origin and dependencies before reusing code; repository says it is forked from shiaho777/web-to-app. |
| https://github.com/dmvieira/appacadabra | AI-generated HTML/CSS/JS micro-apps in Android WebView with native capabilities | MIT | Study capability/plugin architecture and native bridge boundary. Requires user-supplied OpenRouter key for AI generation; model usage can cost money. |
| https://github.com/Etiip/ai-app-builder | Full-stack Next.js AI builder with sandbox, database, auth and GitHub sync | MIT (README badge/section) | Reference for future full-stack mode, but depends on Totalum VCaaS API and is not a fully independent free backend. |
| https://github.com/lab1207/AI-Website-Builder | React/TypeScript/Vite/Gemini website generation, preview and ZIP export | MIT | Candidate for selected UX patterns (chat, preview, import/export). Requires a Gemini API key and overlaps with existing A.S. website-generation features. |

## Initial findings

1. **Do not merge all seven repositories wholesale.** They use different stacks and solve overlapping but distinct problems. A combined codebase would add major dependency, licensing, maintenance and security risks.
2. **Preserve the existing A.S. APP BUILDER as the source of truth.** Work in a separate branch and integrate small, independently tested capabilities only after review.
3. **Separate the product into modules:** (a) website generator/editor, (b) web-to-APK packaging, (c) native Android code generation/build, (d) provider/backend gateway, (e) project storage/version history.
4. **Prioritize a safe server-side AI gateway.** Do not place shared provider secrets in browser code, HTML output, APK assets or public logs. If users bring their own keys, store them only in a suitable protected local secret store and explain provider billing.
5. **Treat generated code as untrusted.** Validate inputs, isolate previews/builds, restrict permissions, test artifacts and avoid executing arbitrary generated code in privileged contexts.
6. **License gate before code reuse:** retain license and copyright notices; review each repository's full license and bundled dependencies. GPL-3.0 code needs a specific compatibility/compliance decision before being included in a distributed product.
7. **Mobile-first constraint:** the user is working from an Android phone without a PC. Prefer browser-accessible GitHub/Cloudflare workflows and cloud CI for A.S. web project builds; on-device native builders are separate Android applications and are not automatically integrable into a website.

## Recommended integration order

1. **Phase 1 — audit and baseline:** document candidate roles/licenses, inspect the existing project workflows and preserve the current main branch.
2. **Phase 2 — website generator improvements:** compare existing A.S. generator with AI-Website-Builder patterns; port no source until dependencies and license are checked.
3. **Phase 3 — APK packaging:** compare current WebView APK workflow with WebToApp/iappyxOS; retain the simpler, safer current pipeline unless a tested feature clearly improves it.
4. **Phase 4 — native app generation:** use AIDaoPublic and VibeApp as architecture references; do not claim native generation until real Android source compilation and device tests pass.
5. **Phase 5 — provider gateway and storage:** server-side secrets, quotas, project history, queue recovery and user-visible error reporting.
6. **Phase 6 — validation:** run GitHub Actions, exercise the deployed API end-to-end, download an APK, install it on a real Android device and record results.

## Not yet verified

- Full source trees and dependency manifests for all seven repositories;
- all transitive dependency licenses and security advisories;
- reproducible builds of the candidate repositories;
- deployed Cloudflare configuration and live build queue;
- successful installation and runtime behavior on the user's phone;
- whether upstream projects' current releases match their README claims.

**Status:** Phase 1 desk audit started; no third-party source code has been copied into the application. This report is an initial checkpoint, not a claim that integration or end-to-end testing is complete.
