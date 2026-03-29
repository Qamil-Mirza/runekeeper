import type { TimeBlock } from "@/lib/types";

export interface OverlapLayout {
  block: TimeBlock;
  column: number;
  totalColumns: number;
}

/**
 * Assign columns to overlapping blocks so they can render side-by-side.
 * Blocks must be sorted by start time. Non-overlapping blocks get
 * column=0, totalColumns=1 (no layout change).
 */
export function assignOverlapColumns(blocks: TimeBlock[]): OverlapLayout[] {
  if (blocks.length === 0) return [];

  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));

  // Build clusters of transitively-overlapping blocks
  const clusters: TimeBlock[][] = [];
  let currentCluster: TimeBlock[] = [sorted[0]];
  let clusterEnd = sorted[0].end;

  for (let i = 1; i < sorted.length; i++) {
    const block = sorted[i];
    if (block.start < clusterEnd) {
      // Overlaps with current cluster
      currentCluster.push(block);
      if (block.end > clusterEnd) clusterEnd = block.end;
    } else {
      clusters.push(currentCluster);
      currentCluster = [block];
      clusterEnd = block.end;
    }
  }
  clusters.push(currentCluster);

  // Assign columns within each cluster
  const layoutMap = new Map<string, { column: number; totalColumns: number }>();

  for (const cluster of clusters) {
    // columns[i] = end time of the last block placed in column i
    const columns: string[] = [];

    for (const block of cluster) {
      // Find the leftmost column where this block fits (no overlap)
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        if (block.start >= columns[col]) {
          columns[col] = block.end;
          layoutMap.set(block.id, { column: col, totalColumns: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        layoutMap.set(block.id, { column: columns.length, totalColumns: 0 });
        columns.push(block.end);
      }
    }

    // Set totalColumns for all blocks in this cluster
    const total = columns.length;
    for (const block of cluster) {
      const layout = layoutMap.get(block.id)!;
      layout.totalColumns = total;
    }
  }

  return sorted.map((block) => ({
    block,
    ...layoutMap.get(block.id)!,
  }));
}
