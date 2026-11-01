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

// ---------------------------------------------------------------- listings & orders

pub(crate) const WINDOW: u64 = 3_600 * T;

pub(crate) fn register_listing_as(c: &mut Contract, who: &AccountId, price: u128) -> U64 {
    testing_env!(ctx(who)
        .attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT))
        .build());
    c.register_listing(U128(price), "sha256:abc".to_string(), U64(WINDOW))
}

pub(crate) fn create_as(c: &mut Contract, caller: &AccountId, listing: U64) -> Order {
    testing_env!(ctx(caller).build());
    c.create_order(owner(), listing, "ed25519:buyerpub".to_string())
}

/// Mandate with 200 tUSDC budget (above max_total, so limits are tested in isolation)
/// and a 5 tUSDC listing from the allowed seller.
pub(crate) fn ready() -> (Contract, U64) {
    let mut c = setup();
    set_default_mandate(&mut c, STORAGE_DEPOSIT);
    deposit_budget(&mut c, &owner(), 200 * USDC);
    let l = register_listing_as(&mut c, &seller(), 5 * USDC);
    (c, l)
}

#[test]
fn register_listing_stores_and_refunds_excess() {
    let mut c = setup();
    let id = register_listing_as(&mut c, &seller(), 5 * USDC);
    let l = c.get_listing(id).unwrap();
    assert_eq!(l.seller, seller());
    assert_eq!(l.price.0, 5 * USDC);
    assert_eq!(l.delivery_window.0, WINDOW);
    let receipts = near_sdk::test_utils::get_created_receipts();
    assert_eq!(receipts.len(), 1, "excess deposit is refunded");
    assert_eq!(receipts[0].receiver_id, seller());
}

#[test]
#[should_panic(expected = "Insufficient storage deposit")]
fn register_listing_requires_storage_payment() {
    let mut c = setup();
    testing_env!(ctx(&seller()).build());
    c.register_listing(U128(1), "h".to_string(), U64(WINDOW));
}

#[test]
#[should_panic(expected = "price must be positive")]
fn register_listing_rejects_zero_price() {
    let mut c = setup();
    register_listing_as(&mut c, &seller(), 0);
}

#[test]
#[should_panic(expected = "delivery_window out of range")]
fn register_listing_rejects_long_window() {
    let mut c = setup();
    testing_env!(ctx(&seller())
        .attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT))
        .build());
    c.register_listing(U128(1), "h".to_string(), U64(MAX_DELIVERY_WINDOW_NS + 1));
}

#[test]
fn create_order_escrows_funds_and_charges_storage() {
    let (mut c, l) = ready();
    let deposit_before = c.get_mandate(owner()).unwrap().storage_deposit.0;
    let o = create_as(&mut c, &agent(), l);
    assert_eq!(o.id.0, 0);
    assert_eq!(o.buyer, owner());
    assert_eq!(o.agent, agent());
    assert_eq!(o.seller, seller());
    assert_eq!(o.amount.0, 5 * USDC);
    assert_eq!(o.deadline.0, START + WINDOW);
    assert_eq!(o.status, OrderStatus::Open);
    assert_eq!(c.get_order(U64(0)), Some(o));

    let m = c.get_mandate(owner()).unwrap();
    assert_eq!(m.balance.0, 195 * USDC);
    assert_eq!(m.spent.0, 5 * USDC);
    assert_eq!(m.open_orders, 1);
    assert!(
        m.storage_deposit.0 < deposit_before,
        "order storage is charged"
    );
}

#[test]
#[should_panic(expected = "Price exceeds max_per_order")]
fn create_order_rejects_per_order_limit() {
    let (mut c, _) = ready();
    let big = register_listing_as(&mut c, &seller(), 11 * USDC);
    create_as(&mut c, &agent(), big);
}

#[test]
#[should_panic(expected = "Order would exceed max_total")]
fn create_order_rejects_total_limit() {
    let (mut c, _) = ready();
    let ten = register_listing_as(&mut c, &seller(), 10 * USDC);
    for _ in 0..10 {
        create_as(&mut c, &agent(), ten); // 100 tUSDC = max_total
    }
    create_as(&mut c, &agent(), ten);
}

#[test]
#[should_panic(expected = "Seller not allowed by mandate")]
fn create_order_rejects_unauthorized_seller() {
    let (mut c, _) = ready();
    let rogue = register_listing_as(&mut c, &acc("attacker.testnet"), 5 * USDC);
    create_as(&mut c, &agent(), rogue);
}

#[test]
#[should_panic(expected = "Insufficient mandate balance")]
fn create_order_rejects_insufficient_balance() {
    let mut c = setup();
    set_default_mandate(&mut c, STORAGE_DEPOSIT);
    deposit_budget(&mut c, &owner(), 4 * USDC);
    let l = register_listing_as(&mut c, &seller(), 5 * USDC);
    create_as(&mut c, &agent(), l);
}

#[test]
#[should_panic(expected = "Caller is not the mandate's agent")]
fn create_order_rejects_other_caller() {
    let (mut c, l) = ready();
    create_as(&mut c, &acc("mallory.testnet"), l);
}

#[test]
#[should_panic(expected = "Caller is not the mandate's agent")]
fn create_order_rejects_owner_as_caller() {
    let (mut c, l) = ready();
    create_as(&mut c, &owner(), l);
}

#[test]
#[should_panic(expected = "Mandate expired")]
fn create_order_rejects_expired_mandate() {
    let (mut c, l) = ready();
    testing_env!(ctx(&agent()).block_timestamp(START + 86_400 * T).build());
    c.create_order(owner(), l, "pk".to_string());
}

#[test]
#[should_panic(expected = "Mandate is revoked")]
fn create_order_rejects_revoked_mandate() {
    let (mut c, l) = ready();
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    c.revoke_mandate();
    create_as(&mut c, &agent(), l);
}

#[test]
#[should_panic(expected = "Listing not found")]
fn create_order_rejects_unknown_listing() {
    let (mut c, _) = ready();
    create_as(&mut c, &agent(), U64(99));
}

#[test]
#[should_panic(expected = "Insufficient storage deposit")]
fn create_order_rejects_when_storage_deposit_is_exhausted() {
    let (mut c, l) = ready();
    let mut m = c.mandates.get(&owner()).unwrap();
    m.storage_deposit = U128(0);
    c.mandates.insert(&owner(), &m);
    create_as(&mut c, &agent(), l);
}

#[test]
#[should_panic(expected = "Too many open orders")]
fn create_order_rejects_above_open_order_cap() {
    let mut c = setup();
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT))
        .build());
    c.set_mandate(
        agent(),
        U128(100 * USDC),
        U128(10 * USDC),
        vec![seller()],
        U64(START + 86_400 * T),
        Some(3),
    );
    deposit_budget(&mut c, &owner(), 100 * USDC);
    let l = register_listing_as(&mut c, &seller(), 1 * USDC);
    for _ in 0..3 {
        create_as(&mut c, &agent(), l);
    }
    create_as(&mut c, &agent(), l);
}

#[test]
fn default_open_order_cap_is_fifty() {
    let mut c = setup();
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(NEAR))
        .build());
    c.set_mandate(
        agent(),
        U128(1_000 * USDC),
        U128(10 * USDC),
        vec![seller()],
        U64(START + 86_400 * T),
        None,
    );
    deposit_budget(&mut c, &owner(), 1_000 * USDC);
    let l = register_listing_as(&mut c, &seller(), 1 * USDC);
    for _ in 0..DEFAULT_MAX_OPEN_ORDERS {
        create_as(&mut c, &agent(), l);
    }
    assert_eq!(c.get_mandate(owner()).unwrap().open_orders, 50);
    testing_env!(ctx(&agent()).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.create_order(owner(), l, "pk".to_string())
    }));
    let err = r.expect_err("51st open order must be rejected");
    let msg = err
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default();
    assert!(msg.contains("Too many open orders"), "unexpected panic: {msg}");
}
