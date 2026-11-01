//! NEP-171 receipts: one non-transferable NFT per order.
//!
//! `token_id` is the order id; the owner is the buyer (mandate owner). The
//! token metadata mirrors the order (amount, seller, status, deadline) and is
//! rewritten whenever the order's status changes.

use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, PromiseOrValue};

use crate::*;

pub const NON_TRANSFERABLE: &str = "Receipts are non-transferable in this version";

/// Bytes reserved per order for metadata rewrites (status names differ in
/// length by up to 5 bytes). Charged at `create_order`, so later status
/// changes never need a new storage payment.
pub const METADATA_SLACK_BYTES: u64 = 32;

fn ns_to_ms(ns: u64) -> String {
    (ns / 1_000_000).to_string()
}

impl Contract {
    pub(crate) fn receipt_metadata(token: &AccountId, order: &Order) -> TokenMetadata {
        let extra = json!({
            "order_id": order.id,
            "amount": order.amount,
            "token": token,
            "seller": order.seller,
            "listing_id": order.listing_id,
            "status": order.status,
            "deadline": order.deadline,
        });
        TokenMetadata {
            title: Some(format!("Horkos receipt #{}", order.id.0)),
            description: Some("Escrow receipt for an AI agent purchase".to_string()),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(ns_to_ms(order.created_at.0)),
            expires_at: Some(ns_to_ms(order.deadline.0)),
            starts_at: None,
            // Always set, so later rewrites keep the same encoded size.
            updated_at: Some(ns_to_ms(env::block_timestamp())),
            extra: Some(extra.to_string()),
            reference: None,
            reference_hash: None,
        }
    }

    /// Mints the receipt. Storage is measured by the caller (`create_order`).
    pub(crate) fn mint_receipt(&mut self, order: &Order) {
        let token_id: TokenId = order.id.0.to_string();
        self.nft.internal_mint_with_refund(
            token_id.clone(),
            order.buyer.clone(),
            Some(Self::receipt_metadata(&self.token, order)),
            None,
        );
        NftMint {
            owner_id: &order.buyer,
            token_ids: &[&token_id],
            memo: Some("horkos order created"),
        }
        .emit();
    }

    /// Persists a status change on the order and its receipt.
    pub(crate) fn save_order(&mut self, order: &Order) {
        self.orders.insert(&order.id.0, order);
        let metadata = Self::receipt_metadata(&self.token, order);
        if let Some(by_id) = self.nft.token_metadata_by_id.as_mut() {
            by_id.insert(&order.id.0.to_string(), &metadata);
        }
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "horkos",
                "version": "0.1.0",
                "event": "order_status",
                "data": [{"order_id": order.id, "status": order.status}],
            })
        ));
    }
}

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    #[allow(unused_variables)]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        env::panic_str(NON_TRANSFERABLE)
    }

    #[payable]
    #[allow(unused_variables)]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        env::panic_str(NON_TRANSFERABLE)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.nft.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.nft.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.nft.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.nft.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.nft.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.nft_metadata.get().unwrap()
    }
}
