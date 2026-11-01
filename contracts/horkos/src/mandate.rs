//! Budget deposits (NEP-141 `ft_on_transfer`) and mandate management.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::{U128, U64};
use near_sdk::{
    assert_one_yocto, env, log, near, require, AccountId, NearToken, Promise, PromiseOrValue,
};

use crate::*;

#[near]
impl Contract {
    /// Creates or updates the caller's mandate. The caller is the owner.
    ///
    /// Requires at least 1 yoctoNEAR (so a function-call key cannot call it).
    /// All attached NEAR is added to the mandate's storage deposit; the
    /// mandate's own storage growth is charged from it, and later
    /// `create_order` calls charge their storage from it too.
    /// Updating keeps `balance`, `spent`, `open_orders` and re-activates.
    #[payable]
    pub fn set_mandate(
        &mut self,
        agent: AccountId,
        max_total: U128,
        max_per_order: U128,
        allowed_sellers: Vec<AccountId>,
        expires_at: U64,
        max_open_orders: Option<u32>,
    ) -> Mandate {
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= 1,
            "Requires attached deposit of at least 1 yoctoNEAR"
        );
        let owner = env::predecessor_account_id();
        let max_open_orders = max_open_orders.unwrap_or(DEFAULT_MAX_OPEN_ORDERS);

        require!(agent != owner, "Agent must be a separate account");
        require!(max_per_order.0 > 0, "max_per_order must be positive");
        require!(
            max_per_order.0 <= max_total.0,
            "max_per_order exceeds max_total"
        );
        require!(!allowed_sellers.is_empty(), "allowed_sellers is empty");
        require!(
            allowed_sellers.len() <= MAX_ALLOWED_SELLERS,
            "Too many allowed sellers"
        );
        require!(
            expires_at.0 > env::block_timestamp(),
            "expires_at is in the past"
        );
        require!(
            (1..=MAX_OPEN_ORDERS_LIMIT).contains(&max_open_orders),
            "max_open_orders out of range"
        );

        let mut mandate = self.mandates.get(&owner).unwrap_or(Mandate {
            owner: owner.clone(),
            agent: agent.clone(),
            balance: U128(0),
            spent: U128(0),
            max_total,
            max_per_order,
            allowed_sellers: vec![],
            expires_at,
            active: true,
            storage_deposit: U128(0),
            open_orders: 0,
            max_open_orders,
        });
        mandate.agent = agent;
        mandate.max_total = max_total;
        mandate.max_per_order = max_per_order;
        mandate.allowed_sellers = allowed_sellers;
        mandate.expires_at = expires_at;
        mandate.max_open_orders = max_open_orders;
        mandate.active = true;
        let deposit = mandate.storage_deposit.0 + attached;

        // Measure the mandate's own storage delta and settle it against the deposit.
        let before = env::storage_usage();
        self.mandates.insert(&owner, &mandate);
        let after = env::storage_usage();
        mandate.storage_deposit = U128(apply_storage_delta(deposit, before, after));
        // Same encoded size (fixed-width fields), so no further storage change.
        self.mandates.insert(&owner, &mandate);
        mandate
    }

    /// Deactivates the caller's mandate and refunds its unused storage deposit.
    /// Open orders stay valid and can still be refunded after their deadline;
    /// the unspent budget stays withdrawable via `withdraw(Budget)`.
    #[payable]
    pub fn revoke_mandate(&mut self) -> U128 {
        assert_one_yocto();
        let owner = env::predecessor_account_id();
        let mut mandate = self.mandates.get(&owner).expect("No mandate");
        let refund = mandate.storage_deposit.0;
        mandate.active = false;
        mandate.storage_deposit = U128(0);
        self.mandates.insert(&owner, &mandate);
        if refund > 0 {
            Promise::new(owner)
                .transfer(NearToken::from_yoctonear(refund))
                .detach();
        }
        U128(refund)
    }
}

/// Returns the deposit left after paying for storage growth `before → after`
/// (or crediting freed storage). Panics if the deposit cannot cover growth.
pub(crate) fn apply_storage_delta(deposit: u128, before: u64, after: u64) -> u128 {
    let byte_cost = env::storage_byte_cost().as_yoctonear();
    if after >= before {
        let cost = u128::from(after - before) * byte_cost;
        require!(
            deposit >= cost,
            format!("Insufficient storage deposit: need {cost} yoctoNEAR, have {deposit}")
        );
        deposit - cost
    } else {
        deposit + u128::from(before - after) * byte_cost
    }
}

#[near]
impl FungibleTokenReceiver for Contract {
    /// Credits the sender's mandate budget. Only the configured token is
    /// accepted. Senders without a mandate get their tokens back, so a
    /// transfer cannot create new records at the contract's storage cost.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        #[allow(unused_variables)] msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.token,
            "Only the configured token is accepted"
        );
        match self.mandates.get(&sender_id) {
            Some(mut mandate) => {
                mandate.balance = U128(mandate.balance.0 + amount.0);
                self.mandates.insert(&sender_id, &mandate);
                PromiseOrValue::Value(U128(0))
            }
            None => {
                log!("No mandate for {}; returning deposit", sender_id);
                PromiseOrValue::Value(amount)
            }
        }
    }
}
