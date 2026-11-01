//! Listings and order lifecycle.

use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

use crate::mandate::apply_storage_delta;
use crate::*;

#[near]
impl Contract {
    /// Publishes an offer. The caller is the seller and pays the listing's
    /// storage from the attached deposit; any excess is refunded.
    #[payable]
    pub fn register_listing(
        &mut self,
        price: U128,
        condition_hash: String,
        delivery_window: U64,
    ) -> U64 {
        require!(price.0 > 0, "price must be positive");
        require!(
            !condition_hash.is_empty() && condition_hash.len() <= MAX_STRING_LEN,
            "condition_hash length out of range"
        );
        require!(
            delivery_window.0 > 0 && delivery_window.0 <= MAX_DELIVERY_WINDOW_NS,
            "delivery_window out of range"
        );
        let seller = env::predecessor_account_id();
        let id = self.next_listing_id;
        self.next_listing_id += 1;

        let before = env::storage_usage();
        self.listings.insert(
            &id,
            &Listing {
                seller: seller.clone(),
                price,
                condition_hash,
                delivery_window,
            },
        );
        let refund = apply_storage_delta(
            env::attached_deposit().as_yoctonear(),
            before,
            env::storage_usage(),
        );
        if refund > 0 {
            Promise::new(seller)
                .transfer(NearToken::from_yoctonear(refund))
                .detach();
        }
        U64(id)
    }

    /// Opens an order under `owner`'s mandate. Only the mandate's agent may
    /// call it. Every limit is enforced here; on success the price moves
    /// from the mandate balance into the order's escrow and the order's
    /// storage is charged to the mandate's storage deposit.
    pub fn create_order(
        &mut self,
        owner: AccountId,
        listing_id: U64,
        buyer_pubkey: String,
    ) -> Order {
        let mut mandate = self.mandates.get(&owner).expect("No mandate for owner");
        let caller = env::predecessor_account_id();
        require!(caller == mandate.agent, "Caller is not the mandate's agent");
        require!(mandate.active, "Mandate is revoked");
        let now = env::block_timestamp();
        require!(now < mandate.expires_at.0, "Mandate expired");

        let listing = self.listings.get(&listing_id.0).expect("Listing not found");
        let price = listing.price.0;
        require!(
            mandate.allowed_sellers.contains(&listing.seller),
            "Seller not allowed by mandate"
        );
        require!(
            price <= mandate.max_per_order.0,
            "Price exceeds max_per_order"
        );
        require!(
            mandate.spent.0 + price <= mandate.max_total.0,
            "Order would exceed max_total"
        );
        require!(price <= mandate.balance.0, "Insufficient mandate balance");
        require!(
            mandate.open_orders < mandate.max_open_orders,
            "Too many open orders"
        );
        require!(
            !buyer_pubkey.is_empty() && buyer_pubkey.len() <= MAX_STRING_LEN,
            "buyer_pubkey length out of range"
        );

        let id = self.next_order_id;
        self.next_order_id += 1;
        let order = Order {
            id: U64(id),
            buyer: owner.clone(),
            agent: caller,
            seller: listing.seller,
            amount: U128(price),
            listing_id,
            created_at: U64(now),
            deadline: U64(now + listing.delivery_window.0),
            buyer_pubkey,
            delivery_ref: None,
            encrypted_key: None,
            status: OrderStatus::Open,
        };

        let before = env::storage_usage();
        self.orders.insert(&id, &order);
        let after = env::storage_usage();
        mandate.storage_deposit = U128(apply_storage_delta(
            mandate.storage_deposit.0,
            before,
            after,
        ));
        mandate.balance = U128(mandate.balance.0 - price);
        mandate.spent = U128(mandate.spent.0 + price);
        mandate.open_orders += 1;
        self.mandates.insert(&owner, &mandate);
        order
    }
}
