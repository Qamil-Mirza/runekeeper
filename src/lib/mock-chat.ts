import type { ChatMessage } from "./types";

export const mockChatMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    content:
      "Welcome back, Archivist. Ready to plan your week? Tell me your top priorities and any fixed commitments.",
    timestamp: "2026-03-22T20:00:00",
    quickActions: ["Plan my week", "Show inventory", "Quick reschedule"],
  },
  {
    id: "msg-2",
    role: "user",
    content:
      "I need to finish my lab report by Thursday (about 3 hours), study for my midterm on Friday (8 hours total), and hit the gym 3 times this week (1 hour each).",
    timestamp: "2026-03-22T20:01:00",
  },
  {
    id: "msg-3",
    role: "assistant",
    content:
      "Got it. Three priorities logged:\n\n**Quests this week:**\n• Lab report — 3h, due Thursday\n• Midterm study — 8h, due Friday\n• Gym sessions — 3 × 1h\n\nWhat fixed events should I work around? Classes, meetings, anything immovable.",
    timestamp: "2026-03-22T20:01:30",
  },
  {
    id: "msg-4",
    role: "user",
    content:
      "Classes MWF 10-11 (Organic Chem), discussion Tue 2-3, club meeting Tue 11-12, and office hours Thu 3-4.",
    timestamp: "2026-03-22T20:02:00",
  },
  {
    id: "msg-5",
    role: "assistant",
    content:
      "Noted. Last question — what are your working hours and break preferences?",
    timestamp: "2026-03-22T20:02:15",
  },
  {
    id: "msg-6",
    role: "user",
    content:
      "Weekdays 9 to 6. No focus blocks longer than 2 hours, and I need a 30-minute lunch break.",
    timestamp: "2026-03-22T20:02:45",
  },
  {
    id: "msg-7",
    role: "assistant",
    content:
      "Your week plan is ready. I've scheduled 8h of midterm study across four 2h blocks, the lab report in two sessions, and gym MWF after 5pm. Review the map and confirm when you're ready.",
    timestamp: "2026-03-22T20:03:00",
    diffPreview: {
      summary: "16 blocks across 5 days — 3 new focus sessions proposed",
      changes: [
        {
          type: "add",
          block: {
            id: "block-11",
            title: "Budget proposal draft",
            taskId: "task-6",
            start: "2026-03-24T15:30:00",
            end: "2026-03-24T16:30:00",
            type: "focus",
            committed: false,
          },
        },
        {
          type: "add",
          block: {
            id: "block-14",
            title: "Lab report finalize",
            taskId: "task-1",
            start: "2026-03-25T14:00:00",
            end: "2026-03-25T16:00:00",
            type: "focus",
            committed: false,
          },
        },
        {
          type: "add",
          block: {
            id: "block-17",
            title: "Read chapter 13",
            taskId: "task-5",
            start: "2026-03-26T13:00:00",
            end: "2026-03-26T14:30:00",
            type: "focus",
            committed: false,
          },
        },
      ],
    },
    quickActions: ["Confirm plan", "Adjust schedule", "Show full map"],
  },
];
