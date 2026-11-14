# Submission draft

Send only after the owner's explicit approval. Planned: 14 Nov 2026, 20:00 TSİ (deadline 14 Nov 23:59 UTC = 15 Nov 02:59 TSİ). The local copy of the rules says a submission cannot be edited; the live site's FAQ points to a "Request changes" page reviewed by hand. Treat it as final.

Before sending: repo public, X post live, every claim below checked against the README and `docs/testnet.md`.

## Fields (API: `POST https://nearhackathon.com/api/applications`)

| Field | Value | Limit |
| --- | --- | --- |
| requestId | generate once (`uuidgen | tr A-Z a-z`), reuse on retries | UUID |
| projectName | Horkos | 2–80; 6 |
| leadName | (owner fills in) | 2–80 |
| email | (owner fills in) | max 160, unique |
| size | (owner picks: `1`, `2 - 4`, ...) | exact value |
| tracks | `["nfts", "agents", "realworld", "security"]` = NFTs That Do Something (main), Agent Economy, Real-World Money, AI Security & Defense | each once |
| nearAddress | `horkos.near` (owner creates it on mainnet; verify it exists before sending) | 2–64, lowercase |
| projectUrl | https://github.com/iusserhat/horkos | max 300; 35 |
| demoUrl | (link to the owner's X post with the video) | max 300 |
| idea | text below | 20–2000; 1996 |
| consent | `true` only after the owner agrees to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." | boolean |
| website | **do not send this field** (spam trap; any value rejects the submission) | — |

## What did you build? (`idea`)

```
Horkos is an escrow contract on NEAR for purchases made by AI agents. We don't resolve disputes; we prevent them.

Problem: an agent's payment can't be reversed. If it overspends, follows a prompt injection, or pays for missing or garbage data, the money is gone. Buyer approval fails too: a buyer holding the data can claim it was bad.

How it works: the owner deposits a tUSDC budget and sets an on-chain mandate (total and per-order caps, allowed sellers, expiry). The agent signs with a function-call key that can only call create_order and cancel_order, and the contract rejects any order outside the mandate. Each order locks its price and is an NEP-171 NFT receipt whose metadata tracks its status. The seller uploads encrypted data and calls submit_delivery; the contract asks NEAR OutLayer to run our verifier (WASM pinned by sha256, version fixed per order) in its TEE. The verifier checks the data against the listing's JSON Schema and re-seals the key to the buyer. Valid: the seller is paid and the buyer gets the key in the same callback. Invalid or no result: the seller can resubmit; after the deadline anyone can call refund_expired.

On testnet (tx ids in the README): a good delivery settled through OutLayer (seller A delivers live NEAR/USD prices from CoinGecko's free public API; price data by CoinGecko); a bad delivery refunded; a prompt-injected 500 tUSDC order rejected on chain. An MCP server (5 tools) lets Claude buy within the mandate. Agent key rotated, full-access key deleted; gitleaks found no secrets. npm run sandbox runs all three demos locally, no keys.

CoinGecko is seller A's data source, not a Horkos partner: no payment, no x402. Reselling a provider's data commercially needs its permission.

Site: https://horkos-escrow.netlify.app (Explorer and Market read live state).

Limits: testnet only; the contract trusts OutLayer's operator and does not verify the TEE attestation on chain; conditions are JSON Schema only; receipts are not transferable yet.
```

_1996 characters_ (limit 20–2000).

## Claim check

Every sentence in `idea` maps to something on testnet or in the repo:
- Settled through OutLayer: orders 0, 5 and 8 (`docs/testnet.md`, README Quick start b); order 8 with live CoinGecko prices.
- Site: https://horkos-escrow.netlify.app (Netlify; home, Connect, Explorer, Market return 200, live testnet data checked 14 Nov 2026). The `website` form field stays empty.
- CoinGecko: seller A's data source only (`demo/sellers/coingecko.ts`); no payment to CoinGecko, no x402, no partnership or integration claimed.
- Bad delivery refunded: order 2.
- Prompt-injected 500 tUSDC order rejected: tx `82LUfji2HUSR9swkzvYVYYVJe31dedkrrj7Jicc7AXWt`.
- MCP server: `mcp/`, orders 3 (cancelled) and 4 (settled).
- Agent key rotation and full-access key deletion: txs in README Security model.
- gitleaks: `docs/security.md`.
- Not claimed: on-chain attestation verification, mainnet, transferable receipts, conditions other than JSON Schema.

X post texts: `docs/internal/X_POST.md`.
