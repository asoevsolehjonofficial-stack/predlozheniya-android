import test from "node:test";
import assert from "node:assert/strict";
import { validHtml, bytesToBase64, base64ToBytes, safeEqual, verifyGitHubOidc, readBodyLimited } from "../src/index.js";

test("accepts a complete self-contained HTML document", () => {
  assert.equal(validHtml("<!doctype html><html><head><title>Demo</title></head><body><h1>OK</h1></body></html>"), "");
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
