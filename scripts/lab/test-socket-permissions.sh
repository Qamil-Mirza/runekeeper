#!/bin/bash
# Verifies the permission model for the Lab Manager socket, using real Linux
# kernel permission checks inside Docker:
#
#   - the socket directory is 2750 and the socket 0660, owned by the manager
#     user and the dedicated socket group;
#   - a process with Runekeeper's container identity (uid 1001) can connect
#     ONLY when it is given the socket group as a supplementary group
#     (compose `group_add`), and not through uid 1001, gid 1001 or "other";
#   - the agent identity cannot connect at all.
#
# The numeric ids are placeholders until the real accounts exist on the host;
# override them with MANAGER_UID / SOCK_GID / AGENT_UID / AGENT_GID. Runekeeper's
# container identity defaults to today's 1001:65533 and can be set with
# RUNEKEEPER_UID / RUNEKEEPER_GID to test a dedicated identity.
#
# This does not touch any running container or the host's /run.
set -euo pipefail

MANAGER_UID="${MANAGER_UID:-61001}"
SOCK_GID="${SOCK_GID:-61003}"
AGENT_UID="${AGENT_UID:-61002}"
AGENT_GID="${AGENT_GID:-61002}"
RUNEKEEPER_UID="${RUNEKEEPER_UID:-1001}"
RUNEKEEPER_GID="${RUNEKEEPER_GID:-65533}"
RK="$RUNEKEEPER_UID:$RUNEKEEPER_GID"
HELPER_IMAGE=node:20-alpine         # prepares the directory and plays the manager
IMAGE="${IMAGE:-node:20-alpine}"   # image the connecting clients run in; set it to
                                   # a built Runekeeper image to test the real one

RUN_ID="lab-socktest-$$"
VOLUME="$RUN_ID-run"
SERVER="$RUN_ID-manager"

cleanup() {
  docker rm -f "$SERVER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$VOLUME" >/dev/null

# Prepare the directory the way the host will: manager-owned, socket group,
# setgid so the socket inherits the group, nothing for "other".
docker run --rm --user 0:0 -v "$VOLUME:/run/lab-manager" "$HELPER_IMAGE" sh -c "
  chown $MANAGER_UID:$SOCK_GID /run/lab-manager && chmod 2750 /run/lab-manager"

# Stand-in manager: runs as the manager uid with an unrelated primary group,
# so the socket gets its group from the setgid directory, as in production.
docker run -d --name "$SERVER" --user "$MANAGER_UID:$MANAGER_UID" --group-add "$SOCK_GID" \
  -v "$VOLUME:/run/lab-manager" "$HELPER_IMAGE" node -e '
    const http = require("http"), fs = require("fs");
    const path = "/run/lab-manager/api.sock";
    try { fs.unlinkSync(path); } catch {}
    process.umask(0o117);
    http.createServer((req, res) => res.end("ok")).listen(path);
  ' >/dev/null

for _ in $(seq 1 50); do
  docker exec "$SERVER" test -S /run/lab-manager/api.sock 2>/dev/null && break
  sleep 0.1
done

echo "== ownership and modes =="
docker exec "$SERVER" stat -c '%a %u:%g %n' /run/lab-manager /run/lab-manager/api.sock

# Prints: OK, or the errno (EACCES, ENOENT, ...).
CLIENT='
  const req = require("http").request(
    { socketPath: "/run/lab-manager/api.sock", path: "/v1/health" },
    (res) => { res.resume(); res.on("end", () => console.log("OK")); });
  req.on("error", (e) => console.log(e.code));
  req.end();'

fail=0
check() {
  local expected="$1" name="$2"; shift 2
  local got
  got="$(docker run --rm -v "$VOLUME:/run/lab-manager" "$@" "$IMAGE" node -e "$CLIENT" 2>&1 | tail -1)"
  if [ "$got" = "$expected" ]; then
    echo "PASS  $name -> $got"
  else
    echo "FAIL  $name -> got $got, expected $expected"
    fail=1
  fi
}

echo "== connect attempts =="
check OK     "runekeeper $RK + group_add $SOCK_GID"            --user "$RK" --group-add "$SOCK_GID"
check EACCES "runekeeper $RK, no group_add"                    --user "$RK"
check EACCES "uid 1001 with gid 1001 (colliding host ids)"     --user 1001:1001
check EACCES "uid 1001:65533 (today's container identity)"     --user 1001:65533
check EACCES "runekeeper $RK + group_add 1001"                 --user "$RK" --group-add 1001
check EACCES "agent identity $AGENT_UID:$AGENT_GID"            --user "$AGENT_UID:$AGENT_GID"
check EACCES "unrelated uid 12345:12345"                       --user 12345:12345

echo "== socket re-created after a manager restart (directory mount) =="
docker restart "$SERVER" >/dev/null
for _ in $(seq 1 50); do
  docker exec "$SERVER" test -S /run/lab-manager/api.sock 2>/dev/null && break
  sleep 0.1
done
sleep 0.3
check OK     "runekeeper identity after manager restart"       --user "$RK" --group-add "$SOCK_GID"
check EACCES "agent identity after manager restart"            --user "$AGENT_UID:$AGENT_GID"

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: all checks passed"
