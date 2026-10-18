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

test("CI native build fixture rejects missing or invalid OIDC tokens without creating jobs", async () => {
  const values = new Map();
  const env = { JOBS: {
    get: async key => values.get(key) ?? null,
    put: async (key, value) => values.set(key, value),
    delete: async key => values.delete(key),
    list: async () => ({ keys: [...values.keys()].map(name => ({ name })) })
  } };
  const response = await call("/api/ci/build-fixture", {
    method: "POST",
    origin: null,
    headers: { "Content-Type": "application/json", Authorization: "Bearer invalid.token.value" },
    body: JSON.stringify({ files: [] }),
    env
  });
  assert.equal(response.status, 401);
  assert.equal(values.size, 0);
});

test("CI native build fixture rejects browser-origin requests", async () => {
  const response = await call("/api/ci/build-fixture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: [] }),
    env: { JOBS: { put: async () => { throw new Error("should not write"); } } }
  });
  assert.equal(response.status, 403);
});

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

test("built-in AI endpoint fails closed when the AI binding is missing", async () => {
  const response = await call("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Create a small app." }),
    env: { SITE_ORIGIN: ORIGIN, RATE_LIMITS: { get: async () => null, put: async () => {} } }
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});

test("built-in AI endpoint returns generated code and applies a per-hour limit", async () => {
  const store = new Map();
  const env = {
    SITE_ORIGIN: ORIGIN,
    RATE_LIMITS: {
      get: async key => store.get(key) ?? null,
      put: async (key, value) => { store.set(key, value); }
    },
    AI: {
      run: async (model, input) => {
        assert.equal(model, "@cf/meta/llama-3.2-3b-instruct");
        assert.equal(input.messages[1].content, "Create a small app.");
        return { response: "<!doctype html><html><head></head><body>AI works</body></html>" };
      }
    }
  };
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.55" },
    body: JSON.stringify({ prompt: "Create a small app." }),
    env
  };
  const first = await call("/api/ai/generate", options);
  assert.equal(first.status, 200);
  const data = await first.json();
  assert.match(data.text, /AI works/);
  assert.equal(data.provider, "cloudflare");

  const second = await call("/api/ai/generate", options);
  assert.equal(second.status, 200);
  const third = await call("/api/ai/generate", options);
  assert.equal(third.status, 429);
});

test("built-in AI endpoint rejects empty and oversized prompts", async () => {
  const env = {
    SITE_ORIGIN: ORIGIN,
    RATE_LIMITS: { get: async () => null, put: async () => {} },
    AI: { run: async () => ({ response: "unused" }) }
  };
  const empty = await call("/api/ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "  " }), env
  });
  assert.equal(empty.status, 400);
  const oversized = await call("/api/ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "x".repeat(18001) }), env
  });
  assert.equal(oversized.status, 413);
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


test("queued build status reports the queue state without exposing source data", async () => {
  const requestId = "1234567890abcdef1234567890abcdef";
  const token = "queued-status-test-token";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const job = {
    requestId,
    slug: "build-1234567890ab",
    status: "queued",
    createdAt: Date.now(),
    html: "<!doctype html><html><head></head><body>private</body></html>",
    tokenHash
  };
  const values = new Map([["job:" + requestId, JSON.stringify(job)]]);
  const env = {
    SITE_ORIGIN: ORIGIN,
    JOBS: {
      async get(key) { return values.get(key) || null; },
      async put(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); }
    }
  };

  const response = await call("/api/status?requestId=" + requestId, {
    env,
    headers: { Authorization: "Bearer " + token }
  });
  assert.equal(response.status, 200);
  const responseText = await response.clone().text();
  assert.deepEqual(JSON.parse(responseText), {
    requestId,
    status: "queued",
    message: "Waiting for the free build queue."
  });
  assert.doesNotMatch(responseText, /private/);
});
