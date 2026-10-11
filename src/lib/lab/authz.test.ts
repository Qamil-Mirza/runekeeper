import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, verify } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import {
  bindingHash,
  canonicalJson,
  newNonce,
  signAuthorization,
  signedText,
  toBindingDecimal,
  type AuthzFields,
} from "./authz";

// Vectors published by the Lab Manager with the pinned contract. Both sides
// assert against the same file.
interface Vector {
  name: string;
  action: AuthzFields["action"];
  targetId: string;
  outcome: AuthzFields["outcome"];
  actorId: string;
  note: string | null;
  binding: unknown;
  canonicalJson: string;
  bindingHash: string;
  authorization: { signedAt: string; expiresAt: string; nonce: string; signature: string };
  signedText: string;
}

const file = JSON.parse(
  readFileSync(join(process.cwd(), "docs/lab/contract/binding-vectors.json"), "utf8")
) as { publicKeyPem: string; vectors: Vector[] };

// The vectors are signed with the public RFC 8032 test key (test 1). Ed25519
// is deterministic, so signing with its seed must reproduce them exactly.
const RFC8032_TEST_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const testKey = createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.from(RFC8032_TEST_SEED, "hex"),
  ]),
  format: "der",
  type: "pkcs8",
});

function fieldsOf(v: Vector): AuthzFields {
  return {
    action: v.action,
    targetId: v.targetId,
    bindingHash: v.bindingHash,
    outcome: v.outcome,
    actorId: v.actorId,
    signedAt: v.authorization.signedAt,
    expiresAt: v.authorization.expiresAt,
    nonce: v.authorization.nonce,
    note: v.note,
  };
}

describe("lab-authz-v2 against the pinned vectors", () => {
  it("has vectors to check", () => {
    assert.ok(file.vectors.length >= 4);
    assert.equal(
      createPublicKey(testKey).export({ type: "spki", format: "pem" }),
      createPublicKey(file.publicKeyPem).export({ type: "spki", format: "pem" })
    );
  });

  for (const v of file.vectors) {
    describe(v.name, () => {
      it("canonicalizes the binding identically", () => {
        assert.equal(canonicalJson(v.binding), v.canonicalJson);
      });

      it("computes the same binding hash", () => {
        assert.equal(bindingHash(v.binding), v.bindingHash);
      });

      it("builds the same signed text", () => {
        assert.equal(signedText(fieldsOf(v)), v.signedText);
      });

      it("produces the same signature, which verifies with the public key", () => {
        const auth = signAuthorization(testKey, fieldsOf(v));
        assert.equal(auth.signature, v.authorization.signature);
        assert.ok(
          verify(
            null,
            Buffer.from(v.signedText, "utf8"),
            createPublicKey(file.publicKeyPem),
            Buffer.from(auth.signature, "base64")
          )
        );
      });
    });
  }
});

describe("canonicalJson", () => {
  it("sorts keys at every level and keeps array order", () => {
    assert.equal(
      canonicalJson({ b: 1, a: { d: null, c: ["z", "y"] } }),
      '{"a":{"c":["z","y"],"d":null},"b":1}'
    );
  });

  it("refuses non-integer numbers", () => {
    assert.throws(() => canonicalJson({ costUsd: 0.1 }));
    assert.throws(() => canonicalJson({ n: Number.NaN }));
  });

  it("changes the hash when any bound field changes", () => {
    const base = { labId: "lab_1", limits: { costUsd: "2.000000" } };
    assert.notEqual(bindingHash(base), bindingHash({ ...base, limits: { costUsd: "2.000001" } }));
  });
});

describe("helpers", () => {
  it("writes quantities with exactly six fractional digits", () => {
    assert.equal(toBindingDecimal(2), "2.000000");
    assert.equal(toBindingDecimal(1 / 3), "0.333333");
    assert.equal(toBindingDecimal(0), "0.000000");
    assert.throws(() => toBindingDecimal(-1));
    assert.throws(() => toBindingDecimal(Number.POSITIVE_INFINITY));
  });

  it("treats a missing note and an empty note as the same", () => {
    const f = fieldsOf(file.vectors[0]);
    assert.equal(signedText({ ...f, note: null }), signedText({ ...f, note: "" }));
    assert.notEqual(signedText({ ...f, note: "" }), signedText({ ...f, note: "x" }));
  });

  it("generates nonces the contract accepts, never twice the same", () => {
    const a = newNonce();
    assert.match(a, /^[A-Za-z0-9_-]{22,128}$/);
    assert.notEqual(a, newNonce());
  });
});
