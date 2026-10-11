#!/bin/bash
# Rehearses the Stage 1 deployment AND its rollback locally, the way production
# does them: the real production compose file, built from `main` (today's
# image), then from `main` plus the identity commit (what deploy.sh builds
# after the merge), then rolled back.
#
# What it proves:
#   - the identity commit applies cleanly to `main` and changes only the Dockerfile
#   - the backup taken before the deployment is the exact running image, by id
#   - the rollback puts that exact image id back, without building
#   - the database container is never recreated or restarted, the volume is
#     never recreated, and its data survives the deployment and the rollback
#   - a later deploy from an unreverted `main` silently undoes the rollback,
#     and a deploy from a reverted `main` does not
#
# Development machines only. It builds two images and starts containers under
# the throwaway project name `rk-rollback` with its own volume and ports.
# Everything is removed on exit.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

PROJECT=rk-rollback
IDENTITY_COMMIT="${IDENTITY_COMMIT:-91920a8}"
BASE_REF="${BASE_REF:-main}"
IMAGE="$PROJECT-app"                  # production: runekeeper-app
APP_URL=http://127.0.0.1:33000
USER_ID=11111111-1111-4111-8111-111111111111

WORK="$(mktemp -d)"
WT="$WORK/tree"
ENV_FILE="$WORK/env"
COMPOSE=(docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$WT/docker-compose.prod.yml" -f "$REPO/scripts/lab/docker-compose.rehearsal.yml")

pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS  $1 -> $3"
  else fail=$((fail+1)); echo "  FAIL  $1 -> got '$3', expected '$2'"; fi
}
differs() { # name unwanted actual
  if [ "$2" != "$3" ] && [ -n "$3" ]; then pass=$((pass+1)); echo "  PASS  $1 -> $3"
  else fail=$((fail+1)); echo "  FAIL  $1 -> '$3' should differ from '$2'"; fi
}
section() { echo; echo "== $1 =="; }

cleanup() {
  section "cleanup"
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1
  docker image rm "$IMAGE:latest" "$IMAGE:pre-identity" >/dev/null 2>&1
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
  rm -rf "$WORK"
  echo "  removed containers, volume, images and the temporary checkout"
}
trap cleanup EXIT

PGPW="$(openssl rand -hex 16)"
cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$PGPW
AUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=$APP_URL
AUTH_GOOGLE_ID=rehearsal
AUTH_GOOGLE_SECRET=rehearsal
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
GEMINI_API_KEY=rehearsal
EMAIL_NOTIFICATIONS_ENABLED=false
EOF

app() { docker exec "$PROJECT-app-1" "$@"; }
wait_for_app() {
  for _ in $(seq 1 90); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$APP_URL/")" = "200" ] && return 0
    python3 -c 'import time; time.sleep(1)'
  done
  return 1
}
# What deploy.sh runs last, with its version stamp.
deploy() {
  APP_VERSION="$(git -C "$WT" rev-parse --short HEAD)" "${COMPOSE[@]}" up -d --build >"$WORK/up.log" 2>&1 \
    || { tail -20 "$WORK/up.log"; echo "compose up failed"; exit 1; }
  wait_for_app || { docker logs "$PROJECT-app-1" 2>&1 | tail -20; echo "app did not become ready"; exit 1; }
}
# Measures how long the app fails to answer while a step runs.
poll_start() {
  python3 - "$APP_URL/" "$WORK/poll.$1" <<'PY' &
import sys, time, urllib.request
url, out = sys.argv[1], sys.argv[2]
with open(out, "w") as f:
    while True:
        t = time.time()
        try: ok = urllib.request.urlopen(url, timeout=1).status == 200
        except Exception: ok = False
        f.write(f"{t:.3f} {int(ok)}\n"); f.flush()
        time.sleep(0.2)
PY
  POLL_PID=$!
}
poll_stop() { # label
  kill "$POLL_PID" 2>/dev/null; wait "$POLL_PID" 2>/dev/null
  python3 - "$WORK/poll.$1" "$1" <<'PY'
import sys
rows = [l.split() for l in open(sys.argv[1]) if l.strip()]
worst, start, last_ok = 0.0, None, None
for t, ok in rows:
    t = float(t)
    if ok == "1":
        if start is not None: worst = max(worst, t - (last_ok if last_ok is not None else start))
        start, last_ok = None, t
    elif start is None: start = t
print(f"  measured: longest interruption during {sys.argv[2]} = {worst:.1f}s (local machine; indicative only)")
PY
}
# Compose decides whether to replace a container from its own bookkeeping, and
# after a manual retag that decision is not reliable. Make the running
# container match the image the compose file's tag points at.
converge() { # label
  if [ "$(app_image_id)" = "$(docker image inspect -f '{{.Id}}' "$IMAGE:latest")" ]; then
    echo "  note: $1: compose replaced the container by itself"
  else
    echo "  note: $1: compose left the old container running; forcing the replacement"
    "${COMPOSE[@]}" up -d --no-build --no-deps --force-recreate app >"$WORK/converge.log" 2>&1
    wait_for_app
  fi
}
app_identity() { app sh -c 'echo $(id -u):$(id -g)'; }
app_image_id() { docker inspect -f '{{.Image}}' "$PROJECT-app-1"; }
db_container_id() { docker inspect -f '{{.Id}}' "$PROJECT-db-1"; }
db_started() { docker inspect -f '{{.State.StartedAt}}' "$PROJECT-db-1"; }
volume_created() { docker volume inspect -f '{{.CreatedAt}}' "${PROJECT}_pgdata"; }
quest_count() { docker exec "$PROJECT-db-1" psql -tA -U runekeeper -d runekeeper -c "select count(*) from tasks where title = 'kept across rollback'"; }
signed_in_read() {
  local cookie
  cookie="$(app node -e '
    import("next-auth/jwt").then(async ({ encode }) => {
      const token = await encode({
        token: { userId: process.argv[1], sub: process.argv[1], email: "owner@rehearsal.test", name: "Rehearsal" },
        secret: process.env.AUTH_SECRET, salt: "authjs.session-token",
      });
      process.stdout.write("authjs.session-token=" + token);
    });' "$USER_ID")"
  curl -s --max-time 20 -H "Cookie: $cookie" "$APP_URL/api/tasks" | grep -o 'kept across rollback' | head -1
}
db_untouched() { # label
  check "$1: database container not recreated" "$DB_ID" "$(db_container_id)"
  check "$1: database container not restarted" "$DB_STARTED" "$(db_started)"
  check "$1: database volume not recreated" "$VOL_CREATED" "$(volume_created)"
  check "$1: database row still present" "1" "$(quest_count)"
  check "$1: signed-in session reads it through the app" "kept across rollback" "$(signed_in_read)"
}

###############################################################################
section "the commit to deploy"
git worktree add --detach "$WT" "$BASE_REF" >/dev/null 2>&1 || { echo "could not check out $BASE_REF"; exit 1; }
BASE_SHA="$(git -C "$WT" rev-parse --short HEAD)"
echo "  base: $BASE_REF at $BASE_SHA"

section "TODAY: build and run from $BASE_REF (the image production runs now)"
deploy
DATABASE_URL="postgresql://runekeeper:$PGPW@127.0.0.1:35432/runekeeper" npx drizzle-kit push --force >"$WORK/push.log" 2>&1
check "schema applied" "0" "$?"
docker exec -i "$PROJECT-db-1" psql -q -U runekeeper -d runekeeper >/dev/null <<EOF
insert into users (id, email, name) values ('$USER_ID', 'owner@rehearsal.test', 'Owner');
insert into tasks (user_id, title) values ('$USER_ID', 'kept across rollback');
EOF
check "identity before the change" "1001:65533" "$(app_identity)"
DB_ID="$(db_container_id)"; DB_STARTED="$(db_started)"; VOL_CREATED="$(volume_created)"

section "BACKUP (checklist step: record and pin the running image by its id)"
OLD_ID="$(app_image_id)"
echo "  running image id: $OLD_ID"
check "the tag the compose file builds points at the running image" "$OLD_ID" "$(docker image inspect -f '{{.Id}}' "$IMAGE:latest")"
docker image tag "$OLD_ID" "$IMAGE:pre-identity"
check "pre-identity tag is that exact image" "$OLD_ID" "$(docker image inspect -f '{{.Id}}' "$IMAGE:pre-identity")"
docker save "$IMAGE:pre-identity" -o "$WORK/pre-identity.tar"
check "archive written" "0" "$?"

section "DEPLOY: $BASE_REF plus the identity commit, as deploy.sh does after the merge"
git -C "$WT" cherry-pick "$IDENTITY_COMMIT" >/dev/null 2>&1
check "identity commit applies cleanly to $BASE_REF" "0" "$?"
check "files changed relative to $BASE_REF" "Dockerfile" "$(git -C "$WT" diff --name-only "$BASE_SHA" HEAD | tr '\n' ' ' | sed 's/ $//')"
poll_start deploy
deploy
poll_stop deploy
NEW_ID="$(app_image_id)"
check "identity after the change" "61010:61010" "$(app_identity)"
differs "a new image is running" "$OLD_ID" "$NEW_ID"
check "the previous image still exists under its tag" "$OLD_ID" "$(docker image inspect -f '{{.Id}}' "$IMAGE:pre-identity")"
db_untouched "after deploy"

section "RESTORE FROM THE ARCHIVE (as if the tagged image had been pruned)"
docker image rm "$IMAGE:pre-identity" >/dev/null 2>&1
check "tag removed, image no longer resolvable by it" "gone" "$(docker image inspect "$IMAGE:pre-identity" >/dev/null 2>&1 && echo present || echo gone)"
docker load -i "$WORK/pre-identity.tar" >/dev/null 2>&1
check "archive loads" "0" "$?"
check "loaded image is the exact previous image id" "$OLD_ID" "$(docker image inspect -f '{{.Id}}' "$IMAGE:pre-identity" 2>/dev/null)"

section "ROLLBACK: put the exact previous image back, no build, app only"
docker image tag "$OLD_ID" "$IMAGE:latest"
# Retagging alone is not enough: without --force-recreate compose sees an
# unchanged service definition and leaves the new container running.
"${COMPOSE[@]}" up -d --no-build --no-deps app >"$WORK/rollback.log" 2>&1
check "WITHOUT --force-recreate the new image keeps running (the trap)" "$NEW_ID" "$(app_image_id)"
poll_start rollback
"${COMPOSE[@]}" up -d --no-build --no-deps --force-recreate app >"$WORK/rollback.log" 2>&1
check "rollback command succeeded" "0" "$?"
wait_for_app; check "app answers after rollback" "0" "$?"
poll_stop rollback
check "running image is the exact previous image id" "$OLD_ID" "$(app_image_id)"
check "identity after rollback" "1001:65533" "$(app_identity)"
db_untouched "after rollback"

section "HAZARD: a later deploy while main still contains the commit"
deploy
differs "the compose tag no longer points at the previous image" "$OLD_ID" "$(docker image inspect -f '{{.Id}}' "$IMAGE:latest")"
check "the pinned previous image is still there" "$OLD_ID" "$(docker image inspect -f '{{.Id}}' "$IMAGE:pre-identity")"
converge "deploy from unreverted main"
check "identity once the container matches the tag (the change is back)" "61010:61010" "$(app_identity)"
db_untouched "after re-deploy"

section "ROLL BACK AGAIN, then make it durable: revert on main and deploy"
docker image tag "$OLD_ID" "$IMAGE:latest"
"${COMPOSE[@]}" up -d --no-build --no-deps --force-recreate app >"$WORK/rollback.log" 2>&1
wait_for_app
check "running image is the exact previous image id" "$OLD_ID" "$(app_image_id)"
git -C "$WT" revert --no-edit HEAD >/dev/null 2>&1
check "revert applies cleanly" "0" "$?"
check "tree equals $BASE_REF again" "" "$(git -C "$WT" diff --name-only "$BASE_SHA" HEAD)"
deploy
converge "deploy of the revert"
check "identity after deploying the revert" "1001:65533" "$(app_identity)"
check "container runs the image the compose tag points at" "$(docker image inspect -f '{{.Id}}' "$IMAGE:latest")" "$(app_image_id)"
deploy
check "a further deploy from the reverted main keeps the old identity" "1001:65533" "$(app_identity)"
db_untouched "after deploying the revert"

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
