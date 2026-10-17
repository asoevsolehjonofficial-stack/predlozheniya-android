import test from "node:test";
import assert from "node:assert/strict";
import worker, { getProvider, generateWithDeepSeek } from "../ai-worker.js";

const ORIGIN = "https://as-app-builder.pages.dev";

function rateLimitStore() {
  const values = new Map();
  return {
    values,
    get: async key => values.get(key) ?? null,
    put: async (key, value) => { values.set(key, value); }
  };
}

async function call(path, { method = "GET", origin = ORIGIN, headers = {}, body, env } = {}) {
  const requestHeaders = new Headers(headers);
  if (origin !== null) requestHeaders.set("Origin", origin);
  const request = new Request("https://ai-worker.test" + path, { method, headers: requestHeaders, body });
  return worker.fetch(request, env || { RATE_LIMITS: rateLimitStore() });
}

function deepseekEnv(overrides = {}) {
  return {
    DEEPSEEK_API_KEY: "test-secret-key",
    RATE_LIMITS: rateLimitStore(),
    ...overrides
  };
}

function cloudflareEnv(aiRun = async () => ({ response: "<!doctype html><html><body>AI works</body></html>" })) {
  return {
    RATE_LIMITS: rateLimitStore(),
    AI: { run: aiRun }
  };
}

test("DeepSeek is selected automatically when its secret is configured", () => {
  assert.deepEqual(getProvider(deepseekEnv()), { provider: "deepseek", model: "deepseek-flash" });
});

test("Cloudflare AI remains available when no DeepSeek key is configured", () => {
  assert.deepEqual(getProvider(cloudflareEnv()), { provider: "cloudflare", model: "@cf/meta/llama-3.2-3b-instruct" });
});

test("explicit provider setting is validated and does not silently fall back", () => {
  assert.match(getProvider({ AI_PROVIDER: "deepseek" }).error, /DEEPSEEK_API_KEY/);
  assert.match(getProvider({ AI_PROVIDER: "unknown", AI: {} }).error, /AI_PROVIDER/);
});

test("health reports DeepSeek provider without exposing the secret", async () => {
  const response = await call("/api/health", { env: deepseekEnv() });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.provider, "deepseek");
  assert.equal(data.model, "deepseek-flash");
  assert.doesNotMatch(JSON.stringify(data), /test-secret-key/);
});

test("built-in AI health and generation remain compatible with Cloudflare AI", async () => {
  const env = cloudflareEnv(async (model, input) => {
    assert.equal(model, "@cf/meta/llama-3.2-3b-instruct");
    assert.equal(input.messages[1].content, "Create a small app.");
    return { response: "<!doctype html><html><body>AI works</body></html>" };
  });
  const health = await call("/api/health", { env });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).provider, "cloudflare");

  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.77" },
    body: JSON.stringify({ prompt: "Create a small app." }),
    env
  };
  const first = await call("/api/ai/generate", options);
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.match(result.text, /AI works/);
  assert.equal(result.provider, "cloudflare");
  assert.equal((await call("/api/ai/generate", options)).status, 200);
  assert.equal((await call("/api/ai/generate", options)).status, 429);
});

test("DeepSeek generation sends a server-side authenticated request and returns generated code", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: "<!doctype html><html><body>DeepSeek works</body></html>" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await call("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.8" },
      body: JSON.stringify({ prompt: "Create a small app." }),
      env: deepseekEnv()
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.text, /DeepSeek works/);
    assert.equal(data.provider, "deepseek");
    assert.equal(data.model, "deepseek-flash");
    assert.equal(captured.url, "https://api.deepseek.com/chat/completions");
    assert.equal(captured.options.headers.authorization, "Bearer test-secret-key");
    assert.equal(captured.body.model, "deepseek-flash");
    assert.equal(captured.body.thinking.type, "disabled");
    assert.equal(captured.body.messages[1].content, "Create a small app.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepSeek upstream quota errors return a safe 429 message without upstream body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("sensitive provider diagnostics", { status: 429 });
  try {
    const response = await call("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Create a small app." }),
      env: deepseekEnv()
    });
    assert.equal(response.status, 429);
    const body = await response.text();
    assert.match(body, /rate limit or quota/i);
    assert.doesNotMatch(body, /sensitive provider diagnostics|test-secret-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepSeek API key is never echoed and prompts containing likely secrets are rejected", async () => {
  const response = await call("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Use this key sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456" }),
    env: deepseekEnv()
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /contains a secret/i);
});

test("DeepSeek endpoint rejects unapproved origins before calling the provider", async () => {
  const response = await call("/api/ai/generate", {
    method: "POST",
    origin: "https://evil.example",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Create a small app." }),
    env: deepseekEnv()
  });
  assert.equal(response.status, 403);
});

test("DeepSeek empty and malformed upstream responses fail safely", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    await assert.rejects(() => generateWithDeepSeek(deepseekEnv(), "deepseek-flash", "Create app"), /DEEPSEEK_INVALID_JSON/);

    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
    await assert.rejects(() => generateWithDeepSeek(deepseekEnv(), "deepseek-flash", "Create app"), /DEEPSEEK_EMPTY/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("built-in AI rejects empty, oversized, and secret-bearing prompts", async () => {
  const env = cloudflareEnv();
  const empty = await call("/api/ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: " " }), env
  });
  assert.equal(empty.status, 400);
  const large = await call("/api/ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "x".repeat(18001) }), env
  });
  assert.equal(large.status, 413);
  const secret = await call("/api/ai/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Here is sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890" }), env
  });
  assert.equal(secret.status, 400);
});
