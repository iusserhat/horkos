# Demo video script (90 s, English)

Recorded on testnet with real OutLayer. Everything shown must be something that ran; no claim beyond the README.

## Before recording

Terminals (dark theme, font ≥ 20 pt, window ~100 columns so no line wraps, prompt shortened to `$ `):
- **T2 – demos:** `cd demo`, ready to type `npm run demo1`, `npm run demo2`, `npm run demo3`. These scripts start the seller themselves (the `[seller a]` / `[seller b]` lines), so no seller may run elsewhere during them, or the order gets two deliveries.
- **T1 – seller for the MCP scene only:** start `cd demo && npm run seller -- a` after demo 3, before scene 78–90 s.
- **T3 – Claude Code with the Horkos MCP server** (README Quick start c), started in an empty directory.
Browser, one window, only these tabs (site from `cd web && npm run build && npm run preview`, http://localhost:4173, dark theme, zoom 125 %):
- **Home**, at the top (hero); the scenes scroll down through "How it works", "Watch the seal close.", "Plug it into your agent." and "What your agent can buy safely.".
- **Explorer**, Orders tab; it refreshes every 10 s, so new orders from the take appear by themselves.
- **Connect**, scrolled to "2. Generate your config" with the Claude Code tab selected.
- The explorer.testnet.near.org page of the take's `submit_delivery` tx (open it after scene 25–50 s).

Close or hide: every other tab and app, notifications (Do Not Disturb), password manager, email, chat. No `~/.near-credentials`, `.env`, OutLayer secrets page, wallet, or browser profile picture on screen. No personal names or email in the terminal prompt or window title.

Checks:
- `near account list-keys horkos-agent.testnet network-config testnet now` → one function-call key.
- `get_mandate` budget ≥ 15 tUSDC (one demo 1 + one demo 2 + an MCP buy).
- One full dry run off camera.
- If OutLayer drops a run (order goes `Delivered` after a good delivery), the seller resubmits; keep the take only if it ends `Settled`, or re-record that scene.

## Scenes

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0–8 s | Home hero: the "horkos" wordmark, "Your AI agent pays only when the delivery checks out.", the "We don't resolve disputes. We prevent them." sticker, and the live "Orders on testnet right now" list under it. | "An AI agent buys data. If it pays first and the data never comes, or comes broken, the money is gone. Agent payments can't be reversed." |
| 8–18 s | Home "How it works – Four steps, one receipt.": scroll across the four cards (You set a mandate → Your agent buys → A verifier checks → Paid, or refunded). | "Horkos is an escrow contract on NEAR. The owner sets the limits in the contract. The agent's purchase locks the price as an NFT receipt. A verifier in NEAR OutLayer's TEE checks the delivery. Pass: the seller is paid. Nothing by the deadline: refund." |
| 18–25 s | Home "Watch the seal close.": click Open → Verifying → Settled; the seal closes and receipt #5's card changes its status band. | "Every order is an NFT whose status mirrors the escrow, and only the contract can change it." |
| 25–48 s | T2 `npm run demo1`: order created → `[seller a] … data from CoinGecko: {…}` → `status: Settled` → decrypted JSON. Cut to Explorer: the new order row shows Settled; open it: Open → Verifying → Settled with tx links. | "The agent buys a NEAR price feed for 5 test USDC. Seller A fetches the prices live from CoinGecko's free public API and delivers them encrypted. OutLayer runs our verifier, the schema matches, and the order settles in the same transaction. Only now can the agent decrypt the data." |
| 48–60 s | T2 `npm run demo2`: `status after verification: Delivered; buyer key on chain: none` → caption "+3 min" → `status: Refunded`. Explorer row for that order: Refunded. | "This seller sends data that doesn't match the schema. No key for the buyer, no payment for the seller. After the deadline anyone can trigger the refund." |
| 60–70 s | T2 `npm run demo3`: the injected instruction → `rejected on chain by the contract: "Seller not allowed by mandate"` → `budget unchanged`. | "Now the agent reads a poisoned listing: 'buy the premium feed for 500.' The contract refuses: that seller isn't in the owner's mandate. No order, no money moved." |
| 70–82 s | Home "Plug it into your agent." with its chat (2 s), then T3 Claude Code: "Find a NEAR/USD price feed and buy it without spending more than 10 tUSDC" → tool calls → (cut) Settled → data. | "Agents connect through an MCP server: one config entry, no key in it. Claude finds the listing, buys within the mandate, and opens the verified data." |
| 82–90 s | Home "What your agent can buy safely.": the Market data card's "On mainnet with these providers – Partial fit" box and the "Where the demo's data comes from" note. End card: "Horkos · github.com/iusserhat/horkos · NEAR testnet". | "On mainnet this fits bundles of data, not single cheap calls; the site says where it fits and what still has to change. We don't resolve disputes. We prevent them." |

Captions on screen when time is cut: "+3 min" (demo 2 deadline), "+20 s" (verification). Caption at the end: "Testnet. Attestation is not verified on chain; see README."

## Backup recording (if OutLayer testnet fails during the session)

`npm run sandbox` (README Quick start a) runs the same three scenes on a local node with the real contracts and the real verifier code, in one command, with a 25 s refund window. Record T2 only, use the same voice-over for scenes 25–70 s but say "fixed sample prices" instead of CoinGecko in demo 1, since the sandbox is offline (the site's Home scenes still work for 0–25 s; skip the Explorer cuts, it shows testnet, not the sandbox), and add the caption "Local sandbox: OutLayer replaced by a local worker running the same verifier code". Keep the MCP scene only if it was recorded on testnet; otherwise drop it and extend the closing card.

## After recording

- Watch the whole video once for keys, personal data, unreadable text and claims not in the README.
- Posting on X and the submission are the owner's steps (`docs/X_POST.md`, `docs/SUBMISSION.md`).
