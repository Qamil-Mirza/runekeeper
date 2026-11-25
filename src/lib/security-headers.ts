// Response headers for every route, used by next.config.ts. Kept free of
// imports so the config can load it.

export interface HeaderEntry {
  source: string;
  headers: { key: string; value: string }[];
}

/** The Lab route that serves agent-written report HTML into a sandboxed frame. */
export const REPORT_HTML_PATH = "/api/lab/reports/:id/html";

/**
 * CSP for report HTML: an opaque-origin sandbox (scripts run, but cannot reach
 * Runekeeper's cookies or API), nothing loaded from the network, and framable
 * only by the app itself.
 */
export const REPORT_FRAME_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-ancestors 'self'";

// Every path except the report HTML route (which gets its own entry below).
const ALL_BUT_REPORT_HTML = "/((?!api/lab/reports/[^/]+/html$).*)";

export function securityHeaders(isDev: boolean): HeaderEntry[] {
  const siteCsp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://lh3.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
  ].join("; ");

  const common = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
  ];
  const permissions = {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  };

  return [
    {
      source: ALL_BUT_REPORT_HTML,
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        ...common,
        { key: "Content-Security-Policy", value: siteCsp },
        permissions,
      ],
    },
    {
      source: REPORT_HTML_PATH,
      headers: [...common, { key: "Content-Security-Policy", value: REPORT_FRAME_CSP }, permissions],
    },
  ];
}
