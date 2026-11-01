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
/// Storage reserved per order at `create_order` so that delivery and
/// settlement never need a new payment: `delivery_ref` and `encrypted_key`
/// (each up to `MAX_STRING_LEN`, plus a 4-byte length prefix) and the
/// seller's earnings entry (key + u128 + 40-byte trie record overhead).
pub const DELIVERY_RESERVED_BYTES: u64 = 2 * (4 + MAX_STRING_LEN as u64) + 128;
/// Largest verifier output the contract reads (OutLayer caps it at 900 bytes).
pub const MAX_VERIFIER_OUTPUT: usize = 2048;

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    Mandates,
    Listings,
    Orders,
    Balances,
    NftOwners,
    NftMetadata,
    NftEnumeration,
    NftContractMetadata,
    Verifiers,
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
    /// A delivery is being checked by the verifier (one request at a time).
    Verifying,
    /// A delivery was submitted but did not pass (or no result came back);
    /// the seller may resubmit until the deadline.
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
    /// Data key sealed to `buyer_pubkey`, written only on settlement.
    pub encrypted_key: Option<String>,
    pub status: OrderStatus,
    /// Verifier version pinned at `create_order`; `submit_delivery` uses only
    /// this version, so changing the verifier never affects existing orders.
    pub verifier_version: u32,
    /// Number of verification requests made; callbacks carry it so a result
    /// can only apply to the attempt that asked for it.
    pub attempts: u32,
}

/// Where and how deliveries are verified (set by the admin).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct VerifierConfig {
    /// OutLayer contract, e.g. `outlayer.testnet`.
    pub outlayer: AccountId,
    /// Verifier WASM; the hash pins the exact code OutLayer runs.
    pub wasm_url: String,
    pub wasm_hash: String,
    pub build_target: String,
    /// Verifier's X25519 public key (base64). Sellers seal `K || sha256(ciphertext)`
    /// to it; the matching secret key lives only inside the TEE.
    pub encryption_pubkey: String,
    /// OutLayer secrets row holding the verifier key (optional until P1 keys exist).
    pub secrets_profile: Option<String>,
    pub secrets_account: Option<AccountId>,
    /// Smallest deposit a seller must attach for OutLayer's fee (yoctoNEAR).
    pub min_fee: U128,
    /// Largest fee accepted; bounds what Horkos forwards back to the seller
    /// when the OutLayer call itself fails.
    pub max_fee: U128,
}

/// A verifier version as published by `set_verifier` (immutable once added).
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct VerifierView {
    pub version: u32,
    pub config: VerifierConfig,
}

/// What the verifier WASM prints to stdout (OutLayer `response_format: Json`).
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct VerifierOutput {
    pub order_id: U64,
    pub attempt: u32,
    pub valid: bool,
    /// Data key sealed to the buyer's public key; required when `valid`.
    pub buyer_sealed_key: Option<String>,
    pub data_sha256: Option<String>,
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
