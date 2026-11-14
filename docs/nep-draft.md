# NEP draft: Verified-delivery escrow receipts

Status: draft, not submitted. Reference implementation: Horkos v2 (`contracts/horkos-v2`, deployed on testnet as `escrow-v2.horkos.testnet`).

## Summary

A standard interface for escrow contracts in which every purchase is an NEP-171 token (a *receipt*) that carries the claim on the order. The price is locked when the order is created; the seller is paid only when a delivery passes a machine-checkable condition, verified by a pinned verifier; otherwise the order is refunded to the receipt's holder after a deadline. Receipts can be transferred while the order is open.

## Motivation

AI agents can pay, but a stablecoin payment cannot be reversed. If the buyer pays first, a seller who delivers nothing or garbage keeps the money; if the seller delivers first, the buyer already has what it paid for. Wallets, agents, explorers and marketplaces need one way to read "what was bought, for how much, is the money still locked, and who holds the claim" without contract-specific code. NEP-171 already gives ownership and transfer; this NEP adds the order semantics on top.

## Specification

### Receipt

One NEP-171 token per order; `token_id` = order id. The token's owner is the *holder*: the account that receives the refund if the order does not settle and whose public key the data key is sealed to on settlement. The token metadata `extra` field is JSON with at least:

```json
{ "order_id": "1", "amount": "5000000", "token": "tusdc.example.near", "seller": "seller.near",
  "listing_id": "1", "status": "Open", "deadline": "1794672000000000000" }
```

`status` is one of `Open`, `Verifying`, `Delivered`, `Settled`, `Refunded`, `Cancelled`. The last three are final and never change.

### Methods

```rust
// views
fn get_order(order_id: U64) -> Option<Order>;
fn get_receipt_holder(order_id: U64) -> Option<AccountId>;
fn get_verifier_version(version: u32) -> Option<VerifierConfig>;   // code hash + verifier location, append-only

// buyer side
fn create_order(owner: AccountId, listing_id: U64, buyer_pubkey: String, verifier_version: Option<u32>) -> Order; // within the owner's mandate
fn cancel_order(order_id: U64) -> Order;            // Open only; refund to the holder
fn set_receipt_pubkey(order_id: U64, buyer_pubkey: String) -> Order;   // holder, 1 yocto, Open or Delivered only

// seller side
#[payable] fn submit_delivery(order_id: U64, delivery_ref: String, sealed_key: String) -> Promise; // starts verification

// anyone
fn refund_expired(order_id: U64) -> Order;          // after the deadline; refund to the holder

// NEP-171 / NEP-178, restricted to open orders
fn nft_transfer(...);  fn nft_transfer_call(...);  fn nft_approve(...);
```

Rules:

1. The price is locked at `create_order` and leaves escrow exactly once: to the seller on settlement, or to the holder on cancel or refund.
2. Settlement happens only through the contract's own verification callback, only for the current attempt, and only before the deadline.
3. A receipt can be transferred only while its order is not final. A final receipt is a frozen record.
4. A refund goes to the holder at the moment of the refund: back to the buyer's budget if the buyer holds it, otherwise to the holder.
5. The verifier (code hash and location) is pinned per order when it is created; publishing a new verifier version does not affect existing orders.

### Events (NEP-297)

Standard `nep171` events (`nft_mint`, `nft_transfer`) plus:

```
EVENT_JSON:{"standard":"horkos","version":"0.1.0","event":"order_status","data":[{"order_id":"1","status":"Settled"}]}
```

A standardized version would rename the standard to `nep-xxx` and add `amount` and `holder` to the `order_status` data.

## Security considerations

- **Verifier trust.** The contract can pin the verifier's code hash, but if the verification result arrives through an operator (as with NEAR OutLayer today), the contract trusts that operator; the TEE attestation can be checked afterwards. Implementations should state this.
- **Conditions.** A machine-checkable condition (for example a JSON Schema) proves the shape of a delivery, not that the data is true.
- **Transfers during verification.** The attempt in flight is sealed to the key that was set when it started; implementations should not allow the holder to change the key during verification, or a holder could make the seller pay for repeated verifications.
- **Phishing.** A holder who gives the receipt away gives away the claim; wallets should say so when transferring a receipt.
- **Storage.** The contract should charge the order's storage to the buyer, and either reserve or charge storage for receivers of transferred receipts.
- **Front-running a refund.** A transfer and a refund in the same block are ordered by the chain; the refund goes to whoever holds the receipt when it executes.

## Reference implementation

Horkos v2: [`contracts/horkos-v2`](../contracts/horkos-v2), ADR-036 in [decisions.md](decisions.md), methods in [contract-api.md](contract-api.md). On testnet: a transferred receipt settled and the new holder opened the data ([docs/testnet.md](testnet.md)); attack and invariant tests in `contracts/horkos-v2/tests/`.

## Open questions

- Should the receipt standard include the mandate (spending limits) or leave it to the escrow?
- A common format for verifier results and attestation references, so wallets can show "verified by" without contract-specific code.
- Partial deliveries and multi-part orders.
