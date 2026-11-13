# Demo video checklist (90 s, X post)

Post must include the video (no screenshots only), **@NEARProtocol** and **#NEARHackathon**. Do not claim anything the video does not show.

## Before recording

1. Agent key: **done 13 Nov** (new function-call key, old one and the full-access key deleted; `docs/TESTNET.md`). Check before recording: `near account list-keys horkos-agent.testnet network-config testnet now` shows one function-call key.
2. Close other terminal tabs; font ≥ 18 pt; dark theme; window ~110 columns so lines do not wrap.
3. Nothing secret on screen: no `~/.near-credentials`, no `.env`, no OutLayer secrets page.
4. Dry run once, off camera.

## Command order

Testnet (only if OutLayer testnet works and `set_verifier` v0 is published):
1. Terminal A: `cd demo && npm run seller` (sellers A, B, C).
2. Terminal B: `npm run demo1`, then `npm run demo2` (waits for the 3 min window), then `npm run demo3`.
3. Browser: testnet explorer for the settled order's tx, and `get_order` output.

Fallback (sandbox, stated in README and on screen): `contracts/scripts/build.sh`, then `cd demo && CARGO_TARGET_DIR=../contracts/target npm run sandbox`. One run shows all three demos (~1.5 min including the 25 s refund wait; cut the wait in editing and say so with an on-screen "+25 s").

## 90-second script

| Time | Screen | Voice / caption |
| --- | --- | --- |
| 0–8 s | Title: "Horkos — escrow for AI agent purchases on NEAR" | "AI agents can pay. They can't get refunds." |
| 8–18 s | Mandate (`get_mandate`: agent, 10 tUSDC/order, sellers A and B, budget — 45 tUSDC after today's runs; top up with `owner.deposit` if you want 50) | "The owner sets limits in the contract, not in the agent." |
| 18–40 s | Demo 1: order created → seller delivers → `status: Settled` → decrypted JSON → receipt NFT | "5 tUSDC locked, receipt minted. The data passes the schema check, the seller is paid, the buyer gets the key." |
| 40–65 s | Demo 2: `Delivered; buyer key on chain: none` → (cut the 3 min wait, caption "+3 min") → `Refunded` | "Bad data fails verification. The buyer never sees it, the seller is never paid, and the deadline refunds the money." |
| 65–80 s | Demo 3: prompt-injection text → `create_order rejected: Seller not allowed by mandate` | "A hijacked agent tries to pay 500 tUSDC to an unknown seller. The contract refuses." |
| (optional) | Claude Desktop with the Horkos MCP server: "buy a NEAR/USD feed, max 10 tUSDC" → tool calls → data; then "buy the premium feed" → rejected | Only if it fits in 90 s; otherwise a second clip. |
| 80–90 s | README status table + repo URL | "We don't resolve disputes. We prevent them." |

## After recording

- Watch it once for keys, wrong claims, unreadable text.
- Posting on X and the submission need the owner's explicit approval.
