# A.S. APP BUILDER — PROGRESS

Last updated: 2026-10-19
Working branch: fix/ai-quota-native-preview
Pull request: #27 — https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/27

## Release checklist (11 acceptance criteria)

- [ ] 1. Production site works without console/network errors — NOT VERIFIED in this session.
- [ ] 2. Required GitHub Actions are green with no cancelled/skipped required checks — recent run 39152068438 and 39152068311 failed; fix is pushed to branch but new CI results are pending.
- [ ] 3. Real prompt → AI native Java/XML project → source validation — implementation path exists; real production generation and compiler validation NOT VERIFIED.
- [ ] 4. APK builds and passes integrity checks — workflow contains build/signature/checksum steps; successful run NOT VERIFIED.
- [ ] 5. APK installs and launches on Android 5/API 21 and Android 15/API 35 — API 35 workflow path exists; API 21 emulator run and successful run evidence NOT VERIFIED.
- [ ] 6. Preview uses an actual screenshot from the running APK — workflow contains Android 15 screenshot capture/upload; production proof NOT VERIFIED.
- [ ] 7. User can download APK and source from the site — authenticated download flow exists in code; production end-to-end proof NOT VERIFIED.
- [ ] 8. Production AI quotas verified with real requests — unit test covers the fifth request returning 429; live quota test NOT RUN.
- [ ] 9. Security audit of dependencies, secrets/history, input validation, rate limits, request size and CORS — partial static checks exist; full audit NOT COMPLETE.
- [ ] 10. PR #24 merged and production updated — PR #24 was merged at 2026-10-18T18:01:00Z; production deployment and health verification are NOT CONFIRMED. Follow-up fix must go through a new PR because #24 is already merged.
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

## Stage 2 — Canonical HTML source and CI drift prevention

### Changes pushed to `fix/ai-quota-native-preview`
- Added `scripts/sync-assets.sh`: default mode copies root `index.html` to `app/src/main/assets/index.html`; `--check` verifies byte-for-byte identity and prints a diff plus repair command on drift.
- Updated `.github/workflows/quality-security.yml` to run the shared script in `--check` mode and include the script in path filters.
- Updated `.github/workflows/manual-import-smoke.yml` to use the same canonical sync check before browser smoke tests and include the script in path filters.
- The real Android screenshot-preview block remains in the canonical root HTML; current branch copies of both HTML files are identical (blob SHA `35f2b0f6fdc039afab8c8e1cae939dc191bfab59`).
- Root cause in the failed run is proven by its diff: that PR merge checkout had the native screenshot-preview block in root `index.html` but not in the Android asset. The latest inspected branch version already had both files identical; the new script makes the source-of-truth and guard explicit.

### CI status and PR handling
- Follow-up PR opened: [#27 — Prevent website and Android HTML asset drift](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/27). PR #24 had already been merged before this repair was prepared, so GitHub does not permit adding commits to that closed/merged PR.
- Confirmed failed run IDs: [39152068311](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39152068311) and [39152068438](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39152068438).
- Failure evidence: manual import workflow's asset equality assertion failed; quality workflow's `cmp` failed and showed the missing native screenshot-preview block in the Android asset.
- PR #24 is already merged (merge timestamp `2026-10-18T18:01:00Z`), so it cannot be updated as an open PR. The follow-up fix is committed to the same head branch; a new follow-up PR is required to run pull-request CI for these changes.
- No workflow runs for PR #27's head commit `3075d876b9d63a075e590565fd3373aeed861a9b` were present in the Actions run list at the time of this update; only the Cloudflare Pages check reported success. Therefore CI is NOT YET VERIFIED on this follow-up commit. The connector-created commits did not produce new PR workflow runs, so I cannot truthfully report that the checks have completed. Earlier run `39152115773` (quality/security) and `39152115572` (manual HTML import) succeeded on the earlier PR #24 merge checkout, but they do not validate this new script/workflow revision. Checks skipped after the early synchronization failure still need a fresh run.

### Current status
- Stage 2: IMPLEMENTED IN BRANCH and follow-up PR #27 opened; CI validation is blocked pending a new workflow run on the latest head.
- No claim that all 11 release acceptance criteria are complete.

## Stage 3 — Why PR #27 CI did not start (2026-10-18)

### Confirmed checks
- PR #27 is open, not Draft, base `main`, head branch `fix/ai-quota-native-preview`.
- Commit `30a2784905ad66fa0e4694417460b6eb20f652f4` added manual dispatch to the diagnostics workflow; the subsequent progress-recording commit moved the branch head to `270b050b8aa9f4fac68426d44b569226fe76ec28`.
- `quality-security.yml` has `pull_request: branches: [main]` and no path filter. The PR base matches; its changed files are not excluded by a path filter.
- `manual-import-smoke.yml` has a PR path filter. Its list previously omitted `scripts/sync-assets.sh`; added that path. The workflow file itself is also included in the path list.
- Push triggers for quality/security and manual import are restricted to `main`, so a push to the feature branch does not satisfy those push triggers. Their PR triggers should still match PR #27.
- Checked all 12 workflow files on the branch: each now has `workflow_dispatch`. The previously missing manual dispatch was added to `pr-failure-diagnostics.yml`.
- Confirmed current branch/PR head SHA: `270b050b8aa9f4fac68426d44b569226fe76ec28`. Its check-runs API response contains only a successful Cloudflare Pages check; GitHub Actions run search contains no Actions run for this SHA. Thus there is still no real Actions run to inspect and no green CI claim is justified.

### Token diagnosis — evidence limit
- The commits were created through the connected GitHub integration's file/contents update operations; commit metadata shows the repository account as author/committer.
- GitHub commit metadata does not expose which credential authenticated the API write. The available connector does not expose the token type or a POST workflow-dispatch action. Therefore I cannot prove from available evidence that the credential was specifically `GITHUB_TOKEN`; missing runs are consistent with workflow-event suppression by an automation token, but that exact token identity is NOT CONFIRMED.
- The connected GitHub tools expose read operations and rerun-existing-run actions, but no workflow-dispatch action; no existing Actions run belongs to the current SHA to rerun. This is a tooling limitation, not evidence of a code test failure.

### User action required to create the first authoritative run
1. Open [PR #27](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/27) and verify the latest head is `270b050b8aa9f4fac68426d44b569226fe76ec28`.
2. Open [Quality and security checks](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/workflows/quality-security.yml), choose **Run workflow**, select branch `fix/ai-quota-native-preview`, and start it.
3. Repeat for [Manual HTML import smoke test](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/workflows/manual-import-smoke.yml).
4. If GitHub displays **Approve and run workflows**, click it. Then send the resulting run links/IDs here so I can read the job logs and fix demonstrated failures.

### Current status
- Trigger configuration: UPDATED; every workflow supports manual dispatch.
- Current-head CI: BLOCKED awaiting the manual dispatch/approval action above; no current-head run exists to claim success.
- Release acceptance checklist remains 0/11 fully confirmed.



## Stage 1 follow-up — CI trigger recovery (2026-10-19)

### Actions performed and evidence
- Closed and reopened PR #27 through the connected GitHub API. PR is open and not draft afterward; no Actions run appeared immediately after this attempt.
- Updated `.github/workflows/quality-security.yml`: push branches now include `main` and `fix/**`; PR trigger types include `opened`, `reopened`, `synchronize`, and `ready_for_review`. Commit: `361922c63fe4d3c9e4817f2770e0e464b6393e49`.
- Checked Actions after that push: Quality and security run [39157261722](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39157261722) completed successfully on that commit. All steps passed: asset sync, HTML/security assertions, inline JS syntax, workflow YAML parsing, backend tests and Wrangler dry-runs, credential-pattern scan.
- Updated `.github/workflows/manual-import-smoke.yml`: push branches now include `main` and `fix/**`; PR trigger types include `opened`, `reopened`, `synchronize`, and `ready_for_review`. Commit/current PR head: `a2673658e6cde2af86df419ad7d080ab1fc70fcf`.
- Checked Actions after that push: Manual HTML import smoke run [39157276730](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39157276730) completed successfully on current PR head. All steps passed, including synchronized assets, import wiring, production health checks without an inference request, and real-browser smoke test.
- Latest PR head confirmed via GitHub API: `a2673658e6cde2af86df419ad7d080ab1fc70fcf`. The current head has a green manual-import run; the quality/security run is green on the immediately preceding workflow-trigger commit `361922c63fe4d3c9e4817f2770e0e464b6393e49`. No current-head quality run has been observed yet.
- Creating a diagnostic branch via the connected GitHub branch tool was attempted twice but the connector rejected the request with a branch-creation argument error. No new branch or diagnostic PR was created. This attempt did not modify repository content.

### Trigger diagnosis
- Confirmed: event/path configuration was a contributing gap because feature-branch pushes were not covered by the original `push: branches: [main]` rules. Expanding the triggers caused real runs to appear.
- Not proven: whether any separate repository-level Actions disablement, approval requirement, or specific token suppression was also involved. Successful push-triggered runs show Actions are enabled for these workflows now; they do not establish the exact token type used by earlier commits.

### Stages 2–4 — static review notes
- Native AI worker has prompt length limit (18,000 characters), bounded request body (24 KiB), output cap (100,000 characters), provider/model allow-listing, origin validation, content-type validation, per-IP hourly/daily and global daily counters, and a secret-pattern check before inference. Limits visible in code: 5 requests/hour/IP, 15/day/IP, 100/day global web AI, 30/day global native AI. These are static-code observations, not a live abuse/load test; KV counter increments are read-then-write and are not atomic under concurrent requests.
- Native Android template workflow uses a matrix for API 21 and API 35, Gradle build, emulator instrumentation tests, APK integrity/signature checks, package ID verification, and artifact upload. This workflow currently listens to branches `stage2/**` and `feature/native-ai-codegen-2026-10-18`, or PRs that change `native-builder/**`/the workflow. PR #27 does not modify `native-builder/**`, so this workflow is not expected to run for PR #27. No successful API 21/API 35 emulator evidence has been collected in this CI recovery step.
- User-project APK workflow includes read-only top-level permissions, OIDC auth, source validation/build paths, authenticated download verification, checksum comparison, and queue dispatch. The YAML configuration itself is not proof of a successful native APK build or installation.
- No production AI generation request was made during these checks; the health check explicitly does not consume AI inference quota.

### Current status
- Trigger recovery: VERIFIED by two real successful Actions runs.
- Stage 2 asset synchronization/browser import smoke: VERIFIED by run 39157276730.
- Stage 3–4 Android APK/API 21/API 35 runtime proof: NOT VERIFIED; native emulator workflow has not run for this PR.
- Release checklist: 2/11 partially supported by current evidence, 0/11 fully certified for release. Do not mark the whole release complete.


## Stage 1 follow-up — CI confirmed and diagnostics workflow merged (2026-10-19)

- Trigger recovery produced real successful runs on the feature branch: [Quality and security checks #39157261722](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39157261722) passed all listed steps on `361922c63fe4d3c9e4817f2770e0e464b6393e49`; [Manual HTML import smoke #39157276730](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39157276730) passed all steps on `a2673658e6cde2af86df419ad7d080ab1fc70fcf`, including real browser smoke and health endpoints without consuming AI inference quota.
- Created isolated workflow-only PR [#28 — Add manual dispatch for PR failure diagnostics](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/28), containing only `.github/workflows/pr-failure-diagnostics.yml`.
- PR #28 CI on `2cbe40fe82a49730c556daf9d9f3805360dc03fb`: [Quality/security](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39157451300) SUCCESS, [A.S. AUTO CHECK AI](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39157451183) SUCCESS, Cloudflare Pages check SUCCESS. PR was clean/mergeable and was squash-merged after these checks passed. Merge commit: `63094e6fb5db94cdccde51d20a17f26b193aeab1`.
- The 11 workflow files that already existed on `main` were verified to contain `workflow_dispatch`; PR #28 adds the missing diagnostics workflow to the default branch so its manual-dispatch entry is available from the Actions UI as well.
- Latest change to `PROGRESS.md` is documentation-only; its resulting commit must not be mistaken for a fresh app-code test. The relevant implementation/workflow changes have the successful runs listed above.

### Current status
- Stage 1 trigger issue: RECOVERED; actual Actions runs now appear and passed.
- Stage 2 website-to-Android asset synchronization and browser import smoke: PASSED in run 39157276730.
- Stage 3 native generation/Android build chain: STATIC CONFIGURATION REVIEWED; real production prompt-to-APK generation is NOT VERIFIED.
- Stage 4 APK/emulator API 21 and API 35: workflow configuration contains both API levels, build, instrumentation, signature/integrity checks and artifact upload; successful emulator evidence is NOT YET VERIFIED for PR #27.
- AI quotas/security: source-level protections and tests are present; concurrency/abuse load testing and live provider quota validation are NOT COMPLETE. Rate-limit counters use separate reads/writes, so simultaneous requests may race; this remains a documented hardening risk, not a demonstrated failure in current CI.
- Release acceptance checklist: 0/11 fully certified end-to-end; successful targeted CI checks do not substitute for production generation, install/launch, screenshot, download, quota, and three scenario tests.


## Stage 2 — Atomic AI quotas and protected CI fixture mode (2026-10-19)

- Branch: `fix/durable-object-ai-limits`.
- Replaced KV read-then-write AI quota counters with a single Durable Object `RateLimitCoordinator`; all three counters are checked and reserved inside one storage transaction.
- Counter windows are explicit UTC hour/day identifiers so limits reset at the same boundaries as the user-facing retry messages; only the current hourly/daily key per IP is retained.
- Added a parallel-request regression test: 20 simultaneous requests from one IP must yield exactly 5 successful inference calls and 15 HTTP 429 responses.
- Added a secret-protected `x-ai-ci-test-secret` mode using the `AI_CI_TEST_SECRET` environment secret. Valid test requests return deterministic native Java fixtures or a simple web fixture without invoking the provider or consuming the production rate counters. An invalid supplied secret returns HTTP 403.
- Updated `backend/wrangler-ai.toml` with a Durable Object binding and SQLite-class migration; no credential values are stored in source/config.
- CI fixture mode requires the same non-empty secret to be configured as a Cloudflare Worker secret and a GitHub Actions secret before the full pipeline can use it. The connected GitHub tools do not expose secret-writing operations; the actual secret value has not been created or changed by this session.
- Validation status: pending CI on this branch. No production deployment of the Durable Object migration has been performed yet.

### Stage 1 closeout — PR #27

- PR #27 merged into `main` as `2290a0f45a0194858af7318689585cd848b85e70`.
- Latest-head validation before merge: [Quality/security](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158244916), [Manual HTML import/browser smoke](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158244815), [A.S. AUTO CHECK AI](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158244807), and [Validate web app](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158244884) succeeded on `05e23e892aba543a5977918d04da6db4906c84df`. The real AI inference step was intentionally skipped to protect production quota.
- After merge, `main` checks are green for [Quality/security](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158318443), [Manual browser smoke including deployed backend health](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158318446), [Validate web app](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158318467), [AUTO CHECK AI](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158318444), and [Free APK queue worker](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158318458).
- Builder APK release run [39158318451](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158318451) passed its quality gate but was still building at last inspection; final artifact status remains pending.
- Production frontend/browser and deployed backend health were checked by the green post-merge browser workflow. The AI Worker’s new Durable Object and test-secret changes are a separate pending branch and are not yet deployed.


## Stage 3 — Quota-free native E2E test path (2026-10-19)

- Branch: `feat/ci-native-e2e-oidc`.
- Added a separate `/api/ci/native-fixture` route in the AI Worker. It only accepts a short-lived GitHub Actions OIDC bearer token for this exact repository, the `native-ai-smoke.yml` workflow, and `refs/heads/main`; it rejects browser-origin requests and invalid/missing tokens. It returns deterministic fixture source without calling AI inference or touching production counters. This is a separate test endpoint, not a public quota bypass.
- Added negative tests for missing/invalid OIDC and browser-origin requests; existing atomic counter concurrency test remains in place.
- Reworked `.github/workflows/native-ai-smoke.yml` to avoid real AI inference on routine runs and matrix-test three native examples (`simple`, `multi-screen`, `storage`) on API 21 and API 35. The intended artifacts are APK, source, SHA-256, and real emulator screenshots; Gradle caching is enabled.
- Important: the new endpoint and matrix workflow are not yet deployed/run on production. The previous workflow run [39158748190](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158748190) did use one real AI generation because the previous workflow hard-coded live mode; its browser step passed and its API 35 emulator step was still in progress at last check. The workflow change removes that default behavior.
- The PR #29 code checks passed: [Quality/security](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158667349), [web validation](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158667336), [AUTO CHECK AI](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158667324). PR #29 was merged, but production AI Worker deployment did not happen: [deploy workflow failed at credential validation](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39158748319). No Cloudflare production change is claimed from that run.
- Remaining E2E acceptance gap: the current new matrix workflow builds and launches generated APKs locally and captures screenshots, but it still needs a queue/API download round-trip integrated into the same test path. The backend unit suite already tests authenticated download/checksum behavior; that is not equivalent to a live generated APK download.
- Remaining release gates: production Durable Object migration, production CI fixture endpoint, live APK download round-trip, Lighthouse before/after baseline, and full 11-point production checklist.



## Stage 4 follow-up — unblock quota-free native E2E from unrelated production health failures (2026-10-19)

- Latest native matrix run [39159778662](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39159778662) failed before any APK jobs started: its prerequisite UI smoke logged `FAIL: Cloudflare Worker health — fetch failed` and `FAIL: Built-in AI Worker health — fetch failed`. The website itself returned HTTP 200 for its assets and the browser UI checks passed; the generated-app matrix was skipped due to the job dependency.
- The separate deploy workflow [39159778677](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39159778677) failed before deployment because repository Actions secrets are empty: `Add CLOUDFLARE_API_TOKEN in repository Actions secrets to use this optional redeploy workflow.` Its log also showed `CLOUDFLARE_API_TOKEN:` and `CLOUDFLARE_ACCOUNT_ID:` blank. No production deployment is claimed.
- Confirmed `main` contains `RateLimitCoordinator`, the `RATE_LIMITER` Durable Object binding, and the SQLite migration in `backend/wrangler-ai.toml`; this is code/config evidence, not evidence the DO is deployed to production. Parallel-request regression is included in the green quality run [39160205127](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160205127).
- In branch `fix/e2e-production-health-gate`, routine native fixture E2E now skips external production backend-health checks in the UI prerequisite while preserving those checks as a separate release smoke; this lets the quota-free native matrix proceed independently of the unavailable production Worker endpoints. Awaiting PR checks and main workflow execution before marking it passed.
- Still not proven: APK matrix completion, API 21/35 installation and launch, screenshots, or download-through-API round-trip.


## Stage 4 follow-up — independent native matrix is running (2026-10-19)

- Read this file before continuing. PR [#32 — Decouple native fixture E2E from production Worker health](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/32) passed [Quality/security](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160423566) and [A.S. AUTO CHECK AI](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160423354) on exact head `f9c8ab68c8cc743ab002202c75dfbf73fadbd2fb`, then was squash-merged as `3f1c2565e9627c83a17fd96d141824f7286af734`.
- After the merge, the live UI preflight succeeded and all six generated-app jobs started in [Native AI generated APK smoke #39160499339](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160499339): simple, multi-screen, and storage fixtures on API 21 and API 35. At the time of this update, SDK/Gradle setup was still running; no APK, screenshot, or download acceptance is claimed yet.
- [A.S. AUTO CHECK AI #39160499337](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160499337) is green on the merge commit.
- The app-builder release workflow [#39160499380](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160499380) is still in progress; it is a separate builder APK artifact, not proof that generated project APKs passed E2E.
- Production deploy remains blocked by missing GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; do not place their values in source or chat. The Durable Object code/config and parallel-counter regression test are present in main and quality/security is green, but the new DO has not been proven deployed to production.
- Production queue/download round-trip and Lighthouse before/after measurements remain unverified.


## Stage 4 retry 1 — fix local Worker runtime startup (2026-10-19)

- Native matrix [run 39160499339](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160499339) passed its website UI preflight after PR #32, but all six fixture jobs failed before generation/build because Wrangler could not start the local Worker.
- Exact runtime log: `Uncaught TypeError: Incorrect type for map entry 'CLOUDFLARE_MODEL': the provided value is not of type 'function or ExportedHandler'.`
- Root cause confirmed in `backend/ai-worker.js`: module exports included plain string/number constants alongside function exports. Cloudflare Worker module runtime rejects plain values in the named-export map. The fix branch `fix/wrangler-runtime-export-values` removes constants from the export list while retaining function exports used by tests. Waiting for CI before merge.


## Stage 4 retry 1 complete — Worker runtime fix merged (2026-10-19)

- PR [#33 — Fix local Cloudflare Worker startup for native E2E](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/33) merged after all checks passed on exact SHA `2eff8d00602e6511449c8e78236c4287f19b0ffc`: [Quality/security](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160829149), [Validate web app](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160829171), [AUTO CHECK AI](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160829120). Merge commit: `9a90513f61291027140bfe83793681be8e207798`.
- Removed plain constants from the Worker module named-export list (the exact cause of the previous Wrangler startup error). Added a valid XML `strings.xml` resource alongside generated Java fixture source.
- New main validation is queued: [Native AI generated APK smoke #39160916274](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160916274), [Quality/security #39160916311](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160916311), and [Validate web app #39160916264](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160916264). Wait for these before accepting the E2E chain.
- Previous failed run remains [#39160499339](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160499339); it did not produce accepted APK/screenshot evidence because the local Worker failed before source generation.


## Stage 4 retry 2 — repair Android matrix package and SDK setup (2026-10-19)

- Native matrix [run #39160916274](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160916274) passed UI preflight and started six fixture jobs, but uncovered three workflow issues:
  1. Build log: `Android resource linking failed ... package ... 'tj.as.generated.p_native_multi-screen_api35' is not a valid Android package name` — hyphen in applicationId.
  2. Emulator action warning: `Unexpected input(s) 'api_level', valid inputs are ['api-level', ...]` — the matrix key was mistakenly used as an action input name.
  3. API 21 setup log: `Warning: An error occurred while preparing SDK package Google APIs Intel x86_64 Atom System Image: Error on ZipFile unknown archive`, followed by `sdkmanager failed with exit code 1` — each job was downloading both system images, including an irrelevant one.
- Branch `fix/native-e2e-matrix-api-levels` sanitizes the package slug, restores the action input name `api-level`, installs only the selected API image per job, and retries SDK image installation up to three times. Awaiting CI before merge.


## Stage 4 retry 2 complete — matrix corrections merged (2026-10-19)

- PR [#35 — Fix native E2E API-level matrix and package names](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/35) merged as `568ff4764206a4c9b05b010fc8b9c3db2782e368` after [Quality/security](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39161323306) and [AUTO CHECK AI](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39161323364) both passed on `86b1f3e24e48feb4c2b046b8a90a849675f194d3`.
- Fixes: correct emulator input `api-level`, sanitize `multi-screen` package name to `multi_screen`, install only the API-specific system image and retry SDK download up to 3 times.
- Previous main run [#39160916274](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39160916274) did not pass: it caught these exact defects. A new main E2E run must confirm the fixes; no screenshot/API-download success is claimed until that run is green.

## Stage 4 retry 3 — add API upload/download verification to native E2E (2026-10-19)

- The matrix workflow now includes a local build API Worker and a dedicated /api/ci/build-fixture route guarded by a short-lived GitHub OIDC token restricted to this repository, the native-ai-smoke.yml workflow, refs/heads/main, and audience as-app-builder-native-e2e.
- The CI-only fixture route does not call Turnstile, production build quotas, or production AI. It creates a local fixture job only after valid OIDC authorization. Separate CI-only upload routes reuse the existing APK checksum and screenshot validation logic.
- Each matrix job is intended to create a local API job from the validated Java/XML source, build and verify the APK, upload it to the local API, download it with the per-job download token, compare byte-for-byte and SHA-256, install and launch it on its target emulator, capture a real PNG, upload that screenshot through the API, and download/compare the PNG.
- Security tests added for rejected missing/invalid OIDC tokens and browser-origin requests. Plain numeric STALE_BUILD_MS was removed from the API Worker's named-export list to prevent Wrangler module startup rejection.
- This work is in branch feat/local-api-download-e2e and has not yet passed CI or been merged. Production deployment and live production API round-trip remain separate gates.

## Stage 4 retry 4 — correct SDK install retries (2026-10-19)

- The latest main matrix run [#39161397305](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39161397305) failed during SDK image installation. Exact log: `yes: standard output: Broken pipe`; the `sdkmanager` had reached 100% extraction, but `set -o pipefail` treated the `yes` process's expected SIGPIPE as failure, repeating downloads three times.
- Removed the `yes |` pipeline because the Android setup action has already accepted SDK licenses. SDK image installation now retries the `sdkmanager` command directly, avoiding the false failure.
- The same in-progress PR adds the protected local API job, APK upload/download checksum round-trip, and screenshot upload/download round-trip. CI must validate all of this before merge.

## Stage 4 retry 5 — fix test import after runtime-safe export cleanup (2026-10-19)

- The first backend validation run on an earlier PR #36 commit failed with exact log: `SyntaxError: The requested module '../src/index.js' does not provide an export named 'STALE_BUILD_MS'`. Removing this numeric constant from module exports is required for the Cloudflare runtime, so the unit test now defines the 35-minute threshold locally instead of importing a runtime-incompatible value.
- The latest head `aba03ec15d4e2387d3c4830f4625102a024b747e` passed [Quality/security #39162034704](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39162034704) and [Validate web app #39162034716](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39162034716). AUTO CHECK AI is still pending/in progress at the time of this update.

## Stage 4 retry 3–5 complete — protected API round-trip added (2026-10-19)

- PR [#36 — Test native APK and screenshot downloads through a protected local API](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/pull/36) passed all checks on exact head `fd586fb377f57b742bc2495c75596cce7939cc66`: [Quality/security #39162120243](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39162120243), [Validate web app #39162120257](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39162120257), [AUTO CHECK AI #39162120149](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39162120149). Merge commit: `a3a62325b3519c065bf13969989d61b56292193d`.
- The native matrix now starts a local AI fixture Worker and a local build API Worker. It creates a local build job using signed OIDC, uploads the built APK with SHA-256, downloads it with the job token and compares bytes/hash, then uploads/downloads the emulator screenshot through the API and compares the PNG.
- API fixture routes are restricted to the exact native E2E workflow on main and a dedicated audience; unauthorized-token and browser-origin negative tests passed. The fixture does not invoke production AI, Turnstile, or production build quotas.
- Next evidence gate: new main run [Native AI generated APK smoke #391622…](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions) must complete all six example/API-level jobs. Production Worker deployment and live production queue/download remain blocked by missing GitHub Actions Cloudflare secrets.

## Stage 5 — native CI OIDC repair and hourly quota acceptance (2026-10-19)

- Live Cloudflare account access is authenticated and can read Worker settings, deployments, versions, and Worker-secret metadata. Current production Worker: `as-app-builder-ai`, account `ca54a89f5e9c7e5d433b84b47741295b`.
- Rollback baseline checked before deployment: active deployment `e48a0955-f91e-4c40-bbe8-64a5d6155d4b`, active version `63b9c056-2402-42d0-913e-09529ff7381f`; previous version `b6678b0e-9ad0-46ba-8b1c-8718297127b4`. Live bindings still AI + legacy KV `RATE_LIMITS` + `SITE_ORIGIN`; no Durable Object namespace is provisioned. No production deployment has been performed.
- Cloudflare API integration can upload Worker versions, deploy versions, patch settings, and add Worker secrets. It can list Durable Object namespaces (currently empty). GitHub integration has no repository Actions-secret write operation; no Cloudflare API token was created because there is no secure way to store it as a GitHub secret through available tools.
- Exact native CI OIDC failure on [run #39161202139](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39161202139): the local fixture Worker accepted only the main-branch OIDC workflow/ref, rejecting the repair branch token. Worker code now accepts only the exact main workflow/ref or exact repair-branch workflow/ref; browser-origin fixture requests and invalid/missing tokens remain rejected. Fixture requests do not invoke inference or consume production quotas.
- Hourly production quota is now four accepted requests per source IP; the fifth must return HTTP 429. Concurrent unit test expects 4 successes, 16 rate-limited responses out of 20, and exactly 4 inference calls.
- [Native E2E run #39161853792](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39161853792) reached emulator execution after browser UI smoke passed. One emulator job failed because `reactivecircus/android-emulator-runner` executes its script from a temporary working directory, so the relative APK path was empty at `adb install` (log: `adb: need APK file on command line`). Workflow now uses an absolute `$GITHUB_WORKSPACE/native-builder/app/build/outputs/apk/debug/app-debug.apk` path. API 21/35 SDK image setup uses per-API installs with retries.
- Production smoke test cannot be performed from the Cloudflare management execution environment: outbound requests to the public Worker URL are explicitly blocked by the environment. A GitHub Actions runner must execute the live health and four-success/fifth-429 test after deployment.
- PR #27 is merged. PR #34 remains open pending green native matrix and unit/security checks. Acceptance checklist remains 0/11 fully certified until all six APK/emulator/screenshot artifacts and production live smoke are verified.


## Stage 5 continuation — production smoke and emulator runner fixes (2026-10-19)

- The native E2E logs confirmed a separate runtime path issue after APK build/signature validation: `adb: need APK file on command line`. The emulator action runs its script from a temporary working directory, so the workflow now resolves the APK via `$GITHUB_WORKSPACE`.
- The matrix concurrency key now includes the branch ref and cancels stale runs for the same ref, allowing the latest fixed commit to start instead of waiting behind an obsolete emulator boot.
- Added `.github/workflows/production-quota-smoke.yml`, which runs only after changes to the AI Worker/config reach `main`. It verifies live health, four successful production AI responses, and a fifth HTTP 429. It prints statuses only and does not print generated source or credentials. This should run only after the direct Worker deployment has been verified and before/at PR #34 merge.
- No production Worker upload/deployment or live quota request has been performed yet. The next safe sequence is: wait for the latest six-job native matrix and quality/security checks; upload a non-deployed Worker version with the DO migration; inspect version/bindings; deploy with rollback baseline preserved; merge PR #34; inspect the production quota smoke run immediately and roll back to `b6678b0e-9ad0-46ba-8b1c-8718297127b4` if it fails.


## Stage 5 continuation — local Build API OIDC defect (2026-10-19)

- Latest matrix run [#39162465916](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39162465916) exposed another exact fixture authorization bug in `backend/src/index.js`: `verifyGitHubOidc(request, expectedWorkflowRef, expectedAudience)` ignored its `expectedWorkflowRef` argument and hard-coded `build-user-project-apk.yml@refs/heads/main` plus `refs/heads/main`. The native local API fixture requested audience `as-app-builder-native-e2e` and was rejected with HTTP 401: `{"error":"Unauthorized CI workflow."}`.
- Fixed the verifier to compare the token's `workflow_ref` and `ref` as a strict pair. The regular build API audience remains restricted to its configured main workflow. The native E2E audience allows only the main workflow/ref and the exact repair-branch workflow/ref. Signature, issuer, repository, audience, expiry, and not-before checks remain in place.
- Native AI source fixture already passed OIDC in that run; the failure was the separate local Build API fixture. The run also showed the absolute APK path correction is now needed for screenshot stage; the next CI run will validate both fixes.
- Latest change is awaiting quality/security and native six-job matrix. No production Worker deployment has occurred.


## Stage 5 continuation — local APK download CORS fix (2026-10-19)

- Native E2E [run #39163074448](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39163074448) confirmed native source OIDC, local API job creation, APK build, package/signature/checksum validation, and APK upload all passed for the `multi-screen / API 21` scenario.
- The APK download-back request then returned HTTP 403 because the local Build API enforces its allowed Origin for public `/api/download` and `/api/preview` routes, while the CI curl requests omitted the `Origin: https://as-app-builder.pages.dev` header. Added that exact allowed Origin header to both download round-trips. The same run's local API fixture creation passed after fixing the OIDC verifier.
- The latest workflow update is running a new native matrix; do not count the round-trip/screenshot criterion complete until all six jobs pass and artifacts are present.


## Stage 5 continuation — emulator action shell isolation fix (2026-10-19)

- Latest native matrix [#39163318356](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39163318356) verified the Origin-header fix: APK upload/download round-trip passed for all six jobs that reached it, and real APK build/signature/checksum validation passed.
- The screenshot step then failed with `adb: need APK file on command line` even though the APK exists and its SHA-256/signature checks passed. The log showed the emulator action executing each script line as a separate `/usr/bin/sh -c` process; variables assigned on previous lines (`APK`, `PACKAGE`) were therefore empty in the `adb install` process.
- Reworked the emulator script to execute as one `bash -euo pipefail -c` command and moved the normalized package ID to a matrix-derived job environment variable `PACKAGE_NAME`. This preserves the absolute APK path and package name in the same shell. Latest native rerun is pending; screenshot criteria remain unverified until all six jobs and artifacts pass.


## Stage 5 continuation — Android screenshot filesystem fix (2026-10-19)

- Native E2E [run #39163723547](https://github.com/asoevsolehjonofficial-stack/predlozheniya-android/actions/runs/39163723547) confirmed the one-shell fix: APK install succeeded, the app launched, and the activity check passed. The next exact failure was `Error opening file: /sdcard/native-e2e.png (Read-only file system)`, followed by `adb: error: remote object '/sdcard/native-e2e.png' does not exist`.
- Changed the screenshot path to writable `/data/local/tmp/native-e2e.png` for both `screencap` and `adb pull`. Removed Bash nounset from the nested shell to avoid a runner `PS1: unbound variable` startup warning while retaining `-e` and `pipefail`.
- Latest native matrix rerun is pending. APK build, signature/checksum validation, local API APK upload/download, app installation and launch are proven for the jobs that reached those steps; screenshot upload/download still requires a fully green rerun.
