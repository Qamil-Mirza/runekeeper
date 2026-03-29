# Overlapping Block Layout for Calendar Views

## Problem

When calendar blocks overlap in time (e.g., a Google Calendar event and a Runekeeper quest at the same hour), they render on top of each other at full width. The block rendered last covers the earlier one, making it invisible.

## Design

### Column Assignment Algorithm

A shared pure utility function `assignOverlapColumns` takes a list of time blocks (sorted by start time) and returns layout metadata for each block.

**Steps:**

1. **Cluster detection:** Walk through blocks chronologically. A cluster is a maximal set of blocks where each block overlaps with at least one other block in the set (transitive closure). A block that doesn't overlap with anything forms its own single-block cluster.

2. **Column assignment:** Within each cluster, assign each block to the lowest-numbered column (0-indexed) where it doesn't conflict with any already-assigned block in that column.

3. **Output:** For each block, return `{ block, column, totalColumns }` where `totalColumns` is the maximum column count in that block's cluster.

**Interface:**

```typescript
interface OverlapLayout {
  block: TimeBlock;
  column: number;       // 0-indexed column assignment
  totalColumns: number; // total columns in this block's cluster
}

function assignOverlapColumns(blocks: TimeBlock[]): OverlapLayout[];
```

**Location:** `src/lib/scheduler/overlap-layout.ts` — a pure function with no side effects, used by rendering components only.

### Day View (`EventCard` in `calendar-view.tsx`)

Current positioning: `left-10 right-4` (40px left margin, 16px right margin).

With overlap layout:
- Available width = container width - 40px - 16px (handled via CSS calc or inline style)
- Each block gets: `left: 40px + (column / totalColumns) * availableWidth` and `width: availableWidth / totalColumns`
- Switch from Tailwind `left-10 right-4` to inline `style` for left/width when `totalColumns > 1`
- When `totalColumns === 1`, keep current behavior (no change in appearance)
- Add 1px horizontal gap between adjacent columns via a small padding/margin offset

### Week Grid View (`TimeBlockComponent` + `DayColumn`)

Current positioning: `left-0.5 right-0.5` (2px margins each side).

With overlap layout:
- `DayColumn` computes `assignOverlapColumns` for its blocks and passes `column`/`totalColumns` as props to `TimeBlockComponent`
- `TimeBlockComponent` calculates its left offset and width as percentages: `left: (column / totalColumns) * 100%`, `width: (1 / totalColumns) * 100%`
- When `totalColumns === 1`, keep current `left-0.5 right-0.5` behavior
- Add 1px gap between columns

### Week Mini View

No changes. Blocks remain full-width stacked. At 32px hour height and ~9px font, splitting would make blocks unreadable.

### Visual Details

- Adjacent columns separated by 1px gap (applied as 0.5px padding on each side of a block when in a multi-column cluster)
- No z-index changes needed — blocks no longer visually overlap within their assigned columns
- Non-overlapping blocks render exactly as before (single-block cluster = `totalColumns: 1`)
