import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadLabSettings, isLabOwner } from "./settings";

const A = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const B = "11111111-2222-4333-8444-555555555555";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

test("ownerIds is null when unset or empty", () => {
  assert.equal(loadLabSettings({}).ownerIds, null);
  assert.equal(loadLabSettings({ LAB_OWNER_USER_IDS: "" }).ownerIds, null);
  assert.equal(loadLabSettings({ LAB_OWNER_USER_IDS: "  " }).ownerIds, null);
});

test("ownerIds is null when any entry is not a uuid", () => {
  assert.equal(loadLabSettings({ LAB_OWNER_USER_IDS: `${A},nope` }).ownerIds, null);
  assert.equal(loadLabSettings({ LAB_OWNER_USER_IDS: `${A},` }).ownerIds, null);
  assert.equal(loadLabSettings({ LAB_OWNER_USER_IDS: "*" }).ownerIds, null);
});

test("ownerIds parses a comma list and lowercases ids", () => {
  const s = loadLabSettings({ LAB_OWNER_USER_IDS: ` ${A.toUpperCase()} , ${B}` });
  assert.deepEqual([...(s.ownerIds ?? [])], [A, B]);
  assert.equal(isLabOwner(A, s), true);
  assert.equal(isLabOwner(A.toUpperCase(), s), true);
  assert.equal(isLabOwner(B, s), true);
});

test("isLabOwner is false for no user and when ownerIds is null", () => {
  const s = loadLabSettings({ LAB_OWNER_USER_IDS: A });
  assert.equal(isLabOwner(null, s), false);
  assert.equal(isLabOwner(undefined, s), false);
  assert.equal(isLabOwner("", s), false);
  assert.equal(isLabOwner(B, s), false);
  assert.equal(isLabOwner(A, loadLabSettings({})), false);
});

test("token hashes are accepted only as 64 lowercase hex", () => {
  const h = hash("t1");
  const s = loadLabSettings({
    LAB_ADVISOR_TOKEN_SHA256: h,
    LAB_EXECUTOR_TOKEN_SHA256: h.toUpperCase(),
  });
  assert.equal(s.tokenHashes.advisor, h);
  assert.equal("executor" in s.tokenHashes, false);

  for (const bad of ["", "abc", h.slice(0, 63), h + "0", "z".repeat(64)]) {
    const t = loadLabSettings({ LAB_EXECUTOR_TOKEN_SHA256: bad });
    assert.equal("executor" in t.tokenHashes, false, `rejects ${JSON.stringify(bad)}`);
  }
});

test("runpodKey is null when unset or empty", () => {
  assert.equal(loadLabSettings({}).runpodKey, null);
  assert.equal(loadLabSettings({ RUNPOD_API_KEY: "" }).runpodKey, null);
  assert.equal(loadLabSettings({ RUNPOD_API_KEY: "  " }).runpodKey, null);
  assert.equal(loadLabSettings({ RUNPOD_API_KEY: "k" }).runpodKey, "k");
});
