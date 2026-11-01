#!/usr/bin/env bash
# Runs the near-sandbox binary inside Ubuntu 24.04 via Docker.
#
# Why: near-sandbox 2.14.0 needs glibc >= 2.39; Ubuntu 22.04 (our WSL) has
# 2.35. near-workspaces runs whatever NEAR_SANDBOX_BIN_PATH points to, so
# point it at this script and set NEAR_SANDBOX_REAL_BIN to the real binary:
#
#   export NEAR_SANDBOX_REAL_BIN=/path/to/near-sandbox
#   export NEAR_SANDBOX_BIN_PATH="$PWD/contracts/scripts/sandbox-docker.sh"
#
# The script rewrites 127.0.0.1 listen addresses to 0.0.0.0 inside the
# container and publishes those ports on 127.0.0.1 of this machine. The
# sandbox home directory is bind-mounted at the same path. near-workspaces
# stops the node with SIGKILL, which docker does not forward, so a watchdog
# removes the container once this process is gone.
set -euo pipefail

BIN="${NEAR_SANDBOX_REAL_BIN:?set NEAR_SANDBOX_REAL_BIN to the near-sandbox binary}"
IMAGE="${NEAR_SANDBOX_IMAGE:-ubuntu:24.04}"
NAME="horkos-sandbox-$$-$RANDOM"

args=()
mounts=(-v "$BIN:/usr/local/bin/near-sandbox:ro")
ports=()
prev=""
for a in "$@"; do
  if [[ "$prev" == "--home" ]]; then
    mkdir -p "$a"
    mounts+=(-v "$a:$a")
  fi
  if [[ "$prev" == "--rpc-addr" || "$prev" == "--network-addr" ]] && [[ "$a" == 127.0.0.1:* ]]; then
    port="${a##*:}"
    ports+=(-p "127.0.0.1:$port:$port")
    a="0.0.0.0:$port"
  fi
  args+=("$a")
  prev="$a"
done

# Watchdog: remove the container when this process (exec'd into docker) dies.
self=$$
setsid bash -c "while kill -0 $self 2>/dev/null; do sleep 1; done; docker rm -f $NAME >/dev/null 2>&1" \
  </dev/null >/dev/null 2>&1 &

exec docker run --rm --name "$NAME" --label horkos-sandbox \
  --user "$(id -u):$(id -g)" "${mounts[@]}" "${ports[@]}" \
  "$IMAGE" near-sandbox "${args[@]}"
