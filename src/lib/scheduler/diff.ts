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

  // Find removals (current committed blocks not in proposed)
  for (const current of currentBlocks) {
    if (!current.committed) continue;

    const stillExists = proposedBlocks.some(
      (p) => p.taskId === current.taskId
    );

    if (!stillExists && current.taskId) {
      changes.push({ type: "remove", block: current });
    }
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
