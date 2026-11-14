#!/usr/bin/env bash
# Builds all contract wasm files with cargo-near.
# Output: $CARGO_TARGET_DIR/near/<crate>/<crate>.wasm (default target dir: contracts/target).
set -euo pipefail
cd "$(dirname "$0")/.."
for c in test-token horkos horkos-v2 mock-outlayer faucet; do
  (cd "$c" && cargo near build non-reproducible-wasm)
done
