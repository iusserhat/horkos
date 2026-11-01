use super::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, NearToken, PromiseOrValue};

pub(crate) const T: u64 = 1_000_000_000; // 1 second in ns
pub(crate) const START: u64 = 1_000_000 * T;

pub(crate) fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}
pub(crate) fn horkos() -> AccountId {
    acc("horkos.testnet")
}
pub(crate) fn token() -> AccountId {
    acc("tusdc.testnet")
}

pub(crate) fn ctx(predecessor: &AccountId) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(horkos())
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor.clone())
        .block_timestamp(START);
    b
}

pub(crate) fn setup() -> Contract {
    testing_env!(ctx(&acc("deployer.testnet")).build());
    Contract::new(token())
}

#[test]
fn new_stores_token_and_starts_empty() {
    let c = setup();
    assert_eq!(c.get_token(), token());
    assert_eq!(c.get_mandate(acc("alice.testnet")), None);
    assert_eq!(c.get_listing(U64(0)), None);
    assert_eq!(c.get_order(U64(0)), None);
    assert_eq!(c.balance_of(acc("seller.testnet")).0, 0);
    assert!(c.storage_byte_cost().0 > 0);
}

#[test]
fn final_statuses() {
    assert!(!OrderStatus::Open.is_final());
    assert!(!OrderStatus::Delivered.is_final());
    assert!(OrderStatus::Settled.is_final());
    assert!(OrderStatus::Refunded.is_final());
    assert!(OrderStatus::Cancelled.is_final());
}

// ---------------------------------------------------------------- mandates

pub(crate) const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub(crate) const STORAGE_DEPOSIT: u128 = NEAR / 10;
pub(crate) const USDC: u128 = 1_000_000; // 6 decimals

pub(crate) fn owner() -> AccountId {
    acc("alice.testnet")
}
pub(crate) fn agent() -> AccountId {
    acc("agent.alice.testnet")
}
pub(crate) fn seller() -> AccountId {
    acc("seller.testnet")
}

/// Sets alice's mandate: 100 tUSDC total, 10 per order, one seller, 1 day.
pub(crate) fn set_default_mandate(c: &mut Contract, deposit: u128) -> Mandate {
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
    c.set_mandate(
        agent(),
        U128(100 * USDC),
        U128(10 * USDC),
        vec![seller()],
        U64(START + 86_400 * T),
        None,
    )
}

pub(crate) fn deposit_budget(c: &mut Contract, from: &AccountId, amount: u128) -> U128 {
    testing_env!(ctx(&token()).build());
    match c.ft_on_transfer(from.clone(), U128(amount), String::new()) {
        PromiseOrValue::Value(v) => v,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

#[test]
fn set_mandate_creates_with_defaults_and_charges_storage() {
    let mut c = setup();
    let m = set_default_mandate(&mut c, STORAGE_DEPOSIT);
    assert_eq!(m.owner, owner());
    assert_eq!(m.agent, agent());
    assert!(m.active);
    assert_eq!(m.balance.0, 0);
    assert_eq!(m.open_orders, 0);
    assert_eq!(m.max_open_orders, DEFAULT_MAX_OPEN_ORDERS);
    // Some of the deposit paid for the mandate record itself.
    assert!(m.storage_deposit.0 < STORAGE_DEPOSIT);
    assert!(m.storage_deposit.0 > 0);
    assert_eq!(c.get_mandate(owner()), Some(m));
}

#[test]
#[should_panic(expected = "Requires attached deposit of at least 1 yoctoNEAR")]
fn set_mandate_requires_deposit() {
    let mut c = setup();
    set_default_mandate(&mut c, 0);
}

#[test]
#[should_panic(expected = "Insufficient storage deposit")]
fn set_mandate_rejects_deposit_too_small_for_record() {
    let mut c = setup();
    set_default_mandate(&mut c, 1);
}

fn try_set(
    max_total: u128,
    max_per_order: u128,
    sellers: Vec<AccountId>,
    expires_at: u64,
    max_open: Option<u32>,
    agent_id: AccountId,
) {
    let mut c = setup();
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT))
        .build());
    c.set_mandate(
        agent_id,
        U128(max_total),
        U128(max_per_order),
        sellers,
        U64(expires_at),
        max_open,
    );
}

#[test]
#[should_panic(expected = "max_per_order exceeds max_total")]
fn set_mandate_rejects_per_order_above_total() {
    try_set(10, 11, vec![seller()], START + T, None, agent());
}

#[test]
#[should_panic(expected = "max_per_order must be positive")]
fn set_mandate_rejects_zero_per_order() {
    try_set(10, 0, vec![seller()], START + T, None, agent());
}

#[test]
#[should_panic(expected = "allowed_sellers is empty")]
fn set_mandate_rejects_empty_sellers() {
    try_set(10, 1, vec![], START + T, None, agent());
}

#[test]
#[should_panic(expected = "expires_at is in the past")]
fn set_mandate_rejects_past_expiry() {
    try_set(10, 1, vec![seller()], START, None, agent());
}

#[test]
#[should_panic(expected = "Agent must be a separate account")]
fn set_mandate_rejects_owner_as_agent() {
    try_set(10, 1, vec![seller()], START + T, None, owner());
}

#[test]
#[should_panic(expected = "max_open_orders out of range")]
fn set_mandate_rejects_zero_open_order_cap() {
    try_set(10, 1, vec![seller()], START + T, Some(0), agent());
}

#[test]
#[should_panic(expected = "max_open_orders out of range")]
fn set_mandate_rejects_open_order_cap_above_limit() {
    try_set(
        10,
        1,
        vec![seller()],
        START + T,
        Some(MAX_OPEN_ORDERS_LIMIT + 1),
        agent(),
    );
}

#[test]
fn set_mandate_update_keeps_balance_and_adds_deposit() {
    let mut c = setup();
    let first = set_default_mandate(&mut c, STORAGE_DEPOSIT);
    deposit_budget(&mut c, &owner(), 50 * USDC);
    let second = set_default_mandate(&mut c, STORAGE_DEPOSIT);
    assert_eq!(second.balance.0, 50 * USDC);
    // Same record size: the whole second deposit is added.
    assert_eq!(
        second.storage_deposit.0,
        first.storage_deposit.0 + STORAGE_DEPOSIT
    );
}

#[test]
fn revoke_mandate_deactivates_and_refunds_unused_deposit() {
    let mut c = setup();
    let m = set_default_mandate(&mut c, STORAGE_DEPOSIT);
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    let refunded = c.revoke_mandate();
    assert_eq!(refunded, m.storage_deposit);
    let after = c.get_mandate(owner()).unwrap();
    assert!(!after.active);
    assert_eq!(after.storage_deposit.0, 0);
    let receipts = near_sdk::test_utils::get_created_receipts();
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].receiver_id, owner());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn revoke_mandate_requires_one_yocto() {
    let mut c = setup();
    set_default_mandate(&mut c, STORAGE_DEPOSIT);
    testing_env!(ctx(&owner()).build());
    c.revoke_mandate();
}

#[test]
#[should_panic(expected = "No mandate")]
fn revoke_mandate_without_mandate_panics() {
    let mut c = setup();
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    c.revoke_mandate();
}

#[test]
fn ft_on_transfer_credits_existing_mandate() {
    let mut c = setup();
    set_default_mandate(&mut c, STORAGE_DEPOSIT);
    assert_eq!(deposit_budget(&mut c, &owner(), 30 * USDC).0, 0);
    assert_eq!(deposit_budget(&mut c, &owner(), 20 * USDC).0, 0);
    assert_eq!(c.get_mandate(owner()).unwrap().balance.0, 50 * USDC);
}

#[test]
fn ft_on_transfer_returns_tokens_without_mandate() {
    let mut c = setup();
    let before = env::storage_usage();
    assert_eq!(deposit_budget(&mut c, &owner(), 30 * USDC).0, 30 * USDC);
    assert_eq!(c.get_mandate(owner()), None);
    assert_eq!(env::storage_usage(), before);
}

#[test]
#[should_panic(expected = "Only the configured token is accepted")]
fn ft_on_transfer_rejects_other_tokens() {
    let mut c = setup();
    set_default_mandate(&mut c, STORAGE_DEPOSIT);
    testing_env!(ctx(&acc("fake-usdc.testnet")).build());
    let _ = c.ft_on_transfer(owner(), U128(1), String::new());
}
