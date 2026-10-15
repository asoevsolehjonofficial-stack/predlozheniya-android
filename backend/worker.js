const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_APK_BYTES = 30 * 1024 * 1024;
const JOB_TTL_SECONDS = 60 * 60;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "";
  const originOK = origin === allowed;
  return {
    ...(originOK ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "false", "vary": "Origin" } : {}),
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "Content-Type,Authorization,X-APK-SHA256",
    "access-control-max-age": "86400"
  };
}
function response(request, env, body, status = 200) {
  const headers = { ...corsHeaders(request, env) };
  if (body instanceof Response) return body;
  return json(body, status, headers);
}
function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
function validId(s) { return /^[a-f0-9]{32}$/.test(s || ""); }
async function sha256hex(data) {
  const bytes = data instanceof ArrayBuffer ? data : new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function getJob(env, id) {
  const raw = await env.JOBS.get("job:" + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function putJob(env, id, job) {
  await env.JOBS.put("job:" + id, JSON.stringify(job), { expirationTtl: JOB_TTL_SECONDS });
}
function internalOK(request, env) {
  const secret = env.BUILD_SOURCE_SECRET || "";
  return secret.length >= 32 && bearer(request) === secret;
}
async function verifyTurnstile(token, request, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  if (!r.ok) return false;
  const data = await r.json().catch(() => ({}));
  return data.success === true && (!data.action || data.action === "build_apk");
}
async function rateLimited(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const key = "rate:" + await sha256hex(ip + ":" + bucket);
  const count = Number(await env.JOBS.get(key) || "0");
  if (count >= 5) return true;
  await env.JOBS.put(key, String(count + 1), { expirationTtl: 11 * 60 });
  return false;
}
async function dispatchBuild(env, slug, requestId) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_ACTIONS_TOKEN;
  if (!repo || !token) throw new Error("Сервис сборки не настроен: отсутствуют серверные параметры GitHub.");
  const url = "https://api.github.com/repos/" + repo + "/actions/workflows/build-user-project-apk.yml/dispatches";
  const r = await fetch(url, {
    method: "POST",
    headers: { "authorization": "Bearer " + token, "accept": "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28", "user-agent": "AS-App-Builder" },
    body: JSON.stringify({ ref: "main", inputs: { project_slug: slug, request_id: requestId } })
  });
  if (r.status !== 204) {
    const detail = (await r.text()).slice(0, 300);
    throw new Error("GitHub не запустил сборку (HTTP " + r.status + "). " + detail);
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const origin = request.headers.get("Origin");
    if (origin && origin !== (env.ALLOWED_ORIGIN || "")) return json({ ok: false, error: "Запрос с этого сайта запрещён." }, 403, cors);

    if (request.method === "GET" && path === "/api/health") {
      const ready = Boolean(env.JOBS && env.SOURCES && env.APKS && env.TURNSTILE_SECRET && env.BUILD_SOURCE_SECRET && env.GITHUB_ACTIONS_TOKEN && env.GITHUB_REPOSITORY);
      return json({ ok: ready, service: "A.S. APP BUILDER build service", ...(ready ? {} : { error: "Не настроены все секреты или хранилища backend." }) }, ready ? 200 : 503, cors);
    }

    if (request.method === "POST" && path === "/api/build") {
      if (await rateLimited(request, env)) return json({ ok: false, error: "Слишком много запросов. Попробуй позже." }, 429, cors);
      const length = Number(request.headers.get("Content-Length") || "0");
      if (length > MAX_HTML_BYTES + 10000) return json({ ok: false, error: "Проект превышает лимит 1 MiB." }, 413, cors);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "Некорректный JSON." }, 400, cors); }
      const html = body && typeof body.html === "string" ? body.html : "";
      const size = new TextEncoder().encode(html).length;
      if (!html || size > MAX_HTML_BYTES) return json({ ok: false, error: "HTML пустой или превышает 1 MiB." }, 413, cors);
      if (!/<html[\s>]/i.test(html) || !/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) return json({ ok: false, error: "Проект должен содержать HTML, head и body." }, 400, cors);
      if (/<script[^>]+src\s*=|<iframe[^>]+src\s*=|javascript\s*:/i.test(html)) return json({ ok: false, error: "Удалите внешние скрипты, iframe и javascript: URL перед сборкой." }, 400, cors);
      if (/(github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]{20,}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,})/i.test(html)) return json({ ok: false, error: "В проекте обнаружен возможный секрет. Удалите его." }, 400, cors);
      if (!await verifyTurnstile(body.turnstileToken, request, env)) return json({ ok: false, error: "Проверка Turnstile не пройдена. Повтори проверку." }, 403, cors);
      const requestId = randomHex(16);
      const downloadToken = randomHex(32);
      const slug = "p-" + requestId.slice(0, 20);
      const job = { requestId, slug, status: "queued", message: "Задача поставлена в очередь.", tokenHash: await sha256hex(downloadToken), createdAt: new Date().toISOString() };
      await env.SOURCES.put("source:" + requestId, html, { expirationTtl: JOB_TTL_SECONDS });
      await putJob(env, requestId, job);
      try {
        await dispatchBuild(env, slug, requestId);
      } catch (e) {
        await env.SOURCES.delete("source:" + requestId);
        await putJob(env, requestId, { ...job, status: "failed", message: e.message });
        return json({ ok: false, error: e.message }, 502, cors);
      }
      return json({ ok: true, requestId, downloadToken }, 202, cors);
    }

    if (request.method === "GET" && path === "/api/status") {
      const id = url.searchParams.get("requestId") || "";
      if (!validId(id)) return json({ ok: false, error: "Неверный номер сборки." }, 400, cors);
      const job = await getJob(env, id);
      if (!job) return json({ ok: false, error: "Задача не найдена или срок хранения истёк." }, 404, cors);
      if (await sha256hex(bearer(request)) !== job.tokenHash) return json({ ok: false, error: "Нет доступа к этой сборке." }, 403, cors);
      return json({ ok: true, status: job.status, message: job.message || "", ...(job.status === "success" ? { downloadUrl: "/api/download?requestId=" + id, sha256: job.sha256 } : {}) }, 200, cors);
    }

    if (request.method === "GET" && path === "/api/download") {
      const id = url.searchParams.get("requestId") || "";
      if (!validId(id)) return json({ ok: false, error: "Неверный номер сборки." }, 400, cors);
      const job = await getJob(env, id);
      if (!job || job.status !== "success") return json({ ok: false, error: "APK пока не готов." }, 404, cors);
      if (await sha256hex(bearer(request)) !== job.tokenHash) return json({ ok: false, error: "Нет доступа к этому APK." }, 403, cors);
      const object = await env.APKS.get("apk:" + id);
      if (!object) return json({ ok: false, error: "APK больше не хранится." }, 404, cors);
      return new Response(object.body, { headers: { ...cors, "content-type": "application/vnd.android.package-archive", "content-length": String(object.size), "content-disposition": 'attachment; filename="as-app-' + id.slice(0, 8) + '.apk"', "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }

    if (path === "/api/internal/source" && request.method === "GET") {
      if (!internalOK(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
      const id = url.searchParams.get("requestId") || "";
      if (!validId(id)) return json({ ok: false, error: "Invalid request ID" }, 400);
      const html = await env.SOURCES.get("source:" + id);
      const job = await getJob(env, id);
      if (!html || !job || job.status === "failed") return json({ ok: false, error: "Source not found" }, 404);
      await putJob(env, id, { ...job, status: "building", message: "APK собирается на GitHub Actions." });
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }

    if (path === "/api/internal/upload" && request.method === "PUT") {
      if (!internalOK(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
      const id = url.searchParams.get("requestId") || "";
      if (!validId(id)) return json({ ok: false, error: "Invalid request ID" }, 400);
      const job = await getJob(env, id);
      if (!job) return json({ ok: false, error: "Job expired" }, 404);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_APK_BYTES) return json({ ok: false, error: "APK is empty or exceeds 30 MiB." }, 413);
      const digest = await sha256hex(bytes);
      if (request.headers.get("X-APK-SHA256") !== digest) return json({ ok: false, error: "APK checksum mismatch." }, 400);
      await env.APKS.put("apk:" + id, bytes, { httpMetadata: { contentType: "application/vnd.android.package-archive" }, customMetadata: { sha256: digest } });
      await env.SOURCES.delete("source:" + id);
      await putJob(env, id, { ...job, status: "success", message: "APK собран и проверен.", sha256: digest, completedAt: new Date().toISOString() });
      return json({ ok: true, sha256: digest });
    }

    if (path === "/api/internal/fail" && request.method === "POST") {
      if (!internalOK(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
      const id = url.searchParams.get("requestId") || "";
      if (!validId(id)) return json({ ok: false, error: "Invalid request ID" }, 400);
      const job = await getJob(env, id);
      if (!job) return json({ ok: false, error: "Job expired" }, 404);
      const body = await request.json().catch(() => ({}));
      await putJob(env, id, { ...job, status: "failed", message: String(body.message || "APK build failed").slice(0, 300), completedAt: new Date().toISOString() });
      await env.SOURCES.delete("source:" + id);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Not found" }, 404, cors);
  }
};
