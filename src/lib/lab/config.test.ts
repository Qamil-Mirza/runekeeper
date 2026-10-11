import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLabOwner, loadLabConfig, parseManagerUrl, parseOwnerUserIds } from "./config";
import type { SecretReader } from "./secrets";

const OWNER = "3f2b8c1e-6a4d-4e0b-9c57-0d1e2f3a4b5c";
const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TOKEN = "t".repeat(48);

const base = {
  LAB_MANAGER_URL: "unix:/run/lab-manager/api.sock",
  LAB_MANAGER_TOKEN_FILE: "/run/secrets/service-token",
  LAB_OWNER_USER_IDS: OWNER,
};

const tokenFile =
  (content: string): SecretReader =>
  (path) =>
    path === "/run/secrets/service-token"
      ? { ok: true, value: content }
      : { ok: false, reason: "ENOENT" };
const goodToken = tokenFile(`${TOKEN}\n`);

describe("parseManagerUrl", () => {
  it("accepts a unix socket path", () => {
    assert.deepEqual(parseManagerUrl("unix:/run/lab-manager/api.sock"), {
      kind: "unix",
      socketPath: "/run/lab-manager/api.sock",
    });
  });

  it("accepts loopback http", () => {
    assert.deepEqual(parseManagerUrl("http://127.0.0.1:7717"), {
      kind: "tcp",
      host: "127.0.0.1",
      port: 7717,
    });
  });

  for (const raw of [
    "http://0.0.0.0:7717",
    "http://192.168.1.10:7717",
    "http://host.docker.internal:7717",
    "http://example.com:7717",
    "https://127.0.0.1:7717",
    "http://127.0.0.1",
    "http://127.0.0.1:7717/v1",
    "http://user@127.0.0.1:7717",
    "unix:relative/api.sock",
    "unix:",
    "",
    "garbage",
  ]) {
    it(`rejects ${JSON.stringify(raw)}`, () => {
      assert.equal(parseManagerUrl(raw), null);
    });
  }
});

describe("parseOwnerUserIds", () => {
  it("parses a comma-separated list of uuids", () => {
    assert.deepEqual(
      parseOwnerUserIds(` ${OWNER.toUpperCase()} , ${OTHER} `),
      new Set([OWNER, OTHER])
    );
  });

  for (const raw of [
    undefined,
    "",
    "  ",
    ",",
    "<runekeeper-user-uuid>",
    "owner@example.com",
    `${OWNER},nope`,
  ]) {
    it(`fails closed for ${JSON.stringify(raw)}`, () => {
      assert.equal(parseOwnerUserIds(raw), null);
    });
  }
});

describe("loadLabConfig", () => {
  it("is disabled when no manager url is set", () => {
    assert.deepEqual(loadLabConfig({}, goodToken), { status: "disabled" });
    assert.deepEqual(loadLabConfig({ ...base, LAB_MANAGER_URL: " " }, goodToken), {
      status: "disabled",
    });
  });

  it("loads a complete configuration, reading the token from its file", () => {
    const result = loadLabConfig(base, goodToken);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.config.token, TOKEN);
    assert.ok(result.config.ownerUserIds.has(OWNER));
  });

  it("ignores a token placed in the environment", () => {
    const result = loadLabConfig(
      { ...base, LAB_MANAGER_TOKEN_FILE: undefined, LAB_MANAGER_TOKEN: TOKEN },
      goodToken
    );
    assert.equal(result.status, "invalid");
  });

  const invalid: [string, Record<string, string | undefined>, SecretReader][] = [
    ["a non-loopback url", { LAB_MANAGER_URL: "http://10.0.0.5:7717" }, goodToken],
    ["no token file configured", { LAB_MANAGER_TOKEN_FILE: undefined }, goodToken],
    ["a token file that cannot be read", {}, () => ({ ok: false, reason: "EACCES" })],
    ["a token file with loose permissions", {}, () => ({ ok: false, reason: "mode 644" })],
    ["a short token", {}, tokenFile("short")],
    ["an empty token file", {}, tokenFile("")],
    ["a token file with two values", {}, tokenFile(`${TOKEN}\n${TOKEN}\n`)],
    ["a missing allowlist", { LAB_OWNER_USER_IDS: undefined }, goodToken],
    ["a placeholder allowlist", { LAB_OWNER_USER_IDS: "<runekeeper-user-uuid>" }, goodToken],
    ["an email allowlist", { LAB_OWNER_USER_IDS: "owner@example.com" }, goodToken],
  ];
  for (const [name, override, reader] of invalid) {
    it(`is invalid with ${name}`, () => {
      assert.equal(loadLabConfig({ ...base, ...override }, reader).status, "invalid");
    });
  }
});

describe("isLabOwner", () => {
  const config = { ownerUserIds: new Set([OWNER]) };

  it("allows a listed user id, case-insensitively", () => {
    assert.equal(isLabOwner(OWNER, config), true);
    assert.equal(isLabOwner(OWNER.toUpperCase(), config), true);
  });

  for (const id of [undefined, null, "", OTHER]) {
    it(`denies ${JSON.stringify(id)}`, () => {
      assert.equal(isLabOwner(id, config), false);
    });
  }
});
