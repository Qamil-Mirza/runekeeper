import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown, safeLink, type MdBlock, type MdInline } from "./markdown";

const plain = (nodes: MdInline[]): string =>
  nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : n.t === "br" ? "\n" : plain(n.c))).join("");

/** Every node kind in a tree, to prove nothing unexpected is produced. */
function kinds(blocks: MdBlock[]): string[] {
  const out: string[] = [];
  const inl = (ns: MdInline[]) =>
    ns.forEach((n) => {
      out.push(n.t);
      if ("c" in n) inl(n.c);
    });
  const walk = (bs: MdBlock[]) =>
    bs.forEach((b) => {
      out.push(b.t);
      if (b.t === "p" || b.t === "h") inl(b.c);
      else if (b.t === "quote") walk(b.c);
      else if (b.t === "list") b.items.forEach(walk);
      else if (b.t === "table") [b.head, ...b.rows].forEach((r) => r.forEach(inl));
    });
  walk(blocks);
  return out;
}

describe("lab markdown: blocks", () => {
  it("reads headings, paragraphs and rules", () => {
    const b = parseMarkdown("# Title\n\nFirst line\nsecond line\n\n---\n\n### Sub ###");
    assert.deepEqual(
      b.map((x) => x.t),
      ["h", "p", "hr", "h"]
    );
    assert.equal(b[0].t === "h" && b[0].level, 1);
    assert.equal(b[1].t === "p" && plain(b[1].c), "First line\nsecond line");
    assert.equal(b[3].t === "h" && plain(b[3].c), "Sub");
  });

  it("keeps a fenced code block verbatim, with its language", () => {
    const b = parseMarkdown("Run:\n```bash\nnpm test -- --grep '*x*'\n# not a heading\n```\nafter");
    assert.deepEqual(b[1], { t: "code", lang: "bash", v: "npm test -- --grep '*x*'\n# not a heading" });
    assert.equal(b[2].t, "p");
  });

  it("takes an unclosed fence to the end of the text", () => {
    const b = parseMarkdown("```\nstill code\n<b>x</b>");
    assert.deepEqual(b, [{ t: "code", lang: "", v: "still code\n<b>x</b>" }]);
  });

  it("reads a table with alignment and a short row", () => {
    const b = parseMarkdown("| Size | Score | Note |\n|:--|--:|:-:|\n| 512 | 0.81 | `a|b` |\n| 1024 | 0.90 |\n\nDone");
    const t = b[0];
    assert.equal(t.t, "table");
    if (t.t !== "table") return;
    assert.deepEqual(t.align, ["left", "right", "center"]);
    assert.deepEqual(t.head.map(plain), ["Size", "Score", "Note"]);
    assert.deepEqual(t.rows.map((r) => r.map(plain)), [
      ["512", "0.81", "a|b"],
      ["1024", "0.90", ""],
    ]);
    assert.equal(b[1].t, "p");
  });

  it("does not take a line with a pipe for a table without a divider row", () => {
    assert.equal(parseMarkdown("a | b\nc | d")[0].t, "p");
  });

  it("reads bullet and numbered lists, nested and with a start number", () => {
    const b = parseMarkdown("- one\n- two\n  - inner **bold**\n  - inner 2\n- three\n\n3. third\n4. fourth");
    assert.deepEqual(
      b.map((x) => x.t),
      ["list", "list"]
    );
    const [ul, ol] = b;
    if (ul.t !== "list" || ol.t !== "list") return assert.fail();
    assert.equal(ul.items.length, 3);
    assert.deepEqual(
      ul.items[1].map((x) => x.t),
      ["p", "list"]
    );
    assert.equal(ol.ordered, true);
    assert.equal(ol.start, 3);
    assert.equal(ol.items.length, 2);
  });

  it("keeps a code block inside a list item", () => {
    const b = parseMarkdown("1. Install\n\n   ```sh\n   npm ci\n   ```\n2. Run");
    const l = b[0];
    if (l.t !== "list") return assert.fail();
    assert.equal(l.items.length, 2);
    assert.deepEqual(l.items[0][1], { t: "code", lang: "sh", v: "npm ci" });
  });

  it("reads a quote with blocks inside", () => {
    const b = parseMarkdown("> quoted\n> - item\n\nafter");
    const q = b[0];
    if (q.t !== "quote") return assert.fail();
    assert.deepEqual(
      q.c.map((x) => x.t),
      ["p", "list"]
    );
  });

  it("does not recurse without limit on deep nesting", () => {
    const deep = ">".repeat(500) + " x\n" + "  ".repeat(200) + "- y";
    assert.doesNotThrow(() => parseMarkdown(deep));
  });
});

describe("lab markdown: inline", () => {
  it("reads code, bold, italic and strikethrough", () => {
    const n = parseInline("a `x*y*` **b _c_** ~~d~~ *e*");
    assert.deepEqual(
      n.map((x) => x.t),
      ["text", "code", "text", "strong", "text", "del", "text", "em"]
    );
    assert.equal(plain(n), "a x*y* b c d e");
  });

  it("leaves unmatched markers and snake_case names alone", () => {
    assert.equal(plain(parseInline("2 * 3 * 4 and max_token_count and **open")), "2 * 3 * 4 and max_token_count and **open");
    assert.deepEqual(
      parseInline("max_token_count").map((x) => x.t),
      ["text"]
    );
  });

  it("honours backslash escapes", () => {
    assert.deepEqual(parseInline("\\*not em\\*"), [{ t: "text", v: "*not em*" }]);
  });

  it("turns a newline into a line break", () => {
    assert.deepEqual(
      parseInline("a\nb").map((x) => x.t),
      ["text", "br", "text"]
    );
  });
});

describe("lab markdown: untrusted input", () => {
  it("leaves raw HTML as literal text", () => {
    const b = parseMarkdown('<script>alert(1)</script>\n\n<img src="https://evil.example/x.png" onerror="x()">');
    // The address inside the tag is a link like any bare address; the tag itself is text.
    assert.deepEqual([...new Set(kinds(b))].sort(), ["link", "p", "text"]);
    assert.equal(b[1].t === "p" && plain(b[1].c), '<img src="https://evil.example/x.png" onerror="x()">');
    assert.equal(b[0].t === "p" && plain(b[0].c), "<script>alert(1)</script>");
  });

  it("keeps only http, https and mailto links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<b>x</b>",
      "vbscript:x",
      "file:///etc/passwd",
      "//evil.example",
      "/relative",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
    ]) {
      assert.equal(safeLink(bad), null, bad);
      const n = parseInline(`[click](${bad})`);
      assert.ok(!n.some((x) => x.t === "link"), bad);
    }
    assert.deepEqual(safeLink("https://example.org/a?b=1"), { href: "https://example.org/a?b=1", host: "example.org" });
    assert.equal(safeLink("mailto:a@example.org")?.host, "a@example.org");
  });

  it("reports the host a link really goes to", () => {
    const [link] = parseInline("[github.com](https://github.com@evil.example/login)");
    assert.equal(link.t === "link" && link.host, "evil.example");
  });

  it("never loads an image: it becomes a link marked as an image", () => {
    const [img] = parseInline("![chart](https://example.org/c.png)");
    assert.equal(img.t, "link");
    assert.equal(img.t === "link" && img.image, true);
    assert.equal(plain(parseInline("![x](javascript:alert(1))")), "![x](javascript:alert(1))");
  });

  it("links a bare address without its trailing punctuation", () => {
    const n = parseInline("See https://example.org/a_(b). Then (https://example.org/c).");
    const links = n.filter((x) => x.t === "link").map((x) => (x.t === "link" ? x.href : ""));
    assert.deepEqual(links, ["https://example.org/a_(b)", "https://example.org/c"]);
  });

  it("stays fast on text made to be slow", () => {
    const started = Date.now();
    parseMarkdown("*a ".repeat(11_000));
    parseMarkdown("[".repeat(16_000));
    parseMarkdown("`".repeat(1) + " x ".repeat(10_000) + "``");
    parseMarkdown("|".repeat(30_000) + "\n|-|\n");
    assert.ok(Date.now() - started < 2_000, `took ${Date.now() - started} ms`);
  });
});
