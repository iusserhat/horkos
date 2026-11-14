# Horkos web — design brief

Status: draft for the owner's approval. No code until approved.

## 1. Goal and audience

A judge or developer should understand within 30 seconds: what Horkos prevents, how an order moves through the contract, how to connect an agent (5 minutes, everything on the site), and that it runs on testnet now (live data, real tx links).

Three static pages, no backend: **Home** (`/`), **Connect** (`/connect`), **Explorer** (`/explorer`). Data comes straight from NEAR testnet RPC in the browser.

## 2. Tone

Technical documentation, not a launch page. Reference points: Stripe docs (precise copy, code next to prose), Linear (restraint, typographic hierarchy), Vercel (neutral surfaces, one accent). Every sentence names a concrete thing: a method, an account, a number, a tx. No adjectives that cannot be checked. Words banned in copy: revolutionizing, the future of, seamless, unleash, empower, next-gen, trustless, production-ready.

Rationale: the audience is judges and developers who verify claims (Q-017 screening reads the repo and README). A site that looks like docs and links every claim to chain data earns trust faster than visual effects.

## 3. Color tokens

One accent (teal). Status colors are semantic and always paired with a text label and an icon shape, never color alone. All text pairs below are WCAG AA (≥ 4.5:1) on both `--bg` and `--surface`; ratios computed.

```css
:root {                       /* light */
  --bg:        #FFFFFF;
  --surface:   #F6F7F8;
  --border:    #E3E5E8;
  --text:      #0E1116;       /* 18.9 */
  --muted:     #5A616C;       /*  6.2 */
  --accent:    #0B7363;       /*  5.8; white text on accent 5.8 */
  --st-open:   #0E1116;       /* outline badge */
  --st-verify: #0B7363;       /* = accent */
  --st-deliv:  #9A4A06;       /*  6.3 */
  --st-settle: #167A3A;       /*  5.4 */
  --st-refund: #4A5668;       /*  7.4 */
  --st-cancel: #5A616C;
  --danger:    #B42318;       /*  6.6 (rejections) */
  --code-bg:   #F6F7F8;
}
:root[data-theme="dark"], @media (prefers-color-scheme: dark) {
  --bg:        #0B0D10;
  --surface:   #14171B;
  --border:    #262B31;
  --text:      #E8EAED;       /* 16.1 */
  --muted:     #9AA3AE;       /*  7.6 */
  --accent:    #45BBA8;       /*  8.3; --bg text on accent 8.3 */
  --st-deliv:  #E2A64E;  --st-settle: #5CC47F;  --st-refund: #A7B4C4;
  --danger:    #F27D6F;  --code-bg: #14171B;
}
```

No gradients, no shadows beyond a 1 px border, no blur. Theme toggle in the header (system default, remembered in `localStorage`, wrapped in try/catch).

## 4. Typography (2 families)

- **IBM Plex Sans** (400, 500, 600) for text; **IBM Plex Mono** (400, 500) for code, account ids, hashes, amounts. Self-hosted woff2 via `@fontsource` (SIL OFL), `font-display: swap`, only Latin subset.
- Scale (rem, 16 px base): 0.8125 caption · 0.9375 small · 1 body · 1.25 h4 · 1.5 h3 · 2 h2 · 2.75 h1 (clamp to 2 on ≤ 480 px). Line height 1.6 body, 1.15 headings. Max text width 68 ch.
- Hashes and account ids are mono, truncated in the middle (`92QVpc…LmzA`) with the full value in `title` and copy-on-click.

## 5. Spacing and layout

4 px base: `4 8 12 16 24 32 48 64 96`. Content width 1120 px, 24 px gutters (16 px ≤ 480 px). Sections separated by 96 px (64 px mobile). Radius 6 px for controls, 8 px for panels. Grid: 12 columns desktop, single column ≤ 768 px. Works to 360 px wide, no horizontal page scroll (code blocks scroll inside themselves).

## 6. Motion

Only the "How it works" flow animates. One SVG; a small token (the order) moves along the edge for the current step; the active node gets an accent outline; the step caption swaps. 300 ms ease-out per step, no looping effects elsewhere, no scroll-triggered animation, no auto-scroll. Autoplay advances every 3.5 s, pauses on hover/focus or when the user presses a control, and does not start when `prefers-reduced-motion: reduce` (then steps change instantly, no token travel).

## 7. Components

Header (logo wordmark, nav: How it works · Connect · Explorer · GitHub, theme toggle) · Button (primary accent / secondary outline) · Code block (mono, copy button, language label) · Tabs (ARIA tablist, arrow-key navigation) · Stepper controls (prev / play-pause / next, step dots with labels, `aria-live="polite"` caption) · Flow diagram (SVG, 6 nodes) · Status badge (label + icon shape: circle open, half circle verifying, triangle delivered, check settled, return arrow refunded, slash cancelled) · Tx link (mono, external icon, explorer.testnet.near.org) · Data table (orders) collapsing to cards ≤ 768 px · Receipt card (NFT: order id, amount, seller, status band) · Progress bar (spent / max_total, with numbers in text) · Key-value list · Callout (note / limitation, border-left only) · Config generator form (selects + text inputs, read-only output) · Footer.

## 8. Pages

### Home

```
┌───────────────────────────────────────────────────────────────────────┐
│ HORKOS            How it works  Connect  Explorer  GitHub      [◐]    │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Escrow for AI agent purchases on NEAR.                               │
│  The seller is paid only when the owner's mandate allows the order    │
│  and a verifier accepts the delivery. Otherwise the money returns.    │
│                                                                       │
│  We don't resolve disputes. We prevent them.                          │
│                                                                       │
│  [ Connect your agent ]  [ See it live → ]        testnet · 6 orders  │
│                                                   live from chain     │
├───────────────────────────────────────────────────────────────────────┤
│  THE PROBLEM                                                          │
│  3 sentences                       ┌ pay first ─────┐ ┌ data first ─┐ │
│                                    │ agent ──$──▶ ✕ │ │ ✕ ◀──▤── s  │ │
│                                    │ no data        │ │ no payment  │ │
│                                    └────────────────┘ └─────────────┘ │
├───────────────────────────────────────────────────────────────────────┤
│  HOW IT WORKS   [Happy path][No delivery][Failed check][Out of mandate]│
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Owner ──mandate──▶ ┌──────────┐ ◀──submit_delivery── Seller    │  │
│  │                     │  Escrow  │                                │  │
│  │  Agent ─create_order▶ contract │ ──request_execution──▶ OutLayer│  │
│  │                     └──────────┘ ◀──on_verified────────  TEE    │  │
│  │                          │ mint                                 │  │
│  │                      NFT receipt                                │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  Step 3 of 6 · submit_delivery                                        │
│  "Seller attaches the data key sealed to the verifier; order →        │
│   Verifying; contract calls OutLayer request_execution."              │
│  [◀] [❚❚] [▶]   ● ● ◉ ○ ○ ○                                           │
├───────────────────────────────────────────────────────────────────────┤
│  USE CASES  (2×2 grid, each: agent gets / seller gives / checked /    │
│              refund when; tag "works today" or "planned condition")   │
├───────────────────────────────────────────────────────────────────────┤
│  SECURITY MODEL            │  KNOWN LIMITATIONS                       │
│  5 short lines, tx links   │  6 short lines                           │
├───────────────────────────────────────────────────────────────────────┤
│ GitHub · Docs · MIT · Built for NEAR Hackathon                        │
└───────────────────────────────────────────────────────────────────────┘
mobile (390): single column; diagram scales to width (viewBox), labels
stay ≥ 12 px by switching to a vertical layout of the same 6 nodes.
```

Flow steps (happy path), each with the one line the contract actually does:
1. Mandate: `set_mandate` stores caps, sellers, expiry; `ft_transfer_call` adds budget.
2. create_order: limits checked; price moves to escrow; NFT receipt minted to the owner; `Open`.
3. submit_delivery: key sealed to the verifier; `Verifying`; `request_execution` to OutLayer.
4. Verification: verifier in the TEE decrypts, checks the JSON Schema, re-seals the key to the buyer.
5. on_verified: valid and before deadline → seller's internal balance credited; `Settled`.
6. Key opens: buyer reads `encrypted_key`, decrypts the data; seller calls `withdraw`.
Alternative tabs: No delivery (Open → deadline → `refund_expired` → `Refunded`); Failed check (`Verifying → Delivered`, resubmit → `Verifying → Settled`, or deadline → `Refunded`); Out of mandate (`create_order` panics "Seller not allowed by mandate"; no order, no NFT).

Use cases (from `docs/DESIGN.md` §8; only JSON Schema conditions exist today, the site says so):
1. Dataset purchase — works today: schema, minimum rows. Refund when the schema fails or nothing arrives by the deadline.
2. Market or API data feed (≥ $1 per order; DESIGN.md rules out cent-sized calls) — works today: schema of the response.
3. Agent-to-agent job with structured output (e.g. labels as JSON) — works today for shape; hidden control samples are planned.
4. Code work against a test suite — planned condition type, labeled "not yet".

### Connect

```
┌───────────────────────────────────────────────────────────────────────┐
│ CONNECT YOUR AGENT                                                    │
│ ┌ On this page ┐  1. Requirements (Node 20, git, near-cli-rs)         │
│ │ 1 Install    │  2. Generate your config  ┌ form ────────┬ output ─┐ │
│ │ 2 Config     │     network  [testnet ▾]  │ owner [ ]    │ {json}  │ │
│ │ 3 Mandate    │     client   [Claude Code▾]│ agent [ ]    │ [copy]  │ │
│ │ 4 Tools      │     (no key field, ever)  └──────────────┴─────────┘ │
│ │ 5 Examples   │  3. Set up a mandate (near-cli commands, why the     │
│ │ 6 SDK        │     function-call key only allows 2 methods)         │
│ │ 7 Troublesh. │  4. Tools: 5 entries, each: what / params / request  │
│ └──────────────┘     / response (from the real run, order 6)          │
│                   5. "Ask → you see" conversations (real transcripts)  │
│                   6. SDK: 15-line TypeScript example                   │
│                   7. Troubleshooting: OutLayer failure, storage        │
│                      deposit, open-order cap                           │
└───────────────────────────────────────────────────────────────────────┘
client tabs: Claude Code · Claude Desktop · Cursor · Other MCP clients
mobile: sticky "on this page" becomes a collapsible list at the top.
```

Config generator: inputs are network (testnet only, mainnet disabled with a note), owner account, agent account, client, and the absolute path of the cloned repo. Output: the client's config JSON (or `claude mcp add` command) with `HORKOS_AGENT` / `HORKOS_OWNER` env values. There is no key input. A callout explains: the server reads the agent's function-call key from `~/.near-credentials/testnet/<agent>/` (near-cli legacy keychain) on your machine, or from `HORKOS_AGENT_KEY` set in your own shell; the site never sees it. Client config formats will be checked against each client's current docs before writing them.

### Explorer

```
┌───────────────────────────────────────────────────────────────────────┐
│ EXPLORER  escrow.horkos.testnet · updated 3 s ago · auto-refresh 10 s │
│ [Orders] [Receipts] [Mandates] [Verifiers] [Listings]                 │
│ ┌ id ┬ status ────┬ amount ┬ seller ───────┬ deadline ┬ att ┬ txs ┐   │
│ │ 6  │ ✓ Settled  │ 5 tUSDC│ seller-a     │ 14:38 UTC│ 1   │ ↗   │   │
│ │ 4  │ ✓ Settled  │ 5 tUSDC│ seller-a     │ …        │ 2   │ ↗   │   │
│ │ 3  │ ⊘ Cancelled│ …      │              │          │     │     │   │
│ └────┴───────────┴────────┴──────────────┴──────────┴─────┴─────┘   │
│ ▼ order 4 (click)                                                     │
│   Open ─▶ Verifying ─▶ Delivered ─▶ Verifying ─▶ Settled   (same SVG  │
│   create_order ↗  submit_delivery ↗  (no result)  resubmit ↗  language)│
├───────────────────────────────────────────────────────────────────────┤
│ Receipts: cards grid (order id, amount, seller, status band)          │
│ Mandates: owner, agent, spent/max progress bar, per-order cap,        │
│           allowed sellers, expiry, open orders/cap                    │
│ Verifiers: version, wasm sha256, URL (gist link), OutLayer account    │
└───────────────────────────────────────────────────────────────────────┘
mobile: table → stacked cards; tabs scroll horizontally inside their bar.
```

## 9. Data sources and contract gaps (contract is not changed)

| Need | Source | Gap |
| --- | --- | --- |
| All orders | `nft_total_supply` + `nft_tokens` (one NFT per order, never burned) → `get_order` | No `list_orders` view; works via NFTs. |
| Receipts | `nft_tokens` | — |
| Mandates | `get_mandate(owner)` for owners seen in `nft_tokens` (owner = buyer) plus `horkos-owner.testnet` | **No way to list mandates.** Owners without orders are invisible. |
| Verifiers | `get_verifier` (latest version n) → `get_verifier_version(0..n)` | — |
| Listings | `get_listing(0, 1, …)` until null | No count view; scan stops at the first gap (ids are sequential, so fine). |
| Order history + tx links | **Not on chain.** The order stores no tx hashes and there is no history view. Proposal: on click, read the escrow's transactions from the NearBlocks testnet API (CORS open, rate-limited) and pick the `order_status` events for that order; cache results; if the API fails, show a timeline reconstructed from `created_at`, `attempts`, `status`, `deadline` without tx links and say so. | Third-party indexer dependency. |

RPC: `https://test.rpc.fastnear.com` (CORS open), plain `fetch` JSON-RPC `call_function`, no near-api-js in the bundle.

## 10. Tech

`web/`: Vite + TypeScript, **no React** (three small pages, vanilla TS modules keep the bundle and dependency count low). Dependencies: `vite`, `typescript`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`; dev-only `playwright` (screenshots) and `lighthouse` (scores). Static build to `web/dist`. GitHub Pages workflow written but disabled (`workflow_dispatch` only, no push trigger). Lighthouse target ≥ 90 performance and accessibility on all three pages; screenshots 1440 px and 390 px in `docs/screenshots/`.

## 11. Decisions for the owner

1. Approve palette, fonts (IBM Plex Sans + Mono) and accent (teal).
2. Vanilla TS instead of React — OK?
3. Order history from the NearBlocks API (third party) with a reconstructed-timeline fallback — OK?
4. Use-case 4 (code against tests) shown as "planned", since only JSON Schema conditions exist — OK?
5. Mandate list is limited to owners that have orders (no list view in the contract) — OK, or should the site only show the demo owner?
