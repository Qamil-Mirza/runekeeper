# Runekeeper Handoff

AI-powered planning and scheduling system with voice interaction via the OMI wearable.

## Tech Stack

- **Framework:** Next.js 15, React 19, TypeScript
- **Styling:** Tailwind CSS 4, Framer Motion
- **Auth:** NextAuth v5 (Google OAuth)
- **Database:** PostgreSQL (Neon) + Drizzle ORM
- **AI:** Google Gemini 2.5 Flash (chat), Gemini Live (voice streaming)
- **Real-time:** Custom Node.js server with WebSocket (ws)
- **Deployment:** Docker multi-stage build, ports 3000 (HTTP) + 3001 (WS)

## Architecture

```
src/
├── app/             # Next.js pages + API routes
│   ├── api/         # REST endpoints (tasks, blocks, plan, chat, calendar, integrations)
│   └── planner/     # Main planning interface
├── components/      # UI modules (chat, oracle, schedule, inventory, home, integrations)
├── context/         # React context providers (planner state)
├── db/              # Drizzle schema + migrations
├── hooks/           # Custom React hooks
└── lib/
    ├── chat/        # Gemini chat engine, prompts, context builder, memory, action handler
    ├── voice/       # Gemini Live client, voice tools, OMI bridge, wake word detector
    ├── scheduler/   # Scheduling algorithm, conflict detection, free time calculation
    └── google/      # Calendar, Tasks, Gmail API clients
server.ts            # Custom server: HTTP + WS on ports 3000/3001
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Profiles, timezone, working hours |
| `tasks` | Tasks with priority, estimates, due dates, recurrence |
| `timeBlocks` | Calendar events synced with Google Calendar |
| `planSessions` | Weekly planning sessions with diff snapshots |
| `chatMessages` | Chat history per session |
| `chatMemories` | Persistent user context (identity, routines) |
| `integrations` | Provider configs (Gmail, Canvas, Gradescope, OMI) |
| `processedEmails` | Gmail processing audit trail |

## Voice System

The voice system has two paths:

1. **Browser mic** -- user clicks voice modal, browser captures audio at 48kHz, downsamples to 16kHz, streams via WebSocket to `/api/voice`, which relays to Gemini Live.

2. **OMI wearable** -- OMI necklace streams PCM 16kHz audio via HTTP POST to `/api/integrations/omi/webhook`. Audio is:
   - Fed to the **wake word detector** (Gemini Flash transcribes ~3s audio windows, checks for "Oracle, wake")
   - Piped into the active Gemini Live session (if one exists)
   - When wake word detected, `omi_trigger` event pushes to browser via `/api/events` WebSocket, opening the voice modal

When OMI is active, the browser mic auto-mutes to prevent echo feedback.

## Integrations

- **Google Calendar/Tasks** -- bidirectional sync for time blocks and tasks
- **Gmail** -- Pub/Sub webhook for email monitoring, Gemini-powered email analysis
- **Canvas** -- course/assignment sync
- **Gradescope** -- assignment sync
- **OMI** -- wearable device for hands-free voice input

## Environment

Key env vars (see `.env.example` for full list):
- `DATABASE_URL` -- PostgreSQL connection
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` -- NextAuth
- `GEMINI_API_KEY` -- powers chat, voice, wake word detection, email analysis
- `OMI_WEBHOOK_SECRET` -- verifies OMI webhook requests

## Dev Workflow

```bash
npm run dev          # Start custom server (Next.js + WebSocket)
npm run dev:tunnel   # Dev with tunnel for OMI testing
npm run build        # Next.js build + esbuild server bundle
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Apply migrations
```

## Current State

### Built
- Full planning chat with Gemini (structured actions, task/block creation)
- Weekly schedule view with drag-and-drop
- Google Calendar bidirectional sync
- Voice interaction via browser mic + Gemini Live
- OMI wearable integration with wake word activation ("Oracle, wake")
- Gmail monitoring and task extraction
- Canvas and Gradescope assignment sync
- Onboarding flow
- Session memory system

### In Progress
- OMI wake word detection (switched from double-clap to Gemini Flash transcription)

### Known Issues
- Wake word latency is ~1-2s (buffer fill + Gemini inference) -- acceptable but noticeable
- OMI audio webhook uses polling-style HTTP POSTs, not a persistent stream
