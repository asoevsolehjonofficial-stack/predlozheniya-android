const OWNER = "asoevsolehjonofficial-stack";
const REPO = "predlozheniya-android";
const WORKFLOW_REF = OWNER + "/" + REPO + "/.github/workflows/build-user-project-apk.yml@refs/heads/main";
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_AUDIENCE = "as-app-builder-signing-key";
const KEY_NAME = "permanent-apk-signing-key-v1";
let jwksCache = null;
let jwksExpiresAt = 0;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    }
  });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
}
function decodeJwtPart(value) {
  return JSON.parse(decodeBase64Url(value));
}
function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifyGitHubOidc(request) {
  const headerValue = request.headers.get("Authorization") || "";
  if (!headerValue.startsWith("Bearer ")) return false;
  const parts = headerValue.slice(7).split(".");
  if (parts.length !== 3) return false;
  let header, claims, signature;
  try {
    header = decodeJwtPart(parts[0]);
    claims = decodeJwtPart(parts[1]);
    signature = fromBase64(decodeBase64Url(parts[2]));
  } catch { return false; }
  const now = Math.floor(Date.now() / 1000);
  const audienceValid = claims.aud === OIDC_AUDIENCE || (Array.isArray(claims.aud) && claims.aud.includes(OIDC_AUDIENCE));
  if (header.alg !== "RS256" || claims.iss !== OIDC_ISSUER || !audienceValid ||
      claims.repository !== OWNER + "/" + REPO || claims.workflow_ref !== WORKFLOW_REF ||
      claims.ref !== "refs/heads/main" || !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      (Number.isFinite(claims.nbf) && claims.nbf > now)) return false;
  try {
    if (!jwksCache || Date.now() >= jwksExpiresAt) {
      const result = await fetch(OIDC_ISSUER + "/.well-known/jwks");
      if (!result.ok) return false;
      jwksCache = await result.json();
      jwksExpiresAt = Date.now() + 60 * 60 * 1000;
    }
    const jwk = (jwksCache.keys || []).find(key => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(parts[0] + "." + parts[1]));
  } catch {
    return false;
  }
}

async function encryptionKey(env) {
  if (!env.SIGNING_ENCRYPTION_KEY) throw new Error("Encryption key is not configured.");
  const raw = fromBase64(env.SIGNING_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error("Encryption key has an invalid length.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptRecord(value, env) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return JSON.stringify({ version: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) });
}
async function decryptRecord(value, env) {
  const record = JSON.parse(value);
  if (record.version !== 1 || typeof record.iv !== "string" || typeof record.ciphertext !== "string") throw new Error("Encrypted signing record is invalid.");
  const key = await encryptionKey(env);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(record.iv) }, key, fromBase64(record.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
async function readLimited(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return response({ ok: true, service: "A.S. permanent APK signing key service" });
    if (url.pathname !== "/api/internal/key" || !["GET", "PUT"].includes(request.method)) return response({ error: "Not found." }, 404);
    if (!(await verifyGitHubOidc(request))) return response({ error: "Unauthorized." }, 401);
    if (!env.SIGNING || !env.SIGNING_ENCRYPTION_KEY) return response({ error: "Signing key store is not configured." }, 503);

    if (request.method === "GET") {
      const encrypted = await env.SIGNING.get(KEY_NAME);
      if (!encrypted) return response({ error: "Signing key has not been initialized." }, 404);
      try {
        const record = await decryptRecord(encrypted, env);
        if (record.version !== 1 || typeof record.keystoreBase64 !== "string" ||
            typeof record.storePassword !== "string" || typeof record.keyPassword !== "string" ||
            typeof record.keyAlias !== "string") throw new Error("Signing record fields are invalid.");
        return response(record, 200);
      } catch (error) {
        console.error("Unable to decrypt signing key record:", String(error?.message || "unknown error").slice(0, 160));
        return response({ error: "Signing key record could not be decrypted." }, 500);
      }
    }

    if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return response({ error: "Content-Type must be application/json." }, 415);
    let raw;
    try { raw = await readLimited(request, 128 * 1024); }
    catch { return response({ error: "Request body must be valid UTF-8." }, 400); }
    if (raw === null) return response({ error: "Signing key record is too large." }, 413);
    let record;
    try { record = JSON.parse(raw); } catch { record = null; }
    if (!record || typeof record.keystoreBase64 !== "string" || record.keystoreBase64.length < 100 ||
        record.keystoreBase64.length > 100000 || !/^[A-Za-z0-9+/=]+$/.test(record.keystoreBase64) ||
        typeof record.storePassword !== "string" || record.storePassword.length < 20 || record.storePassword.length > 256 ||
        typeof record.keyPassword !== "string" || record.keyPassword.length < 20 || record.keyPassword.length > 256 ||
        typeof record.keyAlias !== "string" || !/^[A-Za-z0-9_-]{1,50}$/.test(record.keyAlias)) {
      return response({ error: "Invalid signing key record." }, 400);
    }
    if (await env.SIGNING.get(KEY_NAME)) return response({ error: "A permanent signing key already exists; overwriting is forbidden." }, 409);
    const protectedRecord = {
      version: 1,
      keystoreBase64: record.keystoreBase64,
      storePassword: record.storePassword,
      keyPassword: record.keyPassword,
      keyAlias: record.keyAlias,
      createdAt: new Date().toISOString(),
      algorithm: "RSA-3072 / PKCS12"
    };
    const encrypted = await encryptRecord(protectedRecord, env);
    // Recheck before writing so a concurrent initializer cannot silently replace the first key.
    if (await env.SIGNING.get(KEY_NAME)) return response({ error: "A permanent signing key was initialized concurrently; fetch the existing key." }, 409);
    await env.SIGNING.put(KEY_NAME, encrypted);
    return response({ ok: true, createdAt: protectedRecord.createdAt, algorithm: protectedRecord.algorithm }, 201);
  }
};

export { verifyGitHubOidc, encryptRecord, decryptRecord };
