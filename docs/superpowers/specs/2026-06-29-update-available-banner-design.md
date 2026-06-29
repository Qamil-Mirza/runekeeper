# Design: "New version available" banner

**Date:** 2026-06-29
**Status:** Approved (pending spec review)

## Problem

After a production deploy, users keep running the previously-loaded bundle until
they manually refresh. There is no signal that a newer version exists, so users
unknowingly use a stale app (observed in practice 2026-06-29).

## Goal

Show a small, passive, dismissible banner when the running deployment is newer
than the version the current tab loaded, prompting the user to refresh. No forced
reloads — the user might have unsaved state (chat draft, in-progress planner edits).

## Approach: reuse the existing WebSocket

The app already has an authenticated WebSocket events channel at `/api/events`
(`src/hooks/use-event-socket.ts`) that **auto-reconnects 3 s after any drop**
(`use-event-socket.ts:39-43`). In the Docker deploy flow a release is a new
container, so the server process restarts, every `/api/events` socket drops, and
each client reconnects automatically. That reconnect is a near-instant,
zero-polling signal that the deployment changed.

Mechanism:

1. Bake a build identifier into the **server runtime** at build time — the git
   short SHA, exposed as `process.env.APP_VERSION`.
2. On every new `/api/events` WebSocket connection, the server sends its version
   as the first message: `{ "type": "app_version", "version": "<sha>" }`.
3. The client records the **first** version it observes as its baseline (the
   version its loaded bundle belongs to). On any later message whose version
   differs from the baseline, a new deployment is live → show the banner.

The client never needs its own version inlined into the bundle; it just remembers
the first thing the server told it and compares.

### Why this over polling a `/api/version` endpoint

- Near-instant detection on deploy (reconnect fires within ~3 s) vs. up to a full
  poll interval of lag.
- Zero periodic network traffic.
- No build-time version inlining into the client bundle.

Tradeoff: coupled to the WS server being reachable. That is already core infra
(voice, OMI triggers depend on it), so this is acceptable.

## Components

### 1. Server — emit `app_version` on connect (`server.ts`)

In the `/api/events` upgrade handler, immediately after the client socket is
established (`server.ts:73-79`), send:

```ts
clientWs.send(JSON.stringify({
  type: "app_version",
  version: process.env.APP_VERSION || "dev",
}));
```

When `APP_VERSION` is unset (local dev), the value is `"dev"`, which is stable
across restarts, so the banner never triggers during development.

### 2. Version source — `Dockerfile`, `docker-compose.prod.yml`, `deploy.sh`

`APP_VERSION` must reach the **runner** stage, because `server.ts` reads it at
runtime (not build time). Follow the existing `NEXT_PUBLIC_WS_PORT` arg pattern.

- **`Dockerfile`** — add `ARG APP_VERSION=dev` and `ENV APP_VERSION=$APP_VERSION`
  in the `runner` stage (so it is present in `process.env` at runtime).
- **`docker-compose.prod.yml`** — under `app.build.args`, add
  `APP_VERSION: "${APP_VERSION:-dev}"` so compose forwards the host's value.
- **`deploy.sh`** — after `git pull origin main`, export the SHA so compose
  interpolation picks it up before `docker compose ... up -d --build`:
  ```sh
  export APP_VERSION="$(git rev-parse --short HEAD)"
  ```

This ties the version string to the exact built image. A redeploy of the same SHA
produces the same version → no spurious banner.

### 3. Client hook — `src/hooks/use-app-version.ts`

A focused hook that owns its own `/api/events` subscription (via the existing
`useEventSocket`) and exposes update state plus a dismiss action:

```ts
export function useAppVersion(): { updateAvailable: boolean; dismiss: () => void }
```

Behavior:
- On each event, ignore anything except `{ type: "app_version" }`.
- First `app_version` seen → store as `baseline`.
- `updateAvailable` is `true` whenever the latest reported version differs from
  `baseline`.
- `dismiss()` advances `baseline` to the latest reported version, so
  `updateAvailable` returns to `false` until a *further*, different version
  arrives (which re-triggers the banner). This cleanly encodes the
  dismiss-then-reappear-on-next-deploy behavior without the component tracking
  versions itself.
- A refresh reloads the page and resets all state.

It opens a **second** `/api/events` WebSocket connection. This is intentional: the
only current `useEventSocket` consumer is `ChatContainer`, which mounts **only
when the chat view is active** (`planner-shell.tsx:177`), so it cannot provide
app-wide coverage. The extra connection is one lightweight socket and keeps the
feature self-contained and independent of the current view. The server already
tracks multiple sockets per user ("tabs"), so a second connection is supported.

### 4. Banner UI — `src/components/update-banner.tsx`

A presentational component driven by `useAppVersion`.

- Renders nothing while `updateAvailable` is false.
- When shown: a fixed banner at **bottom-center** (single position, no
  per-breakpoint switching), animated in with Framer Motion to match existing
  styling. Copy: "A new version of Runekeeper is available." with a **Refresh**
  button (`window.location.reload()`) and a dismiss **✕** that calls `dismiss()`.
- Mounted once in `src/app/planner/planner-shell.tsx` (the persistent shell) so
  it is present regardless of the active view.

## Behavior & edge cases

- **Dismiss:** `dismiss()` advances the baseline to the version currently being
  advertised, hiding the banner. If a *further* deploy lands afterward (a third,
  different SHA), the latest version again differs from the (advanced) baseline,
  so the banner reappears.
- **Multiple tabs:** each tab has its own connection and baseline, so each shows
  the banner independently — correct, since each tab loaded its own bundle.
- **Reconnect without deploy** (transient network blip): server reports the same
  version → no banner.
- **Dev / missing `APP_VERSION`:** server reports `"dev"`; never triggers.
- **Placement rationale:** single fixed position deliberately avoids the
  responsive position-switching complexity flagged in prior modal-layout feedback.

## Out of scope (YAGNI)

- Forced/auto reload or countdown (explicitly rejected — risks losing user state).
- Showing changelog / release notes in the banner.
- Service-worker-based update detection.
- A `/api/version` REST endpoint (the WS path supersedes it).

## Testing

- **Server:** unit-check that the `/api/events` connection handler sends a
  well-formed `app_version` message as its first frame.
- **Client hook:** with a mocked event stream, assert `updateAvailable` stays
  false for the baseline and for repeated identical versions, and flips true when
  a differing version arrives.
- **Manual:** run prod build with `APP_VERSION=a`, load the app, restart the
  server with `APP_VERSION=b`, confirm the banner appears within ~3 s and Refresh
  loads the new build.

## Files touched

- `server.ts` — send `app_version` on `/api/events` connect.
- `Dockerfile` — `ARG`/`ENV APP_VERSION` in runner stage.
- `docker-compose.prod.yml` — forward `APP_VERSION` build arg.
- `deploy.sh` — export git short SHA before build.
- `src/hooks/use-app-version.ts` — new hook.
- `src/components/update-banner.tsx` — new component.
- `src/app/planner/planner-shell.tsx` — mount the banner.
