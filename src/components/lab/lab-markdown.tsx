"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Links open beside the Lab instead of replacing it.
const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

/**
 * Protocol markdown. GitHub-flavoured, and raw HTML is never interpreted:
 * there is deliberately no rehype-raw, so react-markdown shows it as text.
 */
export function LabMarkdown({ source }: { source: string }) {
  return (
    <div className="lab-md">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </Markdown>
    </div>
  );
}
