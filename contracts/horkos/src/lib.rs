//! Horkos: programmable escrow for AI agent purchases.
//!
//! Funds live in this contract per order. An agent can only open orders that
//! fit the owner's on-chain mandate; unfinished orders refund themselves after
//! their deadline. Every order is a non-transferable NEP-171 receipt.
//! Delivery verification and settlement are added in a later step.

// Write-through collections: storage cost is measured with
// `env::storage_usage()` inside a call, which requires writes to land
// immediately (the `near_sdk::store` collections flush only at the end).
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_sdk::collections::{LazyOption, LookupMap};
use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, AccountId, PanicOnDefault};

mod mandate;
mod nft;
mod orders;
mod types;
mod withdraw;
pub use nft::{METADATA_SLACK_BYTES, NON_TRANSFERABLE};
pub use types::*;

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests;

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    /// The only NEP-141 token accepted as budget.
    pub(crate) token: AccountId,
    pub(crate) mandates: LookupMap<AccountId, Mandate>,
    pub(crate) listings: LookupMap<u64, Listing>,
    pub(crate) next_listing_id: u64,
    pub(crate) orders: LookupMap<u64, Order>,
    pub(crate) next_order_id: u64,
    /// Seller earnings (token base units), withdrawable via `withdraw`.
    pub(crate) balances: LookupMap<AccountId, u128>,
    /// NEP-171 receipts; token_id = order id, owner = buyer.
    pub(crate) nft: NonFungibleToken,
    pub(crate) nft_metadata: LazyOption<NFTContractMetadata>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(token: AccountId) -> Self {
        Self {
            token,
            mandates: LookupMap::new(StorageKey::Mandates),
            listings: LookupMap::new(StorageKey::Listings),
            next_listing_id: 0,
            orders: LookupMap::new(StorageKey::Orders),
            next_order_id: 0,
            balances: LookupMap::new(StorageKey::Balances),
            nft: NonFungibleToken::new(
                StorageKey::NftOwners,
                env::current_account_id(),
                Some(StorageKey::NftMetadata),
                Some(StorageKey::NftEnumeration),
                None::<StorageKey>,
            ),
            nft_metadata: LazyOption::new(
                StorageKey::NftContractMetadata,
                Some(&NFTContractMetadata {
                    spec: NFT_METADATA_SPEC.to_string(),
                    name: "Horkos Receipts".to_string(),
                    symbol: "HORKOS".to_string(),
                    icon: None,
                    base_uri: None,
                    reference: None,
                    reference_hash: None,
                }),
            ),
        }
    }

    // ---- views ----

    pub fn get_token(&self) -> AccountId {
        self.token.clone()
    }

    pub fn get_mandate(&self, owner: AccountId) -> Option<Mandate> {
        self.mandates.get(&owner)
    }

    pub fn get_listing(&self, listing_id: U64) -> Option<Listing> {
        self.listings.get(&listing_id.0)
    }

    pub fn get_order(&self, order_id: U64) -> Option<Order> {
        self.orders.get(&order_id.0)
    }

    /// Seller earnings available to `withdraw`.
    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).unwrap_or(0))
    }

    /// Current yocto cost per byte of storage (helps clients size deposits).
    pub fn storage_byte_cost(&self) -> U128 {
        U128(env::storage_byte_cost().as_yoctonear())
    }
}
