# Runekeeper Handoff

AI-powered planning and scheduling system with voice interaction.

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
│   ├── api/         # REST endpoints (tasks, blocks, plan, chat, calendar, integrations, lab)
│   └── planner/     # Main planning interface
├── components/      # UI modules (chat, oracle, schedule, inventory, home, integrations)
├── context/         # React context providers (planner state)
├── db/              # Drizzle schema + migrations
├── hooks/           # Custom React hooks
└── lib/
    ├── chat/        # Gemini chat engine, prompts, context builder, memory, action handler
    ├── voice/       # Gemini Live client, voice tools, prompts
    ├── pensive/     # Pensive API client + assignment sync
    ├── scheduler/   # Scheduling algorithm, conflict detection, free time calculation
    ├── lab/         # The Lab: stores, agent auth, RunPod reads, overview and spend
    └── google/      # Calendar, Tasks, Gmail API clients
tools/lab/           # The `lab` CLI (lab.mjs) and the agents' skill (SKILL.md)
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
| `integrations` | Provider configs (Gmail, Canvas, Gradescope, Pensive) |
| `processedEmails` | Gmail processing audit trail |
| `lab_*` (5) | The Lab: `lab_experiments`, `lab_runs`, `lab_protocols`, `lab_reports`, `lab_report_replies` |

## Voice System

**Browser mic** -- user clicks voice modal, browser captures audio at 48kHz, downsamples to 16kHz, streams via WebSocket to `/api/voice`, which relays to Gemini Live.

## Integrations

- **Google Calendar/Tasks** -- bidirectional sync for time blocks and tasks
- **Gmail** -- Pub/Sub webhook for email monitoring, Gemini-powered email analysis
- **Canvas** -- course/assignment sync
- **Gradescope** -- assignment sync
- **Pensive** -- assignment sync (EECS 189 etc.) via pasted Firebase auth record; manual sync from the Nexus

## Environment

Key env vars (see `.env.example` for full list):
- `DATABASE_URL` -- PostgreSQL connection
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` -- NextAuth
- `GEMINI_API_KEY` -- powers chat, voice, email analysis

## Dev Workflow

```bash
npm run dev          # Start custom server (Next.js + WebSocket)
npm run dev:tunnel   # Dev with public tunnel (e.g. Gmail Pub/Sub webhook)
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
- Gmail monitoring and task extraction
- Canvas and Gradescope assignment sync
- Pensive assignment sync
- Onboarding flow
- Session memory system

### In Progress
- The Lab is built: a read-only dashboard for the owner (Overview, Protocols and Reports boards) plus a token-gated agent API and the `lab` CLI. Agents post protocols and reports and track runs; the owner accepts, rejects or replies with typed or dictated notes. RunPod is only read. Pending, by the owner: apply the lab migrations (`npm run db:migrate`), set the Lab env vars below on the server, and install the CLI and skill for the agents (see `tools/lab/SKILL.md`). Until `LAB_OWNER_USER_IDS` and the token hashes are set, the Lab answers 404.
- Code: `src/lib/lab/` (stores, auth, RunPod reads), `src/components/lab/` (UI), `src/app/api/lab/` (owner and agent routes), `tools/lab/lab.mjs` (CLI).
- Env vars: `LAB_OWNER_USER_IDS`, `LAB_ADVISOR_TOKEN_SHA256`, `LAB_EXECUTOR_TOKEN_SHA256`, `RUNPOD_API_KEY`; CLI side `LAB_URL`, `LAB_TOKEN_FILE`. Tests: `npm run test:lab`.
- Spec: `docs/superpowers/specs/2026-11-24-lab-dashboard-design.md` (gitignored; add with `git add -f`).

### Known Issues
- (none)
