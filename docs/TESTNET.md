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
| `horkos-agent.testnet` | Agent. Function-call key `ed25519:3Py9s8PuWvcSbrrCpw14T6RVbF6WqBxikNBSva1skmpK`: only `create_order` / `cancel_order` on `escrow.horkos.testnet`, allowance 1 NEAR (tx `B6QLp54u2FJFYune1hFYekBjn2Epd4ahTCZAPKv9USpV`). Its full-access key is still present (pending deletion, owner's decision). |
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
