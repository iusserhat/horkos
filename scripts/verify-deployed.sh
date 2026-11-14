#!/usr/bin/env bash
# Compares the contracts built from this repo (contracts/scripts/build.sh) with
# the code deployed on NEAR testnet: sha256 of the local wasm vs the account's
# code_hash (base58 of the same sha256). Prints MATCH/MISMATCH per contract;
# exits 1 if any differs. Needs curl and python3; build first.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${CARGO_TARGET_DIR:-$PWD/contracts/target}"
RPC="${NEAR_RPC:-https://rpc.testnet.near.org}"
fail=0
for pair in escrow.horkos.testnet:horkos escrow-v2.horkos.testnet:horkos_v2 tusdc.horkos.testnet:test_token faucet.horkos.testnet:faucet; do
  account=${pair%%:*}; crate=${pair##*:}
  wasm="$TARGET/near/$crate/$crate.wasm"
  [[ -f "$wasm" ]] || { echo "$wasm missing; run contracts/scripts/build.sh"; exit 1; }
  local_hash=$(sha256sum "$wasm" | cut -d' ' -f1)
  chain_hash=$(curl -s "$RPC" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"'"$account"'"}}' \
    | python3 -c '
import sys, json
b58 = json.load(sys.stdin)["result"]["code_hash"]
alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
n = 0
for c in b58:
    n = n * 58 + alphabet.index(c)
print(n.to_bytes(32, "big").hex())')
  if [[ "$local_hash" == "$chain_hash" ]]; then verdict=MATCH; else verdict=MISMATCH; fail=1; fi
  printf '%-26s local %s  chain %s  %s\n' "$account" "$local_hash" "$chain_hash" "$verdict"
done
exit $fail
