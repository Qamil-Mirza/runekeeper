#!/bin/bash
# Rehearses the two Runekeeper deployment stages locally, using the REAL
# production compose file and the REAL Lab override, under a throwaway project
# name with its own database volume and its own ports.
#
#   Stage 1  container identity change only (no Lab settings)
#   Stage 4  Lab socket integration (override file, secrets, socket group)
#
# It checks, from inside the running containers, what the deployment steps
# claim: the process identity, ownership and modes of mounted files, signed-in
# sessions, database access, the WebSocket, and the Lab route end to end.
#
# The Lab Manager here is a stand-in that only answers health and an empty lab
# list. This rehearses Runekeeper's side, not the Lab Manager.
#
# Development machines only. It builds an image, starts containers, and
# creates /run/rk-rehearsal inside Docker's Linux VM. Everything is removed on
# exit, including the rehearsal database volume.
set -uo pipefail
cd "$(dirname "$0")/../.."

PROJECT=rk-rehearsal
APP_UID=61010; APP_GID=61010          # Runekeeper container identity
SOCK_GID=61020                        # lab-sock
MANAGER_UID=61001                     # stand-in for lab-manager (host-allocated in production)
AGENT_UID=61002                       # stand-in for lab-agent
VM_DIR=/run/rk-rehearsal              # real Linux paths inside Docker's VM
HELPER=node:20-alpine
APP_URL=http://127.0.0.1:33000
OWNER_ID=11111111-1111-4111-8111-111111111111
OTHER_ID=22222222-2222-4222-8222-222222222222

WORK="$(mktemp -d)"
ENV_FILE="$WORK/env"
BASE=(docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.prod.yml -f scripts/lab/docker-compose.rehearsal.yml)
WITH_LAB=("${BASE[@]}" -f docker-compose.lab.yml)

pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS  $1 -> $3"
  else fail=$((fail+1)); echo "  FAIL  $1 -> got '$3', expected '$2'"; fi
}
section() { echo; echo "== $1 =="; }

vm() { docker run --rm --user 0:0 -v "$VM_DIR:$VM_DIR" "$HELPER" sh -c "$1"; }

cleanup() {
  section "cleanup"
  docker rm -f rk-rehearsal-manager >/dev/null 2>&1
  LAB_SOCK_GID=$SOCK_GID LAB_OWNER_USER_IDS=$OWNER_ID LAB_SOCKET_DIR=$VM_DIR/lab-manager LAB_SECRETS_DIR=$VM_DIR/secrets \
    "${WITH_LAB[@]}" down -v --remove-orphans >/dev/null 2>&1
  docker run --rm --user 0:0 -v /run:/hostrun "$HELPER" rm -rf /hostrun/rk-rehearsal >/dev/null 2>&1
  docker image rm "$PROJECT-app" >/dev/null 2>&1
  rm -rf "$WORK"
  echo "  removed containers, volume, VM directory and image"
}
trap cleanup EXIT

# Throwaway values; none is a real credential.
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
APP_VERSION=rehearsal
EOF

app() { docker exec "$PROJECT-app-1" "$@"; }

wait_for_app() {
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$APP_URL/")" = "200" ] && return 0
    python3 -c 'import time; time.sleep(1)'
  done
  return 1
}

# A session cookie minted the way NextAuth does, with the rehearsal's own
# AUTH_SECRET, for a user that exists in the rehearsal database.
cookie_for() {
  app node -e '
    import("next-auth/jwt").then(async ({ encode }) => {
      const token = await encode({
        token: { userId: process.argv[1], sub: process.argv[1], email: process.argv[2], name: "Rehearsal" },
        secret: process.env.AUTH_SECRET, salt: "authjs.session-token",
      });
      process.stdout.write("authjs.session-token=" + token);
    });' "$1" "$2"
}
status() { # path cookie
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 ${2:+-H "Cookie: $2"} "$APP_URL$1"
}
body() { curl -s --max-time 20 -H "Cookie: $2" "$APP_URL$1"; }

###############################################################################
section "STAGE 1: build and start with the production compose file (identity change only)"
"${BASE[@]}" up -d --build >"$WORK/up1.log" 2>&1 || { tail -20 "$WORK/up1.log"; echo "compose up failed"; exit 1; }
wait_for_app || { docker logs "$PROJECT-app-1" 2>&1 | tail -20; echo "app did not become ready"; exit 1; }

section "container identity"
check "app process uid:gid" "$APP_UID:$APP_GID" "$(app sh -c 'echo $(id -u):$(id -g)')"
check "app supplementary groups" "$APP_GID" "$(app id -G)"
check "files in the image owned by the old uid 1001" "0" "$(app sh -c 'find /app -user 1001 2>/dev/null | wc -l | tr -d " "')"
check "app can write under /app" "no" "$(app sh -c 'touch /app/.w 2>/dev/null && echo yes || echo no')"
check "app can write its temp dir" "yes" "$(app sh -c 'touch /tmp/.w 2>/dev/null && echo yes || echo no')"
check "db container user unchanged (postgres)" "postgres" "$(docker exec "$PROJECT-db-1" stat -c '%U' /proc/1)"
check "db data directory owner unchanged" "postgres" "$(docker exec "$PROJECT-db-1" stat -c '%U' /var/lib/postgresql/data)"
check "app has no bind mounts or volumes" "0" "$(docker inspect -f '{{len .Mounts}}' "$PROJECT-app-1")"

section "database schema and seed (as deploy.sh does, against the rehearsal database)"
DATABASE_URL="postgresql://runekeeper:$PGPW@127.0.0.1:35432/runekeeper" npx drizzle-kit push --force >"$WORK/push.log" 2>&1
check "schema applied" "0" "$?"
docker exec -i "$PROJECT-db-1" psql -q -U runekeeper -d runekeeper >/dev/null <<EOF
insert into users (id, email, name) values
  ('$OWNER_ID', 'owner@rehearsal.test', 'Owner'),
  ('$OTHER_ID', 'other@rehearsal.test', 'Other');
insert into tasks (user_id, title) values ('$OWNER_ID', 'rehearsal quest');
EOF

OWNER_COOKIE="$(cookie_for "$OWNER_ID" owner@rehearsal.test)"
OTHER_COOKIE="$(cookie_for "$OTHER_ID" other@rehearsal.test)"

section "existing functionality under the new identity"
check "landing page" "200" "$(status /)"
check "planner without a session redirects" "302" "$(status /planner)"
check "planner with a session" "200" "$(status /planner "$OWNER_COOKIE")"
check "API without a session" "401" "$(status /api/tasks)"
check "session + database read (/api/user/preferences)" "200" "$(status /api/user/preferences "$OWNER_COOKIE")"
check "database row returned (/api/tasks)" "rehearsal quest" "$(body /api/tasks "$OWNER_COOKIE" | grep -o 'rehearsal quest' | head -1)"
check "database write (create a quest)" "200" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Cookie: $OWNER_COOKIE" -H 'Content-Type: application/json' -d '{"title":"written under new uid"}' "$APP_URL/api/tasks" | sed 's/201/200/')"
check "WebSocket /api/events with a session" "app_version" "$(app node -e '
  const WebSocket = require("ws");
  const ws = new WebSocket("ws://127.0.0.1:3001/api/events", { headers: { Cookie: process.argv[1] } });
  const t = setTimeout(() => { console.log("timeout"); process.exit(0); }, 8000);
  ws.on("message", (m) => { console.log(JSON.parse(m).type); clearTimeout(t); ws.close(); });
  ws.on("error", (e) => { console.log("error " + e.message); clearTimeout(t); });' "$OWNER_COOKIE")"
check "WebSocket without a session is refused" "401" "$(app node -e '
  const WebSocket = require("ws");
  const ws = new WebSocket("ws://127.0.0.1:3001/api/events");
  ws.on("unexpected-response", (_q, res) => { console.log(res.statusCode); process.exit(0); });
  ws.on("open", () => { console.log("opened"); process.exit(0); });
  ws.on("error", () => {});')"
check "Lab is absent without Lab settings (owner session)" "404" "$(status /api/lab/status "$OWNER_COOKIE")"
check "permission errors in the app log" "0" "$(docker logs "$PROJECT-app-1" 2>&1 | grep -ciE 'EACCES|EPERM|permission denied')"

section "exposure to the old colliding identity (outside the container, same host)"
APP_PID="$(docker inspect -f '{{.State.Pid}}' "$PROJECT-app-1")"
probe() { # uid:gid
  docker run --rm --pid=host --cap-drop=ALL --user "$1" "$HELPER" sh -c "
    (tr '\0' '\n' < /proc/$APP_PID/environ) 2>/dev/null | grep -q AUTH_SECRET && e=READ || e=denied
    kill -0 $APP_PID 2>/dev/null && s=allowed || s=denied
    echo \"environ \$e, signal \$s\""
}
check "outside uid 1001 gid 1001"  "environ denied, signal denied" "$(probe 1001:1001)"
check "outside uid 1001 gid 65533" "environ denied, signal denied" "$(probe 1001:65533)"
check "outside agent uid"          "environ denied, signal denied" "$(probe $AGENT_UID:$AGENT_UID)"

###############################################################################
section "STAGE 4: Lab integration with the real override file"
vm "mkdir -p $VM_DIR/lab-manager $VM_DIR/secrets $VM_DIR/mgr &&
    chown $MANAGER_UID:$SOCK_GID $VM_DIR/lab-manager && chmod 2750 $VM_DIR/lab-manager &&
    chown $MANAGER_UID:$MANAGER_UID $VM_DIR/mgr && chmod 700 $VM_DIR/mgr"

TOKEN_A="$(openssl rand -hex 32)"; TOKEN_B="$(openssl rand -hex 32)"
install_token() { # value  (atomic replace on both sides, as the rotation procedure does)
  vm "printf '%s\n' '$1' > $VM_DIR/secrets/.tmp && chown $APP_UID:$APP_GID $VM_DIR/secrets/.tmp && chmod 0400 $VM_DIR/secrets/.tmp && mv $VM_DIR/secrets/.tmp $VM_DIR/secrets/service-token &&
      printf '%s\n' '$1' > $VM_DIR/mgr/.tmp && chown $MANAGER_UID:$MANAGER_UID $VM_DIR/mgr/.tmp && chmod 0400 $VM_DIR/mgr/.tmp && mv $VM_DIR/mgr/.tmp $VM_DIR/mgr/service-token"
}
install_token "$TOKEN_A"
openssl genpkey -algorithm ed25519 -out "$WORK/decision.pem" 2>/dev/null
docker run --rm --user 0:0 -v "$VM_DIR:$VM_DIR" -v "$WORK:/in:ro" "$HELPER" sh -c "
  cp /in/decision.pem $VM_DIR/secrets/decision-private.pem &&
  chown $APP_UID:$APP_GID $VM_DIR/secrets/decision-private.pem && chmod 0400 $VM_DIR/secrets/decision-private.pem &&
  chown $APP_UID:$APP_GID $VM_DIR/secrets && chmod 0500 $VM_DIR/secrets"

# Stand-in Lab Manager: answers health, and an empty lab list only when the
# bearer token matches its own copy of the token file.
docker run -d --name rk-rehearsal-manager --user "$MANAGER_UID:$MANAGER_UID" --group-add "$SOCK_GID" \
  -v "$VM_DIR/lab-manager:/run/lab-manager" -v "$VM_DIR/mgr:/mgr:ro" "$HELPER" node -e '
    const http = require("http"), fs = require("fs");
    const sock = "/run/lab-manager/api.sock";
    try { fs.unlinkSync(sock); } catch {}
    process.umask(0o117);
    const cap = { allowed: false, reason: "agent_isolation_missing" };
    http.createServer((req, res) => {
      const send = (s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
      if (req.url === "/v1/health") return send(200, { status: "ok", apiVersion: "1.0", serviceVersion: "stand-in", degraded: false, reasons: [], capabilities: { executorShell: cap, unattendedExecution: cap, tmuxMode: cap } });
      const token = fs.readFileSync("/mgr/service-token", "utf8").trim();
      if (req.headers.authorization !== "Bearer " + token) return send(401, { error: { code: "unauthenticated", message: "bad token", retryable: false } });
      if (!req.headers["x-lab-actor-id"]) return send(403, { error: { code: "actor_not_allowed", message: "no actor", retryable: false } });
      if (req.url === "/v1/labs") return send(200, { items: [] });
      send(404, { error: { code: "not_found", message: "not found", retryable: false } });
    }).listen(sock);' >/dev/null

export LAB_SOCK_GID=$SOCK_GID LAB_OWNER_USER_IDS=$OWNER_ID LAB_SOCKET_DIR=$VM_DIR/lab-manager LAB_SECRETS_DIR=$VM_DIR/secrets
"${WITH_LAB[@]}" up -d >"$WORK/up2.log" 2>&1 || { tail -20 "$WORK/up2.log"; echo "compose up with the Lab override failed"; exit 1; }
wait_for_app || { docker logs "$PROJECT-app-1" 2>&1 | tail -20; echo "app did not become ready"; exit 1; }
OWNER_COOKIE="$(cookie_for "$OWNER_ID" owner@rehearsal.test)"
OTHER_COOKIE="$(cookie_for "$OTHER_ID" other@rehearsal.test)"

section "identity and mounts as seen inside the app container"
check "app process uid:gid" "$APP_UID:$APP_GID" "$(app sh -c 'echo $(id -u):$(id -g)')"
check "socket group present as a supplementary group" "yes" "$(app sh -c "id -G | tr ' ' '\n' | grep -qx $SOCK_GID && echo yes || echo no")"
check "socket directory owner and mode"  "$MANAGER_UID:$SOCK_GID 2750" "$(app stat -c '%u:%g %a' /run/lab-manager)"
check "socket owner and mode"            "$MANAGER_UID:$SOCK_GID 660"  "$(app stat -c '%u:%g %a' /run/lab-manager/api.sock)"
check "secrets directory owner and mode" "$APP_UID:$APP_GID 500"       "$(app stat -c '%u:%g %a' /run/secrets)"
check "service token owner and mode"     "$APP_UID:$APP_GID 400"       "$(app stat -c '%u:%g %a' /run/secrets/service-token)"
check "decision key owner and mode"      "$APP_UID:$APP_GID 400"       "$(app stat -c '%u:%g %a' /run/secrets/decision-private.pem)"
check "secrets mount is read-only"       "Read-only file system" "$(app sh -c 'touch /run/secrets/x 2>&1 | grep -o "Read-only file system"')"
check "socket mount is read-only"        "Read-only file system" "$(app sh -c 'touch /run/lab-manager/x 2>&1 | grep -o "Read-only file system"')"
check "no Lab secret in the container environment" "0" "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$PROJECT-app-1" | grep -cE "$TOKEN_A|PRIVATE KEY|^LAB_MANAGER_TOKEN=|^LAB_DECISION_KEY=")"
check "app can read its token file" "yes" "$(app sh -c 'test -r /run/secrets/service-token && echo yes || echo no')"

section "the Lab route end to end (session -> owner gate -> token file -> read-only socket mount)"
check "owner: connection status reachable" '"reachable":true' "$(body /api/lab/status "$OWNER_COOKIE" | grep -o '"reachable":true')"
check "owner: lab list (token accepted by the manager)" "200" "$(status /api/lab/labs "$OWNER_COOKIE")"
check "signed-in non-owner" "404" "$(status /api/lab/status "$OTHER_COOKIE")"
check "no session" "401" "$(status /api/lab/status)"

section "token rotation without a restart"
STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$PROJECT-app-1")"
install_token "$TOKEN_B"
check "owner: lab list with the rotated token" "200" "$(status /api/lab/labs "$OWNER_COOKIE")"
check "app container was not restarted" "$STARTED" "$(docker inspect -f '{{.State.StartedAt}}' "$PROJECT-app-1")"

section "fail closed on a badly provisioned secret"
vm "chmod 0440 $VM_DIR/secrets/service-token"
check "token file readable by group -> Lab denied to the owner" "404" "$(status /api/lab/labs "$OWNER_COOKIE")"
vm "chmod 0400 $VM_DIR/secrets/service-token"
check "restored -> Lab works again" "200" "$(status /api/lab/labs "$OWNER_COOKIE")"

section "manager outage and recovery through the directory mount"
docker stop rk-rehearsal-manager >/dev/null
check "manager stopped -> unreachable, not an error page" '"reachable":false' "$(body /api/lab/status "$OWNER_COOKIE" | grep -o '"reachable":false')"
check "manager stopped -> lab list is 503" "503" "$(status /api/lab/labs "$OWNER_COOKIE")"
docker start rk-rehearsal-manager >/dev/null
for _ in $(seq 1 30); do [ "$(body /api/lab/status "$OWNER_COOKIE" | grep -o '"reachable":true')" ] && break; python3 -c 'import time; time.sleep(0.5)'; done
check "manager restarted (socket re-created) -> reachable again" "200" "$(status /api/lab/labs "$OWNER_COOKIE")"

section "other identities given the same mounts"
other() { # uid:gid extra-args... ; prints "secrets <r>, socket <r>"
  local who="$1"; shift
  docker run --rm --user "$who" "$@" -v "$VM_DIR/lab-manager:/run/lab-manager:ro" -v "$VM_DIR/secrets:/run/secrets:ro" "$PROJECT-app" node -e '
    const fs = require("fs"), http = require("http");
    let s; try { fs.readFileSync("/run/secrets/service-token"); s = "READ"; } catch (e) { s = e.code; }
    const req = http.request({ socketPath: "/run/lab-manager/api.sock", path: "/v1/health" }, (res) => { res.resume(); res.on("end", () => console.log("secrets " + s + ", socket OK")); });
    req.on("error", (e) => console.log("secrets " + s + ", socket " + e.code)); req.end();' 2>&1 | tail -1
}
check "runekeeper identity without the socket group" "secrets READ, socket EACCES"   "$(other $APP_UID:$APP_GID)"
check "old identity 1001:65533 with the socket group" "secrets EACCES, socket OK"    "$(other 1001:65533 --group-add $SOCK_GID)"
check "old identity 1001:65533"                      "secrets EACCES, socket EACCES" "$(other 1001:65533)"
check "agent identity"                               "secrets EACCES, socket EACCES" "$(other $AGENT_UID:$AGENT_UID)"

section "existing functionality still works with the Lab enabled"
check "session + database read" "200" "$(status /api/user/preferences "$OWNER_COOKIE")"
check "data written in stage 1 survived the restart" "written under new uid" "$(body /api/tasks "$OWNER_COOKIE" | grep -o 'written under new uid' | head -1)"
check "permission errors in the app log" "0" "$(docker logs "$PROJECT-app-1" 2>&1 | grep -ciE 'EACCES|EPERM|permission denied')"

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
