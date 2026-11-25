# The Lab as a dashboard — design

Date: 2026-11-24 · Branch: `feat/lab-dashboard` (fresh from `main`)

## Intent

The owner runs research with two Claude Code sessions in tmux on the same
host as Runekeeper: an **advisor** (the owner talks to it about direction)
and an **executor** (builds experiments, runs them on RunPod GPUs once the
owner types the go in its pane). The old Lab tried to *run* agents through a
separate Lab Manager service; that service is stopped and is not coming back.

The Lab becomes a place to **look and give feedback**, nothing else:

1. **Overview** — how many pods are running, total RunPod spend today, when
   the next pod should finish (so the owner knows when to check back), and a
   table of experiments with progress, ETA and cost.
2. **Protocols** — the advisor posts experimental protocols; the owner
   accepts or rejects each, always with a note.
3. **Reports** — the advisor posts writeups (HTML, with plots); the owner
   reads them and may send thoughts back.

All times are shown in Pacific time (`America/Los_Angeles`).

## Goals

- At a glance (phone or laptop): pods running, spent today, next finish.
- One row per experiment with a child row per pod run.
- Protocol review with a required note; the advisor can read the verdict.
- Reports rendered with their plots; optional thoughts back to the advisor.
- Free voice dictation into the note and thoughts boxes.
- **Clear, no clutter.** The owner was emphatic. Every element on screen must
  earn its place; when in doubt, leave it out.

## Non-goals

- Starting, stopping or controlling agents or pods. The Lab never writes to
  RunPod and never sends anything into tmux.
- Notifications (phone pings). Checking the dashboard is enough for now.
- Multiple users. The Lab is the owner's alone.
- Keeping any part of the old Lab (Lab Manager client, agent consoles, team
  tree, files, git, approvals, signing, compute broker).

## Anti-goals (would make this a failure even if it works)

- **A dashboard click that spends money.** Accepting a protocol is a *record*,
  not the go. The standing rule is that the executor starts a pod only after
  the owner's own typed line in its pane; nothing in the Lab may bypass that.
- **Hidden spend.** A pod costing money must never be missing from the
  overview because nobody registered it.
- **Numbers that look verified but are guesses.** RunPod's figures and agent
  reports (progress, ETA) come from different places; an ETA is the agent's
  estimate and must read as one.
- **Agent-written code running with the owner's session.** Report HTML is
  written by an agent; it must not be able to reach Runekeeper's cookies, API
  or the network.
- **Clutter.** Badges, chips, meters, secondary panels "because the data is
  there".

## Constraints

- Runekeeper runs in Docker on the same host as the tmux sessions. The app
  container publishes port 3000 on the host's loopback only; a public HTTPS
  origin also fronts it. The agents reach Runekeeper at
  `http://127.0.0.1:3000` (owner: agent traffic must not use the public
  address).
- The repository is **public**. No host names, account names, user ids or
  internal paths in code, comments, commit messages, PR text or this doc.
- Pushing to `main` auto-deploys to production. Work stays on
  `feat/lab-dashboard` until the owner says otherwise.
- Pods run third-party images and are deleted after use, so **no token goes
  on a pod**. Progress is read from pod logs over SSH by a poller on the host
  (or the executor's waiter) and posted from there.
- One experiment spans several pods; each pod normally runs one frozen stage
  (e.g. E9: dev A, dev B, held-out, a Llama/Gemma follow-up; side check A5 on
  its own pod). A pod may later run two jobs approved together; not yet.
- Existing stack: Next.js 15 App Router, React 19, Tailwind 4, Drizzle +
  Postgres, NextAuth v5 (Google). Tests for the old Lab used `tsx --test`.

## Approaches considered

1. **Lab API in Runekeeper, stored in Postgres — chosen.** Agents post through
   a tiny `lab` command (shipped with a skill) that calls Runekeeper with a
   token kept in a file on the host. Input is validated before it is stored;
   history is kept; the advisor reads verdicts with one command. Cost: a token
   to manage and a handful of routes.
2. **Shared folder.** Agents write markdown/JSON into a host folder mounted
   into the container; verdicts written back as files. No token, but the
   container (its own uid) needs write access to a host folder, nothing
   validates what agents write (a bad file shows wrong or blank), and history
   depends on agents not overwriting files.
3. Rejected outright: pods reporting directly (puts a write token on
   third-party images); Runekeeper SSHing to pods itself (pod SSH keys inside
   the container, duplicating what the executor already does).

The owner picked approach 1.

## What gets built

### 1. Remove the old Lab

Delete, on this branch:

- `src/components/lab/`, `src/lib/lab/`, `src/app/api/lab/`
- `docker-compose.lab.yml`, `scripts/lab/`, `docs/lab/contract/`
- the Lab block in `deploy.sh` (the `LAB_SOCK_GID` override), the `LAB_*`
  entries in `.env.example`, the `test:lab` script
- the old Lab wiring in `src/app/planner/planner-shell.tsx` (re-pointed to the
  new view)

Keep: the container's dedicated uid in the `Dockerfile` (deployed, general
hardening, unrelated to the Lab Manager). The local branch `feat/the-lab`
(which holds documents that must never be pushed) is left untouched; the
owner deletes it when ready.

Host-side leftovers of the old Lab (stopped systemd units, the socket group,
the secrets directory) are the owner's to clean up; out of scope here.

### 2. Who can see it

- **Owner gate:** the Lab exists only for user ids in `LAB_OWNER_USER_IDS`
  (comma-separated uuids, fail closed: unset or malformed means no Lab for
  anyone). Same rule as before; the parser is rewritten small in the new code.
  Non-owners never see the nav entry and get 404 from owner routes.
- **Agent routes** (`/api/lab/agent/*`) authenticate with a bearer token, not
  a session. Two tokens, one per role: `advisor` and `executor` (the poller
  uses the executor's). The role is recorded on everything posted.
  Runekeeper stores only SHA-256 hashes of the tokens, in env
  (`LAB_ADVISOR_TOKEN_SHA256`, `LAB_EXECUTOR_TOKEN_SHA256`). Constant-time
  compare. If neither is set, agent routes return 404.
- `src/middleware.ts` currently 401s every `/api/*` without a session; it
  must let `/api/lab/agent/*` through to the route's own token check (like
  the existing webhook exception).
- Agent routes refuse requests that arrived through the public HTTPS proxy
  (owner wants agent traffic on the host only). The public origin is
  Tailscale Funnel in front of `127.0.0.1:3000`; to the container both kinds
  of traffic come from the same address, so the signal is forwarding headers.
  Next.js adds `X-Forwarded-For/-Host/-Proto` to every request itself, so the
  rule only counts what it would not add: a `Forwarded` header, any
  `Tailscale-*` header, `X-Forwarded-Proto` other than `http`, or an
  `X-Forwarded-Host` that is not loopback. `X-Forwarded-For` is ignored. The token is required regardless.
  *(Builder-check call)* This can only be confirmed behind the real Funnel,
  so the plan ends with an owner-run check after deploy: one `curl` to an
  agent route through the public URL must be refused.
- Role permissions: advisor may post protocols and reports and read the
  inbox; executor may register runs, post progress, end runs. Each role gets
  403 on the other's routes.

### 3. Data (Drizzle, new tables)

Names indicative; the builder may adjust.

- `lab_experiments` — `id` (the agents' own code, e.g. `E9`, `A5`; unique),
  `title`, `created_at`. Created implicitly the first time any record names
  an unknown experiment code; the title may be set/updated by a later post.
- `lab_runs` (one per pod run) — `id`, `experiment_id`, `stage`,
  `setup_id` (frozen-setup id), `pod_id` (RunPod), `cap_usd`, `status`
  (`running` | `done` | `failed` | `stopped`), `progress_pct` (0–100, null
  until first report), `eta` (timestamptz, null if unknown),
  `progress_at`, `started_at`, `ended_at`, `end_note`.
- `lab_protocols` — `id`, `experiment_id`, `title`, `version` (1, 2, …
  per lineage), `revises_id` (nullable), `body_md`, `status` (`waiting` |
  `accepted` | `rejected` | `superseded`), `decision_note` (required when decided),
  `decided_at`, `created_at`, `seen_by_advisor_at`.
  *(Builder-check call)* A revision may be posted for a protocol in any
  state. If the version it revises is still `waiting`, that version becomes
  `superseded` (it leaves the board; the newer card links to earlier
  versions). An accepted version stays accepted; the revision goes to
  Waiting. Only one version per lineage can be waiting at a time.
- `lab_reports` — `id`, `experiment_id` (nullable), `title`, `summary`
  (one line for the card), `html`, `created_at`, `read_at`.
- `lab_report_replies` — `id`, `report_id`, `body`, `created_at`,
  `seen_by_advisor_at`.

Size limit for report HTML: **4 MB** (fits a Plotly export with its
library inlined, keeps Postgres rows sane). Larger uploads are refused with a clear message.

### 4. RunPod

- A **Read Only** RunPod API key in env (`RUNPOD_API_KEY`). The Lab never
  calls a write endpoint. If unset, the overview shows the agent-reported
  rows and a single quiet line "RunPod not connected" in place of the three
  figures.
- Runekeeper reads from RunPod **on demand** when the overview is open (no
  background job), cached server-side for ~30 s so several open tabs don't
  multiply calls. The overview refreshes every 30 s while visible.
- What is read: current pods (id, name, status, cost per hour, uptime);
  per-pod billing (for each run's actual cost, including pods that no longer
  exist); aggregate billing across all resource types (for "spent today":
  GPU, storage, network volumes, everything); optionally the balance (not
  shown in v1).
- **Verified 2026-11-24 with the owner's Read Only key:** base URL
  `https://api.runpod.io/v2` (the v1 host `rest.runpod.io` does not resolve).
  `GET /pods` (includes `cost` per hour), `GET /billing/pods`,
  `GET /billing` and `GET /billing/balance` all answer 200 with that key.
  `/billing` accepts `bucketSize=hour` with `startTime` and `endTime` (both
  required together) and splits each bucket into GPU, disk, storage,
  networking, serverless and `totalAmount`. Billed hours lag by about one
  to two hours.
- **Spent today** = sum of `totalAmount` over hourly buckets from 00:00
  Pacific (08:00 or 07:00 UTC depending on daylight time) to now, **plus**
  accrual for running pods since the end of the last billed hour (pod
  `cost` × elapsed). When accrual is included, the subtitle says so
  ("includes ~$1.20 still accruing"). It must never silently mix an estimate
  into a "billed" number.
- **Run cost** = RunPod's per-pod billing for that `pod_id` (+ accrual while
  running). Shown as `$7.12 / $15` (actual / cap).
- **Unassigned pods:** a RunPod pod that exists (running, or stopped and
  still billing storage) and is not matched by any running run's `pod_id` appears as its own row "Unassigned pod `<name>`" with its
  cost, so no spend is hidden.
- **Mismatch:** a run still `running` in the Lab whose pod RunPod no longer
  lists shows status "Pod gone" (warning colour) until the executor ends it.

### 5. The `lab` command and the `lab-reporting` skill

Source lives in this repo (suggested `tools/lab/`): a single-file CLI (bash +
curl, or a small Node script, builder's call) and a `SKILL.md`. The owner
installs them on the host after approving the skill text. The token is read
from a file (path given by env `LAB_TOKEN_FILE`, default under the agent
user's home, mode 0600). Base URL from `LAB_URL`, default
`http://127.0.0.1:3000`.

Commands (exact flags may be tuned by the builder):

| Who | Command | Effect |
|---|---|---|
| advisor | `lab protocol post <file.md> --experiment E10 --title "…" [--revises <id>]` | new protocol, status waiting; prints its id |
| advisor | `lab report post <file.html> --experiment E9 --title "…" --summary "…"` | new report |
| advisor | `lab inbox` | prints every verdict and reply not yet seen, then marks them seen; `--all` reprints history |
| executor | `lab run start --experiment E9 --stage held-out --setup fs-e9h-a02 --pod <podId> --cap 15` | registers a pod run; prints run id |
| executor/poller | `lab run progress <runId> <pct> [--eta <time>]` | updates progress; `--eta` accepts `18:10` (Pacific, today or next occurrence) or ISO 8601 |
| executor/poller | `lab run list` | prints running runs with their ids, pod ids and stages, so a poller can find what to update |
| executor | `lab run end <runId> --status done\|failed\|stopped [--note "…"]` | closes the run |

Every command prints a one-line human result and exits non-zero on error
with the server's message, so a Claude session sees what went wrong.

The skill tells the advisor: post every protocol before asking the owner,
post each report as one self-contained HTML file (plots embedded, no
external URLs), check `lab inbox` before revising a protocol or starting new
work. It tells the executor: register a run the moment a pod is created, end
it when the pod is deleted, and that **an accepted protocol is not the go —
the go is the owner's typed line in the pane**. The progress poller itself is out of scope here (the executor's waiter or a
script the owner sets up); the skill tells whoever runs it to post progress at least every 10 minutes while a run is running.

### 6. Screens

Dark "mission control" palette already used by the old Lab (`--lab-bg
#07090c`, panel `#0c1116`, lines `#1d2732`, text `#e6edf3`, dim `#7f8d9b`,
accent `#38d6ff`, ok `#3ddc97`, warn `#ffb454`, bad `#ff5c6c`); monospaced,
tabular figures for numbers. Three tabs: **Overview · Protocols · Reports**.
The Protocols tab shows a count only when something is waiting; Reports
shows a count of unread. Nothing else in the chrome.

**Overview** (owner chose layout A):

```
 Overview   Protocols (1)   Reports
 ┌───────────────┬──────────────────────┬──────────────────────┐
 │ PODS RUNNING  │ SPENT TODAY          │ NEXT POD FINISHES    │
 │ 2             │ $14.82               │ 6:10 PM              │
 │ E9 held-out·A5│ since 12:00 AM PT    │ in 1h 40m · E9 h-out │
 └───────────────┴──────────────────────┴──────────────────────┘
 EXPERIMENT              PROGRESS               ETA        COST
 ▾ E9 · probe transfer   2 done · 1 failed …    6:10 PM  $31.40
     dev A    fs-e9a-3f1 Done                     —      $9.80 / $12
     held-out fs-e9h-a02 ▓▓▓▓▓▓░░░ 62%          6:10 PM  $7.12 / $15
     Llama/G  fs-e9lg-1d4 Failed 2:41 PM          —      $4.33 / $10
 ▸ A5 · side check       ▓▓▓░░░░░░ 30%          9:45 PM  $2.10
```

- "Next pod finishes" = earliest ETA among running runs; "—" with "no ETA
  reported" if none has one; "Nothing running" if no pods.
- Experiment row: progress summarises its runs by **stage**, not by pod:
  a stage re-run on a new pod is still one stage, and its latest run decides
  its state. Shown as "2 done · 1 running · 1 failed"; no "of N" total,
  because nothing records how many stages are planned *(builder-check call:
  a total would be a guess, which the anti-goals rule out)*. `stage` is a
  short identifier (lowercase, digits, hyphens, e.g. `held-out`), validated
  by the API. A single running run shows its bar; ETA = latest ETA among its
  running runs; cost = sum of its runs.
- Expanded pod row shows stage, frozen-setup id, cap and actual cost,
  status. Pod id appears on tap/click of the pod row (detail line), not as a
  column.
- Experiments with a running run are expanded by default; others collapsed.
- Shown: experiments with a running run, plus those whose last run ended in
  the last 7 days. Older ones are not shown in v1.
- Stale progress: if a running run's last progress is older than 20 min,
  its progress cell adds "updated 42m ago" in dim text.
- Phone: same table, cost and ETA kept, frozen-setup id hidden in pod rows.

**Protocols** — Kanban, three columns: **Waiting for you · Accepted ·
Rejected**. Card: title, version (v2…), one-line description (first
paragraph of the protocol, truncated), for decided cards the start of the
owner's note, for a revision the start of the note on the version it
revises, date. Waiting cards have a faint warning border. Clicking a card
opens a large modal: rendered markdown, "revises v1, which you rejected:
'…'" when applicable, then the note box (required) with mic, then **Accept**
and **Reject**, both disabled until the note is non-empty. Decided protocols
open read-only with the verdict and note. Decisions are final in v1 (no
undo); the advisor posts a new version to change course. Accepted and
Rejected columns show the most recent 20.

**Reports** — Kanban, three columns: **Unread · Read · Replied**. Opening a
card marks it read. Card: title, summary, experiment, date; replied cards
show the start of the latest reply. The modal is large (near full screen on
desktop, full screen on phone) and shows the report HTML in a sandboxed
frame (below), with a "Thoughts for the advisor (optional)" box with mic and
**Send** under the frame. A report can receive several replies; they are
listed under the frame, oldest first.

Phone: columns stack, Waiting/Unread first; modals full screen.

### 7. Rendering report HTML safely

- The HTML is served from an owner-only route (e.g.
  `GET /api/lab/reports/:id/html`) with response headers
  `Content-Security-Policy: sandbox allow-scripts; default-src 'none';
  script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';
  img-src data: blob:; font-src data:` and `X-Content-Type-Options: nosniff`.
- `next.config.ts` sends `X-Frame-Options: DENY` and `frame-ancestors
  'none'` on every route, which would block this frame. The report-HTML
  route is exempted, with `frame-ancestors 'self'` instead; every other
  route keeps the site-wide headers.
- Shown in `<iframe sandbox="allow-scripts">` (never `allow-same-origin`), so
  scripts run in an opaque origin: plots work, but the page can't read
  Runekeeper cookies, call its API, or load anything from the network.
- Reports therefore must be self-contained (plots as inline SVG/PNG data or
  inline JS libraries). The skill says so.
- Protocol markdown is rendered with raw HTML disabled.

### 8. Voice dictation

The browser's built-in speech recognition (Web Speech API,
`SpeechRecognition` / `webkitSpeechRecognition`). Free. Works in Chrome and
Safari, including iPhone. Tap mic to start, tap again to stop; recognised
text is appended to the box for editing before submit. Hidden where the API
does not exist (e.g. Firefox). Note: Chrome sends the audio to Google's
speech service to transcribe; Safari uses Apple's. No server-side cost.
Interim results shown in dim text while speaking.

### 9. Owner-side API (session-authenticated)

`GET /api/lab/overview`, `GET /api/lab/protocols`, `POST
/api/lab/protocols/:id/decision {verdict, note}` (note required, refused if
already decided), `GET /api/lab/reports`, `POST /api/lab/reports/:id/read`,
`POST /api/lab/reports/:id/replies {body}`, `GET
/api/lab/reports/:id/html`. All 404 for non-owners.

## Decided by the owner

- Lab is read-only toward agents and RunPod; dashboard + protocol review +
  reports only.
- Lab Manager is gone; Runekeeper is the backend (approach 1).
- Agents reach Runekeeper on the host only, not via the public address.
- All RunPod pods are research; "spent today" = all RunPod charges, Pacific.
- Row per experiment, child row per pod run, with stage, frozen-setup id,
  pod id, cap, actual cost, status.
- Progress posted from the host (poller/waiter reading logs over SSH); no
  token on pods.
- Accepting a protocol is a record only; the go stays a typed line.
- No notifications for now.
- Agent instructions as a `lab-reporting` skill, written by the builder,
  approved by the owner before install.
- Old Lab deleted; Lab limited to the owner's account.
- Overview layout A; Kanban for protocols and reports; reports as HTML in a
  modal.
- Voice dictation only if free.
- Design must be clear with no clutter.

## Left to the builder

- Exact field names in `/billing/pods` records for matching a run's `pod_id`
  (the key is in local `.env` as `RUNPOD_API_KEY`).
- How to detect requests that came through the public proxy (§2).
- Exact table/column names, CLI implementation language, markdown renderer
  (the old Lab on `feat/the-lab` had `src/lib/lab/markdown.ts`; reuse its
  approach if sound).
- Test framework for new code (follow what the repo uses now).
- Exact copy for empty states (keep them one line).
