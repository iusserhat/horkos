//! NEP-171 receipts: one transferable NFT per order (v2).
//!
//! `token_id` is the order id. The receipt is minted to the buyer (mandate
//! owner) and IS the claim on the order: whoever holds it when the order
//! closes gets the refund (`cancel_order`, `refund_expired`), and settlement
//! stores the data key sealed to the receipt's `buyer_pubkey`, which the
//! holder can change while no verification is in flight
//! (`set_receipt_pubkey`). Receipts move only while the order is open
//! (`Open`, `Verifying`, `Delivered`); a final receipt is a frozen record.
//! Transfers follow NEP-171 (one yoctoNEAR, owner or approved account) and
//! NEP-178 approvals, and emit NEP-297 `nft_transfer` events.
//! The token metadata mirrors the order (amount, seller, status, deadline) and
//! is rewritten whenever the order's status changes.

use std::collections::HashMap;

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{assert_one_yocto, env, log, near, require, AccountId, Promise, PromiseOrValue};

use crate::*;

pub const RECEIPT_FINAL: &str =
    "Receipt is final: settled, refunded or cancelled receipts cannot be transferred";

/// Bytes reserved per order for metadata rewrites (status names differ in
/// length by up to 5 bytes). Charged at `create_order`, so later status
/// changes never need a new storage payment.
pub const METADATA_SLACK_BYTES: u64 = 32;

fn ns_to_ms(ns: u64) -> String {
    (ns / 1_000_000).to_string()
}

impl Contract {
    /// Current receipt holder: the account that is paid out on refund and
    /// whose `buyer_pubkey` the data key is sealed to.
    pub(crate) fn holder_of(&self, order_id: u64) -> AccountId {
        self.nft
            .owner_by_id
            .get(&order_id.to_string())
            .unwrap_or_else(|| env::panic_str("Receipt not found"))
    }

    fn order_of_token(&self, token_id: &TokenId) -> Order {
        token_id
            .parse::<u64>()
            .ok()
            .and_then(|id| self.orders.get(&id))
            .unwrap_or_else(|| env::panic_str("Token not found"))
    }

    fn assert_transferable(&self, token_id: &TokenId) {
        require!(
            !self.order_of_token(token_id).status.is_final(),
            RECEIPT_FINAL
        );
    }

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
    /// NEP-171: one yoctoNEAR; caller must hold the receipt or be approved
    /// for it. Only while the order is open.
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.assert_transferable(&token_id);
        self.nft
            .nft_transfer(receiver_id, token_id, approval_id, memo)
    }

    /// NEP-171 transfer and call; the receiver can return the receipt with
    /// `true` from `nft_on_transfer` (see `nft_resolve_transfer`).
    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.assert_transferable(&token_id);
        self.nft
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.nft.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    /// If the order closed while the receiver held the receipt (the refund
    /// already went to the receiver), the receipt stays with the receiver;
    /// otherwise the standard rules apply.
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        if self.order_of_token(&token_id).status.is_final() {
            log!(
                "Order {} closed during nft_transfer_call; receipt stays with {}",
                token_id,
                receiver_id
            );
            return true;
        }
        self.nft.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

/// NEP-178 approvals: the approver pays the approval's storage.
#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.assert_transferable(&token_id);
        self.nft.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.nft.nft_revoke(token_id, account_id)
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.nft.nft_revoke_all(token_id)
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.nft
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl Contract {
    /// Account currently holding the order's receipt.
    pub fn get_receipt_holder(&self, order_id: U64) -> Option<AccountId> {
        self.nft.owner_by_id.get(&order_id.0.to_string())
    }

    /// Holder only, one yoctoNEAR. Replaces the X25519 public key the data
    /// key will be sealed to, e.g. after receiving the receipt. Not while
    /// `Verifying` (that attempt is already sealed to the current key; the
    /// new key applies from the next delivery). Same length as the current
    /// key, so the order's storage does not change.
    #[payable]
    pub fn set_receipt_pubkey(&mut self, order_id: U64, buyer_pubkey: String) -> Order {
        assert_one_yocto();
        let mut order = self.orders.get(&order_id.0).expect("Order not found");
        require!(
            env::predecessor_account_id() == self.holder_of(order_id.0),
            "Only the receipt holder"
        );
        require!(
            matches!(order.status, OrderStatus::Open | OrderStatus::Delivered),
            "Key can change only while the order is Open or Delivered"
        );
        require!(
            buyer_pubkey.len() == order.buyer_pubkey.len(),
            "buyer_pubkey must have the same length as the current key"
        );
        order.buyer_pubkey = buyer_pubkey;
        self.orders.insert(&order.id.0, &order);
        order
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
