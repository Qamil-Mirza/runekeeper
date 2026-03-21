import type { TimeBlock } from "./types";

// Week of March 23–29, 2026 (Mon–Sun)
function d(day: number, hour: number, min = 0) {
  return `2026-03-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

export const mockSchedule: TimeBlock[] = [
  // ── Monday ──
  {
    id: "block-1",
    title: "Organic Chemistry",
    start: d(23, 10),
    end: d(23, 11),
    type: "class",
    committed: true,
  },
  {
    id: "block-2",
    title: "Deep work — Midterm study",
    taskId: "task-2",
    start: d(23, 11, 30),
    end: d(23, 13, 30),
    type: "focus",
    committed: true,
  },
  {
    id: "block-3",
    title: "Lunch",
    start: d(23, 13, 30),
    end: d(23, 14),
    type: "personal",
    committed: true,
  },
  {
    id: "block-4",
    title: "Lab report writing",
    taskId: "task-1",
    start: d(23, 14),
    end: d(23, 16),
    type: "focus",
    committed: true,
  },
  {
    id: "block-7",
    title: "Gym — upper body",
    taskId: "task-3",
    start: d(23, 17),
    end: d(23, 18),
    type: "personal",
    committed: true,
  },

  // ── Tuesday ──
  {
    id: "block-8",
    title: "Deep work — Midterm study",
    taskId: "task-2",
    start: d(24, 9),
    end: d(24, 11),
    type: "focus",
    committed: true,
  },
  {
    id: "block-9",
    title: "Club meeting",
    start: d(24, 11),
    end: d(24, 12),
    type: "meeting",
    committed: true,
  },
  {
    id: "block-10",
    title: "Discussion section",
    start: d(24, 14),
    end: d(24, 15),
    type: "class",
    committed: true,
  },
  {
    id: "block-11",
    title: "Budget proposal draft",
    taskId: "task-6",
    start: d(24, 15, 30),
    end: d(24, 16, 30),
    type: "focus",
    committed: false,
  },

  // ── Wednesday ──
  {
    id: "block-12",
    title: "Organic Chemistry",
    start: d(25, 10),
    end: d(25, 11),
    type: "class",
    committed: true,
  },
  {
    id: "block-13",
    title: "Deep work — Midterm study",
    taskId: "task-2",
    start: d(25, 11, 30),
    end: d(25, 13, 30),
    type: "focus",
    committed: true,
  },
  {
    id: "block-14",
    title: "Lab report finalize",
    taskId: "task-1",
    start: d(25, 14),
    end: d(25, 16),
    type: "focus",
    committed: false,
  },
  {
    id: "block-15",
    title: "Gym — upper body",
    taskId: "task-3",
    start: d(25, 17),
    end: d(25, 18),
    type: "personal",
    committed: true,
  },

  // ── Thursday ──
  {
    id: "block-16",
    title: "Deep work — Midterm study",
    taskId: "task-2",
    start: d(26, 9),
    end: d(26, 11),
    type: "focus",
    committed: true,
  },
  {
    id: "block-17",
    title: "Read chapter 13",
    taskId: "task-5",
    start: d(26, 13),
    end: d(26, 14, 30),
    type: "focus",
    committed: false,
  },
  {
    id: "block-18",
    title: "Office hours",
    start: d(26, 15),
    end: d(26, 16),
    type: "meeting",
    committed: true,
  },

  // ── Friday ──
  {
    id: "block-19",
    title: "Organic Chemistry",
    start: d(27, 10),
    end: d(27, 11),
    type: "class",
    committed: true,
  },
  {
    id: "block-20",
    title: "Midterm review session",
    start: d(27, 13),
    end: d(27, 15),
    type: "focus",
    committed: true,
  },
  {
    id: "block-21",
    title: "Gym — upper body",
    taskId: "task-3",
    start: d(27, 17),
    end: d(27, 18),
    type: "personal",
    committed: true,
  },
];
