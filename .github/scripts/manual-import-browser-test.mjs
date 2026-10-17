import test from "node:assert/strict";
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const appPath = resolve(process.cwd(), "index.html");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(pathToFileURL(appPath).href, { waitUntil: "domcontentloaded" });

  const manualPanel = page.locator("#manualHtml").locator("xpath=ancestor::details[1]");
  if (!(await manualPanel.evaluate(element => element.open))) {
    await manualPanel.locator("summary").click();
  }

  await page.locator("#manualHtml").fill("<div>not a full document</div>");
  await page.locator("#importManualHtml").click();
  await page.locator("#aiStatus").filter({ hasText: "Не найден полный HTML-документ" }).waitFor({ timeout: 3000 });

  const validHtml = "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><title>A.S. Import Test</title></head><body><main>MANUAL_IMPORT_WORKS</main></body></html>";
  await page.locator("#manualHtml").fill("```html\n" + validHtml + "\n```");
  await page.locator("#importManualHtml").click();
  await page.locator("#aiStatus").filter({ hasText: "HTML импортирован" }).waitFor({ timeout: 3000 });

  const preview = page.locator("#previewPane iframe");
  await preview.waitFor({ timeout: 3000 });
  assert.equal(await preview.getAttribute("sandbox"), "allow-scripts", "Preview must stay sandboxed");
  assert.match(await preview.contentFrame().locator("body").innerText(), /MANUAL_IMPORT_WORKS/);
  assert.equal(await page.locator("#download").isEnabled(), true, "HTML export should be enabled after import");
  assert.equal(await page.locator("#downloadPwa").isEnabled(), true, "PWA ZIP export should be enabled after import");
  assert.equal(await page.locator("#downloadAndroidProject").isEnabled(), true, "Android project export should be enabled after import");
  assert.deepEqual(pageErrors, [], "The builder page must not throw uncaught JavaScript errors");
  console.log("PASS: invalid HTML rejected; fenced full HTML imported; isolated preview rendered; export controls enabled; no uncaught page errors.");
} finally {
  await browser.close();
}
