import assert from "node:assert/strict";
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

  await page.locator("#manualHtml").evaluate(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
  });

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

  // Test the prompt-to-preview frontend path without spending real AI quota.
  await page.reload({ waitUntil: "domcontentloaded" });
  const prompt = "Create a simple Russian vocabulary app with a working button.";
  const generatedHtml = "<!doctype html><html lang=\\"en\\"><head><meta charset=\\"utf-8\\"><title>Mock AI App</title></head><body><button id=\\"demo\\">AI_GENERATION_FLOW_WORKS</button><script>document.getElementById('demo').addEventListener('click',()=>document.body.dataset.clicked='yes');</script></body></html>";
  let generationRequestSeen = false;
  await page.route("https://as-app-builder-ai.asoev-solehjon-official.workers.dev/api/ai/generate", async route => {
    generationRequestSeen = true;
    const requestBody = route.request().postDataJSON();
    assert.match(requestBody.prompt, /Create a simple Russian vocabulary app/);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "https://as-app-builder.pages.dev" },
      body: JSON.stringify({ text: generatedHtml, provider: "cloudflare", model: "mock-test-model" })
    });
  });
  await page.locator("#prompt").fill(prompt);
  await page.locator("#aiGenerate").click();
  await page.locator("#state").filter({ hasText: "Приложение готово" }).waitFor({ timeout: 5000 });
  assert.equal(generationRequestSeen, true, "Prompt should reach the built-in AI endpoint");
  const aiPreview = page.locator("#previewPane iframe");
  await aiPreview.waitFor({ timeout: 3000 });
  assert.equal(await aiPreview.getAttribute("sandbox"), "allow-scripts", "AI preview must stay sandboxed");
  assert.match(await aiPreview.contentFrame().locator("body").innerText(), /AI_GENERATION_FLOW_WORKS/);
  assert.equal(await page.locator("#downloadAndroidProject").isEnabled(), true, "Android project export should be enabled after mocked generation");
  assert.deepEqual(pageErrors, [], "The builder page must not throw uncaught JavaScript errors");
  console.log("PASS: manual HTML import; invalid HTML rejection; sandboxed preview; exports; prompt-to-AI request-to-preview flow (AI response mocked; no quota spent).");
} finally {
  await browser.close();
}
