#!/usr/bin/env bash
# Rebuilds the Horkos verifier WASM from this repo with a pinned toolchain and
# compares its sha256 with the hash pinned in the escrow contract's verifier
# version 0 (the hash OutLayer checks before it runs the WASM).
#
#   scripts/reproduce-verifier.sh                 # compare with the pinned hash below
#   scripts/reproduce-verifier.sh --chain         # also read the hash live from escrow.horkos.testnet
#   scripts/reproduce-verifier.sh --match-paths   # build with the same CARGO_HOME path as the original
#   scripts/reproduce-verifier.sh --v2 ...        # the v2 build: caller escrow-v2.horkos.testnet,
#                                                 # escrow-v2's verifier version 1
#
# Prints MATCH or MISMATCH; exits 1 on MISMATCH. Needs rustup, curl, python3.
#
# Why --match-paths: rustc embeds the absolute source paths of dependencies
# (CARGO_HOME/registry/src/...) in panic messages, so the WASM is byte-for-byte
# reproducible only with the same CARGO_HOME path. --match-paths downloads the
# published WASM from the URL pinned on chain, checks its sha256, reads that
# path out of it and builds there (the directory must be writable, e.g.
# `sudo mkdir -p <dir> && sudo chown $USER <dir>`). Without it, a build on a
# machine with a different home directory differs only in those strings.
set -euo pipefail
cd "$(dirname "$0")/.."
chain=0; match_paths=0; v2=0
for arg in "$@"; do
  case "$arg" in
    --chain) chain=1 ;;
    --match-paths) match_paths=1 ;;
    --v2) v2=1 ;;
    *) echo "unknown option $arg"; exit 2 ;;
  esac
done

TOOLCHAIN=1.99.1
V1_PINNED=61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f
if (( v2 )); then
  PINNED=4919f8e244c69d61b14db61a62f4a2edbcf25fa40b448729d23b24e4eb7ea996
  CONTRACT=escrow-v2.horkos.testnet; VERSION=1
else
  PINNED=$V1_PINNED
  CONTRACT=escrow.horkos.testnet; VERSION=0
fi
# CONTRACT is the only caller the verifier accepts (compiled in via HORKOS_CONTRACT).

verifier_config() {  # <account> <version> -> "wasm_hash wasm_url"
  curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"'"$1"'","method_name":"get_verifier_version","args_base64":"'"$(printf '{"version":%s}' "$2" | base64)"'"}}' \
    | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]["result"]; c=json.loads(bytes(r)); print(c["wasm_hash"], c["wasm_url"])'
}

cargo_home="${CARGO_HOME:-$HOME/.cargo}"
if (( chain )); then
  config=$(verifier_config "$CONTRACT" "$VERSION")
  onchain=${config%% *}
  echo "On-chain hash ($CONTRACT, verifier version $VERSION): $onchain"
  [[ "$onchain" == "$PINNED" ]] || { echo "On-chain hash differs from the pinned hash in this script"; PINNED=$onchain; }
fi
if (( match_paths )); then
    # The path is read from the v1 WASM published at the URL pinned on chain (v2 was built with the same one).
    config=$(verifier_config escrow.horkos.testnet 0); url=${config#* }
    published=$(mktemp)
    curl -sL "$url" -o "$published"
    echo "Published v1 WASM ($url): $(sha256sum "$published" | cut -d' ' -f1)"
    [[ "$(sha256sum "$published" | cut -d' ' -f1)" == "$V1_PINNED" ]] || { echo "Published WASM does not have the pinned hash"; exit 1; }
    cargo_home=$(python3 -c 'import re,sys; m=re.search(rb"(/[\x21-\x7e]*?/\.cargo)/registry/src/", open(sys.argv[1],"rb").read()); print(m.group(1).decode())' "$published")
    rm -f "$published"
    echo "CARGO_HOME: same path as the original build (read from the published WASM, ${#cargo_home} characters)"
    if ! mkdir -p "$cargo_home" 2>/dev/null; then
      # Non-interactive sudo (CI runners); otherwise ask the user to create it.
      sudo -n mkdir -p "$cargo_home" 2>/dev/null && sudo -n chown -R "$(id -u):$(id -g)" "$(dirname "$cargo_home")" \
        || { echo "Cannot create $cargo_home; run: sudo mkdir -p $cargo_home && sudo chown \$USER $cargo_home"; exit 1; }
    fi
fi

rustup toolchain install "$TOOLCHAIN" --profile minimal --target wasm32-wasip2 >/dev/null 2>&1 || true
rustup target add --toolchain "$TOOLCHAIN" wasm32-wasip2 >/dev/null 2>&1 || true
target=$(mktemp -d)
trap 'rm -rf "$target"' EXIT
(
  cd verifier
  unset HORKOS_CONTRACT RUSTFLAGS CARGO_ENCODED_RUSTFLAGS
  if (( v2 )); then export HORKOS_CONTRACT=$CONTRACT; fi
  CARGO_HOME="$cargo_home" CARGO_TARGET_DIR="$target" cargo "+$TOOLCHAIN" build --release --locked --target wasm32-wasip2 -q
)
wasm="$target/wasm32-wasip2/release/horkos-verifier.wasm"
built=$(sha256sum "$wasm" | cut -d' ' -f1)
echo "Caller:    $CONTRACT"
echo "Toolchain: $(rustc "+$TOOLCHAIN" --version)"
echo "Built:     $built ($(stat -c%s "$wasm") bytes)"
echo "Pinned:    $PINNED"
if [[ "$built" == "$PINNED" ]]; then
  echo "MATCH"
else
  echo "MISMATCH"
  exit 1
fi
