import test from "node:test";
import assert from "node:assert/strict";
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
