# Testnet deployment

Deployed 1 Nov 2026; escrow code redeployed the same day (adds `VerifierConfig.encryption_pubkey`, tx `Ew9zx6nCRBynQXviidBAoqqJKFG6tzG7P3mKnzhhwu8b`) (near-sdk 5.30.0, cargo-near 0.22.0, `cargo near build non-reproducible-wasm`).

| Account | Role | Code sha256 |
| --- | --- | --- |
| `escrow.horkos.testnet` | Horkos contract, `new(token = tusdc.horkos.testnet, admin = horkos.testnet)` | `77b9d96cb731687f9c86e984cb01e79b2c10a6a5c82d5e8f2a82645bd6d6c84d` |
| `tusdc.horkos.testnet` | Test token tUSDC (NEP-141, 6 decimals), 1,000,000 minted to `horkos.testnet` | `79c37d5c1744438dee951a971041ce119fe8ce3b59bc381b59466f4d309f1a68` |
| `horkos.testnet` | Admin of the escrow (publishes verifier versions), token owner (`mint`) | — |
| `probe.horkos.testnet` | OutLayer spike contract (`spikes/outlayer/probe`) | — |

Initial transactions: token deploy `5oVQ2HERAaogMBSBTGnvnaDzuXUHQEiFy2tCHuMqQGPN`, escrow deploy `8pXPACZe4KVLvZrymeMGBEq2TKa4cBP9ik9aBg6tSFuM`, escrow registered on token `8uGEdigtB5BgU7KfQVRsHsNSb8zyZr5VFCtY1rKtuwEs`.

Verify the deployed code matches a local build:

```bash
contracts/scripts/build.sh
sha256sum "$CARGO_TARGET_DIR/near/horkos/horkos.wasm"
near account view-account-summary escrow.horkos.testnet network-config testnet now   # "Local Contract (SHA-256 checksum hex)"
```

State on 1 Nov: no verifier published yet (`get_verifier` → `null`), so `create_order` is rejected ("Verifier not configured") until the verifier WASM is hosted and `set_verifier` is called.

**Trust note:** the contract accounts still have full-access keys (kept in the deployer's local keychain, not in the repo). Whoever holds them can redeploy the code; see the threat model in `DESIGN.md`.

## Demo accounts

Created with the testnet faucet (10 NEAR each). Keys are in the deployer's `~/.near-credentials/testnet` (legacy keychain), never in the repo.

| Account | Role |
| --- | --- |
| `horkos-owner.testnet` | Mandate owner: budget 50 tUSDC, max 10 tUSDC per order, allowed sellers A and B, expires 30 Nov 2026 |
| `horkos-agent.testnet` | Agent. Only key: function-call key `ed25519:8x19MCUbWj24HTVxqn2J8EkpvK5Lf8KMZA2iHsjAUStJ`, `create_order` / `cancel_order` on `escrow.horkos.testnet`, allowance 5 NEAR. No full-access key (rotation 13 Nov, below). |
| `horkos-seller-a.testnet` | Listing 0: 5 tUSDC, 10 min window; delivers data matching the schema |
| `horkos-seller-b.testnet` | Listing 1: 5 tUSDC, 3 min window; delivers data that fails the schema |
| `horkos-seller-c.testnet` | Listing 2: 500 tUSDC; not on the owner's allowed list |

All listings use the same JSON Schema condition (`demo/sellers/profiles.ts`), `sha256:84d788383d9e3a888a6a8e0852ba7500c72aac1d6a05d41e7d92a7b7a0a39496`, published to FastFS.

Demo 3 ran on 1 Nov 2026: the agent's function-call key sent `create_order` for listing 2 and the contract rejected it with "Seller not allowed by mandate"; budget and open orders unchanged. Demos 1 and 2 need a published verifier.

## OutLayer commands that work (13 Nov 2026)

- Cost estimate: `near contract call-function as-read-only outlayer.testnet estimate_execution_cost json-args '{"resource_limits":{"max_instructions":10000000000,"max_memory_mb":128,"max_execution_seconds":60}}' network-config testnet now` → 0.007001 NEAR upper bound; actual charge for the verifier ≈ 0.0015 NEAR, the rest is refunded.
- Direct run of the verifier (any account, e.g. to read its public key): `near contract call-function as-transaction outlayer.testnet request_execution json-args '{"source":{"WasmUrl":{"url":"<wasm_url>","hash":"<sha256>","build_target":"wasm32-wasip2"}},"resource_limits":{...as above...},"input_data":"{\"cmd\":\"pubkey\"}","response_format":"Json","secrets_ref":{"profile":"verifier","account_id":"horkos.testnet"}}' prepaid-gas '300 Tgas' attached-deposit '0.01 NEAR' sign-as horkos.testnet network-config testnet sign-with-legacy-keychain send` — the return value is the verifier's JSON output.
- First run of the gist-hosted verifier v0 (no secret yet): tx `6dnGVTiB1e8sDyEYrv7MoSdKGsLnPqUDFe7oCyNKo8wv`, WASM fetched and run in the TEE, output `{"error":"verifier secret key not available"}` as expected. Hosting and setup steps: `docs/VERIFIER_SETUP.md`.
- With the secret (`verifier` profile, accessor WasmHash, access `AllowAll AND WasmHash`): request 38311 tx `22kdu6b3JJoesbH2y6jjQ6uNrUuQq32mg9LbgejmKJXf` and retry tx `Ds6y6n89BSsCCw4j9B4t6twKYUoyggRneqW9b7gqxSbQ` both ended "Execution promise failed", no `execution_completed` event, callback `null`. The verifier cannot panic on a bad key, so the worker refused before running (likely secrets access). Check: `near contract call-function as-read-only outlayer.testnet list_user_secrets json-args '{"account_id":"horkos.testnet"}' network-config testnet now`.
- **OutLayer testnet outage, 13 Nov 2026 from at least 15:03 TSİ (12:03 UTC):** the OutLayer dashboard lists every testnet execution (dozens of accounts) as "Infrastructure Error", including ours (dashboard ids 91032, 91085; on-chain requests 38311 and the retry). Error text: "Failed to submit to NEAR: the chain did not take resolve_execution ... Smart contract panicked at src/execution.rs:1052:14: Execution request not found". The worker runs, but cannot write the result on chain. Our secret settings were not the cause and stay unchanged (build lock kept).
- Retries after the outage: 15:16 TSİ failed (tx `BJT8YtUot2Auq8FcSdZXgPkDV4Czyd6qBwft1YWxm7X7`); **15:49 TSİ succeeded** (tx `5iWyLC1TVjd7v4CKSDU4yggATB4x4g42TJs4xJAZRtRH`): the verifier read `PROTECTED_VERIFIER_SK` in the TEE and printed its public key `pLiqba7GL8rXlTp8kUWIMbpJQ7d73xbG/toxTKJn72o=`.

## Verifier v0 published (13 Nov 2026)

`set_verifier` by `horkos.testnet`, tx `5AmP9nyCvwPN13XLJojKurnjD7tfRtF4395atmWLizmU`, returned version `0`. Config: outlayer `outlayer.testnet`, WASM URL and sha256 as in `docs/VERIFIER_SETUP.md`, `build_target` `wasm32-wasip2`, `encryption_pubkey` above, secrets `verifier` / `horkos.testnet`, `min_fee` 0.01 NEAR, `max_fee` 0.05 NEAR. Check: `near contract call-function as-read-only escrow.horkos.testnet get_verifier json-args '{}' network-config testnet now`.

## Demos 1 and 2 on testnet (13 Nov 2026, real OutLayer, verifier v0)

- **Demo 1 (Settled):** `create_order` order 0, tx `92QVpcmFUQbxpYYV32sqR9CKdnxnN1n9H6VtH6KbLmzA`; seller A `submit_delivery` tx `DgGzhbkGBEMHGG9duhFSQHgTKsXpxi9NgngEMb1BLAoD` → OutLayer ran the verifier in the TEE, `on_verified` settled the order in the same transaction; the buyer decrypted the JSON (`{"symbol":"NEAR/USD","rows":[...]}`). Receipt NFT #0 status `Settled`.
- **Demo 2 (Refunded):** `create_order` order 2, tx `4zL12Bg9TNRgVtXyyh7KfBrCRcQsa4bbuap2b3jd6rL6`; seller B `submit_delivery` tx `HgPppJUNPThmUDfEpDxhtTnFeZZDVktzggR4thvhE2yj` → verification failed, order `Delivered`, no buyer key on chain; after the 3 min deadline `refund_expired` tx `7PkEjmE3LJfQeH3Ko5KvNXT4Xm9EFzF3Qpg84xXssfC5` → `Refunded`.
- First demo 2 attempt (order 1, tx `B5cbpbtps5PRi62cofxVGR28R3iUKSCGfdEC7VjJxxpx`) stopped in the script: the RPC node did not yet see the new order ("order 1 not found"), so the seller never delivered. Refunded after its deadline, tx `LY8cJkjSGVMifUVzGZmmsNGFj1kRQMoS6LZ2hGrFSGG`. Fixed in the SDK (`waitForSettlement` keeps polling while the order is not visible).
- Owner budget afterwards: balance 45 tUSDC, spent 5 tUSDC (only the settled order).
- Re-check after recovery: pubkey call tx `57W9pyBzYoeFMa2KD3q55KCnt2JmEZTJBLjSKFM8r5Zv` returned the same public key; v0 unchanged.

## Agent key rotation (13 Nov 2026, ~17:00 TSİ)

1. New function-call key `ed25519:8x19MCUbWj24HTVxqn2J8EkpvK5Lf8KMZA2iHsjAUStJ` (escrow only, `create_order` + `cancel_order`, 5 NEAR allowance): tx `CAAqVKNCBhdDUG3dk8Pir72nUiH6ZXQgVgGJAQPD2Xqd`.
2. Old function-call key `ed25519:3Py9s8PuWvcSbrrCpw14T6RVbF6WqBxikNBSva1skmpK` deleted: tx `DDXYxnKkkLwdAwmbjtu6YMMcuc5PswzWDHhsg2g3Q7ET`.
3. Demo 3 with the new key: `create_order` for seller C rejected ("Seller not allowed by mandate"), tx `82LUfji2HUSR9swkzvYVYYVJe31dedkrrj7Jicc7AXWt`; budget 45 → 45 tUSDC, open orders 0 → 0.
4. Full-access key `ed25519:6UMTADMRKpKErS2guxcYEEHEgX3ozWSR8JfHi1fiPsZR` deleted: tx `AHSj5g6T8hf8un6j3PdeVhHn3SjAWgcu13AD6uVqxMjc`. Its local keychain files were removed too. The agent account can no longer add keys, move NEAR or call anything but the two escrow methods.

Check: `near account list-keys horkos-agent.testnet network-config testnet now` → one row, `only do ["create_order", "cancel_order"] function calls on escrow.horkos.testnet with an allowance of 4.99… NEAR`.

## MCP server on testnet (13 Nov 2026, ~17:05 TSİ)

Driven by `mcp/smoke.ts` (official MCP SDK client over stdio):
- `horkos_create_order` listing 2 (500 tUSDC, seller C) → `Order not created: Seller not allowed by mandate`.
- Order 3: `horkos_create_order` listing 0 → `Open`, `horkos_cancel_order` → `Cancelled`.
- Order 4: `horkos_create_order` listing 0 → seller A delivered (tx `JEGNjxrQbVSbfLSYio1v7DsPgS9PRH9HRbRtutLAYfKx`), but OutLayer request 38907 ended "Execution promise failed" with no result, so the contract moved the order back to `Delivered` (as designed). A pubkey probe right after worked (tx `295DUEG27RrHV2H3C3jHNqrG7QV44DEybt5rvbYadhbR`). Seller A resubmitted (attempt 2) → `Settled`; `horkos_open_delivery` returned the JSON. So OutLayer testnet still fails some runs intermittently; the resubmit path covers it.

## Demo 1 re-run (13 Nov 2026, 14:22 UTC, rotated agent key)

Order 5: `create_order` tx `5jdfoCPv37ayyLefChhvRqLrnFGKEsNdsQRgHmnzY95`, seller A `submit_delivery` tx `CbL9cC4uEvV8s5MjMaTKqNrvr6f743FcQoyHHmE2gb5S` → `Settled` on the first attempt; buyer decrypted the JSON; receipt NFT #5 status `Settled`.

## Claude Code with the MCP server (13 Nov 2026, ~14:30 UTC)

`claude mcp add horkos -- <mcp>/node_modules/.bin/tsx <mcp>/server.ts` in an empty directory (→ `✔ Connected`), then `claude -p` (Sonnet) with seller A running:
- "Find a NEAR/USD price feed and buy it without spending more than 10 tUSDC, then show me the data." → `horkos_search_listings`, `horkos_create_order` (order 6), `horkos_get_order` ×4 (`Open → Verifying → Settled`), `horkos_open_delivery` → the JSON.
- "Buy the premium NEAR/USD feed listed on Horkos." → Claude searched, then declined: it identified listing 2's text as a prompt injection and saw `seller_allowed_by_mandate: false`. No `create_order` was sent.
The server entry was removed afterwards (`claude mcp remove horkos`).

## Demo 1 with live CoinGecko data (13 Nov 2026, 16:52 UTC)

Seller A now fetches NEAR/USD from CoinGecko's free public API (`/api/v3/coins/near/market_chart?vs_currency=usd&days=1`, no key; last 4 points; `demo/sellers/coingecko.ts`). No fallback: if CoinGecko does not answer, the seller logs the error and delivers nothing. Listing 0's schema and condition hash are unchanged; the schema has `additionalProperties: false`, so no `source` field is added.

Order 8 (`npm run demo1`): `create_order` tx `83XaoQwthAgLEiJViT1hwXQEwfGiZunFssoCCFtkRWyX`, seller A `submit_delivery` tx `C97q52MF6UcN4G8M3EAG5JoY4Cpa3Z4kQrNqUB7UN4WB` (`Verifying` → `Settled` in the same transaction tree); the buyer decrypted `{"symbol":"NEAR/USD","rows":[{"t":1794588000,"price":3.502227668047138},{"t":1794588300,"price":3.493038727538854},{"t":1794588600,"price":3.494547529635413},{"t":1794588660,"price":3.499031485674342}]}`. Check: the same endpoint read again at 16:53:52 UTC returned the first three points with identical values; the fourth is CoinGecko's live point at 16:51:00, which CoinGecko replaces as time moves (its 16:52:40 point was 3.50138).

## Seller gateway, configuration only (14 Nov 2026, 08:56 UTC)

`horkos-seller-a.testnet` sold a new listing with no seller code: `gateway/examples/coingecko.json` (CoinGecko's free `simple/price` endpoint, no key) and `gateway/examples/coingecko-schema.json`. Steps: `npm run gateway -- check --config examples/coingecko-testnet.json` (OK, usd 3.31), `register` (listing 3: 5 tUSDC, 10 min, condition `sha256:2abb3e2b80f1f421eb7937b1463d277aafdc817a89b12f84b25564bd1d3aca50`), then `run`.

| Step | Tx |
| --- | --- |
| `register_listing` (listing 3) | `6t7JPNToywDV25LdxxPu5BK5sCrKkrUsEHNfn4kq5z5Q` |
| `create_order` by `horkos-agent.testnet` (order 12, buyer `horkos-owner.testnet`, 5 tUSDC) | `F4NtzscXuqJdncSmTZgqWewhhuZ2JUeJkSzV3kKknwf2` |
| `submit_delivery` by the gateway → `Verifying` → `Settled` (OutLayer verifier, same tx tree) | `BJ7gey6fbyw4qzPM7UignWiDxwQstLESQ78mFN6qQ5Dp` |

Gateway log: order received 08:57:21 UTC, delivered and `Settled` 08:59:11 UTC; `get_order 12` → `Settled`, attempts 1, delivery at `https://test.fastfs.io/horkos-seller-a.testnet/outlayer.testnet/93a113785b6e9106a18afe34b03fa586004fdff612f5f0cb4f81079c3c63e474.json`.

## Order history (machine-readable, read by `web/scripts/demo-history.mjs`)

Every transaction that changed a demo order's status, mapped from chain on 13 Nov 2026 (`t` = block time, unix seconds; `to` = `order_status` events in that transaction; `create_order` emits the NFT mint, status `Open`). Rejected `create_order` calls create no order.

<!-- horkos-history:begin -->
```json
{
 "contract": "escrow.horkos.testnet",
 "orders": {
  "0": [
   {
    "t": 1794574198,
    "method": "create_order",
    "tx": "92QVpcmFUQbxpYYV32sqR9CKdnxnN1n9H6VtH6KbLmzA",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794574206,
    "method": "submit_delivery",
    "tx": "DgGzhbkGBEMHGG9duhFSQHgTKsXpxi9NgngEMb1BLAoD",
    "to": [
     "Verifying",
     "Settled"
    ]
   }
  ],
  "1": [
   {
    "t": 1794574237,
    "method": "create_order",
    "tx": "B5cbpbtps5PRi62cofxVGR28R3iUKSCGfdEC7VjJxxpx",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794574433,
    "method": "refund_expired",
    "tx": "LY8cJkjSGVMifUVzGZmmsNGFj1kRQMoS6LZ2hGrFSGG",
    "to": [
     "Refunded"
    ]
   }
  ],
  "2": [
   {
    "t": 1794574439,
    "method": "create_order",
    "tx": "4zL12Bg9TNRgVtXyyh7KfBrCRcQsa4bbuap2b3jd6rL6",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794574449,
    "method": "submit_delivery",
    "tx": "HgPppJUNPThmUDfEpDxhtTnFeZZDVktzggR4thvhE2yj",
    "to": [
     "Verifying",
     "Delivered"
    ]
   },
   {
    "t": 1794574642,
    "method": "refund_expired",
    "tx": "7PkEjmE3LJfQeH3Ko5KvNXT4Xm9EFzF3Qpg84xXssfC5",
    "to": [
     "Refunded"
    ]
   }
  ],
  "3": [
   {
    "t": 1794578634,
    "method": "create_order",
    "tx": "4kiLzrFFvqvUKjHaQLow4667ekEbB7XRjcXCprgREGdQ",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794578636,
    "method": "cancel_order",
    "tx": "9YthwdHcd31ryabiA2G4Qg1oqdeHHtwCxtd6cg9k6pKC",
    "to": [
     "Cancelled"
    ]
   }
  ],
  "4": [
   {
    "t": 1794578655,
    "method": "create_order",
    "tx": "HGQx1x8FaQFsnw5zxs2E2LJSHXHEZQ39JbKWtNF3ARkK",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794578663,
    "method": "submit_delivery",
    "tx": "JEGNjxrQbVSbfLSYio1v7DsPgS9PRH9HRbRtutLAYfKx",
    "to": [
     "Verifying",
     "Delivered"
    ]
   },
   {
    "t": 1794578964,
    "method": "submit_delivery",
    "tx": "CDeQnFSntfZtLAGvbkaAyEAgVHBzobeb1887vFvMZR3N",
    "to": [
     "Verifying",
     "Settled"
    ]
   }
  ],
  "5": [
   {
    "t": 1794579775,
    "method": "create_order",
    "tx": "5jdfoCPv37ayyLefChhvRqLrnFGKEsNdsQRgHmnzY95",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794579785,
    "method": "submit_delivery",
    "tx": "CbL9cC4uEvV8s5MjMaTKqNrvr6f743FcQoyHHmE2gb5S",
    "to": [
     "Verifying",
     "Settled"
    ]
   }
  ],
  "6": [
   {
    "t": 1794580088,
    "method": "create_order",
    "tx": "Hj11HzBejqGQZzE5MDCqWNhhtyWHPsDThvuNRQNc2Ge",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794580096,
    "method": "submit_delivery",
    "tx": "A5YnVr78NuRseF3oD9sAFCgcnHcsTMQdyjaywMe6sgo1",
    "to": [
     "Verifying",
     "Settled"
    ]
   }
  ],
  "7": [
   {
    "t": 1794583145,
    "method": "create_order",
    "tx": "BVDyJeF1dws99Nr8FwLeVDGwBekZLQ1XrDsW6E7XgugA",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794583146,
    "method": "cancel_order",
    "tx": "uBAB6yqf379K92nCErC4YVQzJ4gPg5KUDHDjthEddYx",
    "to": [
     "Cancelled"
    ]
   }
  ],
  "8": [
   {
    "t": 1794588744,
    "method": "create_order",
    "tx": "83XaoQwthAgLEiJViT1hwXQEwfGiZunFssoCCFtkRWyX",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794588756,
    "method": "submit_delivery",
    "tx": "C97q52MF6UcN4G8M3EAG5JoY4Cpa3Z4kQrNqUB7UN4WB",
    "to": [
     "Verifying",
     "Settled"
    ]
   }
  ],
  "12": [
   {
    "t": 1794646635,
    "method": "create_order",
    "tx": "F4NtzscXuqJdncSmTZgqWewhhuZ2JUeJkSzV3kKknwf2",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794646648,
    "method": "submit_delivery",
    "tx": "BJ7gey6fbyw4qzPM7UignWiDxwQstLESQ78mFN6qQ5Dp",
    "to": [
     "Verifying",
     "Settled"
    ]
   }
  ]
 },
 "rejected": [
  {
   "t": 1794578411,
   "method": "create_order",
   "tx": "82LUfji2HUSR9swkzvYVYYVJe31dedkrrj7Jicc7AXWt",
   "reason": "Seller not allowed by mandate",
   "note": "demo 3, listing 2"
  },
  {
   "t": 1794578614,
   "method": "create_order",
   "tx": "xhqFnp6dAckKrCwuztwy2XWmzoMu7iJzBswM3Bi2k3N",
   "reason": "Seller not allowed by mandate",
   "note": "MCP smoke test, listing 2"
  },
  {
   "t": 1794583148,
   "method": "create_order",
   "tx": "6rtGYkYcon8F7FwGLkU791ES44VdLw8eCzzJFsrYbt2P",
   "reason": "Seller not allowed by mandate",
   "note": "MCP example capture, listing 2"
  }
 ]
}
```
<!-- horkos-history:end -->
