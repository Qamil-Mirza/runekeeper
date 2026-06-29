# Update-Available Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a passive, dismissible banner when a newer deployment is live, prompting the user to refresh.

**Architecture:** The server stamps each new `/api/events` WebSocket connection with its build version (`app_version` message). A deploy restarts the server, dropping every socket; the existing 3 s auto-reconnect re-delivers the new version. The client records the first version as baseline and shows the banner when a later version differs.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, custom Node `ws` server (`server.ts`), Tailwind 4, Framer Motion, Docker Compose.

## Global Constraints

- **No new test infrastructure.** The repo has no test runner; verification is manual (build + browser). Do not add vitest/jest/etc.
- **Banner copy (verbatim):** `A new version of Runekeeper is available.`
- **Event shape (verbatim):** `{ "type": "app_version", "version": "<string>" }`.
- **Version fallback:** when `process.env.APP_VERSION` is unset, the server reports the literal string `dev`.
- **0px corners:** UI uses `rounded-none` by default; do not add rounded corners (reuse the shared `Button`).
- **Theme tokens:** dark `bg-surface-dim` (#1a1008), gold accents `rgba(212,168,96,*)`, `text-on-surface`, `font-body`, `text-body-md`. Fonts/sizes already defined in `globals.css`.
- **Per-task type check:** `npx tsc --noEmit` must pass. Final integration check: `npm run build`.

---

### Task 1: Server emits `app_version` on `/api/events` connect

**Files:**
- Modify: `server.ts` (inside the `/api/events` `wss.handleUpgrade` callback, around `server.ts:73-79`)

**Interfaces:**
- Consumes: nothing.
- Produces: each `/api/events` client receives, as its first frame, the JSON string `{"type":"app_version","version":"<APP_VERSION or 'dev'>"}`.

- [ ] **Step 1: Send the version frame on connect**

In `server.ts`, inside the `wss.handleUpgrade(req, socket, head, (clientWs) => { ... })` block for `pathname === "/api/events"`, immediately after the `eventConnections.get(user.id)!.add(clientWs);` line (currently `server.ts:78`), add:

```ts
        // Tell the client which build it just connected to. A deploy restarts
        // the server, so a reconnect re-delivers this with a new value, which
        // the client uses to detect that a newer version is live.
        clientWs.send(
          JSON.stringify({ type: "app_version", version: process.env.APP_VERSION || "dev" })
        );
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Verify the frame is sent**

Run the dev server in one terminal: `APP_VERSION=test-v1 npm run dev`
In a browser DevTools console (while signed in, on `/planner`), open the Network tab → WS → `/api/events` connection → Messages. Confirm the first received message is `{"type":"app_version","version":"test-v1"}`.
(If not signed in, the upgrade returns 401 — sign in first.)

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat(server): send app_version on events websocket connect"
```

---

### Task 2: Client `useAppVersion` hook

**Files:**
- Create: `src/hooks/use-app-version.ts`

**Interfaces:**
- Consumes: `useEventSocket(onEvent: (event: Record<string, unknown>) => void)` from `@/hooks/use-event-socket`, and the `app_version` frame from Task 1.
- Produces: `useAppVersion(): { updateAvailable: boolean; dismiss: () => void }`.

- [ ] **Step 1: Create the hook**

Create `src/hooks/use-app-version.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import { useEventSocket } from "@/hooks/use-event-socket";

/**
 * Detects when a newer deployment is live.
 *
 * The server sends an `app_version` frame on every `/api/events` connection.
 * We treat the first version we see as the baseline (the build this tab loaded
 * with). A deploy restarts the server, so the socket reconnects and reports a
 * different version — at which point `updateAvailable` becomes true.
 *
 * `dismiss()` advances the baseline to the version currently advertised, hiding
 * the banner until a *further*, different version arrives.
 */
export function useAppVersion(): { updateAvailable: boolean; dismiss: () => void } {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    if (event.type !== "app_version" || typeof event.version !== "string") return;
    const version = event.version;
    setBaseline((current) => current ?? version); // set once, on first frame
    setLatest(version);
  }, []);

  useEventSocket(handleEvent);

  const dismiss = useCallback(() => {
    setBaseline((current) => latest ?? current);
  }, [latest]);

  const updateAvailable = baseline !== null && latest !== null && latest !== baseline;

  return { updateAvailable, dismiss };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-app-version.ts
git commit -m "feat(hooks): add useAppVersion to detect new deployments"
```

---

### Task 3: `UpdateBanner` component + mount in planner shell

**Files:**
- Create: `src/components/update-banner.tsx`
- Modify: `src/app/planner/planner-shell.tsx` (import + render, near `planner-shell.tsx:208-211`)

**Interfaces:**
- Consumes: `useAppVersion()` from Task 2; `Button` from `@/components/ui/button`.
- Produces: `<UpdateBanner />` (default export not used — named export `UpdateBanner`).

- [ ] **Step 1: Create the banner component**

Create `src/components/update-banner.tsx`:

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAppVersion } from "@/hooks/use-app-version";

/**
 * Passive, dismissible banner shown when a newer build is deployed.
 * Bottom-center, above the mobile bottom nav (z-40) and sidebar overlay (z-50).
 */
export function UpdateBanner() {
  const { updateAvailable, dismiss } = useAppVersion();

  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[60] mb-16 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 border border-[rgba(212,168,96,0.35)] bg-surface-dim px-4 py-3 shadow-lg lg:mb-0"
        >
          <svg
            className="h-4 w-4 shrink-0 text-primary"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2l2.4 6.9L21 9.3l-5.2 4.2L17.6 21 12 16.9 6.4 21l1.8-7.5L3 9.3l6.6-.4z" />
          </svg>
          <span className="font-body text-body-md text-on-surface">
            A new version of Runekeeper is available.
          </span>
          <Button
            variant="primary"
            onClick={() => window.location.reload()}
            className="px-4 py-1.5"
          >
            Refresh
          </Button>
          <button
            onClick={dismiss}
            aria-label="Dismiss update notification"
            className="shrink-0 text-on-surface-variant transition-colors duration-200 hover:text-on-surface"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Import the banner in the planner shell**

In `src/app/planner/planner-shell.tsx`, add this import alongside the other component imports (after `planner-shell.tsx:17`, the `OnboardingOverlay` import):

```tsx
import { UpdateBanner } from "@/components/update-banner";
```

- [ ] **Step 3: Render the banner**

In `src/app/planner/planner-shell.tsx`, inside the root `<div className="flex h-dvh overflow-hidden">`, just before its closing `</div>` (immediately after the onboarding `AnimatePresence` block at `planner-shell.tsx:209-211`), add:

```tsx
      {/* New-deployment notice */}
      <UpdateBanner />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 5: Verify the banner renders (temporary trigger)**

The banner won't trigger in normal dev (single stable version). To visually confirm rendering, temporarily change the hook's last line in `src/hooks/use-app-version.ts` to `const updateAvailable = true;`, run `npm run dev`, load `/planner`, and confirm the banner appears bottom-center with Refresh + ✕ and clears the mobile bottom nav. **Then revert that line** back to:
`const updateAvailable = baseline !== null && latest !== null && latest !== baseline;`

- [ ] **Step 6: Commit**

```bash
git add src/components/update-banner.tsx src/app/planner/planner-shell.tsx
git commit -m "feat(ui): add update-available banner to planner shell"
```

---

### Task 4: Version source — Docker build arg through deploy

**Files:**
- Modify: `Dockerfile` (runner stage, after `ENV NODE_ENV=production` near `Dockerfile:27`)
- Modify: `docker-compose.prod.yml` (`app.build.args`)
- Modify: `deploy.sh` (after `git pull origin main`, around `deploy.sh:8`)

**Interfaces:**
- Consumes: git short SHA at deploy time.
- Produces: `process.env.APP_VERSION` set to that SHA in the running container (read by Task 1).

- [ ] **Step 1: Accept `APP_VERSION` in the runner stage**

In `Dockerfile`, in the `runner` stage, immediately after the existing `ENV NODE_ENV=production` line (the one in the `runner` stage, `Dockerfile:27`), add:

```dockerfile
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
```

- [ ] **Step 2: Forward the build arg in compose**

In `docker-compose.prod.yml`, under `services.app.build.args`, add a line alongside the existing args:

```yaml
        APP_VERSION: "${APP_VERSION:-dev}"
```

The `args` block then reads:

```yaml
      args:
        NEXT_PUBLIC_WS_PORT: "8443"
        NEXT_PUBLIC_GOGGINS_CALLS_ENABLED: "${NEXT_PUBLIC_GOGGINS_CALLS_ENABLED:-false}"
        APP_VERSION: "${APP_VERSION:-dev}"
```

- [ ] **Step 3: Export the SHA in deploy.sh**

In `deploy.sh`, immediately after the `git pull origin main` line (`deploy.sh:8`), add:

```sh
# Stamp the build with the deployed commit so the app can detect new versions.
export APP_VERSION="$(git rev-parse --short HEAD)"
echo "==> Building APP_VERSION=$APP_VERSION"
```

(Compose interpolates `${APP_VERSION}` from the exported shell variable when it runs `docker compose ... up -d --build` later in the script.)

- [ ] **Step 4: Validate compose config resolves the arg**

Run: `APP_VERSION=abc123 docker compose -f docker-compose.prod.yml config 2>/dev/null | grep -A6 'args:'`
Expected: the rendered `args` section shows `APP_VERSION: abc123`.
(If Docker is unavailable in the working environment, skip this and rely on Task 5's run-based check.)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.prod.yml deploy.sh
git commit -m "feat(deploy): stamp APP_VERSION (git sha) into the runtime image"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: Tasks 1-3 (Task 4's plumbing is exercised in prod; dev simulates it via the `APP_VERSION` env var).

- [ ] **Step 1: Start at version 1**

Run: `APP_VERSION=v1 npm run dev`
Sign in and open `/planner`. Confirm (DevTools → Network → WS → `/api/events` → Messages) the first frame is `{"type":"app_version","version":"v1"}` and **no banner is shown**.

- [ ] **Step 2: Simulate a deploy**

Stop the dev server (Ctrl-C) and restart with a different version:
Run: `APP_VERSION=v2 npm run dev`

- [ ] **Step 3: Confirm the banner appears**

Without reloading the browser, wait up to ~3 s for the WS auto-reconnect. Confirm:
- The reconnected socket's first frame is `{"type":"app_version","version":"v2"}`.
- The banner slides in bottom-center with the exact copy `A new version of Runekeeper is available.`

- [ ] **Step 4: Confirm dismiss and refresh**

- Click **✕** → the banner dismisses and stays gone (no further deploy).
- Reload manually, repeat Steps 1-3, then click **Refresh** → the page reloads and the banner is gone (now running v2 as the new baseline).

- [ ] **Step 5: Confirm dev fallback is silent**

Run plain `npm run dev` (no `APP_VERSION`), restart it once. Confirm the reported version is `dev` both times and the banner never appears.

- [ ] **Step 6: Final integration build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors.

---

## Notes for the executor

- Tasks 1-3 are the functional core and can be verified in dev. Task 4 only takes effect in the Docker/prod deploy path; its correctness is validated by the compose `config` check (Step 4) plus the existing deploy flow.
- The hook opens a **second** `/api/events` socket (the only other consumer, `ChatContainer`, mounts solely on the chat view). This is intentional and supported — the server tracks multiple sockets per user.
- Do not leave the temporary `const updateAvailable = true;` change from Task 3 Step 5 in place; it must be reverted before committing that task.
