import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import worker from "../src/index.js";

const ORIGIN = "https://as-app-builder.pages.dev";

async function call(path, {
  method = "GET",
  origin = ORIGIN,
  headers = {},
  body,
  env = { SITE_ORIGIN: ORIGIN }
} = {}) {
  const requestHeaders = new Headers(headers);
  if (origin !== null) requestHeaders.set("Origin", origin);
  const request = new Request("https://worker.test" + path, {
    method,
    headers: requestHeaders,
    body
  });
  return worker.fetch(request, env);
}

test("health reports an unconfigured backend as unavailable", async () => {
  const response = await call("/api/health");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    service: "A.S. APP BUILDER build API",
    buildEnabled: false
  });
});

test("rejects an unapproved website origin", async () => {
  const response = await call("/api/health", { origin: "https://evil.example" });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /Origin is not allowed/);
});

test("approved CORS preflight returns the website origin and required headers", async () => {
  const response = await call("/api/build", {
    method: "OPTIONS",
    headers: { "Access-Control-Request-Method": "POST" }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(response.headers.get("access-control-allow-methods") || "", /POST/);
  assert.match(response.headers.get("access-control-allow-headers") || "", /authorization/i);
});

test("disallowed CORS preflight is rejected", async () => {
  const response = await call("/api/build", {
    method: "OPTIONS",
    origin: "https://evil.example",
    headers: { "Access-Control-Request-Method": "POST" }
  });
  assert.equal(response.status, 403);
});

test("unconfigured build API keeps CORS headers so the website can read the error", async () => {
  const response = await call("/api/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: "<!doctype html><html><head></head><body></body></html>" })
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match((await response.json()).error, /Backend is not configured/);
});

test("internal source endpoint rejects requests without GitHub OIDC credentials", async () => {
  const response = await call("/api/internal/source?requestId=0123456789abcdef0123456789abcdef");
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("build endpoint rejects non-JSON requests before processing", async () => {
  const response = await call("/api/build", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not json"
  });
  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /application\/json/);
});

test("unknown API routes return 404", async () => {
  const response = await call("/api/not-a-route");
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /Not found/);
});

test("API responses disable caching and sniffing", async () => {
  const response = await call("/api/health");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});


test("successful build status is available only with the download token", async () => {
  const requestId = "0123456789abcdef0123456789abcdef";
  const token = "stage-one-test-token";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const job = {
    requestId,
    status: "success",
    apkUploadedAt: Date.now(),
    tokenHash,
    apkSha256: "a".repeat(64)
  };
  const values = new Map([[ "job:" + requestId, JSON.stringify(job) ]]);
  const env = {
    SITE_ORIGIN: ORIGIN,
    JOBS: {
      async get(key) { return values.get(key) || null; },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); }
    }
  };

  const denied = await call("/api/status?requestId=" + requestId, { env });
  assert.equal(denied.status, 404);

  const response = await call("/api/status?requestId=" + requestId, {
    env,
    headers: { Authorization: "Bearer " + token }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    requestId,
    status: "success",
    message: "APK is ready.",
    downloadUrl: "/api/download?requestId=" + requestId,
    logs: null
  });
});

test("APK download verifies stored checksum and returns an installable-file response", async () => {
  const requestId = "fedcba9876543210fedcba9876543210";
  const token = "stage-one-download-token";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const bytes = Buffer.alloc(2048, 0x41);
  bytes[0] = 0x50;
  bytes[1] = 0x4b;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const job = { requestId, status: "success", apkUploadedAt: Date.now(), tokenHash, apkSha256: sha256 };
  const apk = { base64: bytes.toString("base64"), sha256, createdAt: Date.now() };
  const values = new Map([
    [ "job:" + requestId, JSON.stringify(job) ],
    [ "apk:" + requestId, JSON.stringify(apk) ]
  ]);
  const env = {
    SITE_ORIGIN: ORIGIN,
    JOBS: {
      async get(key) { return values.get(key) || null; },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); }
    }
  };

  const response = await call("/api/download?requestId=" + requestId, {
    env,
    headers: { Authorization: "Bearer " + token }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.android.package-archive");
  assert.match(response.headers.get("content-disposition") || "", /attachment; filename="as-app-fedcba98\.apk"/);
  assert.equal(response.headers.get("x-apk-sha256"), sha256);
  const downloaded = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(downloaded, bytes);
  assert.equal(createHash("sha256").update(downloaded).digest("hex"), sha256);
});

test("APK download rejects a tampered stored record and deletes it", async () => {
  const requestId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const token = "stage-one-tamper-token";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const bytes = Buffer.alloc(2048, 0x41);
  bytes[0] = 0x50;
  bytes[1] = 0x4b;
  const actual = createHash("sha256").update(bytes).digest("hex");
  const job = { requestId, status: "success", apkUploadedAt: Date.now(), tokenHash, apkSha256: "b".repeat(64) };
  const apk = { base64: bytes.toString("base64"), sha256: actual, createdAt: Date.now() };
  const values = new Map([
    [ "job:" + requestId, JSON.stringify(job) ],
    [ "apk:" + requestId, JSON.stringify(apk) ]
  ]);
  const env = {
    SITE_ORIGIN: ORIGIN,
    JOBS: {
      async get(key) { return values.get(key) || null; },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); }
    }
  };

  const response = await call("/api/download?requestId=" + requestId, {
    env,
    headers: { Authorization: "Bearer " + token }
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /integrity check failed/i);
  assert.equal(values.has("apk:" + requestId), false);
});
