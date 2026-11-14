# Verifier

`verifier/` is the program that decides whether a seller gets paid. It is Rust compiled to WASI P2 (`wasm32-wasip2`) and runs inside NEAR OutLayer's TEE, called only by the escrow's `submit_delivery`. 15 unit tests (`cd verifier && cargo test`) and 5 end-to-end tests with SDK-built deliveries (`cd sdk && npm run test:verifier`).

## What it checks

Input from the contract: `{order_id, attempt, delivery_ref, sealed_key, condition_hash, buyer_pubkey}`. `buyer_pubkey` and `condition_hash` come from the order and listing records, never from the seller. In order:

1. **Caller.** `NEAR_PREDECESSOR_ID` must be the Horkos contract (`escrow.horkos.testnet`, fixed at build time by `HORKOS_CONTRACT`). Otherwise anyone could have a seller's data key re-sealed to their own public key.
2. **Sealed key.** Opens `sealed_key` with the verifier's X25519 secret key (`PROTECTED_VERIFIER_SK`, generated inside the TEE by OutLayer secrets); the payload must be 64 bytes: data key `K` and `sha256(ciphertext)`.
3. **Manifest** at `delivery_ref` (≤ 16 KB): version 1, same `order_id`.
4. **Condition** at `condition_url` (≤ 64 KB): its sha256 must equal the listing's `condition_hash`.
5. **Ciphertext** at `data_url` (≤ 1 MB): its sha256 must equal the hash inside the sealed payload.
6. **Decrypt** with `K` (XChaCha20-Poly1305); the plaintext must be JSON.
7. **Condition:** the JSON must validate against the JSON Schema (`jsonschema` crate).
8. **Re-seal** the same 64 bytes to `buyer_pubkey`.

Output (≤ 900 bytes): `{order_id, attempt, valid, buyer_sealed_key, data_sha256, reason}`. Any failure gives `valid: false` with a short `reason` (≤ 120 chars), never a panic. The contract settles only on `valid: true` for the same order and attempt, before the deadline. `{"cmd":"pubkey"}` returns the public key instead.

It checks conformance to the seller's published schema, not data quality or truth.

## Version pinning

- `set_verifier` (admin only) appends a version: OutLayer account, WASM URL, WASM sha256, build target, encryption public key, secrets reference, min and max fee. Versions are never edited or removed.
- `create_order` pins the current version on the order (`verifier_version`); the agent may pass the version it checked and the order fails with "Verifier changed: expected version {n}, current {m}" if it moved.
- `submit_delivery` always uses the order's pinned version, so a new version cannot affect open orders.
- OutLayer fetches the WASM from the URL and runs it only if its sha256 matches `wasm_hash`.
- Check the live version: `near contract call-function as-read-only escrow.horkos.testnet get_verifier json-args '{}' network-config testnet now`.

Limits: the contract does not verify the TEE attestation, and it does not check that `encryption_pubkey` came from the TEE (see [security.md](security.md)).

## Verifier v0 on testnet: publishing steps

### Artifact

- WASM: `verifier/build.sh` (wasm32-wasip2, allowed caller `escrow.horkos.testnet`), 2,482,255 bytes
- sha256: `61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f`
- Public URL (gist, pinned to commit):
  `https://gist.githubusercontent.com/iusserhat/b1490a9409f5e9571c3798ce3f6d1bb3/raw/f0bcf05ff5d4334c3ccf40de91a666c02830a110/horkos-verifier.wasm`
- Check: `curl -sL <url> | sha256sum`

### Owner steps in the OutLayer dashboard (done by the owner, key never leaves the TEE)

1. Open https://app.outlayer.ai, switch the network to **testnet**, sign in with `horkos.testnet`.
2. Go to **Secrets** → new secret.
3. Bind to: **WASM hash** → `61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f`.
4. Profile name: `verifier`.
5. Method: **Auto-generated**. Name: `PROTECTED_VERIFIER_SK`. Type: **hex32**.
6. Access: **AllowAll** combined (Logic AND) with **One build only** = the same sha256.
   Why AllowAll: when the escrow calls OutLayer, the signer is the seller, not the escrow, so a whitelist of `horkos.testnet` would block deliveries. The verifier itself refuses to verify unless the caller is `escrow.horkos.testnet`; the only thing other callers can get is the public key.
7. Save. Tell Claude "secret ready". Do not paste any value; there is none to see.

### Steps after that (run by Claude Code)

1. Read the public key: `horkos.testnet` calls `outlayer.testnet` `request_execution` with input `{"cmd":"pubkey"}` and `secrets_ref {profile: "verifier", account_id: "horkos.testnet"}` (≈0.007 NEAR, testnet).
2. `set_verifier` (admin `horkos.testnet`): outlayer `outlayer.testnet`, the URL and hash above, `build_target` `wasm32-wasip2`, that `encryption_pubkey`, secrets `verifier`/`horkos.testnet`, `min_fee` 0.01 NEAR, `max_fee` 0.05 NEAR → version 0.
3. Run demos 1 and 2 on testnet; record tx ids in `docs/testnet.md`.
