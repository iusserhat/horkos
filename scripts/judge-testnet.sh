#!/usr/bin/env bash
# Optional checks that read NEAR testnet (network, no keys):
#   1. the verifier WASM rebuilt from this repo has the sha256 pinned on chain (v1 and v2 builds)
#   2. Sentinel re-evaluates order 28 read-only
#   3. buyers outside the team's test accounts
set -uo pipefail
cd "$(dirname "$0")/.."
r=0
echo "▸ Verifier v1 build vs on-chain hash";   scripts/reproduce-verifier.sh --chain --match-paths || r=1
echo "▸ Verifier v2 build vs pinned hash";     scripts/reproduce-verifier.sh --match-paths --v2 || r=1
echo "▸ Sentinel on order 28 (read-only)";     (cd sentinel && npm ci --silent && npm run sentinel -- --config examples/readonly.json --once --from 28) || r=1
echo "▸ Independent buyers";                   (cd demo && npm ci --silent && npx tsx ../scripts/independent-buyers.mts) || r=1
exit $r
