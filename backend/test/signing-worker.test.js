import test from "node:test";
import assert from "node:assert/strict";
import worker, { encryptRecord, decryptRecord } from "../signing-worker.js";

test("signing key service rejects requests without a GitHub OIDC token", async () => {
  const response = await worker.fetch(new Request("https://signing.test/api/internal/key"), {
    SIGNING: { get: async () => null, put: async () => {} },
    SIGNING_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64")
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Unauthorized/);
});

test("permanent signing record is encrypted at rest and decrypts correctly", async () => {
  const env = { SIGNING_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64") };
  const record = {
    version: 1,
    keystoreBase64: "dGVzdC1rZXlzdG9yZS1ieXRlcw==",
    storePassword: "not-a-real-password-for-unit-test",
    keyPassword: "not-a-real-password-for-unit-test",
    keyAlias: "as-builder-release",
    createdAt: "2026-10-17T00:00:00.000Z",
    algorithm: "RSA-3072 / PKCS12"
  };
  const encrypted = await encryptRecord(record, env);
  assert.notEqual(encrypted, JSON.stringify(record));
  assert.doesNotMatch(encrypted, /storePassword|keyPassword|as-builder-release/);
  assert.deepEqual(await decryptRecord(encrypted, env), record);
});

test("signing record encryption rejects a missing or invalid encryption secret", async () => {
  await assert.rejects(() => encryptRecord({ key: "value" }, {}), /not configured/);
  await assert.rejects(() => encryptRecord({ key: "value" }, { SIGNING_ENCRYPTION_KEY: "not-base64-key" }));
});
