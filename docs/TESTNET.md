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
