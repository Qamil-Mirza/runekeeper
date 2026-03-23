import type { TimeBlock, DiffPreview, DiffChange } from "@/lib/types";

export function generateDiff(
  currentBlocks: TimeBlock[],
  proposedBlocks: TimeBlock[]
): DiffPreview {
  const changes: DiffChange[] = [];

  // Find additions (proposed blocks not in current)
  for (const proposed of proposedBlocks) {
    const existing = currentBlocks.find(
      (b) => b.taskId === proposed.taskId && b.committed
    );

    if (!existing) {
      changes.push({ type: "add", block: proposed });
    } else {
      // Check if the block was modified
      const startChanged = existing.start !== proposed.start;
      const endChanged = existing.end !== proposed.end;
      const titleChanged = existing.title !== proposed.title;

      if (startChanged || endChanged || titleChanged) {
        changes.push({
          type: "modify",
          block: proposed,
          previousBlock: existing,
        });
      }
    }
  }

  // Find removals (committed blocks being replaced by a different proposed block)
  // Only show a removal if the proposed set explicitly replaces that task
  for (const current of currentBlocks) {
    if (!current.committed) continue;

    const replacedByProposed = proposedBlocks.some(
      (p) => p.taskId === current.taskId
    );

    // Only mark as removed if the proposed set contains a different version
    // of this block (i.e., the task was rescheduled). Don't mark committed
    // blocks as removed just because they aren't in the new proposal —
    // they're still committed and untouched.
    if (replacedByProposed) {
      // Already handled as "modify" above
      continue;
    }
    // Otherwise, this committed block is untouched — do NOT show as removed
  }

  const summary = buildSummary(changes);

  return { changes, summary };
}

function buildSummary(changes: DiffChange[]): string {
  const adds = changes.filter((c) => c.type === "add").length;
  const mods = changes.filter((c) => c.type === "modify").length;
  const removes = changes.filter((c) => c.type === "remove").length;

  const parts: string[] = [];
  if (adds > 0) parts.push(`${adds} new block${adds > 1 ? "s" : ""}`);
  if (mods > 0) parts.push(`${mods} modified`);
  if (removes > 0) parts.push(`${removes} removed`);

  if (parts.length === 0) return "No changes";
  return parts.join(", ");
}
