#!/usr/bin/env bash
# One command for judges: runs the checks that need no keys and no testnet,
# then prints a summary table. Network is used only to download dependencies
# (crates, npm packages, the local NEAR node) on the first run.
#
#   npm run judge                 # all checks
#   JUDGE_SKIP_SANDBOX=1 npm run judge   # skip the local-node steps (they need cargo-near and the near-sandbox binary)
#
# Needs: Node 20 (.nvmrc), Rust via rustup (rust-toolchain.toml pins 1.99.1 and the wasm targets),
# for the sandbox steps also cargo-near 0.22.0 (and Docker on Linux with glibc < 2.39).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
LOG="${TMPDIR:-/tmp}/horkos-judge-$$"
mkdir -p "$LOG"
names=(); results=(); times=()

step() {  # step <name> <command...>
  local name=$1; shift
  local file="$LOG/$(echo "$name" | tr -c 'a-zA-Z0-9' '_').log"
  printf '▸ %-52s' "$name"
  local t0=$SECONDS
  if (cd "$ROOT" && eval "$*") >"$file" 2>&1; then r=PASS; else r=FAIL; fi
  local dt=$((SECONDS - t0))
  printf '%s  %4ss\n' "$r" "$dt"
  [[ $r == FAIL ]] && tail -15 "$file" | sed 's/^/    /'
  names+=("$name"); results+=("$r"); times+=("$dt")
}

step "Contract unit tests (v1, v2, tUSDC, faucet)" "cd contracts && cargo test -q -p horkos -p horkos-v2 -p test-token -p faucet --lib"
step "Attack tests, 8 per escrow version (v1, v2)"   "cd contracts && cargo test -q -p horkos -p horkos-v2 --test attacks"
step "Invariants, 100 random sequences (v1, v2)"     "cd contracts && INVARIANT_RUNS=100 cargo test -q --release -p horkos -p horkos-v2 --test invariants"
step "Verifier unit tests"                           "cd verifier && cargo test -q"
step "SDK + MCP type check"                          "cd sdk && npm ci --silent && npm run typecheck && cd ../mcp && npm ci --silent && npm run typecheck"
step "Sentinel rules"                                "cd sentinel && npm ci --silent && npm test"
step "Gateway unit tests (needs sdk/ installed)"     "cd gateway && npm ci --silent && npm test"
if [[ -z "${JUDGE_SKIP_SANDBOX:-}" ]]; then
  # Time limits: the first sandbox build downloads the near-sandbox binary; a stuck download should fail, not hang.
  step "Sandbox integration tests (local NEAR node)"  "timeout 1800 contracts/scripts/test-sandbox.sh"
  step "SDK tests + verifier end-to-end (local node)" "cd sdk && timeout 600 npm test && timeout 600 npm run test:verifier"
  step "Sandbox demo: demos 1-3, mock OutLayer"       "cd demo && npm ci --silent && timeout 900 npm run sandbox"
fi

echo
printf '| %-52s | %-6s | %6s |\n' "Check" "Result" "Time"
printf '|%s|%s|%s|\n' "$(printf -- '-%.0s' {1..54})" "--------" "--------"
fail=0; total=0
for i in "${!names[@]}"; do
  printf '| %-52s | %-6s | %5ss |\n' "${names[$i]}" "${results[$i]}" "${times[$i]}"
  [[ ${results[$i]} == FAIL ]] && fail=1
  total=$((total + times[$i]))
done
echo
echo "Total ${total}s. Logs: $LOG"
exit $fail
