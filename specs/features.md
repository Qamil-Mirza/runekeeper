# Runekeeper — Feature Roadmap

## Current State

The app is a **polished UI prototype**. The entire frontend shell is built — chat interface, week grid, inventory panel, three-panel layout, responsive design, and the full "Enchanted Archivist" design system. However, all data is mock, there is no backend, no authentication, no Google API integration, no persistence, and no real scheduling logic.

### What's Done
- Landing page with sign-in button
- Three-panel planner layout (sidebar, chat, schedule drawer)
- Chat UI with message bubbles, typing indicator, diff previews, quick action chips
- Week grid with color-coded time blocks (focus/meeting/class/personal)
- Task inventory with priority badges, collapsible groups, add/toggle
- Shared React Context state management
- Full design system (sepia palette, Newsreader/Work Sans fonts, paper texture, tonal layering)
- Responsive design (mobile bottom nav, tablet collapsed sidebar, desktop three-panel)
- Accessibility basics (skip-nav, ARIA roles, focus indicators, prefers-reduced-motion)

### What's Mock
- Chat responses are randomly selected from 3 canned strings
- Schedule data is hardcoded (March 23-29, 2026)
- Tasks are hardcoded (10 sample tasks)
- User profile is hardcoded
- "Sign in with Google" button just navigates to `/planner`
- "Commit" button only flips a boolean in memory
- Nothing persists across page refreshes

---

## Feature List

### P0 — Must Have (MVP)

#### 1. Backend API Service
**Description:** Server-side API to handle auth, planning logic, and Google API calls. Next.js API routes or separate service.
**Acceptance criteria:**
- API routes exist for auth, calendar operations, task operations, and planning sessions
- Proper error handling and HTTP status codes
- Request validation
**Dependencies:** None (foundational)
**Status:** Not started

#### 2. Database & Persistence
**Description:** Store user profiles, tasks, time block mappings, plan sessions, and preferences. Needs to persist across sessions.
**Acceptance criteria:**
- User data persists across sessions
- Tasks, blocks, and plan sessions are stored and retrievable
- Schema matches PRD data model (User, Task, TimeBlock, PlanSession)
**Dependencies:** Backend API (#1)
**Status:** Not started

#### 3. Google OAuth 2.0 Authentication
**Description:** Full OAuth 2.0 web-server flow — login, token storage (encrypted), refresh, disconnect, scope management.
**Acceptance criteria:**
- User can sign in with Google and land in the planner
- Refresh tokens stored encrypted at rest
- User can disconnect (revokes tokens, stops watch channels)
- Scopes requested: `calendar.events`, `tasks` (minimal)
- Handles token expiry and refresh transparently
**Dependencies:** Backend API (#1), Database (#2)
**Status:** Not started

#### 4. Read Google Calendar Events
**Description:** Fetch user's calendar events for a given time window using `events.list`. Build a "busy map" of the user's week.
**Acceptance criteria:**
- Given a week range, returns all events from the user's selected calendar(s)
- Correctly identifies free vs busy time slots
- Handles pagination (`nextPageToken`)
- Supports `syncToken` for incremental sync on subsequent calls
**Dependencies:** OAuth (#3)
**Status:** Not started

#### 5. Write Time Blocks to Calendar
**Description:** Create calendar events via `events.insert` for scheduled time blocks. Events must be `opaque` (block time). Store `eventId` and `etag` mapping.
**Acceptance criteria:**
- On plan confirmation, creates events in Google Calendar
- Events appear as "busy" in the user's calendar
- Internal mapping stored: `timeBlockId ↔ calendarId/eventId/etag`
- Supports `events.patch` and `events.update` for modifications
**Dependencies:** OAuth (#3), Read Calendar (#4)
**Status:** Not started

#### 6. Scheduling Algorithm
**Description:** Constraint-based scheduler that takes tasks (with priorities, estimates, deadlines) + user preferences (working hours, max block length, lunch) + existing busy windows → produces a proposed set of time blocks.
**Acceptance criteria:**
- Given tasks and constraints, outputs a valid non-conflicting schedule
- Respects working hours, max block duration, lunch breaks, meeting buffers
- Prioritizes P0 tasks, then P1, then P2
- Splits tasks exceeding max block length into multiple blocks
- Returns unschedulable tasks separately with explanation
**Dependencies:** Read Calendar (#4)
**Status:** Not started

#### 7. Conflict Detection
**Description:** Before committing a plan, detect overlapping events between proposed blocks and existing calendar events.
**Acceptance criteria:**
- Flags any overlap between proposed blocks and existing events
- Offers alternative time slots for conflicting blocks
- Uses `events.list` time range queries (MVP) or `freebusy.query`
**Dependencies:** Read Calendar (#4), Scheduling Algorithm (#6)
**Status:** Not started

#### 8. Preview & Confirmation Flow
**Description:** Show a complete diff (additions, modifications, removals) before writing to calendar. Require explicit user confirmation.
**Acceptance criteria:**
- Diff preview shows exactly what will be written to calendar
- User must explicitly confirm ("Apply these N changes?")
- Cancel aborts with no side effects
- On confirm, all changes written atomically (best-effort)
**Dependencies:** Scheduling Algorithm (#6), Write Calendar (#5)
**Status:** Partial (UI exists, no real diff logic)

#### 9. Undo / Rollback
**Description:** After committing a plan, allow undo within a configurable time window. Reverse the diff by deleting/restoring events.
**Acceptance criteria:**
- After commit, user can undo within window (e.g., 30 minutes)
- Undo deletes created events and restores modified ones (best-effort)
- Handles case where external edits happened in between (warns user)
- Undo token/handle persisted in database
**Dependencies:** Write Calendar (#5), Database (#2)
**Status:** Not started

#### 10. Google Tasks Sync
**Description:** Create tasks in Google Tasks via `tasks.insert` when a plan is committed. Update via `tasks.patch`. Due date is date-only (no time).
**Acceptance criteria:**
- On plan commit, tasks created in a designated Google Tasks list
- Task title, notes, due date, and status synced
- `tasks.patch` used for updates (mark complete, change due date)
- Internal mapping: `taskId ↔ tasklistId/googleTaskId`
**Dependencies:** OAuth (#3), Database (#2)
**Status:** Not started

#### 11. Real Chat Planning Flow
**Description:** Replace mock responses with a real planning conversation. Either an LLM-powered assistant or a structured state machine that walks through: priorities → constraints → preferences → proposed schedule.
**Acceptance criteria:**
- Chat guides user through weekly planning (collect priorities, fixed events, preferences)
- Produces a real proposed schedule using the scheduling algorithm
- Shows inline schedule preview and diff preview in chat
- Handles follow-up adjustments ("move deep work to afternoon")
**Dependencies:** Scheduling Algorithm (#6), Read Calendar (#4)
**Status:** Partial (UI exists, responses are canned)

#### 12. User Preferences & Settings
**Description:** UI and persistence for user preferences — working hours, break rules, max block length, preferred calendars, timezone.
**Acceptance criteria:**
- Settings page or onboarding flow captures preferences
- Preferences saved to database and used by scheduling algorithm
- User can update preferences at any time
- Timezone displayed clearly in all time-related UI
**Dependencies:** Database (#2), OAuth (#3)
**Status:** Partial (type defined, hardcoded in mock)

---

### P1 — High Priority (Post-MVP)

#### 13. Reschedule via Chat
**Description:** User can say "move my deep work to tomorrow afternoon" and the system updates affected events via `events.patch`.
**Acceptance criteria:**
- Natural language rescheduling commands parsed and executed
- Affected events updated in Google Calendar
- Preview shown before applying
- Cascading conflicts handled (if moving block A displaces block B)
**Dependencies:** Write Calendar (#5), Real Chat (#11)
**Status:** Not started

#### 14. Push Notification Sync (Calendar Watch)
**Description:** Register `events.watch` webhook to receive push notifications when calendar changes externally. Trigger incremental sync.
**Acceptance criteria:**
- Watch channel created on user's calendar after OAuth
- Webhook endpoint receives change notifications
- On notification, performs incremental sync using `syncToken`
- Channel renewed before TTL expiry (default 7 days)
- Channel stopped on user disconnect
**Dependencies:** Backend API (#1), OAuth (#3), Read Calendar (#4)
**Status:** Not started

#### 15. Incremental Sync with syncToken
**Description:** Use `nextSyncToken` from `events.list` to fetch only changed events on subsequent syncs. Handle 410 GONE by full resync.
**Acceptance criteria:**
- `syncToken` persisted per user per calendar
- Incremental sync fetches only changes since last sync
- 410 response triggers full resync (clear cache, re-fetch all)
- Handles pagination within sync responses
**Dependencies:** Read Calendar (#4), Database (#2)
**Status:** Not started

#### 16. Onboarding Flow
**Description:** First-run experience after sign-in: welcome message, working hours setup, calendar selection, first weekly plan.
**Acceptance criteria:**
- New users see onboarding before main planner
- Captures: working hours, break preferences, max block length
- User selects which calendars to read for availability
- Onboarding state persisted (don't show again)
**Dependencies:** OAuth (#3), User Preferences (#12)
**Status:** Not started (empty directory exists)

#### 17. Calendar Selection
**Description:** Let user choose which calendars to consider for availability and which calendar to write time blocks to.
**Acceptance criteria:**
- Fetches calendar list via `calendarList.list`
- User can select "planning calendars" (read for availability)
- User can select "write calendar" (where blocks are created)
- Supports dedicated "Runekeeper" calendar creation as an option
**Dependencies:** OAuth (#3)
**Status:** Not started

#### 18. Batch & Serialized Calendar Writes
**Description:** Queue calendar writes and execute them serialized per calendar to avoid rate limiting and race conditions.
**Acceptance criteria:**
- Calendar writes go through a queue (not direct API calls)
- Writes serialized per calendar
- Exponential backoff on rate limit errors
- Failed writes retried with proper error reporting
**Dependencies:** Write Calendar (#5), Backend API (#1)
**Status:** Not started

---

### P2 — Nice to Have

#### 19. Recurring Time Blocks (RRULE)
**Description:** Create recurring calendar events using RFC5545 RRULE strings for habits and routines (e.g., gym MWF).
**Acceptance criteria:**
- User can mark a task as recurring
- System generates proper RRULE string
- Creates recurring event in Google Calendar
- Manages exceptions carefully (avoids notification spam)
**Dependencies:** Write Calendar (#5)
**Status:** Not started

#### 20. Multi-Calendar Free/Busy
**Description:** Query availability across multiple calendars using `freebusy.query` for users with complex calendar setups.
**Acceptance criteria:**
- `freebusy.query` used when multiple calendars selected
- Handles `calendarExpansionMax` limits
- May require additional OAuth scope (`calendar.freebusy`)
**Dependencies:** Calendar Selection (#17), OAuth (#3)
**Status:** Not started

#### 21. Focus Time Event Type
**Description:** Create `focusTime` event type blocks where supported (primary calendar only, not all users).
**Acceptance criteria:**
- Detects if user's calendar supports `focusTime` event type
- Falls back to standard `opaque` events if unsupported
- Note: `eventType` cannot be changed after creation
**Dependencies:** Write Calendar (#5)
**Status:** Not started

#### 22. Reminders & Notifications
**Description:** Configure event reminders (e.g., 10 minutes before focus blocks) and handle `sendUpdates` behavior.
**Acceptance criteria:**
- User can set default reminder time for focus blocks
- Reminders applied to created events
- `sendUpdates` handled appropriately (don't spam attendees)
**Dependencies:** Write Calendar (#5), User Preferences (#12)
**Status:** Not started

#### 23. Offline Mode
**Description:** Allow offline drafting (create tasks, set preferences, propose plan) and queue writes until online.
**Acceptance criteria:**
- App detects offline state and labels it clearly
- Tasks and preferences can be edited offline
- Changes queued and synced when back online
- Last-known schedule cached for viewing
**Dependencies:** Database (#2), Batch Writes (#18)
**Status:** Not started

#### 24. Task Rollover
**Description:** Automatically carry over unfinished tasks from one week to the next with rescheduling suggestions.
**Acceptance criteria:**
- At week boundary, unfinished tasks flagged
- User prompted to reschedule or deprioritize
- Rolled-over tasks retain original priority and notes
**Dependencies:** Scheduling Algorithm (#6), Real Chat (#11)
**Status:** Not started

#### 25. Error Handling & Recovery
**Description:** Comprehensive error boundaries, retry logic, graceful degradation, and user-facing error messages.
**Acceptance criteria:**
- React error boundaries catch component failures
- API errors show user-friendly messages
- Network failures handled gracefully (retry, offline mode)
- Google API quota exceeded → exponential backoff + user notification
**Dependencies:** All features
**Status:** Not started

#### 26. Testing
**Description:** Unit tests, integration tests, and E2E tests covering critical paths.
**Acceptance criteria:**
- Unit tests for scheduling algorithm, utility functions, state management
- Integration tests for API routes (OAuth flow, calendar operations)
- E2E tests for core user flows (sign in → plan week → confirm → undo)
- CI pipeline runs tests on every push
**Dependencies:** All features
**Status:** Not started

---

## Infrastructure Requirements

| Component | Purpose | Options to Consider |
|-----------|---------|-------------------|
| **Runtime** | Server for API routes, OAuth, webhooks | Next.js API routes (simplest), or separate Node/Express service |
| **Database** | Users, tasks, blocks, sessions, tokens | PostgreSQL (Supabase/Neon), Firestore, or PlanetScale |
| **Auth** | OAuth token storage, session management | NextAuth.js, or custom OAuth with encrypted token store |
| **Job Queue** | Batch calendar writes, webhook fan-out | Inngest, BullMQ, or Vercel Cron |
| **Webhook Endpoint** | Receive Calendar push notifications | Publicly accessible HTTPS endpoint with SSL |
| **Encryption** | OAuth tokens at rest | Node.js crypto (AES-256-GCM), or Cloud KMS |
| **Hosting** | Deploy the app | Vercel (simplest for Next.js), Google Cloud Run, Railway |
| **LLM (optional)** | Power the chat assistant | Claude API, or structured state machine (no LLM needed for MVP) |

---

## What I Need From You

### Decisions

1. **Backend approach** — Should I use Next.js API routes (keep everything in one repo) or a separate backend service? API routes are simpler for MVP.
Please use API Routes

2. **Database choice** — PostgreSQL via Supabase/Neon (relational, mature), Firestore (Google-native, serverless), or something else? This affects schema design and hosting.
Let's try Neon

3. **Chat intelligence** — Do you want a real LLM (Claude API) powering the chat assistant, or a structured state machine that walks through planning steps deterministically? LLM is more flexible but adds cost and complexity.
Let's use ollama and qwen3.5, but if you think another open source model would be better for our use case, let's run with that

4. **Deployment target** — Where will this be hosted? Vercel (simplest with Next.js), Google Cloud Run, Railway, self-hosted?
- Let's run it on vercel

5. **Dedicated calendar vs primary** — Should the MVP write to the user's primary calendar or create a dedicated "Runekeeper" calendar to isolate changes?
- primary calender

6. **Scope for V1** — Which features from this list define your V1 launch? All P0s? Some P1s?
- All P0s

### Things You Need to Provide / Set Up

7. **Google Cloud Project** — Create a project in Google Cloud Console. I need the project ID to configure OAuth.

8. **OAuth Consent Screen** — Set up the OAuth consent screen in Google Cloud Console (app name, support email, authorized domains). Required before creating credentials.

9. **OAuth Client Credentials** — Create an OAuth 2.0 Client ID (Web application type) in Google Cloud Console. I need the `client_id` and `client_secret`.

10. **Authorized Redirect URI** — Decide on your domain (e.g., `localhost:3000` for dev, your production domain for prod). This gets configured in the OAuth client.

11. **Database credentials** — If using Supabase/Neon/etc., create the project and provide the connection string.

12. **Claude API key** (if using LLM) — If you want the chat powered by Claude, I need an Anthropic API key.

13. **Deployment account** — Vercel account, Google Cloud billing, or wherever you want to deploy.

14. **Webhook domain** — For Calendar push notifications, we need a publicly accessible HTTPS domain. This can wait until post-MVP if we use polling initially.
