"use client";

import { memo, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { parseMarkdown, type MdBlock, type MdInline } from "@/lib/lab/markdown";

// Text written by an agent, shown with its formatting. Only the node kinds
// the reader produces are drawn: no HTML from the text reaches the page, no
// image or other remote content is loaded, and a link says where it goes.

function Inline({ nodes }: { nodes: MdInline[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "br":
        return <br key={i} />;
      case "code":
        return <code key={i}>{n.v}</code>;
      case "strong":
        return (
          <strong key={i}>
            <Inline nodes={n.c} />
          </strong>
        );
      case "em":
        return (
          <em key={i}>
            <Inline nodes={n.c} />
          </em>
        );
      case "del":
        return (
          <del key={i}>
            <Inline nodes={n.c} />
          </del>
        );
      case "link": {
        const label = n.c.length === 1 && n.c[0].t === "text" ? n.c[0].v : null;
        // The destination is spelled out unless the link's text already is the address.
        const shown = label !== null && (label === n.href || label.includes(n.host));
        return (
          <span key={i}>
            <a href={n.href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" title={n.href}>
              <Inline nodes={n.c} />
            </a>
            {(n.image || !shown) && (
              <span className="lab-md-host">
                {" "}
                ({n.image ? "image, not loaded · " : ""}
                {n.host})
              </span>
            )}
          </span>
        );
      }
    }
  });
}

function Blocks({ blocks }: { blocks: MdBlock[] }): ReactNode {
  return blocks.map((b, i) => {
    switch (b.t) {
      case "p":
        return (
          <p key={i}>
            <Inline nodes={b.c} />
          </p>
        );
      case "h": {
        // Headings are sized for a chat entry and never join the page's outline.
        return (
          <p key={i} role="heading" aria-level={Math.min(b.level + 3, 6)} className={`lab-md-h lab-md-h${Math.min(b.level, 4)}`}>
            <Inline nodes={b.c} />
          </p>
        );
      }
      case "code":
        return (
          <div key={i} className="lab-md-code">
            {b.lang && <span className="lab-md-lang">{b.lang}</span>}
            <pre>
              <code>{b.v}</code>
            </pre>
          </div>
        );
      case "hr":
        return <hr key={i} />;
      case "quote":
        return (
          <blockquote key={i}>
            <Blocks blocks={b.c} />
          </blockquote>
        );
      case "list": {
        const items = b.items.map((item, n) => (
          <li key={n}>
            <Blocks blocks={item} />
          </li>
        ));
        return b.ordered ? (
          <ol key={i} start={b.start}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        );
      }
      case "table":
        return (
          <div key={i} className="lab-md-table lab-scroll" tabIndex={0} role="group" aria-label="Table">
            <table>
              <thead>
                <tr>
                  {b.head.map((cell, n) => (
                    <th key={n} style={{ textAlign: b.align[n] ?? undefined }}>
                      <Inline nodes={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, n) => (
                      <td key={n} style={{ textAlign: b.align[n] ?? undefined }}>
                        <Inline nodes={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

export const LabMarkdown = memo(function LabMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={cn("lab-md", className)}>
      <Blocks blocks={blocks} />
    </div>
  );
});
