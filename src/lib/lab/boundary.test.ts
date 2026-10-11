import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// Structural guards for the Lab's privileged path. A human approval must come
// from an authenticated owner acting in the browser; nothing that an LLM
// drives (the planning chat, the voice assistant, background schedulers) may
// be able to reach the Lab Manager client or the signing key.

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

const files = [...sourceFiles(join(ROOT, "src")), join(ROOT, "server.ts")].map((path) => ({
  rel: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

const PRIVILEGED = /from\s+["'](?:@\/lib\/lab|\.{1,2}(?:\/[\w-]+)*)\/(manager|authz|decision|config|secrets|route)["']/;
const isTest = (rel: string) => rel.endsWith(".test.ts");

describe("who may reach the Lab Manager client and the signing key", () => {
  it("only the Lab library and the /api/lab routes import the privileged modules", () => {
    const offenders = files
      .filter((f) => !isTest(f.rel))
      .filter((f) => !f.rel.startsWith("src/lib/lab/") && !f.rel.startsWith("src/app/api/lab/"))
      .filter((f) => /lib\/lab\/(manager|authz|decision|config|secrets|route)\b/.test(f.text))
      .map((f) => f.rel);
    assert.deepEqual(offenders, []);
  });

  it("no browser code imports them", () => {
    const offenders = files
      .filter((f) => f.rel.startsWith("src/components/") || f.rel === "src/lib/lab/client.ts")
      .filter((f) => PRIVILEGED.test(f.text))
      .map((f) => f.rel);
    assert.deepEqual(offenders, []);
  });

  it("the chat engine, voice assistant, notifications and custom server never touch the Lab", () => {
    const llmDriven = files.filter(
      (f) =>
        f.rel.startsWith("src/lib/chat/") ||
        f.rel.startsWith("src/lib/voice/") ||
        f.rel.startsWith("src/lib/notifications/") ||
        f.rel.startsWith("src/app/api/chat/") ||
        f.rel.startsWith("src/app/api/voice/") ||
        f.rel === "server.ts"
    );
    assert.ok(llmDriven.length > 10, "expected to find the chat and voice sources");
    const offenders = llmDriven
      .filter((f) => /lib\/lab\/|\/api\/lab\b|components\/lab\//.test(f.text))
      .map((f) => f.rel);
    assert.deepEqual(offenders, []);
  });

  it("no voice tool is named after a Lab action", () => {
    const voiceTools = files.find((f) => f.rel === "src/lib/voice/voice-tools.ts");
    assert.ok(voiceTools);
    const names = [...voiceTools.text.matchAll(/name:\s*["']([\w-]+)["']/g)].map((m) => m[1]);
    assert.ok(names.length > 0, "expected to find voice tool declarations");
    assert.deepEqual(
      names.filter((n) => /lab|approv|experiment|budget|agent|research/i.test(n)),
      []
    );
  });
});

describe("the /api/lab routes", () => {
  const routes = files.filter(
    (f) => f.rel.startsWith("src/app/api/lab/") && f.rel.endsWith("/route.ts")
  );

  it("exist", () => assert.ok(routes.length >= 6));

  it("every exported handler goes through the owner gate", () => {
    for (const route of routes) {
      const handlers = [...route.text.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)];
      assert.ok(handlers.length > 0, `${route.rel} exports no handler`);
      const gated = [...route.text.matchAll(/return withLabOwner\(req,/g)];
      assert.equal(gated.length, handlers.length, `${route.rel} has a handler outside withLabOwner`);
    }
  });

  it("none is exempt from the session middleware", () => {
    // src/middleware.ts lets any path ending in /webhook through unauthenticated.
    for (const route of routes) assert.ok(!/\/webhook\/route\.ts$/.test(route.rel), route.rel);
  });
});

describe("the Lab view", () => {
  it("never renders agent-produced text as HTML", () => {
    const offenders = files
      .filter((f) => f.rel.startsWith("src/components/lab/"))
      .filter((f) => /dangerouslySetInnerHTML|innerHTML|document\.write/.test(f.text))
      .map((f) => f.rel);
    assert.deepEqual(offenders, []);
  });
});
