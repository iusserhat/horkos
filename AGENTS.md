# AGENTS.md

Guide for AI agents reviewing or working in this repository. Humans: see [JUDGES.md](JUDGES.md) and the [README](README.md).

## What this is

Horkos: escrow for purchases made by AI agents on NEAR (testnet). An order locks the price in the contract and mints an NFT receipt; the seller is paid only if the encrypted delivery passes the listing's JSON Schema, checked by a verifier WASM in NEAR OutLayer's TEE; otherwise anyone can refund it after the deadline.

## Layout

| Path | Contents |
| --- | --- |
| `contracts/horkos` | Escrow v1 (Rust, near-sdk 5.30.0), deployed as `escrow.horkos.testnet` |
| `contracts/horkos-v2` | Escrow v2, transferable receipts, deployed as `escrow-v2.horkos.testnet` |
| `contracts/test-token`, `contracts/faucet` | tUSDC (`tusdc.horkos.testnet`) and its faucet (`faucet.horkos.testnet`) |
| `contracts/mock-outlayer`, `contracts/integration-tests` | Test-only OutLayer stand-in; near-workspaces sandbox tests |
| `verifier/` | Verifier (Rust, wasm32-wasip2) that runs in OutLayer's TEE |
| `sdk/`, `mcp/`, `gateway/`, `demo/` | TypeScript SDK, MCP server (5 tools), seller gateway, demo sellers and scenarios |
| `web/` | Website (https://horkos-escrow.netlify.app) |
| `docs/` | Architecture, contract API, decisions (ADRs), security, testnet evidence |
| `evidence/attestation/` | `outlayer-verify` output and offline bundles for settled orders 9, 15, 18, 26 |
| `scripts/` | `reproduce-verifier.sh`, `verify-deployed.sh` |

## Run without keys or accounts

```bash
cd contracts && cargo test -p horkos -p horkos-v2 -p test-token -p faucet   # unit tests
cd .. && contracts/scripts/test-sandbox.sh                                  # sandbox integration tests (local node)
(cd sdk && npm ci && npm test && npm run test:verifier)
(cd verifier && cargo test)
(cd gateway && npm ci && npm test && npm run test:sandbox)
(cd demo && npm ci && npm run sandbox)                                      # demos 1-3 on a local node, mock OutLayer, real verifier
scripts/reproduce-verifier.sh --match-paths                                 # rebuild the verifier, compare with the on-chain hash
```

Toolchain: Rust 1.99.1, cargo-near 0.22.0, Node 20. The same commands run in CI (`.github/workflows/ci.yml`) on every push.

## Testnet accounts

| Account | Role |
| --- | --- |
| `escrow.horkos.testnet` | Escrow v1, verifier version 0 (WASM sha256 `61370b57…db80f`) |
| `escrow-v2.horkos.testnet` | Escrow v2 (transferable receipts) |
| `tusdc.horkos.testnet` / `faucet.horkos.testnet` | Test token / faucet (20 tUSDC per account per 24 h) |
| `horkos.testnet` | Admin |
| `horkos-seller-a.testnet` | Seller A, hosted on Render (listings 0, 3, 4, 5 on v1) |

Transactions for every claim: `docs/testnet.md`.

## Known limitations

- Testnet only; no mainnet deployment.
- The contract does not verify OutLayer's TEE attestation on chain; it trusts OutLayer's operator. Attestations can be checked afterwards (`evidence/attestation/`).
- OutLayer testnet sometimes fails runs (timeouts at NEAR's 201-block yield limit, e.g. 14 Nov from about 11:30 to 15:00 UTC); the order then refunds after its deadline.
- Conditions are JSON Schema only: Horkos checks the shape of a delivery, not its quality.
- Contract accounts still have full-access keys held by the team, who could redeploy the code.
- v2 on testnet has shown transfers and refund-to-holder; see the README for whether a v2 settlement has been shown.
- `scripts/verify-deployed.sh` matches the deployed contracts on the deploying machine and in a fresh clone there, but GitHub's runner compiles different bytes, so it is not part of CI.

## Rules for changes

Code, commits and docs in English. Never commit keys, recovery phrases or `.env` files. Do not claim anything that has not been run; record working commands and tx ids in `docs/testnet.md`.
