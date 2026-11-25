#!/usr/bin/env node
// lab: command line for the Lab agent API. Single file, no dependencies, Node >= 20.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AGENT = "/api/lab/agent";

export const USAGE = `usage: lab <command>

  lab protocol post <file.md> --experiment E10 --title "..." [--revises <id>]
  lab report post <file.html> --experiment E9 --title "..." --summary "..."
  lab inbox [--all]
  lab run start --experiment E9 --stage held-out --setup <setupId> --pod <podId> --cap <usd>
  lab run progress <runId> <pct> [--eta 18:10]
  lab run list
  lab run end <runId> --status done|failed|stopped [--note "..."]

environment:
  LAB_URL         server address (default http://127.0.0.1:3000)
  LAB_TOKEN_FILE  file holding the token (default ~/.config/lab/token, mode 600)`;

// Split args into positionals and --flag values. --all is the only boolean flag.
function splitArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (name === "all") {
        flags.all = true;
        continue;
      }
      const value = args[i + 1];
      if (value === undefined) return { error: `--${name} needs a value` };
      flags[name] = value;
      i++;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function need(flags, names) {
  for (const n of names) {
    if (flags[n] === undefined || flags[n] === "") return `missing --${n}`;
  }
  return null;
}

export function parseCommand(argv) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    return { help: true };
  }
  const [a, b, ...rest] = argv;
  const key = a === "inbox" ? "inbox" : `${a} ${b}`;
  const args = a === "inbox" ? argv.slice(1) : rest;
  const parsed = splitArgs(args);
  if (parsed.error) return { error: parsed.error };
  const { positional, flags } = parsed;

  switch (key) {
    case "protocol post": {
      if (positional.length !== 1) return { error: "usage: lab protocol post <file.md> --experiment E10 --title \"...\" [--revises <id>]" };
      const miss = need(flags, ["experiment", "title"]);
      if (miss) return { error: miss };
      return {
        command: key,
        method: "POST",
        path: `${AGENT}/protocols`,
        file: positional[0],
        body: { experiment: flags.experiment, title: flags.title, revisesId: flags.revises ?? null },
      };
    }
    case "report post": {
      if (positional.length !== 1) return { error: "usage: lab report post <file.html> --experiment E9 --title \"...\" --summary \"...\"" };
      const miss = need(flags, ["experiment", "title", "summary"]);
      if (miss) return { error: miss };
      return {
        command: key,
        method: "POST",
        path: `${AGENT}/reports`,
        file: positional[0],
        body: { experiment: flags.experiment, title: flags.title, summary: flags.summary },
      };
    }
    case "inbox":
      if (positional.length) return { error: "usage: lab inbox [--all]" };
      return { command: "inbox", method: "POST", path: `${AGENT}/inbox`, body: flags.all ? { all: true } : {} };
    case "run start": {
      const miss = need(flags, ["experiment", "stage", "setup", "pod", "cap"]);
      if (miss) return { error: miss };
      const cap = Number(flags.cap);
      if (!Number.isFinite(cap) || cap <= 0) return { error: "--cap must be a positive number of dollars" };
      return {
        command: key,
        method: "POST",
        path: `${AGENT}/runs`,
        body: { experiment: flags.experiment, stage: flags.stage, setupId: flags.setup, podId: flags.pod, capUsd: cap },
      };
    }
    case "run progress": {
      if (positional.length !== 2) return { error: "usage: lab run progress <runId> <pct> [--eta 18:10]" };
      const pct = Number(positional[1]);
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { error: "pct must be an integer from 0 to 100" };
      const body = { pct };
      if (flags.eta !== undefined) body.eta = flags.eta;
      return { command: key, method: "POST", path: `${AGENT}/runs/${encodeURIComponent(positional[0])}/progress`, body };
    }
    case "run list":
      return { command: key, method: "GET", path: `${AGENT}/runs` };
    case "run end": {
      if (positional.length !== 1) return { error: "usage: lab run end <runId> --status done|failed|stopped [--note \"...\"]" };
      const miss = need(flags, ["status"]);
      if (miss) return { error: miss };
      if (!["done", "failed", "stopped"].includes(flags.status)) return { error: "--status must be done, failed or stopped" };
      const body = { status: flags.status };
      if (flags.note !== undefined) body.note = flags.note;
      return { command: key, method: "POST", path: `${AGENT}/runs/${encodeURIComponent(positional[0])}/end`, body };
    }
    default:
      return { error: `unknown command "${argv.join(" ")}". Try lab --help` };
  }
}

const PT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function pt(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${PT.format(d).replace(/\s/g, " ")} PT`;
}

export function formatResult(command, status, json) {
  if (status < 200 || status >= 300) {
    const message = json && json.error && typeof json.error.message === "string" ? json.error.message : `request failed (HTTP ${status})`;
    return { text: `lab: ${message}`, exitCode: 1 };
  }
  const j = json ?? {};
  let text;
  switch (command) {
    case "protocol post":
      text = `protocol posted: ${j.id} (v${j.version}, waiting for the owner)`;
      break;
    case "report post":
      text = `report posted: ${j.id}`;
      break;
    case "run start":
      text = `run started: ${j.id}`;
      break;
    case "run progress":
      text = "progress updated";
      break;
    case "run end":
      text = "run ended";
      break;
    case "run list": {
      const runs = Array.isArray(j.runs) ? j.runs : [];
      text = runs.length
        ? runs
            .map((r) => {
              const eta = r.eta ? `, eta ${pt(r.eta)}` : "";
              return `${r.id}  ${r.experiment} ${r.stage}  pod ${r.podId}  ${r.progressPct ?? 0}%${eta}`;
            })
            .join("\n")
        : "no running runs";
      break;
    }
    case "inbox": {
      const items = Array.isArray(j.items) ? j.items : [];
      if (!items.length) {
        text = "nothing new";
        break;
      }
      text = items
        .map((it) =>
          it.kind === "decision"
            ? `${it.experiment} v${it.version} "${it.title}" — ${String(it.verdict).toUpperCase()} (${pt(it.decidedAt)})\n  note: ${it.note}`
            : `reply on "${it.reportTitle}" (${pt(it.createdAt)})\n  ${it.body}`,
        )
        .join("\n\n");
      break;
    }
    default:
      text = "ok";
  }
  return { text, exitCode: 0 };
}

function readToken() {
  const file = process.env.LAB_TOKEN_FILE || path.join(os.homedir(), ".config", "lab", "token");
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    throw new Error(`cannot read the token file ${file}`);
  }
  if (st.mode & 0o077) throw new Error(`token file ${file} is readable by others; run chmod 600 on it`);
  const token = fs.readFileSync(file, "utf8").trim();
  if (!token) throw new Error(`token file ${file} is empty`);
  return token;
}

export async function main(argv) {
  const cmd = parseCommand(argv);
  if (cmd.help) {
    console.log(USAGE);
    return 0;
  }
  if (cmd.error) {
    console.error(`lab: ${cmd.error}`);
    return 1;
  }
  const base = (process.env.LAB_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
  try {
    const body = cmd.body ? { ...cmd.body } : undefined;
    if (cmd.file) {
      let content;
      try {
        content = fs.readFileSync(cmd.file, "utf8");
      } catch {
        throw new Error(`cannot read ${cmd.file}`);
      }
      if (cmd.command === "protocol post") body.bodyMd = content;
      else body.html = content;
    }
    const token = readToken();
    const headers = { Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(base + cmd.path, {
        method: cmd.method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
      });
    } catch {
      throw new Error(`Runekeeper is not reachable at ${base}`);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    const out = formatResult(cmd.command, res.status, json);
    (out.exitCode === 0 ? console.log : console.error)(out.text);
    return out.exitCode;
  } catch (err) {
    console.error(`lab: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function isDirect() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirect()) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
