import test from "node:test";
import assert from "node:assert/strict";
import worker, { getProvider } from "../ai-worker.js";

const ORIGIN = "https://as-app-builder.pages.dev";

async function call(path, { method = "GET", origin = ORIGIN, headers = {}, body, env = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (origin !== null) requestHeaders.set("Origin", origin);
  const request = new Request("https://ai-worker.test" + path, { method, headers: requestHeaders, body });
  return worker.fetch(request, env);
}

function fakeEnv(aiRun = async () => ({ response: "<!doctype html><html><head></head><body>AI works</body></html>" })) {
  const store = new Map();
  return {
    RATE_LIMITS: { get: async key => store.get(key) ?? null, put: async (key, value) => { store.set(key, value); } },
    AI: { run: aiRun }
  };
}

test("built-in AI health reports configured model", async () => {
  const response = await call("/api/health", { env: fakeEnv() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.model, /llama/);
});

test("built-in AI rejects unknown origins", async () => {
  const response = await call("/api/ai/generate", {
    origin: "https://evil.example",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Create a page." }),
    env: fakeEnv()
  });
  assert.equal(response.status, 403);
});

test("built-in AI returns generated HTML and rate-limits requests", async () => {
  const env = fakeEnv(async (model, input) => {
    assert.equal(model, "@cf/meta/llama-3.2-3b-instruct");
    assert.equal(input.messages[1].content, "Create a small app.");
    return { response: "<!doctype html><html><head></head><body>AI works</body></html>" };
  });
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

test("built-in AI rejects empty, oversized, and secret-bearing prompts", async () => {
  const env = fakeEnv();
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


test("native Android source generation uses the dedicated code model", async () => {
  let calledModel = "";
  const env = fakeEnv(async (model, input) => {
    calledModel = model;
    assert.match(input.messages[0].content, /no WebView/i);
    return { response: { files: [{ path: "app/src/main/java/tj/as/generated/MainActivity.java", content: "public class MainActivity {}" }] } };
  });
  const response = await call("/api/ai/native-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.88" },
    body: JSON.stringify({ prompt: "Create a native notes app" }),
    env
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(calledModel, "@cf/qwen/qwen2.5-coder-32b-instruct");
  assert.equal(result.mode, "native-android-source");
  assert.equal(result.model, calledModel);
  assert.match(result.text, /MainActivity/);
});

test("native Android source endpoint retains origin protection", async () => {
  const env = fakeEnv();
  const response = await call("/api/ai/native-generate", {
    origin: "https://evil.example",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Create a native app" }),
    env
  });
  assert.equal(response.status, 403);
});

test("native AI has an independent daily quota when web AI capacity is exhausted", async () => {
  const written = [];
  const env = {
    RATE_LIMITS: {
      get: async key => key.startsWith("asai:global-day:") ? "30" : null,
      put: async (key, value) => { written.push([key, value]); }
    },
    AI: { run: async () => ({ response: { files: [{ path: "app/src/main/java/tj/as/generated/MainActivity.java", content: "public class MainActivity extends Activity {}" }] } }) }
  };
  const response = await call("/api/ai/native-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.99" },
    body: JSON.stringify({ prompt: "Create a tiny native app" }),
    env
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(JSON.parse(body.text).files.length, 1);
  assert.ok(written.some(([key]) => key.startsWith("asai:global-native-day:")));
});


function deepseekEnv(overrides = {}) {
  const values = new Map();
  return {
    DEEPSEEK_API_KEY: "test-secret-key",
    RATE_LIMITS: { get: async key => values.get(key) ?? null, put: async (key, value) => { values.set(key, value); } },
    ...overrides
  };
}

test("DeepSeek provider is selected when its secret exists and native mode keeps its dedicated model", () => {
  assert.deepEqual(getProvider(deepseekEnv()), { provider: "deepseek", model: "deepseek-flash" });
  assert.deepEqual(getProvider({ ...deepseekEnv(), DEEPSEEK_MODEL: "deepseek-v4-pro" }, true), {
    provider: "deepseek", model: "deepseek-v4-pro"
  });
  assert.deepEqual(getProvider({ ...deepseekEnv(), AI_PROVIDER: "cloudflare", AI: { run: async () => ({}) } }, true), {
    provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct"
  });
});

test("invalid or unconfigured explicit AI provider fails closed", () => {
  assert.match(getProvider({ AI_PROVIDER: "unknown", AI: {} }).error, /AI_PROVIDER/);
  assert.match(getProvider({ AI_PROVIDER: "deepseek", RATE_LIMITS: {} }).error, /DEEPSEEK_API_KEY/);
  assert.match(getProvider({ AI_PROVIDER: "cloudflare", RATE_LIMITS: {} }).error, /AI binding/);
});

test("DeepSeek generation preserves the web/native response shape without exposing the API key", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"files":[{"path":"app/src/main/java/tj/as/generated/MainActivity.java","content":"package tj.as.generated;"}]}' } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await call("/api/ai/native-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.140" },
      body: JSON.stringify({ prompt: "Create a native notes app" }),
      env: deepseekEnv()
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.provider, "deepseek");
    assert.equal(data.model, "deepseek-flash");
    assert.equal(data.mode, "native-android-source");
    assert.match(data.text, /MainActivity/);
    assert.equal(captured.url, "https://api.deepseek.com/chat/completions");
    assert.equal(captured.options.headers.authorization, "Bearer test-secret-key");
    assert.equal(captured.body.messages[1].content, "Create a native notes app");
    assert.doesNotMatch(JSON.stringify(data), /test-secret-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepSeek quota errors are sanitized and return HTTP 429", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("provider-secret-diagnostic", { status: 429 });
  try {
    const response = await call("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.141" },
      body: JSON.stringify({ prompt: "Create a small web app" }),
      env: deepseekEnv()
    });
    assert.equal(response.status, 429);
    const data = await response.json();
    assert.match(data.error, /quota/i);
    assert.doesNotMatch(JSON.stringify(data), /provider-secret-diagnostic|test-secret-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("health reports the configured provider but never returns its secret", async () => {
  const response = await call("/api/health", { env: deepseekEnv() });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.provider, "deepseek");
  assert.equal(data.model, "deepseek-flash");
  assert.doesNotMatch(JSON.stringify(data), /test-secret-key/);
});
