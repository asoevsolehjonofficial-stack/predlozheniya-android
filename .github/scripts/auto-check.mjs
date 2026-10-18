import { chromium } from "playwright";

const siteUrl = (process.env.SITE_URL || "https://as-app-builder.pages.dev").replace(/\/$/, "");
const apiUrl = (process.env.API_URL || "https://as-app-builder-api.asoev-solehjon-official.workers.dev").replace(/\/$/, "");
const aiUrl = (process.env.AI_API_URL || "https://as-app-builder-ai.asoev-solehjon-official.workers.dev").replace(/\/$/, "");
const failures = [];
const checks = [];

function pass(name, detail = "") { checks.push({ name, status: "PASS", detail }); console.log(`PASS: ${name}${detail ? " — " + detail : ""}`); }
function fail(name, detail = "") { failures.push({ name, detail }); checks.push({ name, status: "FAIL", detail }); console.error(`FAIL: ${name}${detail ? " — " + detail : ""}`); }
function skip(name, detail = "") { checks.push({ name, status: "SKIP", detail }); console.log(`SKIP: ${name}${detail ? " — " + detail : ""}`); }

async function checkHttpAsset(path) {
  const url = siteUrl + path;
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return fail(`HTTP asset ${path}`, `HTTP ${response.status}`);
    pass(`HTTP asset ${path}`, `HTTP ${response.status}`);
  } catch (error) { fail(`HTTP asset ${path}`, error.message); }
}

for (const path of ["/", "/manifest.webmanifest", "/service-worker.js", "/icon.svg"]) {
  await checkHttpAsset(path);
}

if (process.env.CHECK_BACKEND_HEALTH === "false") {
  skip("Production backend health", "Not part of quota-free native fixture E2E; production health is checked by separate release smoke.");
} else {
  try {
    const response = await fetch(apiUrl + "/api/health", { redirect: "follow", signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true || body.buildEnabled !== true) {
      fail("Cloudflare Worker health", `HTTP ${response.status}; ok=${String(body.ok)}; buildEnabled=${String(body.buildEnabled)}`);
    } else pass("Cloudflare Worker health", "API reports buildEnabled=true");
  } catch (error) { fail("Cloudflare Worker health", error.message); }
  
  try {
    const response = await fetch(aiUrl + "/api/health", { redirect: "follow", headers: { Origin: siteUrl }, signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true || !String(body.model || "").includes("llama")) {
      fail("Built-in AI Worker health", `HTTP ${response.status}; ok=${String(body.ok)}; model=${String(body.model)}`);
    } else pass("Built-in AI Worker health", "AI binding configured; model " + body.model);
  } catch (error) { fail("Built-in AI Worker health", error.message); }
  
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!response || !response.ok()) {
    fail("Browser opens main site", response ? `HTTP ${response.status()}` : "No main document response");
  } else {
    const title = await page.title();
    if (!title.includes("A.S. APP BUILDER")) fail("Page title", `Unexpected title: ${title}`);
    else pass("Page title", title);

    const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    if (!bodyText.includes("A.S. APP BUILDER")) fail("Builder brand visible", "Expected brand text not found");
    else pass("Builder brand visible");

    const textareas = await page.locator("textarea").count();
    const buttons = await page.locator("button").count();
    if (textareas < 1) fail("Prompt input exists", "No textarea found");
    else pass("Prompt input exists", `${textareas} textarea(s)`);
    if (buttons < 1) fail("Interactive controls exist", "No buttons found");
    else pass("Interactive controls exist", `${buttons} button(s)`);

    if (pageErrors.length) fail("Browser JavaScript runtime", pageErrors.slice(0, 8).join(" | "));
    else pass("Browser JavaScript runtime", "No uncaught page errors");

    if (process.env.RUN_LIVE_AI_TEST === "true") {
  
      try {
        await page.locator("#aiProvider").evaluate((el) => { el.value = "cloudflare"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
        await page.locator("#prompt").fill("Create a very simple complete HTML page with title A.S. Browser AI Test and body text UI_GENERATION_SUCCESS. Use inline CSS only.");
        await page.locator("#aiGenerate").click({ timeout: 10000 });
        await page.waitForFunction(() => {
          const state = document.querySelector("#state")?.textContent || "";
          const status = document.querySelector("#aiStatus")?.textContent || "";
          return state.includes("готово") || state.includes("Готово") || status.startsWith("Ошибка:");
        }, { timeout: 90000 });
        const state = await page.locator("#state").innerText().catch(() => "");
        const code = await page.locator("#code").innerText().catch(() => "");
        const previewCount = await page.locator("#previewPane iframe").count().catch(() => 0);
        if (!/<html[\s>]/i.test(code) || !/<\/html>/i.test(code) || previewCount < 1) {
          const status = (await page.locator("#aiStatus").textContent().catch(() => ""))?.trim() || "";
          fail("Real AI generation through builder UI", `No complete HTML or preview. State=${state}; status=${status.slice(0, 240)}`);
        } else {
          pass("Real AI generation through builder UI", `Generated complete HTML and rendered preview; ${code.length} characters`);
          console.log("REAL_BUILDER_UI_AI_GENERATION=PASS");
        }
  
      } catch (error) {
        fail("Real AI generation through builder UI", error.message);
      }
    } else {
      skip("Real AI generation through builder UI", "Skipped on routine push/PR to protect the shared daily AI quota; run manually with test_live_ai=true.");
    }
  }
} catch (error) {
  fail("Browser end-to-end smoke test", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
}

const report = {
  timestamp: new Date().toISOString(),
  siteUrl,
  apiUrl,
  aiUrl,
  passed: checks.filter(x => x.status === "PASS").length,
  failed: failures.length,
  checks,
  failures
};
console.log("AUTO_CHECK_JSON=" + JSON.stringify(report));
if (failures.length) process.exitCode = 1;
