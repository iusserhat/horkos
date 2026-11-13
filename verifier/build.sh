#!/usr/bin/env bash
# Builds the verifier for NEAR OutLayer (wasm32-wasip2) and prints its sha256,
# which goes into the Horkos VerifierConfig (wasm_hash).
# HORKOS_CONTRACT sets the only caller the verifier accepts (default escrow.horkos.testnet).
set -euo pipefail
cd "$(dirname "$0")"
rustup target add wasm32-wasip2 >/dev/null 2>&1 || true
cargo build --release --target wasm32-wasip2
target="${CARGO_TARGET_DIR:-target}"
wasm="$target/wasm32-wasip2/release/horkos-verifier.wasm"
echo "WASM:   $wasm ($(stat -c%s "$wasm") bytes)"
echo "SHA256: $(sha256sum "$wasm" | cut -d' ' -f1)"
echo "Caller: ${HORKOS_CONTRACT:-escrow.horkos.testnet}"
