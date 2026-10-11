import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generateKeyPairSync, createPublicKey, createHash, verify } from "crypto";
import { readSecretFile } from "./secrets";
import { loadDecisionKey, signAuthorization, signedText, type AuthzFields } from "./authz";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function write(name: string, content: string, mode: number): string {
  dir ??= mkdtempSync(join(tmpdir(), "lab-secret-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  chmodSync(path, mode);
  return path;
}

describe("readSecretFile", () => {
  for (const mode of [0o400, 0o600]) {
    it(`reads a file with mode ${mode.toString(8)}`, () => {
      assert.deepEqual(readSecretFile(write("s", "value\n", mode)), { ok: true, value: "value\n" });
    });
  }

  for (const mode of [0o440, 0o404, 0o640, 0o644, 0o664, 0o666]) {
    it(`refuses a file with mode ${mode.toString(8)}`, () => {
      const read = readSecretFile(write("s", "value", mode));
      assert.equal(read.ok, false);
      assert.match(read.ok ? "" : read.reason, /readable by group or other/);
    });
  }

  it("refuses a missing file, a directory and a relative path", () => {
    dir = mkdtempSync(join(tmpdir(), "lab-secret-"));
    mkdirSync(join(dir, "sub"), { mode: 0o700 });
    assert.deepEqual(readSecretFile(join(dir, "absent")), { ok: false, reason: "ENOENT" });
    assert.equal(readSecretFile(join(dir, "sub")).ok, false);
    assert.equal(readSecretFile("relative/path").ok, false);
  });

  it("reads the current content each time, so a replaced file takes effect", () => {
    const path = write("s", "first", 0o600);
    assert.deepEqual(readSecretFile(path), { ok: true, value: "first" });
    writeFileSync(path, "second");
    assert.deepEqual(readSecretFile(path), { ok: true, value: "second" });
  });

  it("refuses an oversized file", () => {
    assert.equal(readSecretFile(write("s", "x".repeat(20_000), 0o600)).ok, false);
  });
});

describe("loadDecisionKey", () => {
  const pair = generateKeyPairSync("ed25519");
  const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;

  it("is absent when no key file is configured", () => {
    assert.deepEqual(loadDecisionKey({}), { status: "absent" });
  });

  it("ignores key material placed in the environment", () => {
    assert.deepEqual(loadDecisionKey({ LAB_DECISION_KEY: pem }), { status: "absent" });
  });

  it("loads the key from its file and derives the agreed key id", () => {
    const path = write("decision-private.pem", pem, 0o400);
    const result = loadDecisionKey({ LAB_DECISION_KEY_FILE: path });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;

    const spki = createPublicKey(pair.privateKey).export({ type: "spki", format: "der" });
    assert.equal(
      result.decisionKey.keyId,
      createHash("sha256").update(spki).digest("hex").slice(0, 16)
    );

    const fields: AuthzFields = {
      action: "budget.set",
      targetId: "lab_1",
      bindingHash: "0".repeat(64),
      outcome: "set",
      actorId: "02cdfbb6-0000-4000-8000-000000000001",
      signedAt: "2026-10-10T12:00:00.000Z",
      expiresAt: "2026-10-10T12:05:00.000Z",
      nonce: "AAAAAAAAAAAAAAAAAAAAAAAA",
    };
    const auth = signAuthorization(result.decisionKey, fields);
    assert.equal(auth.keyId, result.decisionKey.keyId);
    assert.ok(
      verify(null, Buffer.from(signedText(fields)), pair.publicKey, Buffer.from(auth.signature, "base64"))
    );
  });

  it("refuses a key file that group or other can read", () => {
    const result = loadDecisionKey({ LAB_DECISION_KEY_FILE: write("k.pem", pem, 0o640) });
    assert.equal(result.status, "invalid");
  });

  it("refuses a file that is not an Ed25519 private key, without echoing it", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;
    for (const [name, content] of [
      ["garbage.pem", "not a key"],
      ["rsa.pem", rsa],
    ]) {
      const result = loadDecisionKey({ LAB_DECISION_KEY_FILE: write(name, content, 0o400) });
      assert.equal(result.status, "invalid");
      assert.ok(result.status === "invalid" && !result.reason.includes("not a key"));
    }
  });
});
