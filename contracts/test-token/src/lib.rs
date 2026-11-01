//! Testnet-only NEP-141 token ("tUSDC", 6 decimals) used by Horkos demos.
//!
//! Based on the `near-sdk-rs` fungible-token example (v5.30.0). Adds an
//! owner-only `mint` so demo accounts can be funded. Not for mainnet use.

use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::{
    env, log, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    FungibleToken,
    Metadata,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    owner_id: AccountId,
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
}

#[near]
impl Contract {
    /// Creates the token and mints `total_supply` to `owner_id`.
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Horkos Test USDC".to_string(),
            symbol: "tUSDC".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        };
        metadata.assert_valid();
        let mut this = Self {
            owner_id: owner_id.clone(),
            token: FungibleToken::new(StorageKey::FungibleToken),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
        };
        this.token.internal_register_account(&owner_id);
        this.mint_internal(&owner_id, total_supply.0);
        this
    }

    /// Owner-only: mints `amount` to an already registered account.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can mint"
        );
        self.mint_internal(&account_id, amount.0);
    }

    fn mint_internal(&mut self, account_id: &AccountId, amount: u128) {
        self.token.internal_deposit(account_id, amount);
        FtMint {
            owner_id: account_id,
            amount: U128(amount),
            memo: Some("test token mint"),
        }
        .emit();
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used_amount, burned_amount) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned_amount > 0 {
            log!("Account @{} burned {}", sender_id, burned_amount);
        }
        used_amount.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const SUPPLY: u128 = 1_000_000_000_000; // 1M tUSDC

    fn ctx(predecessor: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(0))
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor);
        b
    }

    fn setup() -> Contract {
        testing_env!(ctx(accounts(1)).build());
        Contract::new(accounts(1), U128(SUPPLY))
    }

    #[test]
    fn new_mints_supply_to_owner_with_metadata() {
        let c = setup();
        assert_eq!(c.ft_total_supply().0, SUPPLY);
        assert_eq!(c.ft_balance_of(accounts(1)).0, SUPPLY);
        let m = c.ft_metadata();
        assert_eq!(m.symbol, "tUSDC");
        assert_eq!(m.decimals, 6);
    }

    #[test]
    fn owner_can_mint_to_registered_account() {
        let mut c = setup();
        c.token.internal_register_account(&accounts(2));
        c.mint(accounts(2), U128(5_000_000));
        assert_eq!(c.ft_balance_of(accounts(2)).0, 5_000_000);
        assert_eq!(c.ft_total_supply().0, SUPPLY + 5_000_000);
    }

    #[test]
    #[should_panic(expected = "Only the owner can mint")]
    fn non_owner_cannot_mint() {
        let mut c = setup();
        testing_env!(ctx(accounts(2)).build());
        c.mint(accounts(2), U128(1));
    }

    #[test]
    fn transfer_moves_balance() {
        let mut c = setup();
        c.token.internal_register_account(&accounts(2));
        testing_env!(ctx(accounts(1))
            .attached_deposit(NearToken::from_yoctonear(1))
            .build());
        c.ft_transfer(accounts(2), U128(1_000), None);
        assert_eq!(c.ft_balance_of(accounts(2)).0, 1_000);
        assert_eq!(c.ft_balance_of(accounts(1)).0, SUPPLY - 1_000);
    }
}
