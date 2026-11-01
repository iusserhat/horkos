//! Delivery, verification through NEAR OutLayer, and settlement.
//!
//! Trust model: the contract does not verify a TEE attestation. It accepts
//! the verifier result only from the callback of its own `request_execution`
//! call (`#[private]`), with the WASM pinned by hash. OutLayer's operator is
//! trusted to deliver that result; the attestation can be checked off-chain.

use near_sdk::json_types::U64;
use near_sdk::serde_json::{self, json};
use near_sdk::{assert_one_yocto, env, log, near, require, Gas, Promise, PromiseError};

use crate::*;

const GAS_REQUEST_EXECUTION: Gas = Gas::from_tgas(100);
const GAS_ON_VERIFIED: Gas = Gas::from_tgas(20);

#[near]
impl Contract {
    /// Admin-only: sets where and how deliveries are verified.
    #[payable]
    pub fn set_verifier(&mut self, config: VerifierConfig) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.admin,
            "Only the admin can set the verifier"
        );
        require!(
            config.wasm_hash.len() == 64 && config.wasm_hash.bytes().all(|b| b.is_ascii_hexdigit()),
            "wasm_hash must be 64 hex characters"
        );
        require!(
            config.wasm_url.starts_with("https://") && config.wasm_url.len() <= MAX_STRING_LEN,
            "wasm_url must be an https URL"
        );
        self.verifier = Some(config);
    }

    /// Seller submits a delivery and pays OutLayer's fee (attached NEAR; the
    /// unused part is refunded to the seller by OutLayer). The order moves to
    /// `Verifying` until the callback arrives.
    ///
    /// `delivery_ref`: where the encrypted data lives (stored on the order).
    /// `sealed_key`: the data key sealed to the verifier's public key (passed
    /// to the verifier only, not stored).
    #[payable]
    pub fn submit_delivery(
        &mut self,
        order_id: U64,
        delivery_ref: String,
        sealed_key: String,
    ) -> Promise {
        let verifier = self.verifier.clone().expect("Verifier not configured");
        let mut order = self.orders.get(&order_id.0).expect("Order not found");
        require!(
            env::predecessor_account_id() == order.seller,
            "Only the seller can deliver"
        );
        require!(
            order.status != OrderStatus::Verifying,
            "A verification is already in progress"
        );
        require!(
            matches!(order.status, OrderStatus::Open | OrderStatus::Delivered),
            "Order cannot accept a delivery"
        );
        require!(
            env::block_timestamp() < order.deadline.0,
            "Delivery deadline has passed"
        );
        require!(
            !delivery_ref.is_empty() && delivery_ref.len() <= MAX_STRING_LEN,
            "delivery_ref length out of range"
        );
        require!(
            !sealed_key.is_empty() && sealed_key.len() <= MAX_STRING_LEN,
            "sealed_key length out of range"
        );
        let fee = env::attached_deposit();
        require!(
            fee.as_yoctonear() >= verifier.min_fee.0,
            "Attached deposit is below the verifier fee"
        );
        let listing = self
            .listings
            .get(&order.listing_id.0)
            .expect("Listing not found");

        order.attempts += 1;
        order.delivery_ref = Some(delivery_ref.clone());
        order.status = OrderStatus::Verifying;
        self.save_order(&order);

        // `buyer_pubkey` comes from the order record, never from the seller,
        // so the verifier can only re-encrypt the data key for the buyer.
        let input = json!({
            "order_id": order.id,
            "attempt": order.attempts,
            "delivery_ref": delivery_ref,
            "sealed_key": sealed_key,
            "condition_hash": listing.condition_hash,
            "buyer_pubkey": order.buyer_pubkey,
        });
        let mut args = json!({
            "source": {"WasmUrl": {
                "url": verifier.wasm_url,
                "hash": verifier.wasm_hash,
                "build_target": verifier.build_target,
            }},
            "resource_limits": {
                "max_instructions": 10_000_000_000u64,
                "max_memory_mb": 128,
                "max_execution_seconds": 60,
            },
            "input_data": input.to_string(),
            "response_format": "Json",
            "payer_account_id": order.seller,
        });
        if let (Some(profile), Some(account)) = (verifier.secrets_profile, verifier.secrets_account)
        {
            args["secrets_ref"] = json!({"profile": profile, "account_id": account});
        }

        Promise::new(verifier.outlayer)
            .function_call(
                "request_execution".to_string(),
                serde_json::to_vec(&args).unwrap(),
                fee,
                GAS_REQUEST_EXECUTION,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_VERIFIED)
                    .on_verified(order.id, order.attempts),
            )
    }

    /// OutLayer callback. Settles the order only if the result is valid,
    /// belongs to this order and attempt, the order is still `Verifying`,
    /// and the deadline has not passed. An invalid or missing result returns
    /// the order to `Delivered` (seller may resubmit). A result for an order
    /// that was refunded meanwhile changes nothing. Returns true on settle.
    #[private]
    pub fn on_verified(&mut self, order_id: U64, attempt: u32) -> bool {
        let Some(mut order) = self.orders.get(&order_id.0) else {
            return false;
        };
        if order.status != OrderStatus::Verifying || order.attempts != attempt {
            log!(
                "Ignoring verifier result for order {} attempt {} (status {:?}, attempts {})",
                order_id.0,
                attempt,
                order.status,
                order.attempts
            );
            return false;
        }

        let raw: Result<Vec<u8>, PromiseError> =
            env::promise_result_checked(0, MAX_VERIFIER_OUTPUT);
        // OutLayer returns `null` when the run failed or produced nothing.
        let output: Option<VerifierOutput> = raw
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Option<VerifierOutput>>(&bytes).ok())
            .flatten();

        let sealed_for_buyer = output.as_ref().and_then(|o| {
            let matches = o.valid && o.order_id == order_id && o.attempt == attempt;
            let key = o.buyer_sealed_key.as_ref()?;
            (matches && !key.is_empty() && key.len() <= MAX_STRING_LEN).then(|| key.clone())
        });
        let in_time = env::block_timestamp() < order.deadline.0;

        match (sealed_for_buyer, in_time) {
            (Some(key), true) => {
                let earned = self.balances.get(&order.seller).unwrap_or(0);
                self.balances
                    .insert(&order.seller, &(earned + order.amount.0));
                order.encrypted_key = Some(key);
                order.status = OrderStatus::Settled;
                self.close_order_slot(&order);
                self.save_order(&order);
                if let Some(hash) = output.and_then(|o| o.data_sha256) {
                    log!("Order {} settled; data_sha256 {}", order_id.0, hash);
                }
                true
            }
            _ => {
                order.status = OrderStatus::Delivered;
                self.save_order(&order);
                false
            }
        }
    }

    /// Storage bytes charged per order on top of the order record and its
    /// receipt (helps clients size the mandate's storage deposit).
    pub fn reserved_bytes_per_order(&self) -> U64 {
        U64(DELIVERY_RESERVED_BYTES + METADATA_SLACK_BYTES)
    }
}

impl Contract {
    /// A settled order frees its open-order slot; its amount stays counted
    /// in `spent` (the money was spent).
    fn close_order_slot(&mut self, order: &Order) {
        let mut mandate = self
            .mandates
            .get(&order.buyer)
            .expect("No mandate for owner");
        mandate.open_orders -= 1;
        self.mandates.insert(&order.buyer, &mandate);
    }
}
