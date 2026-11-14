#!/usr/bin/env bash
# Compares the contracts built from this repo (contracts/scripts/build.sh) with
# the code deployed on NEAR testnet: sha256 of the local wasm vs the account's
# code_hash (base58 of the same sha256). Prints MATCH/MISMATCH per contract;
# exits 1 if any differs. Needs curl and python3.
#
#   scripts/verify-deployed.sh                # compare the wasm already built by build.sh
#   scripts/verify-deployed.sh --match-paths  # rebuild with the original CARGO_HOME path, then compare
#
# Why --match-paths: rustc embeds dependency source paths (CARGO_HOME/registry/...)
# in panic messages, so the wasm is byte-for-byte reproducible only with the same
# CARGO_HOME path. The path is read from the deployed escrow code itself; the
# directory must be writable (sudo is tried non-interactively, e.g. on CI).
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${CARGO_TARGET_DIR:-$PWD/contracts/target}"
RPC="${NEAR_RPC:-https://rpc.testnet.near.org}"
fail=0

if [[ "${1:-}" == "--match-paths" ]]; then
  code=$(mktemp)
  curl -s "$RPC" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_code","finality":"final","account_id":"escrow.horkos.testnet"}}' \
    | python3 -c 'import sys,json,base64; sys.stdout.buffer.write(base64.b64decode(json.load(sys.stdin)["result"]["code_base64"]))' > "$code"
  cargo_home=$(python3 -c 'import re,sys; m=re.search(rb"(/[\x21-\x7e]*?/\.cargo)/registry/src/", open(sys.argv[1],"rb").read()); print(m.group(1).decode())' "$code")
  rm -f "$code"
  echo "CARGO_HOME: same path as the original build (read from the deployed code, ${#cargo_home} characters)"
  if ! mkdir -p "$cargo_home" 2>/dev/null; then
    sudo -n mkdir -p "$cargo_home" 2>/dev/null && sudo -n chown -R "$(id -u):$(id -g)" "$(dirname "$cargo_home")" \
      || { echo "Cannot create $cargo_home; run: sudo mkdir -p $cargo_home && sudo chown \$USER $cargo_home"; exit 1; }
  fi
  TARGET="${VERIFY_TARGET_DIR:-$(mktemp -d)}"
  [[ -n "${VERIFY_TARGET_DIR:-}" ]] || trap 'rm -rf "$TARGET"' EXIT
  CARGO_HOME="$cargo_home" CARGO_TARGET_DIR="$TARGET" contracts/scripts/build.sh >/dev/null 2>&1 \
    || { echo "build failed; rerun: CARGO_HOME=<that path> contracts/scripts/build.sh"; exit 1; }
fi
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
