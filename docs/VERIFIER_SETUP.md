# Verifier v0 — publishing steps

## Artifact

- WASM: `verifier/build.sh` (wasm32-wasip2, allowed caller `escrow.horkos.testnet`), 2,482,255 bytes
- sha256: `61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f`
- Public URL (gist, pinned to commit):
  `https://gist.githubusercontent.com/iusserhat/b1490a9409f5e9571c3798ce3f6d1bb3/raw/f0bcf05ff5d4334c3ccf40de91a666c02830a110/horkos-verifier.wasm`
- Check: `curl -sL <url> | sha256sum`

## Owner steps in the OutLayer dashboard (done by the owner, key never leaves the TEE)

1. Open https://app.outlayer.ai, switch the network to **testnet**, sign in with `horkos.testnet`.
2. Go to **Secrets** → new secret.
3. Bind to: **WASM hash** → `61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f`.
4. Profile name: `verifier`.
5. Method: **Auto-generated**. Name: `PROTECTED_VERIFIER_SK`. Type: **hex32**.
6. Access: **AllowAll** combined (Logic AND) with **One build only** = the same sha256.
   Why AllowAll: when the escrow calls OutLayer, the signer is the seller, not the escrow, so a whitelist of `horkos.testnet` would block deliveries. The verifier itself refuses to verify unless the caller is `escrow.horkos.testnet`; the only thing other callers can get is the public key.
7. Save. Tell Claude "secret ready". Do not paste any value; there is none to see.

## Claude's steps after that

1. Read the public key: `horkos.testnet` calls `outlayer.testnet` `request_execution` with input `{"cmd":"pubkey"}` and `secrets_ref {profile: "verifier", account_id: "horkos.testnet"}` (≈0.007 NEAR, testnet).
2. `set_verifier` (admin `horkos.testnet`): outlayer `outlayer.testnet`, the URL and hash above, `build_target` `wasm32-wasip2`, that `encryption_pubkey`, secrets `verifier`/`horkos.testnet`, `min_fee` 0.01 NEAR, `max_fee` 0.05 NEAR → version 0.
3. Run demos 1 and 2 on testnet; record tx ids in `docs/TESTNET.md`.
