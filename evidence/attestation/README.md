# TEE attestation for settled orders 9, 15 and 18

Each settled order was verified by one OutLayer run of the Horkos verifier. This folder holds the off-chain proof for those runs, checked on 14 Nov 2026 (about 15:00 UTC) with [`out-layer/outlayer-verify`](https://github.com/out-layer/outlayer-verify) at commit `90c27d9d4fc843194ddc6f8ebaafa4eb320c3bb6`.

| Order | `submit_delivery` tx | OutLayer task | Executed (UTC) | Verdict | Attested `data_sha256` = contract's "settled" log |
| --- | --- | --- | --- | --- | --- |
| 9 | [`4ctCVTTK…`](https://testnet.nearblocks.io/txns/4ctCVTTKZgiwBJJr7LydyURjGdnViVg2vSgjAPMbUuzP) | 102880 | 2026-11-14 05:32:59 | 5 × PASS | `25094642…d535c9` |
| 15 | [`RxQ68oH3…`](https://testnet.nearblocks.io/txns/RxQ68oH3LVJL7LCoPwYyLPbKb5sbHrRUbsDSzh7HANj) | 106224 | 2026-11-14 10:36:55 | 5 × PASS | `e53cb5a7…ba366e` |
| 18 | [`ChRyUnRF…`](https://testnet.nearblocks.io/txns/ChRyUnRFx5fe4zCzKetg46tZv35bQYA38imbnga9gwuX) | 106595 | 2026-11-14 11:08:54 | 5 × PASS | `7163983e…6f98` |

Files per order:

- `order-N-outlayer-verify.txt`: full output of `outlayer-verify tx <hash> --network testnet --api https://testnet-api.outlayer.ai --no-color --bundle ov-bundle-N.json` (the bundle was renamed afterwards).
- `order-N-bundle.json`: the self-contained evidence bundle (record, quote, collateral, payloads). It re-checks with no network.
- `order-N-onchain.json`: the NEAR-side events of the same transaction (`execution_requested`, `execution_completed`, the contract's "Order N settled; data_sha256 …" log), read from archival RPC.

## Check it yourself

```bash
cargo install --locked --git https://github.com/out-layer/outlayer-verify --rev 90c27d9d4fc843194ddc6f8ebaafa4eb320c3bb6 outlayer-verify

# offline, from the saved bundle
outlayer-verify bundle evidence/attestation/order-9-bundle.json --offline --short
# Expected: PROVEN task 102880 (execute) d2757cd2f877b2a7…3869ad2c

# live, from the transaction (reads OutLayer's API, NEAR RPC and archival RPC)
outlayer-verify tx 4ctCVTTKZgiwBJJr7LydyURjGdnViVg2vSgjAPMbUuzP --network testnet --api https://testnet-api.outlayer.ai
# Expected: five "[ PASS ]" lines (Authenticity, Identity, Binding, Input, Output) and
# "wasm sha256 61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f"
```

The tool's default testnet API address (`testnet-api.outlayer.fastnear.com`) answered HTTP 410 "api_moved" and pointed to `testnet-api.outlayer.ai`, so `--api` is required at this commit.

## What this proves

Together with `scripts/reproduce-verifier.sh` (MATCH):

1. The verifier WASM built from `verifier/` in this repo has sha256 `61370b57…db80f`, the hash pinned in the escrow contract's verifier version 0.
2. A genuine Intel TDX machine (Intel signature chain valid, TCB UpToDate), running an OutLayer worker build whose measurements are approved on chain by `worker.outlayer.testnet`, ran that WASM (`wasm sha256` in the signed record) for `horkos-seller-a.testnet`, with secrets `horkos.testnet/verifier`.
3. It ran on exactly the input the contract built for that order (`order_id`, `attempt`, `delivery_ref`, `sealed_key`, `condition_hash`, `buyer_pubkey`) and produced exactly the output the contract received (`valid: true`, the buyer's sealed key, `data_sha256`). The `data_sha256` in the attested output is the one in the contract's "settled" log.

## What it does not prove

- **The contract does not check any of this on chain.** OutLayer's callback carries only the output. The contract trusts OutLayer's operator, whose account has full-access keys; this check is after the fact (ADR-011, `docs/security.md`).
- **That OutLayer's approved worker image was built from published source.** The tool says so itself: a pass means "the operator's approved build ran". Who controls the approved list is OutLayer.
- **Anything about the data's quality.** The verifier checks the delivery against the listing's JSON Schema, nothing more.
