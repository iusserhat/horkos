# For judges

**Horkos** is an escrow contract on NEAR for purchases made by AI agents. The price is locked in an order with an NFT receipt; the seller is paid only if the delivery passes a machine-checkable condition, verified in NEAR OutLayer's TEE, and otherwise the buyer is refunded after the deadline. Testnet only.

## What maps to which track

| Track | What to look at |
| --- | --- |
| NFTs | Every order is a NEP-171 receipt (`contracts/horkos`). On v2 (`contracts/horkos-v2`, `escrow-v2.horkos.testnet`) the receipt is the claim: it can be transferred while the order is open, and the refund follows the holder (ADR-036 in `docs/decisions.md`). |
| Agents | An on-chain mandate limits what an agent can buy; an MCP server ([`npx -y horkos-mcp`](https://www.npmjs.com/package/horkos-mcp), source in `mcp/`) lets Claude or any MCP agent search, order and open deliveries. |
| Real world | Sellers deliver live data (seller A: NEAR/USD prices from CoinGecko, Coinbase as fallback); the gateway (`gateway/`) turns an existing JSON API into a seller by configuration. |
| Security | Fair exchange: encrypted delivery, checked in a TEE before payment; limits enforced by the contract; per-order verifier pinning; Sentinel (`sentinel/`) for owner-side alerts and cancels; [threat model](docs/threat-model.md). |

## Checks: run this → you should see

0. **Everything local in one command.** `npm run judge` → a table with 10 of 10 PASS (about 6.5 minutes; `JUDGE_SKIP_SANDBOX=1` skips the local-node steps).

1. **CI.** Open the badge at the top of the README (Actions → CI).
   → Latest run on `main` green: contract unit and sandbox tests, verifier tests, TypeScript, sandbox demo, verifier hash checks.
2. **The verifier WASM is this repo's code.** `scripts/reproduce-verifier.sh --match-paths` (Rust via rustup; may ask to create one directory with sudo, see the script header).
   → `On-chain hash (escrow.horkos.testnet, verifier version 0): 61370b57…` … `MATCH`
3. **That WASM ran in Intel TDX on exactly order 9's input.**
   `cargo install --locked --git https://github.com/out-layer/outlayer-verify --rev 90c27d9d4fc843194ddc6f8ebaafa4eb320c3bb6 outlayer-verify`
   `outlayer-verify bundle evidence/attestation/order-9-bundle.json --offline --short`
   → `PROVEN task 102880 (execute) d2757cd2f877b2a7…3869ad2c` (orders 15, 18, 26 likewise; details in `evidence/attestation/`).
4. **A settled order on testnet.** [Order 26, `submit_delivery` → `on_verified`](https://testnet.nearblocks.io/txns/22SUFSDMVzJ2N2Joq37m9dNSKvTzM3YyPTQrfMXwC3hs) (listing 4, hosted seller A).
   → Log `Order 26 settled; data_sha256 6e703058…`; `get_order` returns `"status": "Settled"`.
5. **v2: the receipt carries the claim.** Settlement: [buyer transfers receipt #1](https://testnet.nearblocks.io/txns/9DxmwUQEtLBacJTPCEEKjhpyGztESDimHwshLptrSf3J), [order settles](https://testnet.nearblocks.io/txns/C1BTBTksm2foRkPWLzuKKeNqfJi5Kz2fgH3474uGN8FS) → the new holder opens the data (output of `demo/v2-transfer.ts`, run by the team with its testnet keys, in `docs/testnet.md`: `NEW holder opened the data: {"symbol":"NEAR/USD",...}` and `the original buyer key cannot open it`). Refund: [Buyer transfers receipt #0](https://testnet.nearblocks.io/txns/CLQE8n9UKcBv9jRB1W1ukFXTfrQ7DfmL6Wq6z5G61f4w), then [`refund_expired`](https://testnet.nearblocks.io/txns/4NFBbMtoh9cmkm8HoWW8b1ty41GcB3A3yoL4KWF66tti).
   → 5 tUSDC credited to `hk-v2holder-1114.testnet`, which [withdrew it](https://testnet.nearblocks.io/txns/Az6pUNWs842yT5jqssVuskLNATFPnpjwpct9s6M9LAns); the buyer's agent could no longer cancel.

6. **Sentinel cancels a suspicious order before delivery.** `cd sentinel && npm ci && npm run sentinel -- --config examples/readonly.json --once --from 28`
   → `order 28 (hk-judge-1114.testnet → horkos-seller-b.testnet, 9 tUSDC): BLOCK price_deviation: order 28: 9 tUSDC is +80% vs 5 tUSDC …`; on testnet Sentinel [cancelled it](https://testnet.nearblocks.io/txns/6AX2QHqLLjwuJ8iMcWdktw9VPFyVo7f7TXmQ4ArQH4rj) 6 s after it was created. Threats and what stops each: [docs/threat-model.md](docs/threat-model.md).

No accounts or keys are needed for checks 1 to 3 and 6. Try it yourself with a fresh testnet account: the [Try page](https://horkos-escrow.netlify.app/try.html). Known limits are listed in the README ("Known limitations") and in [AGENTS.md](AGENTS.md).
