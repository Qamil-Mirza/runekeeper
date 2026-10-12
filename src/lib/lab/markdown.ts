// A small Markdown reader for text written by agents. Agent text is untrusted,
// so this produces a tree of known node kinds and nothing else: raw HTML stays
// literal text, an image is never loaded (it becomes a link), and a link is
// kept only when it goes to an http, https or mailto address.

export type MdInline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "br" }
  | { t: "strong" | "em" | "del"; c: MdInline[] }
  | { t: "link"; href: string; host: string; image: boolean; c: MdInline[] };

export type MdAlign = "left" | "center" | "right" | null;

export type MdBlock =
  | { t: "p"; c: MdInline[] }
  | { t: "h"; level: number; c: MdInline[] }
  | { t: "code"; lang: string; v: string }
  | { t: "hr" }
  | { t: "quote"; c: MdBlock[] }
  | { t: "list"; ordered: boolean; start: number; items: MdBlock[][] }
  | { t: "table"; align: MdAlign[]; head: MdInline[][]; rows: MdInline[][][] };

const MAX_DEPTH = 8;
/** How far ahead a closing `*`, `_`, `~~` or backtick run is looked for. */
const MAX_SPAN = 4000;

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The address as it will be opened, or null when it is not one a reader may be sent to. */
export function safeLink(raw: string): { href: string; host: string } | null {
  const trimmed = raw.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
    // The host is what the reader is shown, so it is taken from the parsed
    // address: "https://good.example@evil.example" goes to evil.example.
    return { href: url.href, host: url.protocol === "mailto:" ? url.pathname : url.hostname };
  } catch {
    return null;
  }
}

// ─── Inline ──────────────────────────────────────────────────────────────────

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;

function pushText(out: MdInline[], v: string) {
  if (!v) return;
  const last = out.at(-1);
  if (last?.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

/** Index of the closing delimiter, skipping escapes and code spans; -1 when there is none. */
function findCloser(s: string, from: number, delim: string): number {
  const end = Math.min(s.length, from + MAX_SPAN);
  for (let i = from; i < end; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++;
    } else if (ch === "`") {
      let n = 1;
      while (s[i + n] === "`") n++;
      const close = s.indexOf("`".repeat(n), i + n);
      i = close === -1 || close > end ? i + n - 1 : close + n - 1;
    } else if (s.startsWith(delim, i)) {
      const single = delim.length === 1;
      // A lone `*` is not closed by one half of `**`.
      if (single && (s[i + 1] === delim || s[i - 1] === delim)) {
        while (s[i + 1] === delim) i++;
        continue;
      }
      if (i > from && !/\s/.test(s[i - 1])) {
        if (delim[0] === "_" && s[i + delim.length] !== undefined && WORD.test(s[i + delim.length])) continue;
        return i;
      }
    }
  }
  return -1;
}

/** Reads `(address "title")` starting at the opening bracket; null when it is not one. */
function readDestination(s: string, open: number): { raw: string; end: number } | null {
  let i = open + 1;
  while (s[i] === " ") i++;
  let raw = "";
  if (s[i] === "<") {
    const close = s.indexOf(">", i);
    if (close === -1) return null;
    raw = s.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const start = i;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\") i++;
      else if (/\s/.test(ch)) break;
      else if (ch === "(") depth++;
      else if (ch === ")") {
        if (depth === 0) break;
        depth--;
      }
    }
    raw = s.slice(start, i).replace(/\\(.)/g, "$1");
  }
  while (s[i] === " ") i++;
  if (s[i] === '"' || s[i] === "'") {
    const close = s.indexOf(s[i], i + 1);
    if (close === -1) return null;
    i = close + 1;
    while (s[i] === " ") i++;
  }
  return s[i] === ")" ? { raw, end: i + 1 } : null;
}

function matchingBracket(s: string, open: number): number {
  let depth = 0;
  const end = Math.min(s.length, open + MAX_SPAN);
  for (let i = open; i < end; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === "[") depth++;
    else if (s[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

export function parseInline(s: string, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (ch === "\n") {
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length && PUNCTUATION.test(s[i + 1])) {
      pushText(out, s[i + 1]);
      i += 2;
      continue;
    }
    if (ch === "`") {
      let n = 1;
      while (s[i + n] === "`") n++;
      const fence = "`".repeat(n);
      let close = s.indexOf(fence, i + n);
      while (close !== -1 && s[close + n] === "`") {
        // A longer run is not the closer; look past it.
        let skip = close;
        while (s[skip] === "`") skip++;
        close = s.indexOf(fence, skip);
      }
      if (close !== -1 && close - i <= MAX_SPAN) {
        let v = s.slice(i + n, close).replace(/\n/g, " ");
        if (v.length > 2 && v.startsWith(" ") && v.endsWith(" ")) v = v.slice(1, -1);
        out.push({ t: "code", v });
        i = close + n;
      } else {
        pushText(out, fence);
        i += n;
      }
      continue;
    }
    if ((ch === "[" || (ch === "!" && s[i + 1] === "[")) && depth < MAX_DEPTH) {
      const image = ch === "!";
      const open = image ? i + 1 : i;
      const close = matchingBracket(s, open);
      const dest = close !== -1 && s[close + 1] === "(" ? readDestination(s, close + 1) : null;
      const link = dest && safeLink(dest.raw);
      if (dest && link) {
        const label = s.slice(open + 1, close);
        const c = parseInline(label, depth + 1);
        out.push({ t: "link", ...link, image, c: c.length ? c : [{ t: "text", v: link.href }] });
        i = dest.end;
        continue;
      }
      // Not a link a reader may follow: the source stays as written.
      pushText(out, ch);
      i++;
      continue;
    }
    if (ch === "<") {
      const close = s.indexOf(">", i);
      const link = close !== -1 ? safeLink(s.slice(i + 1, close)) : null;
      if (link && !/\s/.test(s.slice(i + 1, close))) {
        out.push({ t: "link", ...link, image: false, c: [{ t: "text", v: s.slice(i + 1, close) }] });
        i = close + 1;
        continue;
      }
    }
    if ((ch === "h" || ch === "H") && /^https?:\/\//i.test(s.slice(i, i + 8)) && (i === 0 || !WORD.test(s[i - 1]))) {
      let raw = /^[^\s<>]+/.exec(s.slice(i))![0];
      // Punctuation that ends the sentence is not part of the address.
      for (;;) {
        const last = raw.at(-1)!;
        if (/[.,;:!?*_~'"]/.test(last)) raw = raw.slice(0, -1);
        else if (last === ")" && raw.split("(").length <= raw.split(")").length - 1) raw = raw.slice(0, -1);
        else break;
      }
      const link = safeLink(raw);
      if (link && link.host) {
        out.push({ t: "link", ...link, image: false, c: [{ t: "text", v: raw }] });
        i += raw.length;
        continue;
      }
    }
    if ((ch === "*" || ch === "_" || ch === "~") && depth < MAX_DEPTH) {
      const double = s[i + 1] === ch;
      const delim = double ? ch + ch : ch;
      const after = s[i + delim.length];
      const leftOk = ch !== "_" || i === 0 || !WORD.test(s[i - 1]);
      if ((double || ch !== "~") && after !== undefined && !/\s/.test(after) && leftOk) {
        const close = findCloser(s, i + delim.length, delim);
        if (close !== -1) {
          const c = parseInline(s.slice(i + delim.length, close), depth + 1);
          out.push({ t: ch === "~" ? "del" : double ? "strong" : "em", c });
          i = close + delim.length;
          continue;
        }
      }
      pushText(out, delim);
      i += delim.length;
      continue;
    }

    // Plain text up to the next character that could start something.
    const next = s.slice(i + 1).search(/[\n\\`[!<hH*_~]/);
    const end = next === -1 ? s.length : i + 1 + next;
    pushText(out, s.slice(i, end));
    i = end;
  }
  return out;
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:\s+|$)(.*)$/;
const DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = "";
  let code = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "`") {
      code = !code;
      cur += "`";
    } else if (s[i] === "|" && !code) {
      out.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

const startsBlock = (line: string) =>
  FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);

function parseBlocks(lines: string[], depth: number): MdBlock[] {
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const mark = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[i]);
        if (m && m[1][0] === mark[0] && m[1].length >= mark.length) break;
        body.push(lines[i]);
        i++;
      }
      i++;
      out.push({ t: "code", lang: fence[2].slice(0, 40), v: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      out.push({ t: "h", level: heading[1].length, c: parseInline(heading[2] ?? "") });
      i++;
      continue;
    }

    if (QUOTE.test(line) && depth < MAX_DEPTH) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ""));
      out.push({ t: "quote", c: parseBlocks(body, depth + 1) });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("-") && DIVIDER.test(lines[i + 1])) {
      const head = cells(line);
      const divider = cells(lines[i + 1]);
      if (head.length === divider.length) {
        const align = divider.map<MdAlign>((d) =>
          d.startsWith(":") && d.endsWith(":") ? "center" : d.endsWith(":") ? "right" : d.startsWith(":") ? "left" : null
        );
        const rows: MdInline[][][] = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          const row = cells(lines[i++]);
          rows.push(head.map((_h, n) => parseInline(row[n] ?? "")));
        }
        out.push({ t: "table", align, head: head.map((h) => parseInline(h)), rows });
        continue;
      }
    }

    const item = ITEM.exec(line);
    if (item && depth < MAX_DEPTH) {
      const ordered = /\d/.test(item[2]);
      const base = item[1].length;
      const items: MdBlock[][] = [];
      const start = ordered ? parseInt(item[2], 10) : 1;
      while (i < lines.length) {
        const m = ITEM.exec(lines[i]);
        if (!m || m[1].length > base + 1 || /\d/.test(m[2]) !== ordered || RULE.test(lines[i])) break;
        const indent = m[1].length + m[2].length + 1;
        const body = [m[3]];
        i++;
        while (i < lines.length) {
          const l = lines[i];
          if (!l.trim()) {
            // A blank line stays in the item only when indented text follows it.
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && /^ {2,}|\t/.test(lines[j])) {
              body.push("");
              i++;
              continue;
            }
            break;
          }
          const lead = /^[ \t]*/.exec(l)![0].replace(/\t/g, "    ").length;
          if (lead >= 2) {
            body.push(l.replace(/\t/g, "    ").slice(Math.min(lead, indent)));
            i++;
          } else if (!startsBlock(l) && body.at(-1)) {
            // The paragraph carries on without its indent.
            body.push(l);
            i++;
          } else break;
        }
        items.push(parseBlocks(body, depth + 1));
        // Blank lines between items belong to the list.
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        const more = j < lines.length ? ITEM.exec(lines[j]) : null;
        if (more && more[1].length <= base + 1 && /\d/.test(more[2]) === ordered && !RULE.test(lines[j])) i = j;
      }
      out.push({ t: "list", ordered, start, items });
      continue;
    }

    const para = [line.replace(/^ {1,3}/, "")];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      if (lines[i].includes("|") && i + 1 < lines.length && DIVIDER.test(lines[i + 1]) && lines[i + 1].includes("-")) break;
      para.push(lines[i].trim());
      i++;
    }
    out.push({ t: "p", c: parseInline(para.join("\n").trimEnd()) });
  }
  return out;
}

export function parseMarkdown(text: string): MdBlock[] {
  return parseBlocks(text.replace(/\r\n?/g, "\n").split("\n"), 0);
}
