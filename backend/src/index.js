import { unzipSync } from "fflate";

const API = "https://api.github.com";
const OWNER = "asoevsolehjonofficial-stack";
const REPO = "predlozheniya-android";
const WORKFLOW = "build-user-project-apk.yml";
const MAX_HTML_BYTES = 1024 * 1024;
const UUID_RE = /^[a-f0-9]{32}$/;

function response(body, status = 200, origin = "", extra = {}) {
  const responseBody = status === 204 ? null : (typeof body === "string" ? body : JSON.stringify(body));
  return new Response(responseBody, {
    status,
    headers: {
      "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
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
    const detail = (await res.text()).slice(0, 700);
    throw new Error("GitHub API " + res.status + ": " + detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function verifyTurnstile(token, ip, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });
  if (!result.ok) return false;
  const data = await result.json();
  return data.success === true && data.action === "build_apk" && (!env.SITE_ORIGIN || (data.hostname && new URL(env.SITE_ORIGIN).hostname === data.hostname));
}

async function deleteBranch(env, branch) {
  if (!/^asb-build-[a-f0-9]{20}$/.test(branch)) return;
  try {
    await gh(env, "/repos/" + OWNER + "/" + REPO + "/git/refs/heads/" + branch, { method: "DELETE" });
  } catch (e) {
    // Branch may already have been deleted by the scheduled cleanup.
  }
}

async function findRun(env, requestId) {
  const data = await gh(env, "/repos/" + OWNER + "/" + REPO + "/actions/workflows/" + WORKFLOW + "/runs?event=workflow_dispatch&branch=main&per_page=50");
  return (data.workflow_runs || []).find(run => run.display_title === "User APK: " + requestId) || null;
}

async function handleBuild(request, env, cors) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!env.JOBS || !env.RATE_LIMITS || !env.GITHUB_TOKEN || !env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY || !env.SITE_ORIGIN) {
    return response({ error: "Backend is not configured. Set the Worker secrets, SITE_ORIGIN, and KV bindings." }, 503, cors.origin);
  }

  const limitKey = "ip:" + await sha256(ip);
  const current = Number(await env.RATE_LIMITS.get(limitKey) || "0");
  if (current >= 2) return response({ error: "Build limit reached for this network. Try again later." }, 429, cors.origin);
  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (declaredLength > 6 * 1024 * 1024) return response({ error: "Request body is too large." }, 413, cors.origin);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 6 * 1024 * 1024) return response({ error: "Request body is too large." }, 413, cors.origin);
  let payload;
  try { payload = JSON.parse(rawBody); } catch { payload = null; }
  if (!payload) return response({ error: "Invalid JSON request." }, 400, cors.origin);
  if (!(await verifyTurnstile(payload.turnstileToken, ip, env))) return response({ error: "Security check failed. Complete the anti-bot check and retry." }, 403, cors.origin);
  const problem = validHtml(payload.html);
  if (problem) return response({ error: problem }, 400, cors.origin);

  await env.RATE_LIMITS.put(limitKey, String(current + 1), { expirationTtl: 3600 });
  const requestId = crypto.randomUUID().replace(/-/g, "");
  const slug = "build-" + requestId.slice(0, 12);
  const branch = "asb-build-" + requestId.slice(0, 20);
  const bytes = new TextEncoder().encode(payload.html);
  const base = await gh(env, "/repos/" + OWNER + "/" + REPO + "/git/ref/heads/main");
  await gh(env, "/repos/" + OWNER + "/" + REPO + "/git/refs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ref: "refs/heads/" + branch, sha: base.object.sha })
  });
  try {
    await gh(env, "/repos/" + OWNER + "/" + REPO + "/contents/projects/" + slug + "/index.html", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Temporary isolated APK build " + requestId,
        branch,
        content: toBase64(bytes)
      })
    });
    await gh(env, "/repos/" + OWNER + "/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { project_slug: slug, project_ref: branch, request_id: requestId } })
    });
  } catch (error) {
    await deleteBranch(env, branch);
    throw error;
  }
  await env.JOBS.put("job:" + requestId, JSON.stringify({ requestId, slug, branch, createdAt: Date.now(), status: "queued" }), { expirationTtl: 86400 });
  return response({ requestId, status: "queued", message: "Build queued. Keep this page open to check progress." }, 202, cors.origin);
}

async function handleStatus(request, env, cors, requestId) {
  if (!UUID_RE.test(requestId)) return response({ error: "Invalid request ID." }, 400, cors.origin);
  const raw = await env.JOBS.get("job:" + requestId);
  if (!raw) return response({ error: "Build request expired or not found." }, 404, cors.origin);
  const job = JSON.parse(raw);
  const run = await findRun(env, requestId);
  if (!run) return response({ requestId, status: "queued", message: "Waiting for GitHub Actions to start." }, 200, cors.origin);
  if (run.status !== "completed") return response({ requestId, status: run.status, message: run.status === "in_progress" ? "Building and verifying the APK…" : "Build is queued." }, 200, cors.origin);
  if (run.conclusion !== "success") {
    await deleteBranch(env, job.branch);
    job.status = "failed";
    job.conclusion = run.conclusion;
    await env.JOBS.put("job:" + requestId, JSON.stringify(job), { expirationTtl: 86400 });
    return response({ requestId, status: "failed", message: "Build failed. Open GitHub Actions for the build logs.", logs: run.html_url }, 200, cors.origin);
  }
  job.status = "success";
  job.runId = run.id;
  job.logs = run.html_url;
  await env.JOBS.put("job:" + requestId, JSON.stringify(job), { expirationTtl: 86400 });
  await deleteBranch(env, job.branch);
  return response({ requestId, status: "success", message: "APK is ready.", downloadUrl: "/api/download?requestId=" + requestId, logs: run.html_url }, 200, cors.origin);
}

async function handleDownload(env, cors, requestId) {
  if (!UUID_RE.test(requestId)) return response({ error: "Invalid request ID." }, 400, cors.origin);
  const raw = await env.JOBS.get("job:" + requestId);
  if (!raw) return response({ error: "Build request expired or not found." }, 404, cors.origin);
  const job = JSON.parse(raw);
  if (job.status !== "success" || !job.runId) return response({ error: "APK is not ready yet." }, 409, cors.origin);
  const artifacts = await gh(env, "/repos/" + OWNER + "/" + REPO + "/actions/runs/" + job.runId + "/artifacts");
  const artifact = (artifacts.artifacts || []).find(a => a.name === "project-" + job.slug + "-" + requestId + "-apk" && !a.expired);
  if (!artifact) return response({ error: "APK artifact is missing or expired." }, 410, cors.origin);
  const zipResponse = await fetch(API + "/repos/" + OWNER + "/" + REPO + "/actions/artifacts/" + artifact.id + "/zip", {
    headers: {
      "authorization": "Bearer " + env.GITHUB_TOKEN,
      "accept": "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "AS-App-Builder-Worker"
    }
  });
  if (!zipResponse.ok) return response({ error: "Could not download the verified build artifact." }, 502, cors.origin);
  const zipBytes = new Uint8Array(await zipResponse.arrayBuffer());
  if (zipBytes.byteLength > 30 * 1024 * 1024) return response({ error: "Build artifact exceeded the allowed size." }, 413, cors.origin);
  let files;
  try { files = unzipSync(zipBytes); } catch { return response({ error: "Build artifact ZIP is invalid." }, 502, cors.origin); }
  const apkName = Object.keys(files).find(name => name.endsWith("/app-debug.apk") || name === "app-debug.apk");
  if (!apkName) return response({ error: "APK was not found inside the build artifact." }, 502, cors.origin);
  const apk = files[apkName];
  if (apk.byteLength > 25 * 1024 * 1024 || apk.byteLength < 1024) return response({ error: "APK size is outside the allowed range." }, 502, cors.origin);
  const checksumName = Object.keys(files).find(name => name.endsWith("/app-debug.apk.sha256") || name === "app-debug.apk.sha256");
  if (!checksumName) return response({ error: "APK checksum is missing." }, 502, cors.origin);
  const expected = new TextDecoder().decode(files[checksumName]).trim().split(/\s+/)[0].toLowerCase();
  const actual = await sha256Bytes(apk);
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual) return response({ error: "APK checksum verification failed." }, 502, cors.origin);
  return new Response(apk, {
    status: 200,
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-disposition": 'attachment; filename="as-app-' + requestId.slice(0, 8) + '.apk"',
      "content-length": String(apk.byteLength),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-apk-sha256": actual,
      "access-control-allow-origin": cors.origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "vary": "Origin"
    }
  });
}

async function sha256(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Bytes(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value))).map(b => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export default {
  async fetch(request, env) {
    const cors = originAllowed(request, env);
    if (request.method === "OPTIONS") {
      if (!cors.ok) return new Response(null, { status: 403 });
      return response("", 204, cors.origin);
    }
    if (!cors.ok) return response({ error: "Origin is not allowed." }, 403, cors.origin);
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        const configured = Boolean(env.GITHUB_TOKEN && env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY && env.JOBS && env.RATE_LIMITS && env.SITE_ORIGIN);
        return response({ ok: configured, service: "A.S. APP BUILDER build API", buildEnabled: configured }, configured ? 200 : 503, cors.origin);
      }
      if (url.pathname === "/api/build" && request.method === "POST") return await handleBuild(request, env, cors);
      if (url.pathname === "/api/status" && request.method === "GET") return await handleStatus(request, env, cors, url.searchParams.get("requestId") || "");
      if (url.pathname === "/api/download" && request.method === "GET") return await handleDownload(env, cors, url.searchParams.get("requestId") || "");
      return response({ error: "Not found." }, 404, cors.origin);
    } catch (error) {
      console.error("A.S. APP BUILDER API error:", error.message);
      return response({ error: "The build service encountered an error. Check Worker logs for details." }, 500, cors.origin);
    }
  },
  async scheduled(_event, env) {
    // Remove stale temporary build branches once per day.
    const refs = await gh(env, "/repos/" + OWNER + "/" + REPO + "/git/matching-refs/heads/asb-build-");
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const item of refs || []) {
      const branch = item.ref.split("/").pop();
      if (!/^asb-build-[a-f0-9]{20}$/.test(branch)) continue;
      try {
        const commit = await gh(env, "/repos/" + OWNER + "/" + REPO + "/commits/" + item.object.sha);
        if (Date.parse(commit.commit.committer.date) < cutoff) await deleteBranch(env, branch);
      } catch (error) {
        console.error("Branch cleanup failed:", branch, error.message);
      }
    }
  }
};
