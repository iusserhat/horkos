# Testnet deployment

Deployed 1 Nov 2026 from commit `4406f1d` (near-sdk 5.30.0, cargo-near 0.22.0, `cargo near build non-reproducible-wasm`).

| Account | Role | Code sha256 |
| --- | --- | --- |
| `escrow.horkos.testnet` | Horkos contract, `new(token = tusdc.horkos.testnet, admin = horkos.testnet)` | `e7b6089e8a3ffc09be24a39a7882da183a76ea8972287be15d10e36bf7de9993` |
| `tusdc.horkos.testnet` | Test token tUSDC (NEP-141, 6 decimals), 1,000,000 minted to `horkos.testnet` | `79c37d5c1744438dee951a971041ce119fe8ce3b59bc381b59466f4d309f1a68` |
| `horkos.testnet` | Admin of the escrow (publishes verifier versions), token owner (`mint`) | — |
| `probe.horkos.testnet` | OutLayer spike contract (`spikes/outlayer/probe`) | — |

Transactions: token deploy `5oVQ2HERAaogMBSBTGnvnaDzuXUHQEiFy2tCHuMqQGPN`, escrow deploy `8pXPACZe4KVLvZrymeMGBEq2TKa4cBP9ik9aBg6tSFuM`, escrow registered on token `8uGEdigtB5BgU7KfQVRsHsNSb8zyZr5VFCtY1rKtuwEs`.

Verify the deployed code matches a local build:

```bash
contracts/scripts/build.sh
sha256sum "$CARGO_TARGET_DIR/near/horkos/horkos.wasm"
near account view-account-summary escrow.horkos.testnet network-config testnet now   # "Local Contract (SHA-256 checksum hex)"
```

State on 1 Nov: no verifier published yet (`get_verifier` → `null`), so `create_order` is rejected ("Verifier not configured") until the verifier WASM is hosted and `set_verifier` is called.

**Trust note:** the contract accounts still have full-access keys (kept in the deployer's local keychain, not in the repo). Whoever holds them can redeploy the code; see the threat model in `DESIGN.md`.
