# A.S. APP BUILDER — PROGRESS

Last updated: 2026-10-18
Working branch: fix/ai-quota-native-preview
Pull request: #24 — https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/24

## Release checklist (11 acceptance criteria)

- [ ] 1. Production site works without console/network errors — NOT VERIFIED in this session.
- [ ] 2. Required GitHub Actions are green with no cancelled/skipped required checks — NOT VERIFIED; workflow-run listing/log retrieval is unavailable in the currently exposed GitHub tool set.
- [ ] 3. Real prompt → AI native Java/XML project → source validation — implementation path exists; real production generation and compiler validation NOT VERIFIED.
- [ ] 4. APK builds and passes integrity checks — workflow contains build/signature/checksum steps; successful run NOT VERIFIED.
- [ ] 5. APK installs and launches on Android 5/API 21 and Android 15/API 35 — API 35 workflow path exists; API 21 emulator run and successful run evidence NOT VERIFIED.
- [ ] 6. Preview uses an actual screenshot from the running APK — workflow contains Android 15 screenshot capture/upload; production proof NOT VERIFIED.
- [ ] 7. User can download APK and source from the site — authenticated download flow exists in code; production end-to-end proof NOT VERIFIED.
- [ ] 8. Production AI quotas verified with real requests — unit test covers the fifth request returning 429; live quota test NOT RUN.
- [ ] 9. Security audit of dependencies, secrets/history, input validation, rate limits, request size and CORS — partial static checks exist; full audit NOT COMPLETE.
- [ ] 10. PR #24 merged and production updated — PR remains open; no merge or deploy performed.
- [ ] 11. Three production end-to-end scenarios (simple, multi-screen, persistent data) — NOT RUN.

## Failure-log automation (2026-10-18)

- Added `.github/workflows/pr-failure-diagnostics.yml` on branch `fix/ai-quota-native-preview`.
- The collector runs on `workflow_run: completed`, retrieves failed-step logs with `gh run view --log-failed`, keeps the last 200 lines, applies conservative credential-pattern redaction, and posts the excerpt as a comment on PR #24 for failures associated with PR #24 or the target branch.
- Design note: a same-run `if: failure()` step cannot reliably fetch the current run's complete GitHub-hosted step log before the job/run is finished. A completed-run collector is used to avoid this race. Because GitHub only activates `workflow_run` definitions from the default branch, this collector will not automatically execute until the workflow definition exists on the default branch. Its first real run is NOT YET VERIFIED.

## Stage 1 — CI diagnostics

### Confirmed observations
- PROGRESS.md was absent on the inspected PR branch before this file was created.
- index.html and app/src/main/assets/index.html are byte-identical on fix/ai-quota-native-preview (both 115,097 characters; Git blob SHA 35f2b0f6fdc039afab8c8e1cae939dc191bfab59). Therefore the reported synchronization failure is not reproducible from the current branch contents; the failing run's exact commit/log is needed to determine whether it used an older checkout or another cause.
- The manual import workflow is .github/workflows/manual-import-smoke.yml; it invokes .github/scripts/manual-import-browser-test.mjs and tests invalid HTML rejection, valid HTML import, sandboxed preview, exports and a mocked AI request. The exact failing job log is not available from the currently exposed GitHub tools, so its failure line is not yet confirmed.
- .github/workflows/quality-security.yml includes source synchronization, HTML/manifest/security assertions, inline JS syntax, workflow YAML parsing, backend tests and Wrangler dry-runs.
- .github/workflows/auto-check-ai.yml intentionally skips real AI generation on routine push/PR to protect shared quota; the live AI check requires manual dispatch with test_live_ai=true. Its tools/regression/live steps use continue-on-error: true and a final gate. A run marked cancelled is not proof of a code failure; the exact run status and logs are still required.
- Native build workflow contains a native-source branch, Gradle build, APK signature/checksum validation, Android 15 emulator launch and screenshot capture/upload. This configuration is not proof those steps have succeeded.

### Current status
- Stage 1: IN PROGRESS. Do not weaken or remove checks.
- No production deploy or merge performed.
- Next action: retrieve failed workflow run IDs and job logs; reproduce exact failures against their commit; fix only demonstrated root causes; push small commits and inspect each resulting CI run.

## Known constraints
- Do not force-push, delete branches/history/data, or expose secrets.
- Do not claim completion without CI logs, APK artifacts, emulator screenshots and production evidence.
- Do not merge PR #24 until required checks and release criteria pass.
