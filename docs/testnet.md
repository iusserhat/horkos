# Testnet deployment

Deployed 1 Nov 2026; escrow code redeployed the same day (adds `VerifierConfig.encryption_pubkey`, tx `Ew9zx6nCRBynQXviidBAoqqJKFG6tzG7P3mKnzhhwu8b`) (near-sdk 5.30.0, cargo-near 0.22.0, `cargo near build non-reproducible-wasm`).

| Account | Role | Code sha256 |
| --- | --- | --- |
| `escrow.horkos.testnet` | Horkos contract, `new(token = tusdc.horkos.testnet, admin = horkos.testnet)` | `77b9d96cb731687f9c86e984cb01e79b2c10a6a5c82d5e8f2a82645bd6d6c84d` |
| `tusdc.horkos.testnet` | Test token tUSDC (NEP-141, 6 decimals), 1,000,000 minted to `horkos.testnet` | `79c37d5c1744438dee951a971041ce119fe8ce3b59bc381b59466f4d309f1a68` |
| `horkos.testnet` | Admin of the escrow (publishes verifier versions), token owner (`mint`) | — |
| `probe.horkos.testnet` | OutLayer spike contract (`spikes/outlayer/probe`) | — |
| `faucet.horkos.testnet` | tUSDC faucet (`contracts/faucet`), 14 Nov 2026; see below | `55d6afc80cec5e397236a633d35d8811fcf75ab79f2a84a532ec46191d5389e4` |

Initial transactions: token deploy `5oVQ2HERAaogMBSBTGnvnaDzuXUHQEiFy2tCHuMqQGPN`, escrow deploy `8pXPACZe4KVLvZrymeMGBEq2TKa4cBP9ik9aBg6tSFuM`, escrow registered on token `8uGEdigtB5BgU7KfQVRsHsNSb8zyZr5VFCtY1rKtuwEs`.

Verify the deployed code matches a local build:

```bash
contracts/scripts/build.sh
sha256sum "$CARGO_TARGET_DIR/near/horkos/horkos.wasm"
near account view-account-summary escrow.horkos.testnet network-config testnet now   # "Local Contract (SHA-256 checksum hex)"
```

State on 1 Nov: no verifier published yet (`get_verifier` → `null`), so `create_order` is rejected ("Verifier not configured") until the verifier WASM is hosted and `set_verifier` is called.

**Trust note:** the contract accounts still have full-access keys (kept in the deployer's local keychain, not in the repo). Whoever holds them can redeploy the code; see the threat model in [security.md](security.md).

## Transaction evidence at a glance

Details and more transactions in the sections below. Every hash opens on https://testnet.nearblocks.io/txns/<hash>.

| What | Result | Tx |
| --- | --- | --- |
| Escrow deployed (`new(token, admin)`) | Contract live | `8pXPACZe4KVLvZrymeMGBEq2TKa4cBP9ik9aBg6tSFuM` |
| Verifier v0 published (`set_verifier`) | Version 0 | `5AmP9nyCvwPN13XLJojKurnjD7tfRtF4395atmWLizmU` |
| Demo 1: seller A delivers valid data (order 0) | `Settled` | `DgGzhbkGBEMHGG9duhFSQHgTKsXpxi9NgngEMb1BLAoD` |
| Demo 2: seller B delivers data that fails the schema (order 2) | `Delivered`, then `Refunded` | `HgPppJUNPThmUDfEpDxhtTnFeZZDVktzggR4thvhE2yj`, `7PkEjmE3LJfQeH3Ko5KvNXT4Xm9EFzF3Qpg84xXssfC5` |
| Demo 3: agent tries a seller outside the mandate | Rejected: "Seller not allowed by mandate" | `82LUfji2HUSR9swkzvYVYYVJe31dedkrrj7Jicc7AXWt` |
| OutLayer run failed, seller resubmitted (order 4) | `Delivered`, then `Settled` | `JEGNjxrQbVSbfLSYio1v7DsPgS9PRH9HRbRtutLAYfKx` |
| Live CoinGecko data (order 8) | `Settled` | `C97q52MF6UcN4G8M3EAG5JoY4Cpa3Z4kQrNqUB7UN4WB` |
| Gateway, config only (listing 3, order 12) | `Settled` | `BJ7gey6fbyw4qzPM7UignWiDxwQstLESQ78mFN6qQ5Dp` |
| Demo 1 for the video (order 9) | `Settled` | `4ctCVTTKZgiwBJJr7LydyURjGdnViVg2vSgjAPMbUuzP` |
| Render-hosted seller A, judge path (orders 15 and 18) | `Settled` | `RxQ68oH3LVJL7LCoPwYyLPbKb5sbHrRUbsDSzh7HANj`, `ChRyUnRFx5fe4zCzKetg46tZv35bQYA38imbnga9gwuX` |
| Faucet deployed and funded with 10,000 tUSDC | Live | `2MDXwb1vAjgrNfNYjC1LmaTdZyH9zvWXSxw8BdRbqNDD`, `CRGBkeMwRsE1ScDYiuz7imiuAw6VnGSUTSUzvinVmL9U` |
| Fresh account claims 20 tUSDC | Balance `20000000` | `DSZRSc57ddEhBHe9MASomTj2xay6jvvSU94rdBuj4mvw` |
| Fresh account's agent via MCP, OutLayer gave no valid result (order 13) | `Delivered`, then `Refunded` | `6LvF1Mo9RL44GwRRp7vTTFe6f4fiU9uPekzC1HpiGHBY`, `4GWzBi43QXszsSyMAN92zBbpEGPASKEDxnwYDr8uA1n4` |

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
- First run of the gist-hosted verifier v0 (no secret yet): tx `6dnGVTiB1e8sDyEYrv7MoSdKGsLnPqUDFe7oCyNKo8wv`, WASM fetched and run in the TEE, output `{"error":"verifier secret key not available"}` as expected. Hosting and setup steps: `docs/verifier.md`.
- With the secret (`verifier` profile, accessor WasmHash, access `AllowAll AND WasmHash`): request 38311 tx `22kdu6b3JJoesbH2y6jjQ6uNrUuQq32mg9LbgejmKJXf` and retry tx `Ds6y6n89BSsCCw4j9B4t6twKYUoyggRneqW9b7gqxSbQ` both ended "Execution promise failed", no `execution_completed` event, callback `null`. The verifier cannot panic on a bad key, so the worker refused before running (likely secrets access). Check: `near contract call-function as-read-only outlayer.testnet list_user_secrets json-args '{"account_id":"horkos.testnet"}' network-config testnet now`.
- **OutLayer testnet outage, 13 Nov 2026 from at least 15:03 TSİ (12:03 UTC):** the OutLayer dashboard lists every testnet execution (dozens of accounts) as "Infrastructure Error", including ours (dashboard ids 91032, 91085; on-chain requests 38311 and the retry). Error text: "Failed to submit to NEAR: the chain did not take resolve_execution ... Smart contract panicked at src/execution.rs:1052:14: Execution request not found". The worker runs, but cannot write the result on chain. Our secret settings were not the cause and stay unchanged (build lock kept).
- Retries after the outage: 15:16 TSİ failed (tx `BJT8YtUot2Auq8FcSdZXgPkDV4Czyd6qBwft1YWxm7X7`); **15:49 TSİ succeeded** (tx `5iWyLC1TVjd7v4CKSDU4yggATB4x4g42TJs4xJAZRtRH`): the verifier read `PROTECTED_VERIFIER_SK` in the TEE and printed its public key `pLiqba7GL8rXlTp8kUWIMbpJQ7d73xbG/toxTKJn72o=`.

## Verifier v0 published (13 Nov 2026)

`set_verifier` by `horkos.testnet`, tx `5AmP9nyCvwPN13XLJojKurnjD7tfRtF4395atmWLizmU`, returned version `0`. Config: outlayer `outlayer.testnet`, WASM URL and sha256 as in `docs/verifier.md`, `build_target` `wasm32-wasip2`, `encryption_pubkey` above, secrets `verifier` / `horkos.testnet`, `min_fee` 0.01 NEAR, `max_fee` 0.05 NEAR. Check: `near contract call-function as-read-only escrow.horkos.testnet get_verifier json-args '{}' network-config testnet now`.

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

## tUSDC faucet (14 Nov 2026, 09:00 UTC)

`faucet.horkos.testnet` (`contracts/faucet`, code sha256 `55d6afc80cec5e397236a633d35d8811fcf75ab79f2a84a532ec46191d5389e4`): `claim()` sends 20 tUSDC, once per account per 24 h, up to a total cap of 10,000 tUSDC; it pays the caller's token storage deposit if needed. Owner `horkos.testnet` alone can refill (`ft_transfer_call`), pause (`set_paused`) or change the cap (`set_cap`). Views: `get_info`, `next_claim_at`.

| Step | Tx |
| --- | --- |
| 5 NEAR from `horkos-seller-c.testnet` to `horkos.testnet` (gas for the deploy) | `7mmxjHYsKaZPSZEJF6BK7Jmo8aTxYHDfXhfaToZq77RR` |
| Create `faucet.horkos.testnet` (3 NEAR) | `D2vMWmtZvmxD7m7sG4Fax5dPGaCMdxD2UMMhvfhAcPxi` |
| Deploy + `new(owner horkos.testnet, token tusdc.horkos.testnet, amount 20, cap 10,000)` | `2MDXwb1vAjgrNfNYjC1LmaTdZyH9zvWXSxw8BdRbqNDD` |
| Register the faucet on the token | `3dfZUWKvf2qvJRB5SwqXug1MKnw2PxpNFWdXMywZo7Jp` |
| Refill 10,000 tUSDC (`ft_transfer_call`, log "Refilled with 10000000000") | `CRGBkeMwRsE1ScDYiuz7imiuAw6VnGSUTSUzvinVmL9U` |

### Judge path, run with fresh accounts

All commands below ran as written (owner `hk-judge-1114.testnet`, agent `hk-judge-1114-agent.testnet`):

```bash
O=hk-judge-1114.testnet; A=hk-judge-1114-agent.testnet
near account create-account sponsor-by-faucet-service $O autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near account create-account sponsor-by-faucet-service $A autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near contract call-function as-transaction faucet.horkos.testnet claim json-args '{}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' sign-as $O network-config testnet sign-with-legacy-keychain send
near contract call-function as-read-only tusdc.horkos.testnet ft_balance_of json-args "{\"account_id\":\"$O\"}" network-config testnet now      # "20000000"
near account add-key $A grant-function-call-access --allowance '1 NEAR' --contract-account-id escrow.horkos.testnet --function-names 'create_order, cancel_order' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send
near contract call-function as-transaction escrow.horkos.testnet set_mandate json-args '{"agent":"'$A'","max_total":"20000000","max_per_order":"10000000","allowed_sellers":["horkos-seller-a.testnet"],"expires_at":"<now + 7 days, ns>","max_open_orders":null}' prepaid-gas '50 Tgas' attached-deposit '0.5 NEAR' sign-as $O network-config testnet sign-with-legacy-keychain send
near contract call-function as-transaction tusdc.horkos.testnet ft_transfer_call json-args '{"receiver_id":"escrow.horkos.testnet","amount":"20000000","msg":""}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as $O network-config testnet sign-with-legacy-keychain send
```

| Step | Tx / result |
| --- | --- |
| Create owner / agent | `EyeEfAA2FzWGta9PhNtkZpJ2oi6PYCSJ3NFMRcqo7bYV` / `C1bG4bkMxk5GCc3JtVpq99Ac9nADb1kw4UfVvbUVekAV` |
| `claim` (registers on the token, log "Sent 20000000"); balance `"20000000"` | `DSZRSc57ddEhBHe9MASomTj2xay6jvvSU94rdBuj4mvw` |
| Second `claim` the same minute | refused: "Already claimed; next claim after 1794733747535 ms" |
| Agent function-call key | `9uqGzbA3Fn8Uk57Jxnq9oB9iyih5v59kv155McYKyiKW` |
| `set_mandate` / budget deposit (balance 20 tUSDC) | `4vcQpLsc4L7hMehm6XBdCVkRMPPjTSw1hrNzm7mKRxUu` / `2ohrFTaiB7jVSWB75SLC56GRN6rQ6riDh4e9zy5pt64K` |
| MCP server as this agent: `horkos_create_order` listing 3 → order 13 | `2iwWR21NsuyXQ4azQQ29qZNtMc1vRPHRqg9HKQvF7QJQ` |
| Gateway `submit_delivery` for order 13 → `Delivered` (OutLayer gave no valid result; nobody paid; refundable after the deadline) | `6LvF1Mo9RL44GwRRp7vTTFe6f4fiU9uPekzC1HpiGHBY` |
| `refund_expired` order 13 → `Refunded`, 5 tUSDC back to the budget | `4GWzBi43QXszsSyMAN92zBbpEGPASKEDxnwYDr8uA1n4` |
| MCP `horkos_create_order` listing 2 (seller C) | rejected: "Seller not allowed by mandate" |

Order 13 did not settle: the verifier's answer for request 43883 was not a valid result (the reason is not visible on chain), while order 12 on the same listing settled 13 minutes earlier. The escrow behaved as designed: no payment, budget returned via `refund_expired`. The run also hit FastNEAR's `test.rpc.fastnear.com` rate limit (HTTP 429); `rpc.testnet.fastnear.com` and `rpc.testnet.near.org` answered.

## Hosted seller A on Render (14 Nov 2026, from 10:20 UTC)

Seller A is hosted on Render's free tier (`render.yaml`, `demo/sellers/hosted.ts`, service `horkos-seller-a`, Frankfurt). It serves listings 0, 3, 4 and 5, is checked every 5 minutes on `/health` by an UptimeRobot monitor (email alerts), and is meant to stay online during judging (16 to 18 Nov): https://horkos-seller-a.onrender.com/health. If it is down, orders are not paid and are refunded after their delivery window with `refund_expired`. Fallback: the team runs seller A locally (`cd demo && npm run seller -- a`, or `npm run hosted` with `SELLER_ACCOUNT_ID` / `SELLER_PRIVATE_KEY` in the environment).

The Try page agent track was repeated with three fresh accounts (`hk-try1/2/3-1252.testnet`, each claimed 20 tUSDC from the faucet, set a mandate for seller A and deposited 20 tUSDC; txs in the faucet section's format), buying listing 0 through the MCP server against the Render-hosted seller:

| Order | Seller version | Result | Funding → Settled | Txs (`create_order`, `submit_delivery` ..., `refund_expired`) |
| --- | --- | --- | --- | --- |
| 14 | 0.2.0 | Not settled: CoinGecko 429 delayed delivery 3 min 44 s, then 2 OutLayer timeouts; refunded | — | `GubCQrR45w7S8kgyRj78XDcuX6xY5UFm98EdR3mW981C`, `8sxwyQHWv39VefkM3ESiMeyhbz34GhacQwr1nT5P7Rjr`, `8wEshPj1vmAKCjtBFhYa3WvYGxT1XPMqgBNDJ3iA8gRR`, `9dprRaqhnftZjaKPM533aXSXaEbhHmwREib81LJBoKZZ` |
| 15 | 0.2.0 | **Settled**, buyer opened 4 NEAR/USD points | 1 min 21 s | `5rVjtFhqtuSKBp7nq31NEFwBQ4btj3axW5jkq1Sd5qZx`, `RxQ68oH3LVJL7LCoPwYyLPbKb5sbHrRUbsDSzh7HANj` |
| 16 | 0.2.0 | Not delivered: every CoinGecko call from Render answered 429; refunded | — | `36M1byQzRaTZfDtawjUSP5nHRrjTd3PMGwkFVFHtv96D`, `2bk8NMzsX2tjELWf2xZyEMrVfnpZ96hirU9mhsowpd2t` |
| 17 | 0.2.1 | Not settled: 429s, then 2 OutLayer timeouts; refunded | — | `91sjzhn3iFkQnMhDq3ptETbDJj6QezB9eUR2i2qj9svG`, `9iQm4FLRuD9jHCJ3aDgjLHSaJRjCw3tcvs189MREe2p`, `8GQGEies3fSsqUQUjJWVx2w8ET6HMoza2XU57zuwM7DA`, `A3KMS9h37EjNcWCFdXZSdYpviZKAC2ePvRxuqVeAugBg` |
| 18 | 0.2.3 | **Settled** (data from Coinbase after a CoinGecko 429) | 34 s | `7zGiSW98RNo4ZSmK3yapCWJUmCTYa3g2RawYyChFXyLe`, `ChRyUnRFx5fe4zCzKetg46tZv35bQYA38imbnga9gwuX` |
| 19 | 0.2.3 | Not settled: 3 OutLayer timeouts; refunded | — | `A89AnwCQ8zc7LvrBwL4YypwbGgFPb9xho2WyszXLtuUV`, `3bRD5PpqB1xgEdRbVFduiSy9omSivy9Y7N3eeDiSa4gD`, `Gz8aE3UZhUtU96MXtWKnS2e4vikD8aToWYNZ3eavgfz`, `MWy6dLdbakRFwnkjtouQ5E46ep9yXjsUYqHS7qy7BhK`, `EyLLrg62mZG87LiU8B4hV3YxSHRcx5n86NA3f4auGKP6` |
| 20 | 0.2.3 | Not settled: 3 OutLayer timeouts; refunded | — | `91uWS8DamZJZsoaaAh22y1DXRNRqaoArG2hMiVur48V8`, `D4iXLnsvjF7AUnKenQ7wEC8FY88NjHBuKJPyYi6Vfb2G`, `DAN827NEiQ98415Dazo8fyuim6k3T8FfWQ19cNGqhLMu`, `AmSivFBkPncAV4a7cdJTeddyEgbTidqmctgSU89Fvp9r`, `D1cuRmrBDzJDioGYKXnqRHwHg1kpgq4Kn9zHp9XnC7Ji` |

2 of 7 settled in this first series; no buyer lost money (every other order was refunded in full to its mandate budget). Two causes, both measured:

1. **CoinGecko rate-limits Render's shared IP** (HTTP 429, seen in `/health` `last_problem`). Fixed in 0.2.2 / 0.2.3: one call per minute, last good answer reused for up to 10 minutes, fallback to Coinbase's public NEAR-USD API in the same data shape (checked against both listing schemas).
2. **OutLayer did not resolve the verification within NEAR's yield limit.** Every failed run (orders 13, 14, 17, 19, 20) ended exactly 201 blocks (~106 to 121 s) after `request_execution`, with OutLayer's log "Execution promise failed: Failed" and a 0.001 NEAR charge; `on_verified` then moved the order to `Delivered`. Successful runs took 25 to 70 s. A direct `{"cmd":"pubkey"}` run of the same verifier succeeded in 45 blocks (tx `DzCN2kgbQ9Yv8oVaJU4Px8hUWDqVHWEXVe2SQNE64i22`), and other projects' OutLayer runs succeeded at the same time, so the WASM, its hash and the secret are fine; the slow part is OutLayer resolving our runs, which fetch three files from FastFS. The hosted seller retries with backoff until 150 s before the deadline (0.2.0+), which fits about three attempts in a 10-minute window.

### 30-minute listings (14 Nov 2026, 11:39 to 12:12 UTC)

Listings 4 and 5 copy listings 0 and 3 (same seller, price, condition hash and verifier) with a 30-minute delivery window: `register_listing` txs `tz5aBtGp8eJyq1AFxFMQAAxyjXDeiRn6fafNUeMaH9B` (listing 4) and `9DwXCNNiRgzTntiZtTKSGEB3XayXEqNZZQUx79Eok4eM` (listing 5). The hosted seller (0.3.x) retries a failed verification with backoff until 3 minutes before the deadline and logs each attempt's OutLayer request id, outcome and duration on `/health`.

Five orders on listing 4 through the MCP server, against the Render-hosted seller, placed 20 s apart:

| Order | Owner | Attempts | Result | `refund_expired` tx |
| --- | --- | --- | --- | --- |
| 21 | `hk-try1-1252.testnet` | 9 | Not settled, refunded | `2An5ALXnbBDHfR8EPNiLvUQYYTCxvtrkyVG7HG3oHh5n` |
| 22 | `hk-try2-1252.testnet` | 9 | Not settled, refunded | `GrcL9FgEDn9F9J1yGR4m2i2REThRVN6rLEaK28wvsFKT` |
| 23 | `hk-try3-1252.testnet` | 10 | Not settled, refunded | `9AaM8X56HndgbfHSUqF7vCwh7kCR8iUMR2JKCQ9tzDvJ` |
| 24 | `hk-try1-1252.testnet` | 11 | Not settled, refunded | `AQF4mtwQuitt7ZzYeUvG9VEcoeWp59eVkayVhqeS4oi` |
| 25 | `hk-try2-1252.testnet` | 10 | Not settled, refunded | `4HvUhQduw1WUTJwkQ9oLzHdYd9rFx5HuHzKdoGF1DXxC` |

0 of 5 settled: all 49 verification attempts ended at OutLayer's 201-block limit (each `submit_delivery` took 123 to 127 s to final; OutLayer request ids 44806 to 44865 and later). The verifier itself is not the bottleneck: OutLayer's `execution_completed` event for the successful runs reports about 35 M instructions and 4.9 to 6.4 s (`time_ms`), against our limits of 10^10 instructions, 128 MB and 60 s. The verifier is referenced as a pre-built `wasm32-wasip2` WASM by URL and sha256 (`WasmUrl`), not compiled from source per run. Open question: the verifier's HTTP fetches (FastFS manifest, condition, ciphertext) have no timeout; if a fetch hangs inside OutLayer's worker the run never completes. A draft question to the OutLayer team is in `docs/internal/outlayer-timeouts.md`.

Order 13 (gateway, 09:10 UTC) had the same OutLayer cause: the gateway was running, `submit_delivery` was sent 11 s after funding (tx `6LvF1Mo9RL44GwRRp7vTTFe6f4fiU9uPekzC1HpiGHBY`), OutLayer request 43883 ended at 201 blocks with "Execution promise failed", `on_verified` ran and set `Delivered`.

### OutLayer testnet diagnosis (14 Nov 2026, 12:07 to 12:35 UTC)

- **Other projects:** 39 of 39 `request_execution` runs by other accounts (`tredio-oracle.testnet`, `zyx-dev.testnet`, `enclave.parry.testnet`; request ids 45008 to 45134) ended at exactly 201 blocks (112 to 121 s) with "Execution promise failed".
- **Minimal run:** our verifier's `{"cmd":"pubkey"}` (no network fetches, no data) at 12:31 UTC: request 45170, tx `F6dz4wBiha8hd8RmpTPQWkFWtYeq7iwLAxEcgDLCG1Qj`, failed after 125 s the same way. The same call took 45 blocks earlier the same day (tx `DzCN2kgbQ9Yv8oVaJU4Px8hUWDqVHWEXVe2SQNE64i22`).
- **Our side, unchanged since the settled orders 15 and 18:** one verifier version (v0, WASM sha256 `61370b57…`, same URL), same resource limits (1e10 instructions, 128 MB, 60 s), same `min_fee` 0.01 NEAR, same condition files; the hosted seller changed only its retry and logging code. So there was nothing to roll back.
- **Off-chain timing:** the verifier's full check path runs in its unit tests (15 tests) in 0.02 s natively; the two FastFS condition files download in about 0.5 s; on OutLayer, successful runs reported about 35M instructions and 4.9 to 6.4 s.
- **Conclusion:** the timeouts are on OutLayer testnet's side, not in Horkos or the verifier. Draft report to OutLayer: `docs/internal/outlayer-timeouts.md`.

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
  ],
  "13": [
   {
    "t": 1794647417,
    "method": "create_order",
    "tx": "2iwWR21NsuyXQ4azQQ29qZNtMc1vRPHRqg9HKQvF7QJQ",
    "to": [
     "Open"
    ]
   },
   {
    "t": 1794647428,
    "method": "submit_delivery",
    "tx": "6LvF1Mo9RL44GwRRp7vTTFe6f4fiU9uPekzC1HpiGHBY",
    "to": [
     "Verifying",
     "Delivered"
    ]
   },
   {
    "t": 1794648338,
    "method": "refund_expired",
    "tx": "4GWzBi43QXszsSyMAN92zBbpEGPASKEDxnwYDr8uA1n4",
    "to": [
     "Refunded"
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
