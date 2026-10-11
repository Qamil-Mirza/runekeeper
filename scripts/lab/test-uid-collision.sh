#!/bin/bash
# Can a process OUTSIDE a container, with the same numeric uid as the
# container's process and no user-namespace remapping, read that process's
# environment or signal it? "Outside" is simulated by a second container that
# shares the host pid namespace and runs as that uid with no capabilities.
#
# Run this on a development machine only. It starts throwaway containers, one
# kind of which uses --pid=host; do not run it on the production host.
set -uo pipefail
IMAGE=node:20-alpine
cleanup() { docker rm -f uidtest-victim-1001 uidtest-victim-dedicated >/dev/null 2>&1; }
trap cleanup EXIT; cleanup

start_victim() { # name uid:gid
  docker run -d --name "$1" --user "$2" -e LAB_SIGNING_KEY=SECRET-$1 "$IMAGE" \
    node -e 'setInterval(()=>{},1e6)' >/dev/null
}
start_victim uidtest-victim-1001 1001:65533
start_victim uidtest-victim-dedicated 61010:61010
sleep 1

attempt() { # label attacker-uid victim-name
  local pid; pid="$(docker inspect -f '{{.State.Pid}}' "$3")"
  docker run --rm --pid=host --cap-drop=ALL --user "$2" ${4:-} "$IMAGE" sh -c "
    printf '%-58s' '$1'
    if out=\$( (tr '\0' '\n' < /proc/$pid/environ) 2>/dev/null | grep LAB_SIGNING_KEY); then
      printf 'environ: READ (%s)  ' \"\$out\"
    else printf 'environ: denied  '; fi
    if ls /proc/$pid/root/ >/dev/null 2>&1; then printf 'rootfs: READ  '; else printf 'rootfs: denied  '; fi
    if kill -0 $pid 2>/dev/null; then echo 'signal: ALLOWED'; else echo 'signal: denied'; fi"
}
echo "host uid/gid of each victim:"
for v in uidtest-victim-1001 uidtest-victim-dedicated; do
  pid="$(docker inspect -f '{{.State.Pid}}' "$v")"
  docker run --rm --pid=host "$IMAGE" sh -c "grep -E '^(Uid|Gid)' /proc/$pid/status | tr '\n' ' '; echo ' <- $v'"
done
echo
attempt "same uid 1001 outside -> container running as 1001"      1001:1001   uidtest-victim-1001
attempt "same uid 1001 outside -> container running as 61010"     1001:1001   uidtest-victim-dedicated
attempt "agent uid 61002 outside -> container running as 1001"    61002:61002 uidtest-victim-1001
attempt "agent uid 61002 outside -> container running as 61010"   61002:61002 uidtest-victim-dedicated
attempt "gid-65533-only outside (uid 4242) -> container as 1001"  4242:65533  uidtest-victim-1001
attempt "uid 1001 AND primary gid 65533 outside -> container as 1001" 1001:65533 uidtest-victim-1001
attempt "uid 1001:1001 + supplementary 65533 -> container as 1001"  1001:1001  uidtest-victim-1001 "--group-add 65533"
attempt "uid 1001 AND primary gid 65533 outside -> container as 61010" 1001:65533 uidtest-victim-dedicated
