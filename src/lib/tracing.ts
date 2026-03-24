import { Langfuse } from "langfuse";

const isEnabled =
  !!process.env.LANGFUSE_SECRET_KEY && !!process.env.LANGFUSE_PUBLIC_KEY;

const langfuse = isEnabled
  ? new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    })
  : null;

// ── No-op stub that mirrors the Langfuse trace/span interface ────────────────

const noopEvent = { update: () => noopEvent };

const noopGeneration = {
  end: () => noopGeneration,
  update: () => noopGeneration,
};

const noopSpan = {
  generation: () => noopGeneration,
  event: () => noopEvent,
  span: () => noopSpan,
  end: () => noopSpan,
  update: () => noopSpan,
};

// ── Public API ───────────────────────────────────────────────────────────────

export function createTrace(
  name: string,
  opts: { userId?: string; sessionId?: string; metadata?: Record<string, unknown> } = {}
) {
  if (!langfuse) return noopSpan;

  return langfuse.trace({
    name,
    userId: opts.userId,
    sessionId: opts.sessionId,
    metadata: opts.metadata,
  });
}

export async function flushTracing() {
  if (langfuse) await langfuse.flushAsync();
}

export { langfuse };
