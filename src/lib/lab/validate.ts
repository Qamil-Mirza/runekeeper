import { parseEta } from "./time";

export type Valid<T> = { ok: true; value: T } | { ok: false; message: string };

const STAGE_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const EXPERIMENT_RE = /^[A-Z][A-Z0-9]{0,15}$/;
const ID_RE = /^[A-Za-z0-9._-]{1,100}$/;

const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_MD_BYTES = 512 * 1024;
const MAX_TEXT = 10_000;

type Obj = Record<string, unknown>;
type Field<T> = { v: T } | { err: string };

const fail = (message: string) => ({ ok: false as const, message });
const isObj = (b: unknown): b is Obj => typeof b === "object" && b !== null && !Array.isArray(b);

function str(o: Obj, key: string, max: number, opts: { allowEmpty?: boolean } = {}): Field<string> {
  const v = o[key];
  if (typeof v !== "string") return { err: `${key} must be a string` };
  if (!opts.allowEmpty && v.trim() === "") return { err: `${key} must not be empty` };
  if (v.length > max) return { err: `${key} must be at most ${max} characters` };
  return { v };
}

function matching(o: Obj, key: string, re: RegExp, what: string): Field<string> {
  const v = o[key];
  if (typeof v !== "string" || !re.test(v)) return { err: `${key} must be ${what}` };
  return { v };
}

const experimentOf = (o: Obj) => matching(o, "experiment", EXPERIMENT_RE, "an experiment code like E9");

// Optional: a title for the experiment, stored on it (null when not sent).
function experimentTitleOf(o: Obj): Field<string | null> {
  if (o.experimentTitle === undefined || o.experimentTitle === null) return { v: null };
  return str(o, "experimentTitle", 200);
}

export function validateRunStart(
  body: unknown,
): Valid<{
  experiment: string;
  experimentTitle: string | null;
  stage: string;
  setupId: string;
  podId: string;
  capUsd: number;
}> {
  if (!isObj(body)) return fail("body must be a JSON object");
  const experiment = experimentOf(body);
  if ("err" in experiment) return fail(experiment.err);
  const experimentTitle = experimentTitleOf(body);
  if ("err" in experimentTitle) return fail(experimentTitle.err);
  const stage = matching(body, "stage", STAGE_RE, "lowercase letters, digits and dashes, up to 40 characters");
  if ("err" in stage) return fail(stage.err);
  const setupId = matching(body, "setupId", ID_RE, "1-100 characters of letters, digits, . _ -");
  if ("err" in setupId) return fail(setupId.err);
  const podId = matching(body, "podId", ID_RE, "1-100 characters of letters, digits, . _ -");
  if ("err" in podId) return fail(podId.err);
  const cap = body.capUsd;
  if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0 || cap > 10_000) {
    return fail("capUsd must be a number above 0 and at most 10000");
  }
  return {
    ok: true,
    value: {
      experiment: experiment.v,
      experimentTitle: experimentTitle.v,
      stage: stage.v,
      setupId: setupId.v,
      podId: podId.v,
      capUsd: cap,
    },
  };
}

export function validateProgress(body: unknown, now: Date): Valid<{ pct: number; eta: Date | null }> {
  if (!isObj(body)) return fail("body must be a JSON object");
  const pct = body.pct;
  if (typeof pct !== "number" || !Number.isInteger(pct) || pct < 0 || pct > 100) {
    return fail("pct must be an integer from 0 to 100");
  }
  let eta: Date | null = null;
  if (body.eta !== undefined && body.eta !== null) {
    if (typeof body.eta !== "string") return fail("eta must be a string");
    eta = parseEta(body.eta, now);
    if (!eta) return fail("eta must be HH:MM (Pacific) or an ISO 8601 time with offset, within 30 days");
  }
  return { ok: true, value: { pct, eta } };
}

export function validateRunEnd(
  body: unknown,
): Valid<{ status: "done" | "failed" | "stopped"; note: string | null }> {
  if (!isObj(body)) return fail("body must be a JSON object");
  const status = body.status;
  if (status !== "done" && status !== "failed" && status !== "stopped") {
    return fail("status must be done, failed or stopped");
  }
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    const n = str(body, "note", MAX_TEXT, { allowEmpty: true });
    if ("err" in n) return fail(n.err);
    note = n.v.trim() === "" ? null : n.v;
  }
  return { ok: true, value: { status, note } };
}

export function validateProtocolPost(
  body: unknown,
): Valid<{
  experiment: string;
  experimentTitle: string | null;
  title: string;
  bodyMd: string;
  revisesId: string | null;
}> {
  if (!isObj(body)) return fail("body must be a JSON object");
  const experiment = experimentOf(body);
  if ("err" in experiment) return fail(experiment.err);
  const experimentTitle = experimentTitleOf(body);
  if ("err" in experimentTitle) return fail(experimentTitle.err);
  const title = str(body, "title", 200);
  if ("err" in title) return fail(title.err);
  const md = body.bodyMd;
  if (typeof md !== "string" || md.trim() === "") return fail("bodyMd must be a non-empty string");
  if (Buffer.byteLength(md, "utf8") > MAX_MD_BYTES) return fail("bodyMd must be at most 512 KB");
  let revisesId: string | null = null;
  if (body.revisesId !== undefined && body.revisesId !== null) {
    if (typeof body.revisesId !== "string" || body.revisesId === "") {
      return fail("revisesId must be a string");
    }
    revisesId = body.revisesId;
  }
  return {
    ok: true,
    value: { experiment: experiment.v, experimentTitle: experimentTitle.v, title: title.v, bodyMd: md, revisesId },
  };
}

export function validateReportPost(
  body: unknown,
): Valid<{ experiment: string | null; title: string; summary: string; html: string }> {
  if (!isObj(body)) return fail("body must be a JSON object");
  let experiment: string | null = null;
  if (body.experiment !== undefined && body.experiment !== null) {
    const e = experimentOf(body);
    if ("err" in e) return fail(e.err);
    experiment = e.v;
  }
  const title = str(body, "title", 200);
  if ("err" in title) return fail(title.err);
  const summary = str(body, "summary", 300);
  if ("err" in summary) return fail(summary.err);
  const html = body.html;
  if (typeof html !== "string" || html.trim() === "") return fail("html must be a non-empty string");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) return fail("html must be at most 4 MB");
  return { ok: true, value: { experiment, title: title.v, summary: summary.v, html } };
}

export function validateDecision(
  body: unknown,
): Valid<{ verdict: "accepted" | "rejected"; note: string }> {
  if (!isObj(body)) return fail("body must be a JSON object");
  const verdict = body.verdict;
  if (verdict !== "accepted" && verdict !== "rejected") return fail("verdict must be accepted or rejected");
  const note = str(body, "note", MAX_TEXT);
  if ("err" in note) return fail(note.err);
  return { ok: true, value: { verdict, note: note.v.trim() } };
}

export function validateReply(body: unknown): Valid<{ body: string }> {
  if (!isObj(body)) return fail("body must be a JSON object");
  const b = str(body, "body", MAX_TEXT);
  if ("err" in b) return fail(b.err);
  return { ok: true, value: { body: b.v.trim() } };
}
