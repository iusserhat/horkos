#!/usr/bin/env bash
# Builds the contracts and runs the near-workspaces sandbox tests.
# If the downloaded near-sandbox binary cannot run here (it needs glibc >= 2.39,
# e.g. Ubuntu 22.04 has 2.35), the node is run inside Docker (ubuntu:24.04)
# through scripts/sandbox-docker.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/target}"

scripts/build.sh
(cd integration-tests && cargo test --no-run -q)   # downloads near-sandbox on first run

if [[ -z "${NEAR_SANDBOX_BIN_PATH:-}" ]]; then
  bin=$(find "$CARGO_TARGET_DIR/debug/build" -path '*near-sandbox-*/near-sandbox' -type f | head -1)
  if [[ -n "$bin" ]] && ! "$bin" --version >/dev/null 2>&1; then
    echo "near-sandbox does not run natively ($(ldd --version | head -1)); using Docker" >&2
    export NEAR_SANDBOX_REAL_BIN="$bin"
    export NEAR_SANDBOX_BIN_PATH="$PWD/scripts/sandbox-docker.sh"
  fi
fi
(cd integration-tests && cargo test -- --test-threads=1 "$@")
