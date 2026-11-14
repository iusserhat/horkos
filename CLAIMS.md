# Claims and how to check them

Every claim made in the README and on the website, with a command or a transaction and the expected result. Commands run from the repo root; "tx" links open NearBlocks (testnet). If something here does not reproduce, that is a bug in this file.

## Contract behaviour (local, no keys)

| Claim | Check | Expected |
| --- | --- | --- |
| The mandate is enforced by the contract: allowed sellers, per-order cap, total cap, expiry | `cd contracts && cargo test -p horkos --lib create_order_rejects` | 12 passed (incl. unauthorized seller, per-order and total limits, insufficient balance, expired and revoked mandate) |
| A prompt-injected order outside the mandate is refused | `cd contracts && cargo test -p horkos-v2 --test attacks` | 8 passed, incl. `order_outside_the_mandate_is_refused`, `prompt_injected_large_order_is_refused` |
| Nobody is paid until the verifier accepts the delivery; a late or invalid result does not settle | `cd contracts && cargo test -p horkos --lib -- valid_result invalid_result result_for_another` | 7 passed |
| Unfinished orders refund after the deadline; anyone can trigger it | `cd contracts && cargo test -p horkos --lib refund` | 15 passed |
| Settlement pays the seller once; a replayed result does nothing | `cd contracts && cargo test -p horkos-v2 --test attacks double_settlement_pays_once` | 1 passed |
| Tokens are conserved; every order ends in one final state; refunds and keys follow the current receipt holder | `cd contracts && INVARIANT_RUNS=10000 cargo test --release -p horkos-v2 --test invariants -- --nocapture` | `invariants held over 10000 sequences` (run on 14 Nov: v2 249,736 and v1 226,086 operations, `docs/security.md`) |
| Callbacks can only come from the contract's own OutLayer call | `contracts/scripts/test-sandbox.sh callbacks_are_private` | `test result: ok. 1 passed` |
| v2: receipts are transferable while the order is open; refunds go to the holder; final receipts are frozen | `cd contracts && cargo test -p horkos-v2 --lib transfer` | 17 passed |
| All of the above in one go | `npm run judge` | 10 of 10 PASS |

## Verification in the TEE

| Claim | Check | Expected |
| --- | --- | --- |
| The verifier WASM is built from `verifier/` in this repo | `scripts/reproduce-verifier.sh --chain --match-paths` | on-chain hash `61370b57…`, `MATCH` (also in CI) |
| The v2 verifier build likewise | `scripts/reproduce-verifier.sh --match-paths --v2` | `4919f8e2…`, `MATCH` |
| That WASM ran in Intel TDX on exactly the order's input and produced the output the contract settled on (orders 9, 15, 18, 26; v2 order 1) | `outlayer-verify bundle evidence/attestation/order-9-bundle.json --offline --short` (tool at rev `90c27d9`, see `evidence/attestation/README.md`) | `PROVEN task 102880 …` |
| The contract does **not** check the attestation on chain; it trusts OutLayer's operator | `docs/security.md`, `spikes/outlayer/REPORT.md` | stated as a limit |

## On testnet

| Claim | Check | Expected |
| --- | --- | --- |
| Orders settle through OutLayer with the hosted seller | order 26: [`22SUFSDM…`](https://testnet.nearblocks.io/txns/22SUFSDMVzJ2N2Joq37m9dNSKvTzM3YyPTQrfMXwC3hs); also orders 9, 15, 18, 27 (`docs/testnet.md`) | log `Order 26 settled; data_sha256 6e703058…` |
| A delivery that fails or never comes is refunded | orders 21 to 25 (`docs/testnet.md`, `refund_expired` txs) | status `Refunded`, budget back |
| An order outside the mandate is rejected on chain | [`EjkZeP3M…`](https://testnet.nearblocks.io/txns/EjkZeP3M8iQMXxEACR9Meq7ZqF7z3rboCVdhd4PhgXqf) | fails with `Seller not allowed by mandate` |
| v2: a transferred receipt settles and the new holder opens the data | [transfer `9DxmwUQE…`](https://testnet.nearblocks.io/txns/9DxmwUQEtLBacJTPCEEKjhpyGztESDimHwshLptrSf3J), [settle `C1BTBTks…`](https://testnet.nearblocks.io/txns/C1BTBTksm2foRkPWLzuKKeNqfJi5Kz2fgH3474uGN8FS); `demo/v2-transfer.ts` output in `docs/testnet.md` | holder `hk-v2holder-1114.testnet`; buyer's original key cannot open it |
| v2: after a transfer the refund goes to the new holder | [`4NFBbMto…`](https://testnet.nearblocks.io/txns/4NFBbMtoh9cmkm8HoWW8b1ty41GcB3A3yoL4KWF66tti), [withdraw `Az6pUNWs…`](https://testnet.nearblocks.io/txns/Az6pUNWs842yT5jqssVuskLNATFPnpjwpct9s6M9LAns) | 5 tUSDC credited to and withdrawn by the holder |
| The deployed contracts are this repo's code | `scripts/verify-deployed.sh --match-paths` (needs cargo-near) | 4 × `MATCH` on the deploying machine and a fresh clone there; on GitHub's runner the bytes differ, so it is not in CI |
| Sentinel cancels a suspicious order before delivery | `cd sentinel && npm ci && npm run sentinel -- --config examples/readonly.json --once --from 28`; cancel tx [`6AX2QHqL…`](https://testnet.nearblocks.io/txns/6AX2QHqLLjwuJ8iMcWdktw9VPFyVo7f7TXmQ4ArQH4rj) | `BLOCK price_deviation … +80% vs 5 tUSDC`; order 28 `Cancelled` 6 s after creation |
| The faucet gives 20 tUSDC per account per day, no limit across accounts | `docs/testnet.md` ("Faucet check") | 3 claims in a row from 3 accounts |
| An MCP agent (Claude Code) bought within the mandate and refused the injected listing | `docs/testnet.md` ("Claude Code with the MCP server") | orders 4, 6 settled; listing 2 declined |
| The MCP server is on npm | `npx -y horkos-mcp` with `HORKOS_AGENT` / `HORKOS_OWNER` set | `[horkos-mcp] ready …`; 5 tools |

## Design statements on the site

| Statement | Meaning | Where it is enforced |
| --- | --- | --- |
| "Nobody is paid until the delivery checks out" / "Payment waits until the delivery checks out" | The seller's balance is credited only in `on_verified` with a valid result | contract, tests above |
| "Disputes don't arise" | There is no dispute step: the buyer cannot read the data before the verifier accepts it, and payment and key release happen in the same callback. Quality beyond the JSON Schema is not checked | design (ADR-006, ADR-009); limit stated in README |
| "Losses capped by the mandate" | An agent can spend at most the mandate's caps | contract |
| "One gateway for any JSON API" | `gateway/` sells any JSON HTTP API by configuration | `cd gateway && npm test`; testnet run in `docs/testnet.md` |

## Not claimed

Mainnet deployment; on-chain attestation checks; quality checks beyond JSON Schema; independent users (`scripts/independent-buyers.mts` reports 0 so far); being first with agent escrow.
