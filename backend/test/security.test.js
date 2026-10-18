import test from "node:test";
import assert from "node:assert/strict";
import { validHtml, validNativeFiles, bytesToBase64, base64ToBytes, safeEqual, verifyGitHubOidc, readBodyLimited, recoverStaleJob } from "../src/index.js";

const STALE_BUILD_MS = 35 * 60 * 1000;

test("accepts a complete self-contained HTML document", () => {
  assert.equal(validHtml("<!doctype html><html><head><title>Demo</title></head><body><h1>OK</h1></body></html>"), "");
});

test("accepts a minimal native Android project with an Activity entry point", () => {
  const files = [{ path: "app/src/main/java/tj/as/generated/MainActivity.java", content: "package tj.as.generated; import android.app.Activity; public class MainActivity extends Activity {}" }];
  assert.equal(validNativeFiles(files), "");
});

test("rejects unsafe native paths, duplicate files, and missing entry points", () => {
  const main = { path: "app/src/main/java/tj/as/generated/MainActivity.java", content: "package tj.as.generated; import android.app.Activity; public class MainActivity extends Activity {}" };
  assert.match(validNativeFiles([{ ...main, path: "app/src/main/java/tj/as/generated/../MainActivity.java" }]), /path/i);
  assert.match(validNativeFiles([main, main]), /Duplicate/i);
  assert.match(validNativeFiles([{ path: "app/src/main/java/tj/as/generated/Helper.java", content: "package tj.as.generated; class Helper {}" }]), /MainActivity/i);
});

test("rejects restricted runtime loading and network APIs in native source", () => {
  const main = { path: "app/src/main/java/tj/as/generated/MainActivity.java", content: "package tj.as.generated; import android.app.Activity; public class MainActivity extends Activity { void x(){ new ProcessBuilder(\"id\"); } }" };
  assert.match(validNativeFiles([main]), /restricted/i);
});

test("rejects incomplete HTML and remote executable content", () => {
  assert.match(validHtml("<html><body>missing head</body></html>"), /complete HTML document/i);
  assert.match(validHtml("<!doctype html><html><head></head><body><script src=\"https://example.com/x.js\"></script></body></html>"), /External scripts/i);
  assert.match(validHtml("<!doctype html><html><head></head><body><iframe src=\"https://example.com\"></iframe></body></html>"), /External scripts/i);
  assert.match(validHtml("<!doctype html><html><head></head><body><a href=\"javascript:alert(1)\">x</a></body></html>"), /External scripts/i);
});

test("rejects likely secrets and custom CSP overrides", () => {
  assert.match(validHtml("<!doctype html><html><head></head><body>sk-abcdefghijklmnopqrstuvwxyz123456</body></html>"), /secret detected/i);
  assert.match(validHtml("<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\"></head><body></body></html>"), /custom CSP/i);
});

test("constant-time equality rejects unequal values and lengths", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "ab"), false);
  assert.equal(safeEqual(null, "abc"), false);
});

test("binary APK base64 encoding round-trips bytes exactly", () => {
  const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255, 0, 42]);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test("rejects missing or malformed GitHub OIDC credentials", async () => {
  assert.equal(await verifyGitHubOidc(new Request("https://example.test/internal")), false);
  assert.equal(await verifyGitHubOidc(new Request("https://example.test/internal", { headers: { Authorization: "Bearer not.a.jwt" } })), false);
});


test("readBodyLimited reads small request bodies", async () => {
  const request = new Request("https://example.test/api/build", { method: "POST", body: '{"html":"ok"}' });
  assert.equal(await readBodyLimited(request, 100), '{"html":"ok"}');
});

test("readBodyLimited rejects bodies above the configured cap", async () => {
  const request = new Request("https://example.test/api/build", { method: "POST", body: "x".repeat(1024) });
  assert.equal(await readBodyLimited(request, 100), null);
});


test("does not recover a job while its worker is within the timeout window", () => {
  const now = 1_000_000;
  const job = { status: "building", sourceFetchedAt: now - STALE_BUILD_MS + 1, html: "<html></html>", retryCount: 0 };
  assert.equal(recoverStaleJob(job, now), false);
  assert.equal(job.status, "building");
});

test("requeues a stale claimed job once and preserves its source", () => {
  const now = 2_000_000;
  const job = { status: "claimed", claimedAt: now - STALE_BUILD_MS - 1, html: "<!doctype html>", retryCount: 0 };
  assert.equal(recoverStaleJob(job, now), true);
  assert.equal(job.status, "queued");
  assert.equal(job.retryCount, 1);
  assert.equal(job.html, "<!doctype html>");
  assert.equal("claimedAt" in job, false);
});

test("requeues a stale building job with preserved source for one retry", () => {
  const now = 3_000_000;
  const job = { status: "building", sourceFetchedAt: now - STALE_BUILD_MS - 1, html: "<!doctype html>", retryCount: 0 };
  assert.equal(recoverStaleJob(job, now), true);
  assert.equal(job.status, "queued");
  assert.equal(job.retryCount, 1);
  assert.equal(job.html, "<!doctype html>");
  assert.equal("sourceFetchedAt" in job, false);
});

test("requeues a stale native build once and preserves native source files", () => {
  const now = 3_500_000;
  const nativeFiles = [{ path: "app/src/main/java/tj/as/generated/MainActivity.java", content: "package tj.as.generated;" }];
  const job = { status: "building", sourceFetchedAt: now - STALE_BUILD_MS - 1, nativeFiles, type: "native", retryCount: 0 };
  assert.equal(recoverStaleJob(job, now), true);
  assert.equal(job.status, "queued");
  assert.equal(job.retryCount, 1);
  assert.deepEqual(job.nativeFiles, nativeFiles);
  assert.equal("sourceFetchedAt" in job, false);
});

test("marks a repeatedly stale job failed instead of retrying forever", () => {
  const now = 4_000_000;
  const job = { status: "building", sourceFetchedAt: now - STALE_BUILD_MS - 1, html: "<!doctype html>", retryCount: 1 };
  assert.equal(recoverStaleJob(job, now), true);
  assert.equal(job.status, "failed");
  assert.equal(typeof job.failedAt, "number");
  assert.equal("html" in job, false);
});

test("marks a stale legacy job without retained source failed safely", () => {
  const now = 5_000_000;
  const job = { status: "building", sourceFetchedAt: now - STALE_BUILD_MS - 1, retryCount: 0 };
  assert.equal(recoverStaleJob(job, now), true);
  assert.equal(job.status, "failed");
  assert.equal("html" in job, false);
});
