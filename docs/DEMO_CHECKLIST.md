# Demo video checklist (90 s, X post)

Post must include the video (no screenshots only), **@NEARProtocol** and **#NEARHackathon**. Do not claim anything the video does not show.

## Before recording

1. **Rotate the agent key** (the old function-call public key is written in `docs/TESTNET.md`; the full-access key is still on the account). Commands not yet run; check with `near account list-keys` after each:
   - New FC key: `near account add-key horkos-agent.testnet grant-function-call-access --allowance '1 NEAR' --contract-account-id escrow.horkos.testnet --function-names 'create_order, cancel_order' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send`
   - Delete the old FC key: `near account delete-keys horkos-agent.testnet public-keys ed25519:3Py9s8PuWvcSbrrCpw14T6RVbF6WqBxikNBSva1skmpK network-config testnet sign-with-legacy-keychain send`
   - Owner's decision: delete the agent's full-access key too (then the agent can only buy within the mandate). Do this last; it cannot be undone without another key.
   - Update the FC key line in `docs/TESTNET.md`. `demo/config.ts` finds the FC key automatically.
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
| 8–18 s | Mandate line (agent, 10 tUSDC/order, sellers A and B, 50 tUSDC budget) | "The owner sets limits in the contract, not in the agent." |
| 18–40 s | Demo 1: `Open` → worker `valid=true` → `Settled` → decrypted JSON | "5 tUSDC locked, receipt minted. The data passes the schema check, the seller is paid, the buyer gets the key." |
| 40–65 s | Demo 2: `valid=false, reason: schema…` → `Delivered` → "nothing to open" → `Refunded`, budget back | "Bad data fails verification. The buyer never sees it, the seller is never paid, and the deadline refunds the money." |
| 65–80 s | Demo 3: prompt-injection text → `create_order rejected: Seller not allowed by mandate` | "A hijacked agent tries to pay 500 tUSDC to an unknown seller. The contract refuses." |
| 80–90 s | README status table + repo URL | "We don't resolve disputes. We prevent them." If sandbox: caption "Run locally: OutLayer testnet was down on 13 Nov." |

## After recording

- Watch it once for keys, wrong claims, unreadable text.
- Posting on X and the submission need the owner's explicit approval.
