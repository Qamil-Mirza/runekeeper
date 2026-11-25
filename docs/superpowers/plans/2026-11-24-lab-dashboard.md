# Lab Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old agent-running Lab with a read-only dashboard (pods, spend, ETAs, experiments), a protocol review board and a reports board, fed by the advisor/executor sessions through a small token-authenticated API and by RunPod's read-only API.

**Architecture:** Pure logic in `src/lib/lab/` (settings, auth, validation, time, RunPod client, spend, overview assembly, protocol rules) is unit-tested with `node:test`; a thin Drizzle store and Next.js route handlers wire it to Postgres. Agents use a dependency-free Node CLI (`tools/lab/lab.mjs`) shipped with a `lab-reporting` skill. The UI is a client component under `src/components/lab/`, mounted where the old Lab was.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 4, Drizzle (Postgres), NextAuth v5, `node:test` via `tsx`, `react-markdown` + `remark-gfm` (new), browser Web Speech API.

**Spec:** `docs/superpowers/specs/2026-11-24-lab-dashboard-design.md` — read it before any task.

## Global Constraints

- Public repo: no host names, account names, user ids, tailnet names or internal paths in code, comments, commits or PR text.
- Work on branch `feat/lab-dashboard`; never push to `main` (it auto-deploys). Never push `feat/the-lab`.
- `docs/` is gitignored: add docs with `git add -f`.
- The Lab never calls a RunPod write endpoint and never sends anything to tmux. RunPod base URL `https://api.runpod.io/v2`; auth header `Authorization: Bearer ${RUNPOD_API_KEY}`.
- All displayed times are `America/Los_Angeles`.
- Env vars (exact names): `LAB_OWNER_USER_IDS`, `LAB_ADVISOR_TOKEN_SHA256`, `LAB_EXECUTOR_TOKEN_SHA256`, `RUNPOD_API_KEY`. CLI side: `LAB_URL` (default `http://127.0.0.1:3000`), `LAB_TOKEN_FILE`.
- Owner routes answer 404 to anyone not in `LAB_OWNER_USER_IDS` (unset/malformed ⇒ 404 for everyone). Agent routes answer 404 when neither token hash is set.
- Report HTML ≤ 4 MB (4 × 1024 × 1024 bytes of UTF-8). Protocol markdown ≤ 512 KB (my call). Notes/replies ≤ 10 000 chars (my call).
- `stage` matches `^[a-z0-9][a-z0-9-]{0,39}$`; experiment code matches `^[A-Z][A-Z0-9]{0,15}$` (e.g. `E9`, `A5`).
- Copy is plain and short; no decorative chips, badges or meters beyond those in the spec. "Clear, no clutter."
- Palette (CSS vars under `.lab-root`): bg `#07090c`, panel `#0c1116`, raised `#121a22`, line `#1d2732`, line-strong `#2b3947`, text `#e6edf3`, dim `#7f8d9b`, faint `#4d5a67`, accent `#38d6ff`, ok `#3ddc97`, warn `#ffb454`, bad `#ff5c6c`. Fonts: `system-ui` and `ui-monospace` with tabular numbers (my call: no new font files).
- Tests: `npm run test:lab` = `npx tsx --test src/lib/lab/*.test.ts tools/lab/*.test.mjs`. Typecheck: `npx tsc --noEmit`.

## Review Focus

1. **Report HTML that tries to escape** (reads `document.cookie`, `fetch('/api/...')`, `<img src="https://…">`): it must render but get nothing. Pinned by the header test in Task 8 and the manual check in Task 11.
2. **A pod RunPod no longer lists while its run is `running`**, and **a running pod no run claims**: "Pod gone" and "Unassigned pod" rows. Pinned in Task 6 tests.
3. **Midnight and daylight-saving edges for "spent today" and `--eta 18:10`** (e.g. at 23:50 PT, `18:10` means tomorrow; on 2026-03-08 the day starts 08:00 UTC, on 2026-11-02 at 08:00 UTC after the fall-back 07:00 UTC). Pinned in Task 3 tests.
4. **Decision on an already-decided or superseded protocol** (double-click, stale tab): refused with 409, nothing changes. Pinned in Task 4 tests.
5. **Agent request arriving through Funnel with a valid token**: refused. Pinned in Task 2 tests; confirmed live in Task 13.

---

### Task 1: Remove the old Lab

**Files:**
- Delete: `src/components/lab/` (all), `src/lib/lab/` (all), `src/app/api/lab/` (all), `docker-compose.lab.yml`, `scripts/lab/`, `docs/lab/contract/`
- Modify: `deploy.sh` (remove the `LAB_SOCK_GID` block; `COMPOSE_FILES` becomes just `-f "$COMPOSE_FILE"`, keep the variable), `.env.example` (remove the whole "The Lab" section), `package.json` (remove `lab:types`; set `test:lab` as in Global Constraints), `src/app/planner/planner-shell.tsx` (remove `LabView`/`useLabAccess` imports and uses; keep `"lab"` in `ViewId`, pass `showLab={false}` for now)
- Keep: `Dockerfile` uid lines; `src/components/layout/sidebar.tsx` `showLab` prop and `LabIcon`.

**Interfaces:** Produces a tree with no Lab code; `showLab` still exists on the sidebar and bottom nav.

- [ ] **Step 1:** Delete the files and make the edits above.
- [ ] **Step 2:** Run `npx tsc --noEmit` — expected: no errors. Run `grep -rn "lab/" src --include=*.ts --include=*.tsx | grep -v "lab-root"` — expected: no import of `@/lib/lab` or `@/components/lab`.
- [ ] **Step 3:** Commit: `git add -A && git commit -m "chore(lab): remove the old agent-running Lab"`

### Task 2: Settings, owner gate, agent auth

**Files:**
- Create: `src/lib/lab/settings.ts`, `src/lib/lab/agent-auth.ts`, `src/lib/lab/route.ts`
- Test: `src/lib/lab/settings.test.ts`, `src/lib/lab/agent-auth.test.ts`
- Modify: `src/middleware.ts`, `docker-compose.prod.yml` (pass the four env vars, each `${VAR:-}`), `.env.example` (new short "The Lab" section listing the four vars with one-line comments and how to make a token hash: `openssl rand -hex 32 | tee token | tr -d '\n' | sha256sum`)

**Interfaces:**
- Produces:
  - `type AgentRole = "advisor" | "executor"`
  - `interface LabSettings { ownerIds: ReadonlySet<string> | null; tokenHashes: Partial<Record<AgentRole, string>>; runpodKey: string | null }`
  - `loadLabSettings(env: Record<string, string | undefined>): LabSettings`
  - `isLabOwner(userId: string | null | undefined, s: LabSettings): boolean`
  - `agentRoleFor(headers: Headers, s: LabSettings): AgentRole | null` (Bearer token → sha256 hex → constant-time compare with each hash)
  - `cameThroughProxy(headers: Headers): boolean`
  - `withOwner(req: Request, handler: (ctx: { userId: string; settings: LabSettings }) => Promise<Response>, deps?: OwnerDeps): Promise<Response>` — 404 unless owner; for non-GET also same-origin check (403) and rate limit 30/min (429). Errors `{ error: { code, message } }`.
  - `withAgent(req: Request, roles: AgentRole[], handler: (ctx: { role: AgentRole; settings: LabSettings }) => Promise<Response>, deps?: AgentDeps): Promise<Response>` — 404 if no hashes configured; 403 `proxied` if `cameThroughProxy`; 401 on bad/missing token; 403 `wrong_role`; rate limit 120/min per role.
  - `labError(status: number, code: string, message: string): Response`

- [ ] **Step 1: Write failing tests**
  - `settings.test.ts`: `ownerIds` null when unset, empty, or any entry not a uuid; lowercases ids; `isLabOwner` false for null user and when `ownerIds` null; token hash accepted only as 64 lowercase hex, otherwise that role is absent; `runpodKey` null when empty.
  - `agent-auth.test.ts`: token `"t1"` with `LAB_ADVISOR_TOKEN_SHA256=sha256("t1")` ⇒ `"advisor"`; wrong token ⇒ null; missing/`Basic` header ⇒ null; same token configured for both roles ⇒ null (refuse ambiguity); `cameThroughProxy` true for each of `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto`, `forwarded`, `tailscale-user-login`, `tailscale-funnel-request` (case-insensitive), false for a bare request; `withAgent` with a valid advisor token plus `x-forwarded-for` ⇒ 403; valid executor token on an advisor-only route ⇒ 403; `withOwner` with injected `getUser` returning a non-owner ⇒ 404, owner POST without matching `Origin` ⇒ 403.
- [ ] **Step 2:** `npm run test:lab` — expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules. `withOwner`'s default `getUser` lazy-imports `getAuthenticatedUser` from `@/lib/api-helpers` (so tests don't load the DB). Same-origin rule: `Origin` host must equal `Host` or `new URL(NEXTAUTH_URL).host`.
- [ ] **Step 4:** In `src/middleware.ts`, let `/api/lab/agent/` paths through before the session check (same pattern as the webhook exception, with a comment that the route checks its own token).
- [ ] **Step 5:** `npm run test:lab` — expected: PASS. `npx tsc --noEmit` — clean.
- [ ] **Step 6:** Commit `feat(lab): owner gate and agent token auth for the dashboard`.

### Task 3: Time and input validation

**Files:**
- Create: `src/lib/lab/time.ts`, `src/lib/lab/validate.ts`
- Test: `src/lib/lab/time.test.ts`, `src/lib/lab/validate.test.ts`

**Interfaces:**
- Produces:
  - `PACIFIC = "America/Los_Angeles"`
  - `startOfPacificDay(now: Date): Date`
  - `parseEta(input: string, now: Date): Date | null` — `HH:MM` (24 h) = next occurrence in Pacific at or after `now`; otherwise ISO 8601 with offset; anything else null; result more than 30 days ahead ⇒ null.
  - `formatPacificTime(d: Date): string` → `"6:10 PM"`; `formatPacificDate(d: Date): string` → `"Nov 24"`; `formatIn(ms: number): string` → `"1h 40m"` / `"12m"`
  - `type Valid<T> = { ok: true; value: T } | { ok: false; message: string }`
  - `validateRunStart(body: unknown): Valid<{ experiment: string; stage: string; setupId: string; podId: string; capUsd: number }>`
  - `validateProgress(body: unknown, now: Date): Valid<{ pct: number; eta: Date | null }>` (body `{ pct, eta? }`, `pct` integer 0–100)
  - `validateRunEnd(body: unknown): Valid<{ status: "done" | "failed" | "stopped"; note: string | null }>`
  - `validateProtocolPost(body: unknown): Valid<{ experiment: string; title: string; bodyMd: string; revisesId: string | null }>`
  - `validateReportPost(body: unknown): Valid<{ experiment: string | null; title: string; summary: string; html: string }>`
  - `validateDecision(body: unknown): Valid<{ verdict: "accepted" | "rejected"; note: string }>` (note trimmed, non-empty)
  - `validateReply(body: unknown): Valid<{ body: string }>`
  - Limits from Global Constraints; `title` ≤ 200, `summary` ≤ 300, `setupId`/`podId` ≤ 100 chars `[A-Za-z0-9._-]`, `capUsd` > 0 and ≤ 10 000.

- [ ] **Step 1: Write failing tests** (exact cases):
  - `startOfPacificDay(new Date("2026-11-25T05:55:00Z"))` → `2026-11-24T08:00:00Z`; `("2026-07-01T12:00:00Z")` → `2026-07-01T07:00:00Z`; `("2026-03-08T12:00:00Z")` → `2026-03-08T08:00:00Z`; `("2026-11-01T12:00:00Z")` → `2026-11-01T07:00:00Z`.
  - `parseEta("18:10", new Date("2026-11-24T22:00:00Z"))` (2 PM PT) → `2026-11-25T02:10:00Z`; `parseEta("18:10", new Date("2026-11-25T07:50:00Z"))` (11:50 PM PT) → `2026-11-26T02:10:00Z`; `parseEta("2026-11-25T02:10:00-08:00", …)` → that instant; `parseEta("soon", …)` → null; `parseEta("25:00", …)` → null.
  - `formatPacificTime(new Date("2026-11-25T02:10:00Z"))` → `"6:10 PM"`; `formatIn(100*60_000)` → `"1h 40m"`.
  - validators: stage `"Held Out"` rejected with a message naming `stage`; `pct: 101` rejected; decision with note `"   "` rejected; report html of 4 MB + 1 byte rejected with a message containing `4 MB`; experiment `"e9"` rejected.
- [ ] **Step 2:** run — FAIL. **Step 3:** implement with `Intl.DateTimeFormat` (no date library). **Step 4:** run — PASS.
- [ ] **Step 5:** Commit `feat(lab): Pacific time helpers and input validation`.

### Task 4: Protocol rules

**Files:** Create `src/lib/lab/protocols.ts`; Test `src/lib/lab/protocols.test.ts`

**Interfaces:**
- Produces:
  - `type ProtocolStatus = "waiting" | "accepted" | "rejected" | "superseded"`
  - `interface ProtocolRow { id: string; lineageId: string; version: number; status: ProtocolStatus; experimentId: string }`
  - `planRevision(revised: ProtocolRow | null): { version: number; lineageId: string | null; supersedeId: string | null }` — null ⇒ version 1, new lineage; revised waiting ⇒ version+1, same lineage, supersede it; accepted/rejected ⇒ version+1, same lineage, no supersede; superseded ⇒ throws `ProtocolRuleError("revise_superseded")` (revise the newest instead).
  - `checkDecision(p: ProtocolRow): void` — throws `ProtocolRuleError("already_decided")` unless `waiting`.
  - `class ProtocolRuleError extends Error { code: "already_decided" | "revise_superseded" }`
- Note: lineage is a column `lineage_id` (my call, simpler than walking `revises_id`); the row's own id for version 1.

- [ ] **Step 1:** Tests for each branch above, including deciding an `accepted`, `rejected` and `superseded` protocol ⇒ `already_decided`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(lab): protocol revision and decision rules`.

### Task 5: Database tables and store

**Files:**
- Modify: `src/db/schema.ts` (append), generated `drizzle/0007_*.sql`
- Create: `src/lib/lab/store.ts`

**Interfaces:**
- Produces tables (uuid ids `defaultRandom()` except experiments; all timestamps `timestamptz`):
  - `labExperiments` `lab_experiments`: `id text pk` (code), `title text null`, `createdAt`
  - `labRuns` `lab_runs`: `id uuid`, `experimentId → lab_experiments.id`, `stage`, `setupId`, `podId`, `capUsd numeric(10,2)`, `status text` (`running|done|failed|stopped`), `progressPct int null`, `eta null`, `progressAt null`, `startedAt`, `endedAt null`, `endNote null`, `createdBy text` (role). Index on `status`, on `podId`.
  - `labProtocols` `lab_protocols`: `id uuid`, `lineageId uuid`, `version int`, `revisesId uuid null`, `experimentId`, `title`, `bodyMd`, `status text`, `decisionNote null`, `decidedAt null`, `seenByAdvisorAt null`, `createdAt`. Unique `(lineageId, version)`.
  - `labReports` `lab_reports`: `id uuid`, `experimentId null`, `title`, `summary`, `html`, `createdAt`, `readAt null`.
  - `labReportReplies` `lab_report_replies`: `id uuid`, `reportId → lab_reports.id on delete cascade`, `body`, `createdAt`, `seenByAdvisorAt null`.
- `store.ts` (all take `db: Database` first; rows returned as plain objects with `Date`s):
  - `ensureExperiment(db, code, title?: string | null): Promise<void>` (insert if missing; set title when given)
  - `startRun(db, input, role): Promise<{ id: string }>`; `listRunningRuns(db)`; `updateProgress(db, id, pct, eta, now)`; `endRun(db, id, status, note, now)` — the last two return `false` when no running run has that id
  - `listRunsForOverview(db, since: Date)` — every run of each experiment that has a running run or a run ended after `since` (so an experiment's older stages still count), joined with experiment titles
  - `createProtocol(db, input, plan: ReturnType<typeof planRevision>)` (in a transaction: insert, mark superseded, set `lineageId` = own id for v1); `getProtocol(db, id)`; `listProtocolsForBoard(db)` (waiting all; accepted/rejected newest 20 each; plus previous version's note for cards); `decideProtocol(db, id, verdict, note, now)` (UPDATE … WHERE status='waiting', returns whether a row changed)
  - `createReport`, `listReportsForBoard(db)` (each with latest reply excerpt and unread flag), `getReportHtml(db, id)`, `markReportRead(db, id, now)`, `addReply(db, id, body)`
  - `takeInbox(db, all: boolean, now)`: decided protocols and replies with `seenByAdvisorAt` null (or all when `all`), oldest first; sets `seenByAdvisorAt = now` for those returned.

- [ ] **Step 1:** Add tables; run `npm run db:generate` — expected: one new migration creating the five tables and nothing else (inspect the SQL).
- [ ] **Step 2:** Implement `store.ts`. `npx tsc --noEmit` — clean.
- [ ] **Step 3:** Apply locally: `npm run db:migrate` — expected: success. (Store is exercised end to end in Task 12.)
- [ ] **Step 4:** Commit `feat(lab): tables and store for runs, protocols and reports`.

### Task 6: RunPod client, spend and overview assembly

**Files:**
- Create: `src/lib/lab/runpod.ts`, `src/lib/lab/spend.ts`, `src/lib/lab/overview.ts`, `src/lib/lab/types.ts`
- Test: `src/lib/lab/spend.test.ts`, `src/lib/lab/overview.test.ts`, `src/lib/lab/runpod.test.ts`

**Interfaces:**
- `runpod.ts`:
  - `interface RunpodPod { id: string; name: string; status: string; costPerHr: number; startedAt: Date | null }` (from `/pods`: `id`, `name`, `status` e.g. `RUNNING`/`EXITED`, `cost`, `startedAt`)
  - `interface BillingBucket { startTime: Date; endTime: Date; totalAmount: number; podId?: string }`
  - `createRunpodClient(key: string, fetchImpl = fetch): { pods(): Promise<RunpodPod[]>; accountHours(start: Date, end: Date): Promise<BillingBucket[]>; podHours(start: Date, end: Date): Promise<BillingBucket[]> }` — `GET /billing?bucketSize=hour&startTime&endTime` and `GET /billing/pods?…` (both params always together); follows `pagination.nextCursor` on `/pods`; throws `RunpodError` on non-2xx with status.
  - `getRunpodSnapshot(key: string, now: Date, since: Date): Promise<RunpodSnapshot | { error: string }>` — cached in module memory for 30 s keyed by minute; `RunpodSnapshot = { pods; accountHours (from startOfPacificDay); podHours (from since floored to the hour) }`.
- `spend.ts`:
  - `spentToday(hours: BillingBucket[], pods: RunpodPod[], now: Date): { billed: number; accruing: number }` — `billed` = sum of `totalAmount`; `accruing` = Σ running pods `costPerHr × (now − max(lastBilledEnd, startedAt, dayStart))/h`, where `lastBilledEnd` = latest `endTime` in `hours` (or day start if none).
  - `podCost(podId: string, podHours: BillingBucket[], pod: RunpodPod | undefined, now: Date): { billed: number; accruing: number }` — same rule per pod.
- `types.ts` (shared with the client):
  - `OverviewDTO = { runpod: "ok" | "not_connected" | "error"; podsRunning: number | null; podsRunningLabel: string; spent: { billed: number; accruing: number } | null; next: { at: string; label: string } | null; experiments: ExperimentRow[] }`
  - `ExperimentRow = { id: string; title: string | null; summary: string; progressPct: number | null; eta: string | null; cost: number; expanded: boolean; pods: PodRow[] }` and `PodRow = { kind: "run" | "unassigned"; runId: string | null; stage: string; setupId: string | null; podId: string; capUsd: number | null; cost: number; status: "running" | "done" | "failed" | "stopped" | "pod_gone" | "unassigned"; progressPct: number | null; eta: string | null; staleMinutes: number | null; endedAt: string | null }` (ISO strings).
- `overview.ts`: `buildOverview(input: { runs: OverviewRun[]; snapshot: RunpodSnapshot | null; runpodState: OverviewDTO["runpod"]; now: Date }): OverviewDTO`
  - Stage summary: group runs by `(experiment, stage)`, the latest `startedAt` wins; summary text `"2 done · 1 running · 1 failed"` (omit zero parts; order done, running, failed, stopped — as in the spec); if exactly one running run in the experiment, `progressPct` = its pct.
  - Experiment ETA = latest ETA among its running runs; `next` = earliest ETA among all running runs, label `"in 1h 40m · E9 held-out"`.
  - `pod_gone`: run `running` and its `podId` not in `snapshot.pods` (only when `runpodState === "ok"`).
  - Unassigned: any snapshot pod whose id is not the `podId` of a `running` run, status `RUNNING` or (`EXITED` and still listed — still billing disk); grouped under a synthetic experiment row `{ id: "—", title: "Unassigned pods" }` placed first.
  - `staleMinutes` = minutes since `progressAt` when running and > 20, else null.
  - `expanded` = has a running run. Experiments ordered: running first, then by most recent activity.
  - `podsRunning` = count of snapshot pods with status `RUNNING`; label = comma list of `"E9 held-out"` / pod name for unassigned.

- [ ] **Step 1: Write failing tests**
  - `spend.test.ts`: buckets 08:00–09:00Z $1.00 and 09:00–10:00Z $0.50, one running pod $0.60/h started 07:00Z, now 10:30Z ⇒ `{ billed: 1.5, accruing: 0.3 }`; no buckets, pod started 09:00Z, day start 08:00Z, now 09:30Z ⇒ accruing 0.3; stopped pod contributes no accrual.
  - `overview.test.ts`: E9 with runs dev-a done, dev-b done, held-out running 62% ETA, llama-gemma failed ⇒ summary `"2 done · 1 running · 1 failed"`, experiment ETA = held-out ETA; stage re-run (failed then running) counts once as running; running run whose pod is missing ⇒ `pod_gone`; snapshot pod not claimed ⇒ appears under "Unassigned pods" with its cost; `runpodState "not_connected"` ⇒ `podsRunning` null, `spent` null, no `pod_gone`; progress 42 min old ⇒ `staleMinutes: 42`; no running runs ⇒ `next` null.
  - `runpod.test.ts`: fake `fetchImpl` asserts `Authorization: Bearer k`, both `startTime` and `endTime` present, parses `cost` → `costPerHr`; non-2xx ⇒ `RunpodError` with status; client exposes no method other than the three reads.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Smoke against the real API (reads only): `npx tsx --env-file=.env -e 'import("./src/lib/lab/runpod.ts").then(async m=>{const s=await m.getRunpodSnapshot(process.env.RUNPOD_API_KEY,new Date(),new Date(Date.now()-864e5));console.log("pods",s.pods?.length,"hours",s.accountHours?.length)})'` — expected: numbers, no error.
- [ ] **Step 6:** Commit `feat(lab): RunPod reads, spend and the overview model`.

### Task 7: Agent API routes

**Files:** Create under `src/app/api/lab/agent/`:
- `protocols/route.ts` POST (advisor) → validate, `getProtocol(revisesId)` if given (404 if unknown), `planRevision`, `ensureExperiment`, `createProtocol` ⇒ 201 `{ id, version }`; `ProtocolRuleError` ⇒ 409 with code
- `reports/route.ts` POST (advisor) → 201 `{ id }`; body over 4 MB ⇒ 413 (check `content-length` first, then validator)
- `inbox/route.ts` POST (advisor) body `{ all?: boolean }` → 200 `{ items: InboxItem[] }` where `InboxItem = { kind: "decision"; protocolId; experiment; title; version; verdict; note; decidedAt } | { kind: "reply"; reportId; reportTitle; body; createdAt }`
- `runs/route.ts` POST (executor) → `ensureExperiment`, `startRun` ⇒ 201 `{ id }`; a second running run with the same `podId` ⇒ 409 `pod_in_use`. GET (executor) → `{ runs: [{ id, experiment, stage, podId, progressPct, eta }] }`
- `runs/[id]/progress/route.ts` POST (executor) → 200; unknown or not running ⇒ 404
- `runs/[id]/end/route.ts` POST (executor) → 200; unknown or not running ⇒ 404

All: `export const dynamic = "force-dynamic"`, wrapped in `withAgent`, validation failures ⇒ 400 `{ error: { code: "invalid", message } }`.

- [ ] **Step 1:** Implement the six handlers (logic lives in Tasks 2–5; handlers only wire).
- [ ] **Step 2:** `npx tsc --noEmit` clean; `npm run test:lab` still PASS.
- [ ] **Step 3:** Commit `feat(lab): agent API for protocols, reports, inbox and runs`. (Exercised end to end in Task 12.)

### Task 8: Owner API routes and the report frame headers

**Files:**
- Create: `src/lib/security-headers.ts`, test `src/lib/lab/security-headers.test.ts`
- Modify: `next.config.ts` (use `securityHeaders()`)
- Create under `src/app/api/lab/`: `access/route.ts` GET (200 `{}` for owner, else 404), `overview/route.ts` GET (store with `since` = now − 7 days + `getRunpodSnapshot` + `buildOverview`; snapshot failure ⇒ `runpod: "error"` and agent data still returned), `protocols/route.ts` GET, `protocols/[id]/decision/route.ts` POST (409 `already_decided` when `decideProtocol` changes nothing), `reports/route.ts` GET, `reports/[id]/read/route.ts` POST, `reports/[id]/replies/route.ts` POST, `reports/[id]/html/route.ts` GET

**Interfaces:**
- `REPORT_HTML_PATH = "/api/lab/reports/:id/html"`; `REPORT_FRAME_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-ancestors 'self'"`
- `securityHeaders(isDev: boolean): { source: string; headers: { key: string; value: string }[] }[]` — first entry `source: "/((?!api/lab/reports/[^/]+/html$).*)"` with today's headers unchanged; second entry `source: REPORT_HTML_PATH` with the same headers except: no `X-Frame-Options`, CSP = `REPORT_FRAME_CSP`.
- The html route itself also sets `Content-Type: text/html; charset=utf-8`, `Content-Security-Policy: REPORT_FRAME_CSP`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.
- Protocol/report board DTOs added to `types.ts`: `ProtocolCard = { id; experiment; title; version; status; excerpt; note: string | null; previousNote: string | null; createdAt; decidedAt: string | null }`, `ProtocolDetail = ProtocolCard & { bodyMd: string; previous: { version: number; status: ProtocolStatus; note: string | null } | null }` (GET `/api/lab/protocols?id=` returns one detail), `ReportCard = { id; experiment: string | null; title; summary; createdAt; read: boolean; replies: { body: string; createdAt: string }[] }`. Columns are derived on the client from `status` / `read` / `replies.length`.

- [ ] **Step 1: Failing test** `security-headers.test.ts`: the first entry's regex (compiled from `source`) does not match `/api/lab/reports/abc/html` and does match `/planner` and `/api/lab/reports`; the second entry has no `X-Frame-Options` and its CSP contains `sandbox allow-scripts` and `default-src 'none'` and not `allow-same-origin`; the first entry still has `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- [ ] **Step 2:** FAIL. **Step 3:** implement and wire `next.config.ts`; implement the routes. **Step 4:** PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(lab): owner API and a sandboxed frame for report HTML`.

### Task 9: The `lab` CLI and the `lab-reporting` skill

**Files:**
- Create: `tools/lab/lab.mjs` (Node ≥ 20, no dependencies, `#!/usr/bin/env node`, executable), `tools/lab/lab.test.mjs`, `tools/lab/SKILL.md`

**Interfaces:**
- Commands exactly as in spec §5 plus `lab run list`. `protocol post` reads the file and sends `{ experiment, title, bodyMd, revisesId }`; `report post` sends `{ experiment, title, summary, html }`; `inbox [--all]`.
- Exports for tests: `parseCommand(argv: string[]): { method: "GET" | "POST"; path: string; body?: object; file?: string } | { error: string }`, `formatResult(command: string, status: number, json: unknown): { text: string; exitCode: number }`.
- Token: read from `LAB_TOKEN_FILE` (default `~/.config/lab/token`); refuse to run if the file is group/world readable (`mode & 0o077`), message says `chmod 600`.
- Output: one line on success (e.g. `protocol posted: 3f2… (E10 v2, waiting for the owner)`; `inbox`: one block per item, `nothing new` when empty); on error `lab: <server message>` and exit 1; connection refused ⇒ `lab: Runekeeper is not reachable at <LAB_URL>`.

- [ ] **Step 1: Failing tests:** `parseCommand(["run","start","--experiment","E9","--stage","held-out","--setup","fs-e9h-a02","--pod","abc","--cap","15"])` ⇒ POST `/api/lab/agent/runs` with `capUsd: 15`; missing `--pod` ⇒ error naming `--pod`; `["run","progress","r1","62","--eta","18:10"]` ⇒ POST `/api/lab/agent/runs/r1/progress` body `{ pct: 62, eta: "18:10" }`; `["protocol","post","p.md","--experiment","E10","--title","T","--revises","x"]` ⇒ file `p.md`, `revisesId: "x"`; `formatResult("inbox",200,{items:[]})` ⇒ `nothing new`, exit 0; `formatResult(any,409,{error:{message:"m"}})` ⇒ `lab: m`, exit 1.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Write `SKILL.md` (frontmatter `name: lab-reporting`, `description:` one line: when posting protocols, reports, or pod run status to the owner's Lab dashboard). Body, short, with these rules verbatim in substance: advisor — post every protocol with `lab protocol post` before asking the owner, revise with `--revises <id>`, reports are one self-contained HTML file (plots inline as SVG/PNG data or inlined JS; no external URLs; ≤ 4 MB), run `lab inbox` before revising or starting new work; executor — `lab run start` the moment a pod is created, `lab run end` when it is deleted or fails, **an accepted protocol is not the go: start a pod only after the owner's own typed line in your pane**; poller — `lab run list` to find runs, `lab run progress` at least every 10 minutes while running. Include install steps for the owner (copy `lab.mjs` onto `PATH` as `lab`, token file `chmod 600`, skill into the agents' skills directory).
- [ ] **Step 6:** Commit `feat(lab): lab CLI and the lab-reporting skill`.

### Task 10: UI shell and Overview

**Files:**
- Create: `src/components/lab/lab-view.tsx`, `src/components/lab/use-lab.ts`, `src/components/lab/overview.tsx`, `src/components/lab/lab.css`
- Modify: `src/app/planner/planner-shell.tsx` (import `LabView`, `useLabAccess`; restore `showLab={labEnabled}` and `{currentView === "lab" && labEnabled && <LabView />}`)

**Interfaces:**
- `use-lab.ts`: `useLabAccess(): boolean | undefined` (GET `/api/lab/access`); `usePolled<T>(url: string, ms: number): { data: T | null; error: string | null; refresh(): void }` (pauses while `document.hidden`); `postJson(url: string, body: object): Promise<void>` (throws `Error(message)` from `{ error: { message } }`).
- `lab-view.tsx`: `.lab-root` container; tabs `Overview · Protocols · Reports`; Protocols tab shows a count only when waiting > 0, Reports only when unread > 0 (counts from the two board GETs, polled every 60 s); active tab kept in `localStorage` key `lab.tab` (try/catch).
- `overview.tsx`: renders `OverviewDTO` exactly as spec §6 layout A, polled every 30 s:
  - Three figures. Spent subtitle: `since 12:00 AM PT` or, when `accruing > 0`, `since 12:00 AM PT · includes ~$X still accruing`. `runpod: "not_connected"` ⇒ the three figures are replaced by one dim line `RunPod not connected`; `"error"` ⇒ `RunPod didn't answer · showing what the agents reported`.
  - Table columns Experiment / Progress / ETA / Cost; experiment rows toggle; pod rows: stage, setup id (hidden below 640 px), status or bar + pct, ETA, `$cost / $cap`; tapping a pod row reveals one detail line `pod <podId>` (plus `ended <time>` / end note if any). `pod_gone` in warn colour `Pod gone`; stale ⇒ `updated 42m ago` dim after the pct.
  - Empty: `No experiments yet.` (one line).

- [ ] **Step 1:** Implement. **Step 2:** `npx tsc --noEmit` clean.
- [ ] **Step 3:** Verify visually with `npm run dev` signed in as an owner (set `LAB_OWNER_USER_IDS` in `.env` to your local user id): Overview renders, RunPod figures show live numbers, no console errors; at 390 px width no horizontal scroll.
- [ ] **Step 4:** Commit `feat(lab): dashboard shell and overview`.

### Task 11: Protocol and report boards, modal, markdown

**Files:**
- Create: `src/components/lab/board.tsx` (generic three-column board), `src/components/lab/doc-modal.tsx`, `src/components/lab/protocols-board.tsx`, `src/components/lab/reports-board.tsx`, `src/components/lab/lab-markdown.tsx`
- Modify: `package.json` (add `react-markdown@^9`, `remark-gfm@^4`)

**Interfaces:**
- `Board<T>({ columns: { key: string; title: string; dot: string; items: T[] }[]; renderCard: (item: T) => ReactNode; onOpen: (item: T) => void })` — columns stack below 768 px in the given order.
- `DocModal({ title, meta, onClose, children, footer })` — near full screen ≥ 768 px, full screen below; Esc and ✕ close; focus trapped; body scroll locked.
- `LabMarkdown({ source })` — `react-markdown` + `remark-gfm`, **no** `rehype-raw` (raw HTML shown as text).
- Protocols: columns `Waiting for you` (warn) / `Accepted` (ok) / `Rejected` (bad); card per spec §6; modal: `revises v1, which you rejected: "…"` line when `previous`, markdown, then decided ⇒ read-only verdict + note; waiting ⇒ `NoteBox` (Task 12) labelled `Your note (required)` and `Accept` / `Reject`, disabled while the trimmed note is empty; on 409 show `Already decided — refreshed.` and refetch.
- Reports: columns `Unread` (accent) / `Read` (dim) / `Replied` (faint); opening POSTs `/read`; modal body is `<iframe sandbox="allow-scripts" src="/api/lab/reports/<id>/html" title=…>` filling the modal; under it the replies (oldest first) and `NoteBox` labelled `Thoughts for the advisor (optional)` with `Send`.

- [ ] **Step 1:** `npm install react-markdown@^9 remark-gfm@^4`. **Step 2:** implement.
- [ ] **Step 3:** `npx tsc --noEmit` clean.
- [ ] **Step 4:** Manual escape check: post (Task 12 CLI or curl) a report whose HTML contains `<script>document.body.append(String(document.cookie)); fetch("/api/lab/overview").then(()=>document.body.append("FETCHED")).catch(()=>document.body.append("BLOCKED"))</script><img src="https://example.com/x.png">` plus an inline SVG. Expected in the modal: empty cookie string, `BLOCKED`, no network request to example.com in DevTools, SVG visible.
- [ ] **Step 5:** Commit `feat(lab): protocol and report boards with a sandboxed report view`.

### Task 12: Dictation, then end-to-end check

**Files:** Create `src/components/lab/note-box.tsx`, `src/components/lab/use-dictation.ts`; Modify `handoff.md`

**Interfaces:**
- `useDictation(onText: (finalText: string) => void): { supported: boolean; listening: boolean; interim: string; start(): void; stop(): void }` — `window.SpeechRecognition ?? window.webkitSpeechRecognition`, `lang = navigator.language`, `continuous = true`, `interimResults = true`; final results call `onText`; errors stop listening silently except `not-allowed` ⇒ `interim` cleared and a one-line `Microphone blocked` hint.
- `NoteBox({ label, value, onChange, required?: boolean })` — textarea + mic button (hidden when `!supported`); final text appended with a separating space; interim text shown dim below the textarea.

- [ ] **Step 1:** Implement; `npx tsc --noEmit` clean.
- [ ] **Step 2: End to end on local dev.** Generate two tokens, put their hashes in `.env`, restart `npm run dev`, then with `LAB_URL=http://127.0.0.1:3000`:
  1. advisor: `lab protocol post p.md --experiment E10 --title "Cross-family steering"` ⇒ card in Waiting.
  2. advisor: same with `--revises <id>` ⇒ v1 gone from the board, v2 waiting.
  3. owner: Accept disabled until a note is typed (and dictated, in Chrome); accept ⇒ card in Accepted; second click from a stale tab ⇒ `Already decided`.
  4. advisor: `lab inbox` ⇒ the verdict and note once; again ⇒ `nothing new`.
  5. executor: `lab run start … --pod <a real running pod id>` ⇒ row under E10 with live cost; a second real pod not registered ⇒ "Unassigned pods"; `lab run progress <id> 40 --eta 18:10` ⇒ bar, ETA and "Next pod finishes" update; `lab run end <id> --status done`.
  6. advisor: `lab report post r.html …` ⇒ Unread; open ⇒ Read; send thoughts ⇒ Replied; `lab inbox` shows the reply.
  7. advisor token on `runs` ⇒ `lab: …wrong role…`, exit 1; any agent call with header `X-Forwarded-For: 1.2.3.4` via curl ⇒ 403.
- [ ] **Step 3:** Update `handoff.md` "In Progress": replace the old Lab paragraph with 3–4 lines: what the Lab is now, where code lives (`src/lib/lab/`, `src/components/lab/`, `tools/lab/`), env vars, `npm run test:lab`, the spec path.
- [ ] **Step 4:** `npm run test:lab` PASS, `npx tsc --noEmit` clean, `npm run build` succeeds.
- [ ] **Step 5:** Commit `feat(lab): dictation in note boxes; handoff updated`.

### Task 13: Owner-run steps (not done by the implementer)

Listed for the owner; each needs the owner's explicit go-ahead.

- [ ] Merge to `main` (deploys) after reviewing the branch; production `.env.production` gets `LAB_OWNER_USER_IDS`, both token hashes, `RUNPOD_API_KEY` (Read Only); remove the old `LAB_*` lines including `LAB_SOCK_GID`.
- [ ] On the host: put the two tokens in files (`chmod 600`) for the advisor/executor user, install `lab` and the `lab-reporting` skill after reading `SKILL.md`.
- [ ] Funnel check: `curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer $(cat <token file>)" https://<public origin>/api/lab/agent/inbox` ⇒ `403`. Same request to `http://127.0.0.1:3000` ⇒ `200`.
- [ ] Optional cleanup of the old Lab's host leftovers and the local `feat/the-lab` branch.
