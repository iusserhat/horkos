#!/usr/bin/env bash
# Rebuilds the Horkos verifier WASM from this repo with a pinned toolchain and
# compares its sha256 with the hash pinned in the escrow contract's verifier
# version 0 (the hash OutLayer checks before it runs the WASM).
#
#   scripts/reproduce-verifier.sh            # compare with the pinned hash below
#   scripts/reproduce-verifier.sh --chain    # also read the hash live from escrow.horkos.testnet
#
# Prints MATCH or MISMATCH; exits 1 on MISMATCH. Needs rustup and curl.
set -euo pipefail
cd "$(dirname "$0")/.."

TOOLCHAIN=1.99.1
PINNED=61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f
CONTRACT=escrow.horkos.testnet   # the only caller the verifier accepts (compiled in)

if [[ "${1:-}" == "--chain" ]]; then
  onchain=$(curl -s https://rpc.testnet.near.org -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"'"$CONTRACT"'","method_name":"get_verifier_version","args_base64":"eyJ2ZXJzaW9uIjowfQ=="}}' \
    | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]["result"]; print(json.loads(bytes(r))["wasm_hash"])')
  echo "On-chain hash ($CONTRACT, verifier version 0): $onchain"
  [[ "$onchain" == "$PINNED" ]] || { echo "On-chain hash differs from the pinned hash in this script"; PINNED=$onchain; }
fi

rustup toolchain install "$TOOLCHAIN" --profile minimal --target wasm32-wasip2 >/dev/null 2>&1 || true
rustup target add --toolchain "$TOOLCHAIN" wasm32-wasip2 >/dev/null 2>&1 || true
target=$(mktemp -d)
trap 'rm -rf "$target"' EXIT
(
  cd verifier
  unset HORKOS_CONTRACT RUSTFLAGS CARGO_ENCODED_RUSTFLAGS
  CARGO_TARGET_DIR="$target" cargo "+$TOOLCHAIN" build --release --locked --target wasm32-wasip2 -q
)
wasm="$target/wasm32-wasip2/release/horkos-verifier.wasm"
built=$(sha256sum "$wasm" | cut -d' ' -f1)
echo "Toolchain: $(rustc "+$TOOLCHAIN" --version)"
echo "Built:     $built ($(stat -c%s "$wasm") bytes)"
echo "Pinned:    $PINNED"
if [[ "$built" == "$PINNED" ]]; then
  echo "MATCH"
else
  echo "MISMATCH"
  exit 1
fi
