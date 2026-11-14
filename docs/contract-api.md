# Escrow contract API

Contract `contracts/horkos` (near-sdk 5.30.0), deployed at `escrow.horkos.testnet`. Every error string below is copied from the source (`require!`, `expect`, `panic_str`); a failed call reverts all of its state changes. Amounts are strings in JSON (`U128`, `U64`). tUSDC has 6 decimals; times are nanoseconds unless noted.

Gas column: what the SDK attaches (`sdk/src`). Unused gas is refunded.

## Initialisation

### `new(token: AccountId, admin: AccountId)`

`#[init]`, once, by the contract account. `token` is the only NEP-141 accepted as budget; `admin` may publish verifier versions. Receipt metadata: name "Horkos Receipts", symbol `HORKOS`. Testnet: `new(token = tusdc.horkos.testnet, admin = horkos.testnet)`.

## Owner methods

### `set_mandate(agent, max_total, max_per_order, allowed_sellers, expires_at, max_open_orders?) -> Mandate`

| | |
| --- | --- |
| Caller | The owner (any account; the mandate is keyed by the caller) |
| Args | `agent: AccountId`, `max_total: U128`, `max_per_order: U128`, `allowed_sellers: AccountId[]` (1 to 20), `expires_at: U64` (ns), `max_open_orders: u32 \| null` (default 50, 1 to 100) |
| Deposit | At least 1 yoctoNEAR. All of it is added to the mandate's storage deposit; size it for orders (≈ 0.0152 NEAR each) |
| Gas | 50 Tgas |
| Effect | Creates or updates the caller's mandate. Updating keeps `balance`, `spent`, `open_orders` and sets `active = true`. The mandate's own storage is charged from the deposit |

Errors: "Requires attached deposit of at least 1 yoctoNEAR"; "Agent must be a separate account"; "max_per_order must be positive"; "max_per_order exceeds max_total"; "allowed_sellers is empty"; "Too many allowed sellers"; "expires_at is in the past"; "max_open_orders out of range"; "Insufficient storage deposit: need {cost} yoctoNEAR, have {deposit}".

### `revoke_mandate() -> U128`

| | |
| --- | --- |
| Caller | The owner |
| Deposit | Exactly 1 yoctoNEAR |
| Gas | 30 Tgas |
| Effect | `active = false`; refunds the whole unused storage deposit (returned value, yoctoNEAR). Open orders stay valid and refundable; the unspent budget stays withdrawable with `withdraw(Budget)` |

Errors: "Requires attached deposit of exactly 1 yoctoNEAR" (near-sdk `assert_one_yocto`); "No mandate".

### Budget deposit: `ft_transfer_call` on the token → `ft_on_transfer(sender_id, amount, msg) -> U128`

The owner calls the token's `ft_transfer_call(receiver_id = escrow, amount, msg = "")` with 1 yoctoNEAR and 100 Tgas. The token then calls `ft_on_transfer`, which adds `amount` to the sender's mandate balance and returns `"0"`. If the sender has no mandate, it logs "No mandate for {sender}; returning deposit" and returns the full amount, so the token refunds it. `msg` is ignored.

Errors: "Only the configured token is accepted" (predecessor is not the configured token).

## Agent methods

The agent signs with a function-call key limited to `create_order` and `cancel_order` on the escrow. A function-call key cannot attach a deposit, so it cannot call any owner method.

### `create_order(owner, listing_id, buyer_pubkey, verifier_version?) -> Order`

| | |
| --- | --- |
| Caller | `mandate.agent` of `owner`'s mandate |
| Args | `owner: AccountId`, `listing_id: U64`, `buyer_pubkey: String` (X25519, base64, 1 to 256 chars), `verifier_version: u32 \| null` (the version the agent checked) |
| Deposit | None |
| Gas | 100 Tgas |
| Effect | Moves the listing price from the mandate balance to the order (`spent += price`, `open_orders += 1`), pins the current verifier version, sets `deadline = now + listing.delivery_window`, mints receipt NFT `token_id = order id` to `owner`, charges ≈ 1,517 bytes to the storage deposit. Status `Open` |

Errors, in check order: "No mandate for owner"; "Caller is not the mandate's agent"; "Mandate is revoked"; "Mandate expired"; "Listing not found"; "Seller not allowed by mandate"; "Price exceeds max_per_order"; "Order would exceed max_total"; "Insufficient mandate balance"; "Too many open orders"; "buyer_pubkey length out of range"; "Verifier not configured"; "Verifier changed: expected version {expected}, current {current}"; "Insufficient storage deposit: need {cost} yoctoNEAR, have {deposit}".

### `cancel_order(order_id: U64) -> Order`

| | |
| --- | --- |
| Caller | The mandate's current agent or the owner |
| Gas | 50 Tgas |
| Effect | `Open` → `Cancelled`; price back to the budget (`spent -= price`), open-order slot freed, delivery reserve (648 bytes) back to the storage deposit |

Errors: "Order not found"; "No mandate for owner"; "Only the agent or owner can cancel"; "Only Open orders can be cancelled".

## Seller methods

### `register_listing(price, condition_hash, delivery_window) -> U64`

| | |
| --- | --- |
| Caller | The seller |
| Args | `price: U128` (> 0), `condition_hash: String` (1 to 256 chars; the SDK uses `sha256:<hex>` of the condition bytes), `delivery_window: U64` (ns, > 0, ≤ 30 days) |
| Deposit | Storage for the listing record; the excess is refunded (SDK default 0.1 NEAR) |
| Gas | 50 Tgas |
| Returns | The new listing id (sequential from 0) |

Errors: "price must be positive"; "condition_hash length out of range"; "delivery_window out of range"; "Insufficient storage deposit: need {cost} yoctoNEAR, have {deposit}".

### `submit_delivery(order_id: U64, delivery_ref: String, sealed_key: String) -> Promise`

| | |
| --- | --- |
| Caller | The order's seller |
| Args | `delivery_ref`: manifest URL (1 to 256 chars, stored on the order). `sealed_key`: the 64-byte payload `K \|\| sha256(ciphertext)` sealed to the verifier's public key, base64 (1 to 256 chars, passed to the verifier only, not stored) |
| Deposit | OutLayer's fee, between the pinned version's `min_fee` and `max_fee` (testnet v0: 0.01 to 0.05 NEAR). OutLayer refunds the unused part to the seller |
| Gas | 300 Tgas (100 Tgas go to `request_execution`, 10 Tgas are reserved for `on_verified`) |
| Effect | `attempts += 1`, `delivery_ref` stored, status `Verifying`; calls `request_execution` on the pinned OutLayer account with the pinned WASM (URL, sha256, build target), limits 10^10 instructions / 128 MB / 60 s, `response_format: Json`, `payer_account_id = seller`, and the secrets reference if set; then `on_verified` |

Errors: "Order not found"; "Pinned verifier version missing"; "Only the seller can deliver"; "A verification is already in progress"; "Order cannot accept a delivery" (status is not `Open` or `Delivered`); "Delivery deadline has passed"; "delivery_ref length out of range"; "sealed_key length out of range"; "Attached deposit is below the verifier fee"; "Attached deposit is above the verifier's max fee"; "Listing not found".

### `withdraw(from: "Earnings" | "Budget", amount: U128 | null) -> Promise`

| | |
| --- | --- |
| Caller | A seller (`Earnings`: settled order income) or an owner (`Budget`: unspent mandate balance) |
| Deposit | Exactly 1 yoctoNEAR (so an agent's function-call key cannot call it) |
| Gas | 50 Tgas (10 Tgas `ft_transfer`, 5 Tgas `on_withdraw`) |
| Effect | Debits the internal balance, then `ft_transfer` to the caller. If the transfer fails (e.g. the caller is not registered on the token), `on_withdraw` credits it back and logs "Withdraw of {amount} to {account} failed; balance restored". Returns whether it went through |

Errors: "Requires attached deposit of exactly 1 yoctoNEAR"; "Nothing to withdraw"; "Amount exceeds available balance"; "No mandate" (`Budget` without a mandate).

## Anyone

### `refund_expired(order_id: U64) -> Order`

Any account, no deposit, 50 Tgas is ample. `Open`, `Verifying` or `Delivered` past its deadline → `Refunded`; the price returns to the mandate budget, the open-order slot is freed, and if the order never received a delivery (`attempts == 0`) the delivery reserve returns to the storage deposit. A verifier result that arrives afterwards changes nothing.

Errors: "Order not found"; "Order already finalized"; "Order not expired yet"; "No mandate for owner".

## Admin

### `set_verifier(config: VerifierConfig) -> u32`

| | |
| --- | --- |
| Caller | `admin` |
| Args | `outlayer: AccountId`, `wasm_url: String` (https, ≤ 256), `wasm_hash: String` (64 hex chars), `build_target: String` (e.g. `wasm32-wasip2`), `encryption_pubkey: String` (X25519 base64, ≤ 64), `secrets_profile: String \| null`, `secrets_account: AccountId \| null`, `min_fee: U128`, `max_fee: U128` (yoctoNEAR) |
| Deposit | At least 1 yoctoNEAR; storage for the new entry, excess refunded |
| Effect | Appends a new version and returns its number. Existing versions never change; open orders keep the version they were created with |

Errors: "Requires attached deposit of at least 1 yoctoNEAR"; "Only the admin can set the verifier"; "wasm_hash must be 64 hex characters"; "wasm_url must be an https URL"; "encryption_pubkey length out of range"; "max_fee must be positive and at least min_fee"; "Insufficient storage deposit: need {cost} yoctoNEAR, have {deposit}".

## Callbacks (`#[private]`, only the contract itself)

### `on_verified(order_id: U64, attempt: u32, fee: U128) -> bool`

Reads the `request_execution` result (at most 2,048 bytes).

- `Err` (the OutLayer call itself failed and the runtime returned the fee to Horkos): the fee is forwarded to the seller, log "OutLayer call failed for order {id}; fee returned to seller".
- Order no longer `Verifying`, or `attempt` is not the current one: log "Ignoring verifier result for order {id} attempt {n} (status {s}, attempts {m})", returns `false`.
- Result `{valid: true, order_id, attempt, buyer_sealed_key}` matching the order and attempt, before the deadline: seller balance += price, `encrypted_key` stored, status `Settled`, log "Order {id} settled; data_sha256 {hash}", returns `true`.
- Anything else (invalid, `null`, malformed, late): status `Delivered`, returns `false`.

Measured gas: 2.0 to 2.4 Tgas of the 10 attached.

### `on_withdraw(account, from, amount) -> bool`

Restores the debited balance if `ft_transfer` failed. Measured 1.5 Tgas (success) and 1.7 Tgas (restore) of the 5 attached.

## Views

| Method | Returns |
| --- | --- |
| `get_token()` | The accepted token account |
| `get_admin()` | The admin account |
| `get_verifier()` | `{version, config}` of the latest version, or `null` |
| `get_verifier_version(version: u32)` | `VerifierConfig` or `null` |
| `get_mandate(owner)` | `Mandate` or `null`: `owner, agent, balance, spent, max_total, max_per_order, allowed_sellers, expires_at, active, storage_deposit, open_orders, max_open_orders` |
| `get_listing(listing_id: U64)` | `Listing` or `null`: `seller, price, condition_hash, delivery_window` |
| `get_order(order_id: U64)` | `Order` or `null`: `id, buyer, agent, seller, amount, listing_id, created_at, deadline, buyer_pubkey, delivery_ref, encrypted_key, status, verifier_version, attempts` |
| `balance_of(account_id)` | Seller earnings available to `withdraw` |
| `storage_byte_cost()` | yoctoNEAR per byte |
| `reserved_bytes_per_order()` | 680: delivery reserve (648) + metadata slack (32) |

The contract has no view that lists mandates or listings; clients read listings by id from 0 upwards and orders through `nft_tokens`.

## Events

| Standard | Event | When | Data |
| --- | --- | --- | --- |
| `horkos` 0.1.0 | `order_status` | Every status change (`Verifying`, `Settled`, `Delivered`, `Refunded`, `Cancelled`) | `[{order_id, status}]` |
| `nep171` | `nft_mint` | `create_order` | `owner_id`, `token_ids: [order id]`, memo "horkos order created" |

Logged as `EVENT_JSON:{...}`. `Open` has no `order_status` event; the mint marks it.

## NFT receipts (NEP-171)

- One token per order, `token_id` = order id, owner = the mandate owner (buyer).
- Metadata: title "Horkos receipt #{id}", description "Escrow receipt for an AI agent purchase", `copies` 1, `issued_at` = creation (ms), `expires_at` = deadline (ms), `updated_at` = last change (ms), `extra` = JSON `{order_id, amount, token, seller, listing_id, status, deadline}`. Rewritten on every status change, paid from the 32-byte slack reserved at creation.
- Supported: `nft_token`, `nft_tokens`, `nft_total_supply`, `nft_supply_for_owner`, `nft_tokens_for_owner`, `nft_metadata`.
- v1 (`escrow.horkos.testnet`): `nft_transfer` and `nft_transfer_call` always panic with "Receipts are non-transferable in this version". There are no approvals.
- v2 (`escrow-v2.horkos.testnet`, crate `contracts/horkos-v2`): receipts are transferable; see below and ADR-036.

## v2: transferable receipts

Everything above applies to v2, with these changes.

| Method | Who | Deposit | Effect / errors |
| --- | --- | --- | --- |
| `nft_transfer(receiver_id, token_id, approval_id?, memo?)` | holder or approved account | exactly 1 yocto | Moves the receipt (the claim). NEP-297 `nft_transfer` event. "Sender not approved", "Requires attached deposit of exactly 1 yoctoNEAR", "Receipt is final: settled, refunded or cancelled receipts cannot be transferred" |
| `nft_transfer_call(..., msg)` | same | exactly 1 yocto | NEP-171 transfer and call; returned if `nft_on_transfer` returns `true`, unless the order closed meanwhile (then it stays with the receiver) |
| `nft_approve(token_id, account_id, msg?)` | holder | approval storage | NEP-178; only while the order is open |
| `nft_revoke`, `nft_revoke_all` | holder | exactly 1 yocto | NEP-178 |
| `nft_is_approved(token_id, approved_account_id, approval_id?)` | view | | NEP-178 |
| `get_receipt_holder(order_id)` | view | | Current holder, or `null` |
| `set_receipt_pubkey(order_id, buyer_pubkey)` | holder | exactly 1 yocto | Replaces the key the data key is sealed to. "Only the receipt holder", "Key can change only while the order is Open or Delivered", "buyer_pubkey must have the same length as the current key" |
| `cancel_order(order_id)` | holder; the agent only while the buyer holds the receipt | | `Open` only. Refund as below |
| `refund_expired(order_id)` | anyone | | Refund as below |

Refunds: if the buyer holds the receipt, the amount returns to the mandate budget (as in v1). Otherwise it is credited to the holder's internal balance (`balance_of`), withdrawn with `withdraw({"from":"Earnings"})`; the buyer's mandate frees the open-order slot and keeps the amount as spent.

## Limits

| Constant | Value |
| --- | --- |
| Default / maximum open orders per mandate | 50 / 100 |
| Allowed sellers per mandate | 20 |
| String fields (`condition_hash`, `buyer_pubkey`, `delivery_ref`, `sealed_key`, `wasm_url`) | 256 bytes |
| Delivery window | ≤ 30 days |
| Verifier output read by `on_verified` | 2,048 bytes |
