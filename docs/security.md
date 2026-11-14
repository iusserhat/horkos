# Security

Scope: NEAR testnet only. No mainnet deployment, no real funds. Reporting a vulnerability: [SECURITY.md](../SECURITY.md).

## Enforced by the contract

| Rule | Where |
| --- | --- |
| Only the mandate's agent can open orders for an owner | `create_order`: "Caller is not the mandate's agent" |
| Mandate active, not expired | "Mandate is revoked", "Mandate expired" |
| Seller on the owner's allowed list | "Seller not allowed by mandate" |
| Per-order cap, total cap, available balance | "Price exceeds max_per_order", "Order would exceed max_total", "Insufficient mandate balance" |
| Open orders per mandate ≤ 50 by default (≤ 100) | "Too many open orders" |
| Order storage paid from the owner's deposit, so order spam cannot drain the contract | "Insufficient storage deposit: ..." |
| Owner-only methods need a deposit (1 yocto), which a function-call key cannot attach | `set_mandate`, `revoke_mandate`, `withdraw` |
| Only the seller delivers; one verification at a time; only before the deadline | `submit_delivery` |
| Verifier version pinned per order; versions append-only | `create_order`, `set_verifier` |
| Only the result of the contract's own OutLayer call counts, matched to order and attempt | `#[private] on_verified` |
| Settlement only before the deadline; a late result is ignored | `on_verified`, `refund_expired` |
| Settlement credits an internal balance; tokens move only in `withdraw`, which restores the balance if the transfer fails | `withdraw`, `on_withdraw` |
| Buyer key re-sealed only to the `buyer_pubkey` stored on the order | Verifier input built by the contract |
| Receipts cannot be transferred | "Receipts are non-transferable in this version" |
| Only the configured token is accepted; deposits without a mandate are returned | `ft_on_transfer` |

Every method, with its errors: [contract-api.md](contract-api.md).

## Threat model

| Threat | Countermeasure | Remaining assumption |
| --- | --- | --- |
| Compromised or prompt-injected agent | Key can only open/cancel orders; the contract rejects anything outside the mandate (shown on testnet: "Seller not allowed by mandate") | The owner set sensible limits |
| Misuse within the mandate | Per-order and total caps; the owner can revoke at once | Loss within the limits is bounded, not prevented |
| Seller never delivers | Escrow + timeout refund that anyone can trigger | None |
| Delivery does not meet the condition | Verifier rejects, order refunds at the deadline | The condition is well defined |
| Delivery meets the condition but is useless | Partly: conformance is guaranteed, not quality | The buyer reads the condition |
| Buyer fraud ("it was broken") | The data key reaches the buyer only with settlement | OutLayer operator and TEE |
| Cancel after delivery | Cancel only while `Open` | None |
| Key released but payment fails | Settlement and key release in the same callback; internal balance | None |
| Forged verification result | Only the `#[private]` callback of the contract's own call; WASM pinned by hash | **No on-chain attestation check.** OutLayer's operator account has full-access keys and could write a result without the TEE. The TEE run can be audited off-chain |
| Someone else calls the verifier to re-seal a seller's key to themselves | Verifier checks `NEAR_PREDECESSOR_ID`; `buyer_pubkey` comes from the order record | OutLayer passes the predecessor correctly |
| Admin swaps the verifier to pay a colluding seller | Append-only versions, pinned per order; agent may pass the version it checked | Agents check the version for new orders. **The contract account's full-access key can redeploy the code**, which is stronger than admin rights |
| Settlement racing a refund | Settle only while `Verifying` and before the deadline; refund also from `Verifying` | None |
| OutLayer outage | `null` or `Err` result → `Delivered`; the seller may resubmit; fees are refunded or forwarded to the seller | If OutLayer's own callback panics (not expected) its fee stays there and Horkos pays it from its balance, capped by `max_fee` |
| Double payment or double refund | State machine; final states are final | None |
| Storage exhaustion with create/cancel loops | Storage charged to the owner's deposit; open-order cap; no records for senders without a mandate | Loss limited to the owner's own deposit |

## Trusted parties and known limitations

- **OutLayer's operator.** The contract trusts the output of its OutLayer call; the attestation is not verified on chain (OutLayer's callback carries no quote or signature). Details: `spikes/outlayer/REPORT.md`, [internal/outlayer-question.md](internal/outlayer-question.md).
- **The verifier's public key** is published by the admin; the contract does not check it came from the TEE. On testnet it was printed by the verifier inside OutLayer (tx `5iWyLC1TVjd7v4CKSDU4yggATB4x4g42TJs4xJAZRtRH`).
- **Contract account keys.** `escrow.horkos.testnet`, `tusdc.horkos.testnet` and `faucet.horkos.testnet` keep full-access keys held by the team; whoever holds them can redeploy the code.
- **Conditions are JSON Schema only.**
- **OutLayer testnet sometimes fails a run without a reason** (13 Nov outage; order 13 on 14 Nov). The order returns to `Delivered`; the seller resubmits or the buyer is refunded at the deadline. Money is never stuck.
- **A failed `on_verified` for a non-result reason (e.g. gas)** leaves the order `Verifying` until the deadline, then it refunds.
- **Hosted seller and gateway** run with a seller key in their environment; a leak lets someone deliver as that seller, not move buyers' funds.
- **Testnet RPC rate limits** (HTTP 429 from `test.rpc.fastnear.com` on 14 Nov) can delay deliveries; nothing is lost, orders refund at the deadline.

## Agent key on testnet

`horkos-agent.testnet` has a single function-call key (`create_order`, `cancel_order` on the escrow, 5 NEAR allowance); its full-access key was deleted on 13 Nov 2026 (txs in [testnet.md](testnet.md), "Agent key rotation"). Check: `near account list-keys horkos-agent.testnet network-config testnet now`.

## Secret scan

Before the repo goes public.


13 Nov 2026, 17:13 TSİ, commit `HEAD` at the time (30 commits, all branches).

- Tool: gitleaks 8.30.1, official GitHub release `gitleaks_8.30.1_linux_x64.tar.gz`, sha256 checked against `gitleaks_8.30.1_checksums.txt` (OK).
- Command: `gitleaks git <repo> --redact --report-format json`.
- Result: 1 finding, a false positive: rule `generic-api-key` in `verifier/Cargo.lock` line 188 (commit `83866d9`), the dependency name `crypto_secretbox` next to a crate checksum. No secret.
- Extra checks (gitleaks has no NEAR key rule): `git log --all -p` searched for `ed25519:` strings of 60+ base58 characters (NEAR private keys are ~88): none. Keyword search for `private_key` / `secret_key` / `seed_phrase` / `mnemonic`: only code that reads the local keychain (`demo/config.ts`, `mcp/server.ts`). No `.env`, `.pem`, `*key.json` or credentials files ever committed.
- History was not rewritten at that time.

### History rewrite and re-scan (13 Nov 2026, ~20:05 TSİ)

- Commit `1a6ea49` (hash before the rewrite) had added 16 Chrome profile folders that Lighthouse created under `web/` (`web/C:\Users\a\AppData\Local\lighthouse.*`, 2592 files); gitleaks found nothing in them. They were removed from all history with `git filter-repo --path-glob 'web/C:*' --invert-paths` after a `git clone --mirror` backup outside the repo, and pushed with `--force-with-lease`. Checked: 41 commits before and after, same messages, authors and dates; every commit's tree identical apart from those paths; final tree identical (`16cb919…`); packed size 19.68 MiB → 19.05 MiB. Commits from `1a6ea49` on have new hashes.
- Re-scan of all history (44 commits; gitleaks reports 43 scanned): the same single false positive (`verifier/Cargo.lock` line 188, commit `83866d9`). `ed25519:` strings of 60+ base58 characters: none. Keyword hits (`private_key`, `secret_key`, ...): code that reads the local keychain and this file only. No `.env`, `.pem`, `*key.json` or credentials files in any commit.
- Re-run before the repo goes public if new commits land.

### Re-scan (14 Nov 2026, ~09:35 UTC)

gitleaks 8.30.1 (checksum re-verified) over all history (58 commits) and over the working tree: the same single false positive (`verifier/Cargo.lock` line 188). `ed25519:` strings of 60+ base58 characters: none in the tree or in `git log --all -p`.

### Pre-submission sweep (14 Nov 2026, ~12:56 UTC)

- gitleaks 8.30.1 over all history (75 commits): the same single false positive (`verifier/Cargo.lock` line 188). `git log -p --all`: `ed25519:` strings are 44-character public keys only; no `BEGIN PRIVATE`, Bearer, GitHub, Netlify, Render, ElevenLabs or CoinGecko tokens; `.env*`, `.netlify/`, `video-raw/`, credentials and scratch files are ignored and were never committed.
- Images (docs, `web/public`), the demo video (frames every 3 s, OCR and visual check) and its poster: no paths, user names, hosts or keys; MP4 metadata holds only the encoder tag.
- Live site: no source maps, no keys, no local paths in the HTML or JS bundles. `render.yaml` carries no secret values (`sync: false` for the seller account and key); `/health` shows balances, versions and order ids only.
- Commit author email is the owner's personal address on every commit (visible once the repo is public).
