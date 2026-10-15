const API = "https://api.github.com";
const OWNER = "asoevsolehjonofficial-stack";
const REPO = "predlozheniya-android";
const WORKFLOW = "build-user-project-apk.yml";
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_APK_BYTES = 25 * 1024 * 1024;
const UUID_RE = /^[a-f0-9]{32}$/;
const HASH_RE = /^[a-f0-9]{64}$/;

function json(body, status = 200, origin = "", extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "vary": "Origin",
      ...extra
    }
  });
}

function originAllowed(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.SITE_ORIGIN || "").replace(/\/$/, "");
  return { origin, ok: Boolean(allowed && origin === allowed) };
}

function validHtml(html) {
  if (typeof html !== "string") return "HTML must be text.";
  if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) return "HTML is over the 1 MiB limit.";
  if (!/<!doctype html|<html[\s>]/i.test(html) || !/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) return "Provide a complete HTML document with head and body.";
  if (/<script\b[^>]*\bsrc\s*=|<iframe\b[^>]*\bsrc\s*=|javascript\s*:/i.test(html)) return "External scripts, iframe sources, and javascript: URLs are not allowed.";
  if (/(github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]{20,}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,})/i.test(html)) return "Possible API key or secret detected. Remove it before building.";
  if (/http-equiv\s*=\s*["']?content-security-policy/i.test(html)) return "Remove custom CSP meta tags; the build pipeline applies its own policy.";
  return "";
}

async function sha256(value) {
  return sha256Bytes(new TextEncoder().encode(value));
}
async function sha256Bytes(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value))).map(b => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}
function sourceSecretValid(request, env) {
  const supplied = bearer(request);
  return Boolean(env.BUILD_SOURCE_SECRET && env.BUILD_SOURCE_SECRET.length >= 32 && safeEqual(supplied, env.BUILD_SOURCE_SECRET));
}
async function getJob(env, requestId) {
  if (!UUID_RE.test(requestId)) return null;
  const raw = await env.JOBS.get("job:" + requestId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function authorizedJob(request, env, requestId) {
  const job = await getJob(env, requestId);
  if (!job) return null;
  const token = bearer(request);
  if (!token || !job.tokenHash || !safeEqual(await sha256(token), job.tokenHash)) return null;
  return job;
}
async function gh(env, path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      "authorization": "Bearer " + env.GITHUB_TOKEN,
      "accept": "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "AS-App-Builder-Worker",
      ...(init.headers || {})
    }
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error("GitHub API " + res.status + ": " + detail);
  }
  if (res.status === 204) return null;
  return res.json();
}
async function verifyTurnstile(token, ip, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!result.ok) return false;
  const data = await result.json();
  return data.success === true && data.action === "build_apk" &&
    (!env.SITE_ORIGIN || (data.hostname && new URL(env.SITE_ORIGIN).hostname === data.hostname));
}
async function findRun(env, requestId) {
  const data = await gh(env, "/repos/" + OWNER + "/" + REPO + "/actions/workflows/" + WORKFLOW + "/runs?event=workflow_dispatch&branch=main&per_page=100");
  return (data.workflow_runs || []).find(run => run.display_title === "User APK: " + requestId) || null;
}

async function handleBuild(request, env, cors) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!env.JOBS || !env.RATE_LIMITS || !env.BUILDS || !env.GITHUB_TOKEN || !env.BUILD_SOURCE_SECRET ||
      env.BUILD_SOURCE_SECRET.length < 32 || !env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY ||
      env.TURNSTILE_SITE_KEY.startsWith("REPLACE_") || !env.SITE_ORIGIN) {
    return json({ error: "Backend is not configured. Check Worker secrets, KV/R2 bindings, and site settings." }, 503, cors.origin);
  }
  const limitKey = "ip:" + await sha256(ip);
  const current = Number(await env.RATE_LIMITS.get(limitKey) || "0");
  if (current >= 2) return json({ error: "Build limit reached for this network. Try again later." }, 429, cors.origin);
  const dayKey = "daily:" + new Date().toISOString().slice(0, 10);
  const dailyCount = Number(await env.RATE_LIMITS.get(dayKey) || "0");
  if (dailyCount >= 10) return json({ error: "The free daily build capacity has been reached. Please try again tomorrow." }, 429, cors.origin);
  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (declaredLength > 6 * 1024 * 1024) return json({ error: "Request body is too large." }, 413, cors.origin);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 6 * 1024 * 1024) return json({ error: "Request body is too large." }, 413, cors.origin);
  let payload;
  try { payload = JSON.parse(rawBody); } catch { payload = null; }
  if (!payload) return json({ error: "Invalid JSON request." }, 400, cors.origin);
  if (!(await verifyTurnstile(payload.turnstileToken, ip, env))) return json({ error: "Security check failed. Complete the anti-bot check and retry." }, 403, cors.origin);
  const problem = validHtml(payload.html);
  if (problem) return json({ error: problem }, 400, cors.origin);

  await env.RATE_LIMITS.put(limitKey, String(current + 1), { expirationTtl: 3600 });
  await env.RATE_LIMITS.put(dayKey, String(dailyCount + 1), { expirationTtl: 48 * 60 * 60 });
  const requestId = crypto.randomUUID().replace(/-/g, "");
  const slug = "build-" + requestId.slice(0, 12);
  const downloadToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const job = { requestId, slug, createdAt: Date.now(), status: "queued", html: payload.html, tokenHash: await sha256(downloadToken) };
  await env.JOBS.put("job:" + requestId, JSON.stringify(job), { expirationTtl: 86400 });
  try {
    await gh(env, "/repos/" + OWNER + "/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { project_slug: slug, request_id: requestId } })
    });
  } catch (error) {
    await env.JOBS.delete("job:" + requestId);
    throw error;
  }
  return json({ requestId, downloadToken, status: "queued", message: "Build queued. Keep this page open to check progress." }, 202, cors.origin);
}

async function handleSource(request, env, requestId) {
  if (!sourceSecretValid(request, env)) return json({ error: "Unauthorized." }, 401);
  const job = await getJob(env, requestId);
  if (!job || typeof job.html !== "string") return json({ error: "Source expired or already fetched." }, 404);
  const html = job.html;
  delete job.html;
  job.sourceFetchedAt = Date.now();
  job.status = "building";
  await env.JOBS.put("job:" + requestId, JSON.stringify(job), { expirationTtl: 86400 });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    }
  });
}

async function handleUpload(request, env, requestId) {
  if (!sourceSecretValid(request, env)) return json({ error: "Unauthorized." }, 401);
  if (!env.BUILDS) return json({ error: "Private build storage is not configured." }, 503);
  const job = await getJob(env, requestId);
  if (!job || !job.sourceFetchedAt || job.status === "failed") return json({ error: "Build request not found or source was not fetched." }, 404);
  if (job.apkUploadedAt) return json({ error: "APK was already uploaded." }, 409);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/octet-stream")) return json({ error: "Content-Type must be application/octet-stream." }, 415);
  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (declaredLength > MAX_APK_BYTES) return json({ error: "APK is too large." }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength < 1024 || bytes.byteLength > MAX_APK_BYTES) return json({ error: "APK size is outside the allowed range." }, 413);
  const expected = (request.headers.get("X-APK-SHA256") || "").toLowerCase();
  const actual = await sha256Bytes(bytes);
  if (!HASH_RE.test(expected) || !safeEqual(expected, actual)) return json({ error: "APK checksum verification failed." }, 400);
  await env.BUILDS.put("apk:" + requestId, bytes, {
    httpMetadata: { contentType: "application/vnd.android.package-archive", cacheControl: "no-store" },
    customMetadata: { requestId, sha256: actual, createdAt: String(Date.now()) }
  });
  job.apkSha256 = actual;
  job.apkUploadedAt = Date.now();
  job.status = "uploaded";
  await env.JOBS.put("job:" + requestId, JSON.stringify(job), { expirationTtl: 86400 });
  return json({ ok: true, sha256: actual }, 201);
}

async function handleStatus(request, env, cors, requestId) {
  const job = await authorizedJob(request, env, requestId);
  if (!job) return json({ error: "Build request not found or access token is invalid." }, 404, cors.origin);
  const run = await findRun(env, requestId);
  if (!run) return json({ requestId, status: "queued", message: "Waiting for GitHub Actions to start." }, 200, cors.origin);
  if (run.status !== "completed") return json({ requestId, status: run.status, message: run.status === "in_progress" ? "Building and verifying the APK…" : "Build is queued." }, 200, cors.origin);
  if (run.conclusion !== "success" || !job.apkUploadedAt) {
    job.status = "failed";
    delete job.html;
    await env.JOBS.put("job:" + requestId, JSON.stringify(job), { expirationTtl: 86400 });
    await env.BUILDS.delete("apk:" + requestId);
    return json({ requestId, status: "failed", message: "Build failed. Open the GitHub Actions run for diagnostics.", logs: run.html_url }, 200, cors.origin);
  }
  job.status = "success";
  job.runId = run.id;
  job.logs = run.html_url;
  await env.JOBS.put("job:" + requestId, JSON.stringify(job), { expirationTtl: 86400 });
  return json({ requestId, status: "success", message: "APK is ready.", downloadUrl: "/api/download?requestId=" + requestId, logs: run.html_url }, 200, cors.origin);
}

async function handleDownload(request, env, cors, requestId) {
  const job = await authorizedJob(request, env, requestId);
  if (!job) return json({ error: "Build request not found or access token is invalid." }, 404, cors.origin);
  if (job.status !== "success") return json({ error: "APK is not ready yet." }, 409, cors.origin);
  const object = await env.BUILDS.get("apk:" + requestId);
  if (!object) return json({ error: "APK expired or not found." }, 410, cors.origin);
  const bytes = new Uint8Array(await object.arrayBuffer());
  const actual = await sha256Bytes(bytes);
  if (!object.customMetadata || !safeEqual(actual, object.customMetadata.sha256 || "") || !safeEqual(actual, job.apkSha256 || "")) {
    await env.BUILDS.delete("apk:" + requestId);
    return json({ error: "Stored APK integrity check failed." }, 502, cors.origin);
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-disposition": 'attachment; filename="as-app-' + requestId.slice(0, 8) + '.apk"',
      "content-length": String(bytes.byteLength),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "x-apk-sha256": actual,
      "access-control-allow-origin": cors.origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      "vary": "Origin"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/internal/source" && request.method === "GET") return await handleSource(request, env, url.searchParams.get("requestId") || "");
      if (url.pathname === "/api/internal/upload" && request.method === "PUT") return await handleUpload(request, env, url.searchParams.get("requestId") || "");
      const cors = originAllowed(request, env);
      if (request.method === "OPTIONS") {
        if (!cors.ok) return new Response(null, { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": cors.origin,
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type,authorization",
            "access-control-max-age": "600",
            "vary": "Origin"
          }
        });
      }
      if (!cors.ok) return json({ error: "Origin is not allowed." }, 403, cors.origin);
      if (url.pathname === "/api/health" && request.method === "GET") {
        const configured = Boolean(env.GITHUB_TOKEN && env.BUILD_SOURCE_SECRET && env.BUILD_SOURCE_SECRET.length >= 32 &&
          env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY && !env.TURNSTILE_SITE_KEY.startsWith("REPLACE_") &&
          env.JOBS && env.RATE_LIMITS && env.BUILDS && env.SITE_ORIGIN);
        return json({ ok: configured, service: "A.S. APP BUILDER build API", buildEnabled: configured }, configured ? 200 : 503, cors.origin);
      }
      if (url.pathname === "/api/build" && request.method === "POST") {
        if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return json({ error: "Content-Type must be application/json." }, 415, cors.origin);
        return await handleBuild(request, env, cors);
      }
      if (url.pathname === "/api/status" && request.method === "GET") return await handleStatus(request, env, cors, url.searchParams.get("requestId") || "");
      if (url.pathname === "/api/download" && request.method === "GET") return await handleDownload(request, env, cors, url.searchParams.get("requestId") || "");
      return json({ error: "Not found." }, 404, cors.origin);
    } catch (error) {
      console.error("A.S. APP BUILDER API error:", error.message);
      return json({ error: "The build service encountered an error. Check Worker logs for details." }, 500);
    }
  },
  async scheduled(_event, env) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    try {
      const keys = await env.JOBS.list({ prefix: "job:", limit: 1000 });
      for (const item of keys.keys || []) {
        const job = await getJob(env, item.name.slice(4));
        if (job && Number(job.createdAt || 0) < cutoff) {
          await env.JOBS.delete(item.name);
          await env.BUILDS.delete("apk:" + job.requestId);
        }
      }
      const objects = await env.BUILDS.list({ prefix: "apk:", limit: 1000, include: ["customMetadata"] });
      for (const item of objects.objects || []) {
        const createdAt = Number(item.customMetadata?.createdAt || item.uploaded?.getTime?.() || 0);
        if (createdAt && createdAt < cutoff) await env.BUILDS.delete(item.key);
      }
    } catch (error) {
      console.error("Scheduled cleanup failed:", error.message);
    }
  }
};
