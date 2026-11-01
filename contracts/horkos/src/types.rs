use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId, BorshStorageKey};

/// Default cap on non-final (Open/Delivered) orders per mandate.
pub const DEFAULT_MAX_OPEN_ORDERS: u32 = 50;
/// Hard upper bound an owner may configure for `max_open_orders`.
pub const MAX_OPEN_ORDERS_LIMIT: u32 = 100;
/// Upper bound on the allowed-seller list (keeps mandate reads cheap).
pub const MAX_ALLOWED_SELLERS: usize = 20;
/// Upper bound for free-form strings (hashes, public keys, references).
pub const MAX_STRING_LEN: usize = 256;
/// Longest delivery window a listing may declare: 30 days in nanoseconds.
pub const MAX_DELIVERY_WINDOW_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    Mandates,
    Listings,
    Orders,
    Balances,
}

/// A user's spending policy for one agent, enforced by the contract.
/// Keyed by the owner's account (one mandate per owner in P0).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Mandate {
    pub owner: AccountId,
    pub agent: AccountId,
    /// Unspent budget held in escrow-ready form (token base units).
    pub balance: U128,
    /// Amount currently committed to non-refunded orders; checked against `max_total`.
    pub spent: U128,
    pub max_total: U128,
    pub max_per_order: U128,
    pub allowed_sellers: Vec<AccountId>,
    /// Block timestamp (ns) after which the agent can no longer open orders.
    pub expires_at: U64,
    pub active: bool,
    /// Unused NEAR (yocto) prepaid by the owner for order storage.
    pub storage_deposit: U128,
    pub open_orders: u32,
    pub max_open_orders: u32,
}

/// A seller's offer. The delivery condition is referenced by hash.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub seller: AccountId,
    pub price: U128,
    pub condition_hash: String,
    /// Time (ns) the seller has to deliver after an order is created.
    pub delivery_window: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OrderStatus {
    Open,
    Delivered,
    Settled,
    Refunded,
    Cancelled,
}

impl OrderStatus {
    pub fn is_final(self) -> bool {
        matches!(self, Self::Settled | Self::Refunded | Self::Cancelled)
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Order {
    pub id: U64,
    /// Mandate owner whose budget funds the order.
    pub buyer: AccountId,
    /// Agent that created the order under the buyer's mandate.
    pub agent: AccountId,
    pub seller: AccountId,
    pub amount: U128,
    pub listing_id: U64,
    pub created_at: U64,
    pub deadline: U64,
    pub buyer_pubkey: String,
    pub delivery_ref: Option<String>,
    pub encrypted_key: Option<String>,
    pub status: OrderStatus,
}

/// Which internal balance `withdraw` draws from.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WithdrawSource {
    /// Seller earnings credited by `settle`.
    Earnings,
    /// Owner's unspent mandate budget.
    Budget,
}
