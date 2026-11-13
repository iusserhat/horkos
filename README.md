# Horkos

Horkos is an escrow protocol for purchases made by AI agents on NEAR. A user deposits a budget and sets a spending mandate (limits, allowed sellers, expiry). The agent can only open orders inside that mandate. Each order locks its price in the contract and is represented by an NFT receipt (NEP-171). The seller is paid only if a verifier confirms that the delivery meets a machine-checkable condition (for example a JSON Schema). If that does not happen before the deadline, anyone can refund the order to the buyer's budget.

Built at NEAR HACKATHON (development window 19 Oct to 14 Nov 2026). License: MIT.

## Status (13 Nov 2026)

| Part | State |
| --- | --- |
| Contract: mandate, budget deposit, orders, limits, escrow, NFT receipts, cancel, timeout refund, withdraw | Done. Unit and sandbox tests. Deployed on testnet. |
| Contract: delivery and verification through NEAR OutLayer (`submit_delivery` → `on_verified`) | Done. Sandbox tests against a mock OutLayer; ran end to end on testnet with real OutLayer (demos 1 and 2). |
| Verifier program for OutLayer's TEE (`verifier/`: decrypt, check the JSON Schema, re-seal the data key to the buyer) | Done. Unit tests and an end-to-end test with SDK-built deliveries. WASM v0 hosted publicly, sha256 pinned; OutLayer testnet downloaded and ran it (tx `6dnGVTiB1e8sDyEYrv7MoSdKGsLnPqUDFe7oCyNKo8wv`). Its secret key was generated inside OutLayer (`PROTECTED_VERIFIER_SK`, locked to that build). |
| Verifier published on the testnet contract (`set_verifier`) | Done: version 0, tx `5AmP9nyCvwPN13XLJojKurnjD7tfRtF4395atmWLizmU`. Its public key was printed by the verifier inside OutLayer (tx `5iWyLC1TVjd7v4CKSDU4yggATB4x4g42TJs4xJAZRtRH`); the contract does not check that the key came from the TEE (see Trust model). |
| TypeScript SDK (agent, seller, owner) | Done. Tests on a local sandbox. |
| Demo 3 (out-of-mandate purchase rejected) | Ran on testnet. |
| Demos 1 and 2 (successful purchase; bad delivery refunded) | Ran on testnet on 13 Nov with real OutLayer (tx ids in Try it, step 5). Also runnable locally without keys (step 6). |
| MCP server | Not started. |

OutLayer runs end to end on testnet: verifier v0 is published and demos 1 and 2 settled and refunded through it. The local sandbox demo (Try it, step 6) stays as a fallback that needs no keys.

**Outage note.** On 13 Nov 2026, from about 12:00 UTC (still failing at 12:16, working again by 12:49), every OutLayer testnet execution failed with an infrastructure error (the worker ran, but its result was not accepted on chain: "Execution request not found"). In that case OutLayer's callback carries no result. The contract does not leave an order stuck: a missing or invalid result moves the order from `Verifying` back to `Delivered`, the seller may resubmit before the deadline, and after the deadline `refund_expired` returns the funds. This path is covered by the sandbox test `invalid_and_null_results_return_to_delivered_then_retry_settles`; no Horkos order was in flight during the outage. Details: `docs/TESTNET.md`.

## Problem

Agents can pay, but a stablecoin payment cannot be reversed. If an agent overspends, is tricked by a prompt injection, or pays a seller who delivers nothing or delivers garbage, there is no standard way to stop the payment or get the money back. Letting the buyer approve deliveries does not work either: a buyer who has the data can claim it was bad.

## How it works

1. **Mandate.** The owner calls `set_mandate` (agent account, total and per-order limits, allowed sellers, expiry, storage deposit) and deposits the token budget with `ft_transfer_call`.
2. **Order.** The agent calls `create_order`. The contract checks the caller is the mandate's agent, the mandate is active and not expired, the seller is allowed, the price fits both limits and the budget, and the open-order cap. It then moves the price into escrow and mints the receipt NFT to the owner. Otherwise the transaction fails and nothing is created.
3. **Delivery.** The seller encrypts the data, publishes it, and calls `submit_delivery` with the key sealed to the verifier's public key, paying the verifier fee. The contract asks NEAR OutLayer to run the pinned verifier program (`request_execution`), and the order becomes `Verifying`.
4. **Settlement.** In the `on_verified` callback the contract settles only if the result is valid, belongs to this order and attempt, the order is still `Verifying`, and the deadline has not passed. Settling credits the seller's internal balance and stores the data key re-sealed for the buyer, in one step. Otherwise the order goes back to `Delivered`, and the seller may try again before the deadline.
5. **Refund.** After the deadline, `refund_expired` (callable by anyone) returns an unsettled order's price to the budget.
6. **Withdraw.** Sellers (earnings) and owners (unspent budget) call `withdraw`. If the token transfer fails, the balance is restored.

Order states: `Open → Verifying → Settled`; `Verifying → Delivered → Verifying` (retry); `Open | Delivered | Verifying → Refunded`; `Open → Cancelled`. Each order reaches exactly one final state.

Full design (Turkish): `docs/DESIGN.md`. Decisions and reasons: `docs/DECISIONS.md`.

## Repository

```
contracts/horkos/            escrow contract (Rust, near-sdk 5.30)
contracts/test-token/        testnet NEP-141 token "tUSDC" (6 decimals)
contracts/mock-outlayer/     test-only stand-in for OutLayer's request_execution (Worker mode: yields until resolved, like OutLayer)
contracts/integration-tests/ sandbox tests (near-workspaces)
contracts/scripts/           build, sandbox test runner, Docker wrapper for the sandbox node
sdk/                         TypeScript SDK: HorkosAgent, HorkosSeller, HorkosOwner
verifier/                    delivery verifier (Rust, WASI P2) that runs in OutLayer's TEE
demo/                        seller services and scenario scripts (testnet), local sandbox demo
spikes/outlayer/             OutLayer experiment: WASI schema checker, probe contract, report
docs/                        design, decisions, testnet deployment
```

## Try it

Requirements: Linux or macOS, Rust ≥ 1.95 with the `wasm32-unknown-unknown` target, `cargo-near` 0.22, Node.js 20. The sandbox node downloaded by near-workspaces needs glibc ≥ 2.39; on older systems (for example Ubuntu 22.04) the test script runs it in Docker (`ubuntu:24.04`), so Docker is needed there. `setup.sh` installs the toolchain on Ubuntu/WSL.

### 1. Contract unit tests

```bash
cd contracts
cargo test -p horkos -p test-token
```

You should see `test result: ok` for both crates. The tests include, among others: per-order and total limit violations, a seller outside the mandate, double refund, an admin swapping the verifier for open orders, a valid result arriving after the deadline, a late verification callback after a refund, and the storage-deposit bound on create/cancel loops.

### 2. Sandbox tests (real wasm, real cross-contract calls)

```bash
contracts/scripts/test-sandbox.sh --nocapture
```

This builds the three contracts, starts a local NEAR node, and runs `contracts/integration-tests/tests/sandbox.rs`. You should see `test result: ok. 7 passed` and lines such as `GAS on_verified (settle): 2.40 Tgas`, the gas the callbacks actually burn. The contract attaches 10 Tgas to `on_verified` and 5 Tgas to `on_withdraw`, and the tests fail if any path burns more than half of that.

### 3. SDK tests

```bash
cd sdk
npm ci
CARGO_TARGET_DIR=../contracts/target npm test
```

Run after step 2 (it reuses the built wasm and the downloaded sandbox binary). You should see `# pass 6`. The tests cover buy, deliver, settle, decrypt and withdraw; a seller swapping the hosted file after verification (the buyer refuses it: `ciphertext hash mismatch`); an invalid delivery; the `maxPrice` check; cancel; and the agent's function-call key failing to withdraw.

### 4. Look at the testnet deployment

```bash
near contract call-function as-read-only escrow.horkos.testnet get_mandate json-args '{"owner":"horkos-owner.testnet"}' network-config testnet now
near contract call-function as-read-only escrow.horkos.testnet get_listing json-args '{"listing_id":"2"}' network-config testnet now
near account list-keys horkos-agent.testnet network-config testnet now
```

You should see a mandate that allows only `horkos-seller-a.testnet` and `horkos-seller-b.testnet`, a 500 tUSDC listing from `horkos-seller-c.testnet`, and an agent key limited to `create_order` / `cancel_order` on `escrow.horkos.testnet`. Accounts, code hashes and transactions: `docs/TESTNET.md`. To check that the deployed code is this repository's, build it and compare the sha256 with the one near-cli reports.

### 5. Demo scenarios (testnet)

The scripts sign with the demo accounts' keys, which only the team has, so judges cannot run them as-is. They are in `demo/` (`npm run setup`, `npm run demo1|demo2|demo3`).

- **Demo 3** ran on 1 Nov 2026. The agent, signing with its function-call key, sent `create_order` for 500 tUSDC from seller C. The contract rejected it with `Seller not allowed by mandate`, and the budget (50 tUSDC) and open-order count did not change.
- **Demo 1** ran on 13 Nov 2026: order 0 (`create_order` tx `92QVpcmFUQbxpYYV32sqR9CKdnxnN1n9H6VtH6KbLmzA`), seller A's `submit_delivery` (tx `DgGzhbkGBEMHGG9duhFSQHgTKsXpxi9NgngEMb1BLAoD`) ran the verifier on OutLayer and settled the order in the callback; the buyer decrypted the JSON.
- **Demo 2** ran on 13 Nov 2026: order 2 (`create_order` tx `4zL12Bg9TNRgVtXyyh7KfBrCRcQsa4bbuap2b3jd6rL6`), seller B's delivery failed the schema (tx `HgPppJUNPThmUDfEpDxhtTnFeZZDVktzggR4thvhE2yj`), no key for the buyer, then `refund_expired` after the deadline (tx `7PkEjmE3LJfQeH3Ko5KvNXT4Xm9EFzF3Qpg84xXssfC5`) → `Refunded`.
- Check any order: `near contract call-function as-read-only escrow.horkos.testnet get_order json-args '{"order_id":"0"}' network-config testnet now` (orders 0 `Settled`, 2 `Refunded`). All tx ids: `docs/TESTNET.md`.

### 6. Demos 1–3 locally (sandbox, mock OutLayer, real verifier code)

```bash
contracts/scripts/build.sh
cd demo
npm ci
CARGO_TARGET_DIR=../contracts/target npm run sandbox
```

Run after step 3 (it needs `sdk/node_modules`, the built wasm and the sandbox binary). It starts a local NEAR node, deploys the real Horkos and test-token contracts and `mock-outlayer` in `Worker` mode, and builds the verifier natively. When the contract calls `request_execution`, the mock yields like OutLayer does; a worker loop in `demo/sandbox.ts` runs the verifier on the request and resumes it with the verifier's output. You should see:

1. `order 0: Settled`, then the buyer decrypts `{"symbol":"NEAR/USD","rows":[...]}`.
2. `valid=false, reason: schema: ... at /rows`, `order 1: Delivered`, the buyer gets `nothing to open`, and after the 25 s window `refund_expired → order 1: Refunded` with the 5 tUSDC back in the budget.
3. `create_order rejected: ... Seller not allowed by mandate`.

Not real in this demo: the TEE and OutLayer's operator (the worker is a local loop), and HTTPS hosting (files are `file://` URLs).

## Trust model and limits

What the contract enforces on chain:
- Limits, the allowed-seller list, expiry and the open-order cap are checked by the contract on every order. The agent's key is not trusted.
- Escrowed funds move only through settlement, refund, cancel or withdraw, each guarded by the order state machine.
- Each order is pinned to the verifier version that existed when it was created. The admin can publish new versions but cannot change the version an existing order uses.
- Only the result of the contract's own OutLayer call is accepted (the callback is private, the verifier WASM is pinned by sha256).

What is trusted, not verified on chain:
- **OutLayer's operator.** The contract does not verify a TEE attestation. OutLayer's callback carries only the program's output, with no signature or quote. The operator account (`worker.outlayer.testnet` / `.near`) also has full-access keys, so a holder of those keys could submit a result without running the TEE. The TEE attestation can be checked off-chain afterwards. Details: `spikes/outlayer/REPORT.md`. We asked OutLayer about this (`docs/outlayer-question.md`).
- **The verifier public key** is published by the admin with each verifier version. The contract does not check that it came from the TEE.
- **Full-access keys on the contract accounts.** `escrow.horkos.testnet` and `tusdc.horkos.testnet` still have full-access keys held by the team. Whoever holds them can redeploy the contract code, which is more power than the admin role. Removing these keys (or moving upgrades behind a DAO or timelock) is on the roadmap.
- **The condition.** Horkos checks that a delivery meets the seller's published condition, not that the data is good. A buyer should read the condition before buying.

Costs and other limits:
- Each order charges about 1,517 bytes of storage (≈ 0.0152 NEAR) to the owner's storage deposit. 648 bytes of it are returned if the order closes without any delivery.
- The seller pays OutLayer's fee for each verification attempt.
- If a verification callback fails for a reason other than the result (for example gas), the order stays `Verifying` until the deadline, then refunds.
- Receipts are not transferable in this version.
- Testnet only.

## Roadmap

- Delete the contract accounts' full-access keys, or put upgrades behind a DAO or timelock.
- MCP server (`horkos_search_listings`, `horkos_create_order`, `horkos_get_order`, `horkos_open_delivery`, `horkos_cancel_order`).
- Later: cross-chain payment and refund via NEAR Intents, transferable receipts, x402 compatibility.

## Libraries, templates and AI-generated code

Libraries (exact versions are pinned in `Cargo.lock` / `package-lock.json`):
- Rust: `near-sdk` 5.30.0, `near-contract-standards` 5.30.0, `near-workspaces` 0.24.0 (tests), `tokio`, `serde_json`, `anyhow`, `sha2` (spike). Toolchain: `cargo-near` 0.22.0, near-sandbox / nearcore 2.14.0 (tests).
- Verifier (Rust): `crypto_box` 0.9.1, `chacha20poly1305` 0.10.1, `jsonschema` 0.59.0, `sha2`, `base64`, `hex`, `serde_json`, `wasi-http-client` 0.2.1 (WASM build only).
- TypeScript: `near-api-js` 7.3.1, `libsodium-wrappers` 0.8.4 (all encryption), `typescript` 7.0.2, `tsx` 4.23.15.
- Docker image `ubuntu:24.04`, used only to run the sandbox node on hosts with an older glibc.

Templates and borrowed formats:
- `contracts/test-token` follows the fungible-token example in near-sdk-rs (v5.30.0) and adds an owner-only `mint`.
- The FastFS upload format in `sdk/src/storage.ts` follows `out-layer/outlayer-cli` (`src/commands/upload.rs`).

AI-generated code: nearly all code, tests, scripts and documentation drafts in this repository were written by Claude Code (Anthropic, model Claude Opus 5.5), working under the direction of the team member, who set the design, made the decisions recorded in `docs/DECISIONS.md`, and reviewed the results. Commits made this way carry a `Co-Authored-By: Claude` trailer.
