import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_FRAME_CSP, REPORT_HTML_PATH, securityHeaders } from "../security-headers";

type Entry = ReturnType<typeof securityHeaders>[number];

const get = (e: Entry, key: string) => e.headers.find((h) => h.key === key)?.value;
// The first source is a plain regex group; compile it as one, anchored like Next does.
const sourceRe = (e: Entry) => new RegExp(`^${e.source}$`);

for (const isDev of [true, false]) {
  test(`site-wide entry skips only the report HTML route (isDev=${isDev})`, () => {
    const [site] = securityHeaders(isDev);
    const re = sourceRe(site);
    assert.equal(re.test("/api/lab/reports/abc/html"), false);
    assert.equal(re.test("/planner"), true);
    assert.equal(re.test("/"), true);
    assert.equal(re.test("/api/lab/reports"), true);
    assert.equal(re.test("/api/lab/reports/abc/read"), true);
    assert.equal(re.test("/api/lab/reports/abc/html/x"), true);
  });

  test(`site-wide entry keeps the frame lockdown (isDev=${isDev})`, () => {
    const [site] = securityHeaders(isDev);
    assert.equal(get(site, "X-Frame-Options"), "DENY");
    const csp = get(site, "Content-Security-Policy") ?? "";
    assert.ok(csp.includes("frame-ancestors 'none'"));
    assert.equal(csp.includes("'unsafe-eval'"), isDev);
    assert.equal(get(site, "Permissions-Policy"), "camera=(), microphone=(self), geolocation=()");
    assert.equal(get(site, "X-Content-Type-Options"), "nosniff");
  });

  test(`report entry is framable by the app only, sandboxed (isDev=${isDev})`, () => {
    const entries = securityHeaders(isDev);
    assert.equal(entries.length, 2);
    const [site, report] = entries;
    assert.equal(report.source, REPORT_HTML_PATH);
    assert.equal(report.source, "/api/lab/reports/:id/html");
    assert.equal(get(report, "X-Frame-Options"), undefined);
    const csp = get(report, "Content-Security-Policy") ?? "";
    assert.equal(csp, REPORT_FRAME_CSP);
    assert.ok(csp.startsWith("sandbox allow-scripts;"));
    assert.ok(csp.includes("default-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'self'"));
    assert.ok(!csp.includes("allow-same-origin"));
    assert.ok(!csp.includes("frame-ancestors 'none'"));
    // Every other header is the site-wide one, unchanged.
    const rest = (e: Entry) =>
      e.headers.filter((h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy");
    assert.deepEqual(rest(report), rest(site));
  });
}
