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
pub(crate) fn admin() -> AccountId {
    acc("admin.testnet")
}

pub(crate) fn ctx(predecessor: &AccountId) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(horkos())
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor.clone())
        .block_timestamp(START);
    b
}

pub(crate) fn panic_msg(err: Box<dyn std::any::Any + Send>) -> String {
    err.downcast_ref::<String>()
        .cloned()
        .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default()
}

pub(crate) fn setup() -> Contract {
    testing_env!(ctx(&acc("deployer.testnet")).build());
    Contract::new(token(), admin())
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
pub(crate) const STORAGE_DEPOSIT: u128 = NEAR;
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
    // Measure after testing_env!, which resets the storage counter.
    testing_env!(ctx(&token()).build());
    let before = env::storage_usage();
    let returned = match c.ft_on_transfer(owner(), U128(30 * USDC), String::new()) {
        PromiseOrValue::Value(v) => v,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    };
    assert_eq!(returned.0, 30 * USDC);
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
    c.create_order(owner(), listing, "ed25519:buyerpub".to_string(), None)
}

/// Mandate with 200 tUSDC budget (above max_total, so limits are tested in isolation)
/// and a 5 tUSDC listing from the allowed seller.
pub(crate) fn ready() -> (Contract, U64) {
    let mut c = setup();
    publish_verifier(&mut c, verifier_config());
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
    c.create_order(owner(), l, "pk".to_string(), None);
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
    publish_verifier(&mut c, verifier_config());
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
    publish_verifier(&mut c, verifier_config());
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(2 * NEAR))
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
        c.create_order(owner(), l, "pk".to_string(), None)
    }));
    let err = r.expect_err("51st open order must be rejected");
    let msg = panic_msg(err);
    assert!(
        msg.contains("Too many open orders"),
        "unexpected panic: {msg}"
    );
}

// ---------------------------------------------------------------- cancel & refund

pub(crate) fn set_status(c: &mut Contract, id: u64, status: OrderStatus) {
    let mut o = c.orders.get(&id).unwrap();
    o.status = status;
    c.orders.insert(&id, &o);
}

fn assert_released(c: &Contract) {
    let m = c.get_mandate(owner()).unwrap();
    assert_eq!(m.balance.0, 200 * USDC);
    assert_eq!(m.spent.0, 0);
    assert_eq!(m.open_orders, 0);
}

#[test]
fn agent_cancels_open_order_and_budget_returns() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&agent()).build());
    let o = c.cancel_order(o.id);
    assert_eq!(o.status, OrderStatus::Cancelled);
    assert_released(&c);
}

#[test]
fn owner_can_cancel_open_order() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&owner()).build());
    assert_eq!(c.cancel_order(o.id).status, OrderStatus::Cancelled);
}

#[test]
#[should_panic(expected = "Only the agent or owner can cancel")]
fn stranger_cannot_cancel() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&seller()).build());
    c.cancel_order(o.id);
}

#[test]
#[should_panic(expected = "Only Open orders can be cancelled")]
fn cancel_rejected_after_delivery() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    set_status(&mut c, o.id.0, OrderStatus::Delivered);
    testing_env!(ctx(&agent()).build());
    c.cancel_order(o.id);
}

#[test]
#[should_panic(expected = "Only Open orders can be cancelled")]
fn double_cancel_rejected() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&agent()).build());
    c.cancel_order(o.id);
    c.cancel_order(o.id);
}

#[test]
#[should_panic(expected = "Order not expired yet")]
fn refund_rejected_before_deadline() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW - 1)
        .build());
    c.refund_expired(o.id);
}

#[test]
fn anyone_refunds_expired_open_order() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    assert_eq!(c.refund_expired(o.id).status, OrderStatus::Refunded);
    assert_released(&c);
}

#[test]
fn expired_delivered_order_is_refunded() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    set_status(&mut c, o.id.0, OrderStatus::Delivered);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    assert_eq!(c.refund_expired(o.id).status, OrderStatus::Refunded);
    assert_released(&c);
}

#[test]
#[should_panic(expected = "Order already finalized")]
fn double_refund_rejected() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    c.refund_expired(o.id);
    c.refund_expired(o.id);
}

#[test]
#[should_panic(expected = "Order already finalized")]
fn refund_rejected_for_cancelled_order() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&agent()).block_timestamp(START + WINDOW).build());
    c.cancel_order(o.id);
    c.refund_expired(o.id);
}

#[test]
#[should_panic(expected = "Order already finalized")]
fn refund_rejected_for_settled_order() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    set_status(&mut c, o.id.0, OrderStatus::Settled);
    testing_env!(ctx(&agent()).block_timestamp(START + WINDOW).build());
    c.refund_expired(o.id);
}

/// The attack the storage deposit exists for: cancel reopens the token limit,
/// so create/cancel cycles are not bounded by max_total. They must be bounded
/// by the owner's storage deposit instead.
#[test]
fn create_cancel_loop_is_bounded_by_storage_deposit() {
    let (mut c, l) = ready();
    // The owner's first receipt also creates their token set, so measure the
    // steady-state cost on the second order.
    let first = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&agent()).build());
    c.cancel_order(first.id);
    let before = c.get_mandate(owner()).unwrap().storage_deposit.0;
    let second = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&agent()).build());
    c.cancel_order(second.id);
    // Net cost of one create+cancel cycle: the unused delivery reserve comes
    // back on cancel, the order record and receipt do not.
    let per_order = before - c.get_mandate(owner()).unwrap().storage_deposit.0;
    assert!(per_order > 0);

    // Budget the deposit for ~25 more orders. 25 x 5 tUSDC = 125 > max_total
    // (100), so getting past 20 cycles proves cancel reopened the limit; the
    // loop must then stop on the storage deposit, not on any token limit.
    // (Per-order cost is not exactly constant: token ids grow in length and
    // the owner index is a balanced tree.)
    let mut m = c.mandates.get(&owner()).unwrap();
    m.storage_deposit = U128(per_order * 25);
    c.mandates.insert(&owner(), &m);
    let mut cycles = 0;
    let msg = loop {
        testing_env!(ctx(&agent()).build());
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.create_order(owner(), l, "pk".to_string(), None)
        }));
        match r {
            Ok(o) => {
                c.cancel_order(o.id);
                cycles += 1;
                assert!(cycles <= 30, "loop did not stop");
            }
            Err(e) => break panic_msg(e),
        }
    };
    assert!(
        msg.contains("Insufficient storage deposit"),
        "unexpected panic: {msg}"
    );
    assert!(
        cycles > 20,
        "limit should reopen on cancel; stopped after {cycles}"
    );
    assert!(cycles <= 25, "deposit should bound the loop; ran {cycles}");
    assert_eq!(c.get_mandate(owner()).unwrap().spent.0, 0);
}

// ---------------------------------------------------------------- withdraw

fn give_earnings(c: &mut Contract, who: &AccountId, amount: u128) {
    c.balances.insert(who, &amount);
}

fn withdraw_as(c: &mut Contract, who: &AccountId, from: WithdrawSource, amount: Option<u128>) {
    testing_env!(ctx(who)
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    let _ = c.withdraw(from, amount.map(U128));
}

fn callback(
    c: &mut Contract,
    who: &AccountId,
    from: WithdrawSource,
    amount: u128,
    ok: bool,
) -> bool {
    testing_env!(ctx(&horkos()).build());
    let result = if ok {
        Ok(())
    } else {
        Err(near_sdk::PromiseError::Failed)
    };
    c.on_withdraw(who.clone(), from, U128(amount), result)
}

#[test]
fn seller_withdraws_earnings_via_ft_transfer() {
    let mut c = setup();
    give_earnings(&mut c, &seller(), 7 * USDC);
    withdraw_as(&mut c, &seller(), WithdrawSource::Earnings, None);
    assert_eq!(c.balance_of(seller()).0, 0);
    let receipts = near_sdk::test_utils::get_created_receipts();
    assert!(
        receipts.iter().any(|r| r.receiver_id == token()),
        "ft_transfer sent to token"
    );
    assert!(callback(
        &mut c,
        &seller(),
        WithdrawSource::Earnings,
        7 * USDC,
        true
    ));
    assert_eq!(c.balance_of(seller()).0, 0);
}

#[test]
fn partial_withdraw_leaves_rest() {
    let mut c = setup();
    give_earnings(&mut c, &seller(), 7 * USDC);
    withdraw_as(&mut c, &seller(), WithdrawSource::Earnings, Some(2 * USDC));
    assert_eq!(c.balance_of(seller()).0, 5 * USDC);
}

#[test]
fn failed_transfer_to_unregistered_seller_restores_balance() {
    // The token rejects ft_transfer to an account without storage
    // registration; the callback sees a failed promise and credits back.
    let mut c = setup();
    let unregistered = acc("new-seller.testnet");
    give_earnings(&mut c, &unregistered, 7 * USDC);
    withdraw_as(&mut c, &unregistered, WithdrawSource::Earnings, None);
    assert_eq!(c.balance_of(unregistered.clone()).0, 0);
    assert!(!callback(
        &mut c,
        &unregistered,
        WithdrawSource::Earnings,
        7 * USDC,
        false
    ));
    assert_eq!(c.balance_of(unregistered).0, 7 * USDC);
}

#[test]
fn owner_withdraws_budget_and_failure_restores_it() {
    let (mut c, _) = ready();
    withdraw_as(&mut c, &owner(), WithdrawSource::Budget, Some(50 * USDC));
    assert_eq!(c.get_mandate(owner()).unwrap().balance.0, 150 * USDC);
    assert!(!callback(
        &mut c,
        &owner(),
        WithdrawSource::Budget,
        50 * USDC,
        false
    ));
    assert_eq!(c.get_mandate(owner()).unwrap().balance.0, 200 * USDC);
}

#[test]
fn escrowed_funds_are_not_withdrawable_as_budget() {
    let (mut c, l) = ready();
    create_as(&mut c, &agent(), l); // 5 tUSDC escrowed
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.withdraw(WithdrawSource::Budget, Some(U128(200 * USDC)));
    }));
    assert!(panic_msg(r.unwrap_err()).contains("Amount exceeds available balance"));
}

#[test]
#[should_panic(expected = "No mandate")]
fn agent_cannot_withdraw_owner_budget() {
    let (mut c, _) = ready();
    withdraw_as(&mut c, &agent(), WithdrawSource::Budget, None);
}

#[test]
#[should_panic(expected = "Amount exceeds available balance")]
fn withdraw_more_than_balance_rejected() {
    let mut c = setup();
    give_earnings(&mut c, &seller(), 7 * USDC);
    withdraw_as(&mut c, &seller(), WithdrawSource::Earnings, Some(8 * USDC));
}

#[test]
#[should_panic(expected = "Nothing to withdraw")]
fn withdraw_with_zero_balance_rejected() {
    let mut c = setup();
    withdraw_as(&mut c, &seller(), WithdrawSource::Earnings, None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_requires_one_yocto() {
    let mut c = setup();
    give_earnings(&mut c, &seller(), 7 * USDC);
    testing_env!(ctx(&seller()).build());
    let _ = c.withdraw(WithdrawSource::Earnings, None);
}

// `#[private]` on `on_withdraw` is enforced by the wasm export wrapper, not
// by the Rust method, so it is covered by integration tests (near-workspaces).

// ---------------------------------------------------------------- NFT receipts

use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::NonFungibleTokenMetadataProvider;

fn receipt_extra(c: &Contract, id: u64) -> near_sdk::serde_json::Value {
    let token = c.nft_token(id.to_string()).expect("receipt exists");
    let extra = token.metadata.unwrap().extra.unwrap();
    near_sdk::serde_json::from_str(&extra).unwrap()
}

#[test]
fn create_order_mints_receipt_owned_by_buyer() {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    let receipt = c.nft_token("0".to_string()).unwrap();
    assert_eq!(receipt.owner_id, owner());
    let meta = receipt.metadata.unwrap();
    assert_eq!(meta.title.as_deref(), Some("Horkos receipt #0"));
    assert_eq!(
        meta.expires_at,
        Some(((START + WINDOW) / 1_000_000).to_string())
    );
    let extra = receipt_extra(&c, 0);
    assert_eq!(extra["status"], "Open");
    assert_eq!(extra["amount"], (5 * USDC).to_string());
    assert_eq!(extra["seller"], seller().to_string());
    assert_eq!(extra["token"], token().to_string());
    assert_eq!(extra["deadline"], o.deadline.0.to_string());
    assert_eq!(c.nft_supply_for_owner(owner()).0, 1);
    assert_eq!(c.nft_total_supply().0, 1);
    assert_eq!(c.nft_tokens_for_owner(owner(), None, None).len(), 1);
}

#[test]
fn receipt_status_follows_cancel_and_refund() {
    let (mut c, l) = ready();
    let a = create_as(&mut c, &agent(), l);
    let b = create_as(&mut c, &agent(), l);
    testing_env!(ctx(&agent()).build());
    c.cancel_order(a.id);
    assert_eq!(receipt_extra(&c, 0)["status"], "Cancelled");
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("\"event\":\"order_status\"")));

    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    c.refund_expired(b.id);
    let meta = c.nft_token("1".to_string()).unwrap().metadata.unwrap();
    assert_eq!(receipt_extra(&c, 1)["status"], "Refunded");
    assert_eq!(
        meta.updated_at,
        Some(((START + WINDOW) / 1_000_000).to_string())
    );
}

#[test]
fn receipt_storage_growth_stays_within_what_was_charged() {
    let (mut c, l) = ready();
    create_as(&mut c, &agent(), l); // first receipt creates the owner's token set
    testing_env!(ctx(&agent()).build());
    let byte_cost = env::storage_byte_cost().as_yoctonear();
    let deposit_before = c.get_mandate(owner()).unwrap().storage_deposit.0;
    let usage_before = env::storage_usage();
    let o = c.create_order(owner(), l, "pk".to_string(), None);
    c.cancel_order(o.id); // "Open" -> "Cancelled": the longest status name
    let used = env::storage_usage() - usage_before;
    let charged = (deposit_before - c.get_mandate(owner()).unwrap().storage_deposit.0) / byte_cost;
    assert!(
        used <= charged as u64,
        "used {used} bytes, charged {charged}"
    );
}

#[test]
#[should_panic(expected = "Receipts are non-transferable in this version")]
fn nft_transfer_is_rejected() {
    let (mut c, l) = ready();
    create_as(&mut c, &agent(), l);
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    c.nft_transfer(acc("bob.testnet"), "0".to_string(), None, None);
}

#[test]
#[should_panic(expected = "Receipts are non-transferable in this version")]
fn nft_transfer_call_is_rejected() {
    let (mut c, l) = ready();
    create_as(&mut c, &agent(), l);
    testing_env!(ctx(&owner())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    let _ = c.nft_transfer_call(
        acc("bob.testnet"),
        "0".to_string(),
        None,
        None,
        String::new(),
    );
}

#[test]
fn nft_contract_metadata() {
    let c = setup();
    let m = c.nft_metadata();
    assert_eq!(m.spec, "nft-1.0.0");
    assert_eq!(m.symbol, "HORKOS");
    assert_eq!(c.nft_total_supply().0, 0);
}

// ---------------------------------------------------------------- delivery & verification

use near_sdk::test_utils::get_created_receipts;
use near_sdk::PromiseResult;

pub(crate) const FEE: u128 = NEAR / 100;
pub(crate) const HASH: &str = "17ad13a91e319c56f3662a77e17eee15b429ddb5ac4bb58be3ab501e363c38ab";

pub(crate) fn publish_verifier(c: &mut Contract, config: VerifierConfig) -> u32 {
    testing_env!(ctx(&admin())
        .attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT))
        .build());
    c.set_verifier(config)
}

fn verifier_config() -> VerifierConfig {
    VerifierConfig {
        outlayer: acc("outlayer.testnet"),
        wasm_url: format!("https://example.test/{HASH}.wasm"),
        wasm_hash: HASH.to_string(),
        build_target: "wasm32-wasip1".to_string(),
        secrets_profile: Some("verifier".to_string()),
        secrets_account: Some(acc("horkos.testnet")),
        min_fee: U128(FEE),
        max_fee: U128(10 * FEE),
    }
}

/// Mandate + listing + verifier + one Open order.
fn ordered() -> (Contract, Order) {
    let (mut c, l) = ready();
    let o = create_as(&mut c, &agent(), l);
    (c, o)
}

fn submit_at(c: &mut Contract, who: &AccountId, id: U64, fee: u128, ts: u64) {
    let usage = env::storage_usage();
    testing_env!(ctx(who)
        .attached_deposit(NearToken::from_yoctonear(fee))
        .block_timestamp(ts)
        .storage_usage(usage)
        .build());
    let _ = c.submit_delivery(
        id,
        "https://data.test/enc.bin".to_string(),
        "sealed-for-verifier".to_string(),
    );
}

fn submit(c: &mut Contract, id: U64) {
    submit_at(c, &seller(), id, FEE, START);
}

/// Simulates OutLayer resuming the callback with `result`.
fn callback_at(c: &mut Contract, id: U64, attempt: u32, result: PromiseResult, ts: u64) -> bool {
    let usage = env::storage_usage();
    testing_env!(
        ctx(&horkos())
            .block_timestamp(ts)
            .storage_usage(usage)
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result],
    );
    c.on_verified(id, attempt, U128(FEE))
}

fn output(id: U64, attempt: u32, valid: bool, key: Option<&str>) -> PromiseResult {
    let v = near_sdk::serde_json::json!({
        "order_id": id, "attempt": attempt, "valid": valid,
        "buyer_sealed_key": key, "data_sha256": "ab".repeat(32),
    });
    PromiseResult::Successful(v.to_string().into_bytes())
}

fn request_call(receipts: &[near_sdk::mock::Receipt]) -> (String, Vec<u8>, u128) {
    receipts
        .iter()
        .flat_map(|r| r.actions.iter())
        .find_map(|a| match a {
            near_sdk::mock::MockAction::FunctionCallWeight {
                method_name,
                args,
                attached_deposit,
                ..
            } if method_name == b"request_execution" => Some((
                String::from_utf8(method_name.clone()).unwrap(),
                args.clone(),
                attached_deposit.as_yoctonear(),
            )),
            _ => None,
        })
        .expect("request_execution call")
}

fn request_args(receipts: &[near_sdk::mock::Receipt]) -> near_sdk::serde_json::Value {
    near_sdk::serde_json::from_slice(&request_call(receipts).1).unwrap()
}

fn request_deposit(receipts: &[near_sdk::mock::Receipt]) -> u128 {
    request_call(receipts).2
}

fn transfers_to(receipts: &[near_sdk::mock::Receipt], who: &AccountId) -> u128 {
    receipts
        .iter()
        .filter(|r| &r.receiver_id == who)
        .flat_map(|r| r.actions.iter())
        .filter_map(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } => Some(deposit.as_yoctonear()),
            _ => None,
        })
        .sum()
}

fn status(c: &Contract, id: U64) -> OrderStatus {
    c.get_order(id).unwrap().status
}

// ---- set_verifier

fn other_verifier() -> VerifierConfig {
    VerifierConfig {
        outlayer: acc("evil-outlayer.testnet"),
        wasm_url: "https://evil.test/always-valid.wasm".to_string(),
        wasm_hash: "ff".repeat(32),
        ..verifier_config()
    }
}

#[test]
fn set_verifier_publishes_versions_and_charges_storage() {
    let mut c = setup();
    assert_eq!(c.get_verifier(), None);
    assert_eq!(publish_verifier(&mut c, verifier_config()), 0);
    assert!(
        get_created_receipts()
            .iter()
            .any(|r| r.receiver_id == admin()),
        "excess deposit refunded"
    );
    assert_eq!(publish_verifier(&mut c, other_verifier()), 1);
    let v = c.get_verifier().unwrap();
    assert_eq!(v.version, 1);
    assert_eq!(v.config, other_verifier());
    assert_eq!(
        c.get_verifier_version(0),
        Some(verifier_config()),
        "old versions are kept"
    );
}

#[test]
#[should_panic(expected = "Insufficient storage deposit")]
fn set_verifier_requires_storage_payment() {
    let mut c = setup();
    testing_env!(ctx(&admin())
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
    c.set_verifier(verifier_config());
}

#[test]
#[should_panic(expected = "Only the admin can set the verifier")]
fn non_admin_cannot_set_verifier() {
    let mut c = setup();
    testing_env!(ctx(&seller())
        .attached_deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT))
        .build());
    c.set_verifier(verifier_config());
}

#[test]
#[should_panic(expected = "wasm_hash must be 64 hex characters")]
fn set_verifier_rejects_bad_hash() {
    let mut c = setup();
    publish_verifier(
        &mut c,
        VerifierConfig {
            wasm_hash: "xyz".to_string(),
            ..verifier_config()
        },
    );
}

#[test]
#[should_panic(expected = "max_fee must be positive and at least min_fee")]
fn set_verifier_rejects_max_fee_below_min() {
    let mut c = setup();
    publish_verifier(
        &mut c,
        VerifierConfig {
            max_fee: U128(FEE - 1),
            ..verifier_config()
        },
    );
}

/// The attack this guards against: the admin swaps in a verifier that always
/// says "valid" (or another OutLayer account) to pay escrow to a colluding
/// seller. Open orders must keep the verifier they were created with.
#[test]
fn admin_changing_verifier_does_not_affect_existing_orders() {
    let (mut c, old) = ordered();
    assert_eq!(old.verifier_version, 0);
    publish_verifier(&mut c, other_verifier());

    submit(&mut c, old.id);
    let receipts = get_created_receipts();
    assert!(
        receipts
            .iter()
            .any(|r| r.receiver_id == acc("outlayer.testnet")),
        "old order still goes to the pinned OutLayer account"
    );
    assert!(!receipts
        .iter()
        .any(|r| r.receiver_id == acc("evil-outlayer.testnet")));
    assert_eq!(request_args(&receipts)["source"]["WasmUrl"]["hash"], HASH);

    // New orders get the new version.
    let new = create_as(&mut c, &agent(), old.listing_id);
    assert_eq!(new.verifier_version, 1);
}

#[test]
#[should_panic(expected = "Verifier changed: expected version 0, current 1")]
fn create_order_rejects_unexpected_verifier_version() {
    let (mut c, l) = ready();
    publish_verifier(&mut c, other_verifier());
    testing_env!(ctx(&agent()).build());
    c.create_order(owner(), l, "pk".to_string(), Some(0));
}

#[test]
fn create_order_accepts_expected_verifier_version() {
    let (mut c, l) = ready();
    testing_env!(ctx(&agent()).build());
    let o = c.create_order(owner(), l, "pk".to_string(), Some(0));
    assert_eq!(o.verifier_version, 0);
}

// ---- submit_delivery

#[test]
fn submit_delivery_requests_outlayer_and_moves_to_verifying() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    let order = c.get_order(o.id).unwrap();
    assert_eq!(order.status, OrderStatus::Verifying);
    assert_eq!(order.attempts, 1);
    assert_eq!(
        order.delivery_ref.as_deref(),
        Some("https://data.test/enc.bin")
    );
    assert_eq!(receipt_extra(&c, 0)["status"], "Verifying");

    let receipts = get_created_receipts();
    assert_eq!(request_call(&receipts).0, "request_execution");
    assert_eq!(request_deposit(&receipts), FEE);
    let args = request_args(&receipts);
    assert_eq!(args["source"]["WasmUrl"]["hash"], HASH);
    assert_eq!(args["payer_account_id"], seller().to_string());
    assert_eq!(args["secrets_ref"]["profile"], "verifier");
    let input: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(args["input_data"].as_str().unwrap()).unwrap();
    assert_eq!(
        input["buyer_pubkey"], "ed25519:buyerpub",
        "buyer key comes from the order"
    );
    assert_eq!(input["attempt"], 1);
    assert_eq!(input["condition_hash"], "sha256:abc");
    assert!(
        receipts.iter().any(|r| r.receiver_id == horkos()),
        "callback to self"
    );
}

#[test]
#[should_panic(expected = "Only the seller can deliver")]
fn only_seller_can_submit() {
    let (mut c, o) = ordered();
    submit_at(&mut c, &acc("mallory.testnet"), o.id, FEE, START);
}

#[test]
#[should_panic(expected = "Verifier not configured")]
fn create_order_requires_a_verifier() {
    let mut c = setup();
    set_default_mandate(&mut c, STORAGE_DEPOSIT);
    deposit_budget(&mut c, &owner(), 50 * USDC);
    let l = register_listing_as(&mut c, &seller(), 5 * USDC);
    create_as(&mut c, &agent(), l);
}

#[test]
#[should_panic(expected = "Attached deposit is above the verifier's max fee")]
fn submit_rejects_fee_above_max() {
    let (mut c, o) = ordered();
    submit_at(&mut c, &seller(), o.id, 10 * FEE + 1, START);
}

#[test]
#[should_panic(expected = "Attached deposit is below the verifier fee")]
fn submit_requires_fee() {
    let (mut c, o) = ordered();
    submit_at(&mut c, &seller(), o.id, FEE - 1, START);
}

#[test]
#[should_panic(expected = "Delivery deadline has passed")]
fn submit_rejected_after_deadline() {
    let (mut c, o) = ordered();
    submit_at(&mut c, &seller(), o.id, FEE, START + WINDOW);
}

#[test]
#[should_panic(expected = "A verification is already in progress")]
fn second_submit_while_verifying_is_rejected() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    submit(&mut c, o.id);
}

#[test]
#[should_panic(expected = "Order cannot accept a delivery")]
fn submit_rejected_for_cancelled_order() {
    let (mut c, o) = ordered();
    testing_env!(ctx(&agent()).build());
    c.cancel_order(o.id);
    submit(&mut c, o.id);
}

#[test]
#[should_panic(expected = "Only Open orders can be cancelled")]
fn cancel_rejected_while_verifying() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    testing_env!(ctx(&agent()).build());
    c.cancel_order(o.id);
}

// ---- on_verified

#[test]
fn valid_result_settles_into_seller_balance_and_releases_key() {
    let (mut c, o) = ordered();
    let before = c.get_mandate(owner()).unwrap();
    submit(&mut c, o.id);
    assert!(callback_at(
        &mut c,
        o.id,
        1,
        output(o.id, 1, true, Some("sealed-for-buyer")),
        START + 1
    ));
    let order = c.get_order(o.id).unwrap();
    assert_eq!(order.status, OrderStatus::Settled);
    assert_eq!(order.encrypted_key.as_deref(), Some("sealed-for-buyer"));
    assert_eq!(c.balance_of(seller()).0, 5 * USDC);
    let after = c.get_mandate(owner()).unwrap();
    assert_eq!(after.open_orders, before.open_orders - 1);
    assert_eq!(after.spent, before.spent, "settled money stays spent");
    assert_eq!(after.balance, before.balance);
    assert_eq!(receipt_extra(&c, 0)["status"], "Settled");
}

#[test]
fn invalid_result_returns_to_delivered_and_seller_can_retry() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    assert!(!callback_at(
        &mut c,
        o.id,
        1,
        output(o.id, 1, false, None),
        START + 1
    ));
    assert_eq!(status(&c, o.id), OrderStatus::Delivered);
    assert_eq!(
        c.get_order(o.id).unwrap().encrypted_key,
        None,
        "buyer gets nothing"
    );
    assert_eq!(c.balance_of(seller()).0, 0);

    submit_at(&mut c, &seller(), o.id, FEE, START + 2);
    assert_eq!(c.get_order(o.id).unwrap().attempts, 2);
    assert!(callback_at(
        &mut c,
        o.id,
        2,
        output(o.id, 2, true, Some("k")),
        START + 3
    ));
    assert_eq!(status(&c, o.id), OrderStatus::Settled);
}

/// Submits, feeds `result` to the callback, and checks nothing was settled.
fn assert_not_settled(result: PromiseResult) {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    assert!(!callback_at(&mut c, o.id, 1, result, START + 1));
    assert_eq!(status(&c, o.id), OrderStatus::Delivered);
    assert_eq!(c.get_order(o.id).unwrap().encrypted_key, None);
    assert_eq!(c.balance_of(seller()).0, 0);
}

#[test]
fn null_result_returns_to_delivered() {
    // OutLayer returns `null` when the run failed or produced nothing.
    assert_not_settled(PromiseResult::Successful(b"null".to_vec()));
}

#[test]
fn failed_promise_returns_to_delivered_and_forwards_fee_to_seller() {
    // Err means request_execution itself failed, so the runtime refunded the
    // attached fee to Horkos; Horkos must pass it on to the seller.
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    assert!(!callback_at(
        &mut c,
        o.id,
        1,
        PromiseResult::Failed,
        START + 1
    ));
    assert_eq!(status(&c, o.id), OrderStatus::Delivered);
    assert_eq!(transfers_to(&get_created_receipts(), &seller()), FEE);
}

#[test]
fn null_result_does_not_forward_fee() {
    // `null`: the run failed inside OutLayer, which refunds the seller itself.
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    callback_at(
        &mut c,
        o.id,
        1,
        PromiseResult::Successful(b"null".to_vec()),
        START + 1,
    );
    assert_eq!(transfers_to(&get_created_receipts(), &seller()), 0);
}

#[test]
fn failed_promise_after_refund_still_forwards_fee() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    c.refund_expired(o.id);
    callback_at(&mut c, o.id, 1, PromiseResult::Failed, START + WINDOW);
    assert_eq!(status(&c, o.id), OrderStatus::Refunded);
    assert_eq!(transfers_to(&get_created_receipts(), &seller()), FEE);
}

#[test]
fn garbage_output_returns_to_delivered() {
    assert_not_settled(PromiseResult::Successful(b"{not json".to_vec()));
}

#[test]
fn result_for_another_order_does_not_settle() {
    assert_not_settled(output(U64(99), 1, true, Some("k")));
}

#[test]
fn result_for_another_attempt_does_not_settle() {
    assert_not_settled(output(U64(0), 2, true, Some("k")));
}

#[test]
fn valid_result_without_buyer_key_does_not_settle() {
    assert_not_settled(output(U64(0), 1, true, None));
}

#[test]
fn valid_result_with_empty_buyer_key_does_not_settle() {
    assert_not_settled(output(U64(0), 1, true, Some("")));
}

#[test]
fn stale_attempt_callback_is_ignored() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    assert!(!callback_at(
        &mut c,
        o.id,
        7,
        output(o.id, 7, true, Some("k")),
        START + 1
    ));
    assert_eq!(status(&c, o.id), OrderStatus::Verifying);
}

#[test]
fn valid_result_after_deadline_does_not_settle_and_order_refunds() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    assert!(!callback_at(
        &mut c,
        o.id,
        1,
        output(o.id, 1, true, Some("k")),
        START + WINDOW
    ));
    assert_eq!(status(&c, o.id), OrderStatus::Delivered);
    assert_eq!(c.balance_of(seller()).0, 0);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    assert_eq!(c.refund_expired(o.id).status, OrderStatus::Refunded);
    assert_released(&c);
}

#[test]
fn refund_while_verifying_then_late_callback_is_ignored() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    assert_eq!(c.refund_expired(o.id).status, OrderStatus::Refunded);
    assert!(!callback_at(
        &mut c,
        o.id,
        1,
        output(o.id, 1, true, Some("k")),
        START + 1
    ));
    let order = c.get_order(o.id).unwrap();
    assert_eq!(order.status, OrderStatus::Refunded);
    assert_eq!(order.encrypted_key, None);
    assert_eq!(c.balance_of(seller()).0, 0);
    assert_released(&c);
}

#[test]
fn second_callback_after_settle_cannot_pay_twice() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    assert!(callback_at(
        &mut c,
        o.id,
        1,
        output(o.id, 1, true, Some("k")),
        START + 1
    ));
    assert!(!callback_at(
        &mut c,
        o.id,
        1,
        output(o.id, 1, true, Some("k")),
        START + 2
    ));
    assert_eq!(c.balance_of(seller()).0, 5 * USDC);
}

#[test]
#[should_panic(expected = "Order already finalized")]
fn settled_order_cannot_be_refunded() {
    let (mut c, o) = ordered();
    submit(&mut c, o.id);
    callback_at(&mut c, o.id, 1, output(o.id, 1, true, Some("k")), START + 1);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    c.refund_expired(o.id);
}

/// submit_delivery and settlement must not need storage beyond what
/// create_order charged, including the seller's first earnings entry and
/// maximum-length delivery_ref / encrypted_key.
#[test]
fn delivery_and_settlement_fit_in_the_reserve() {
    let (mut c, l) = ready();
    create_as(&mut c, &agent(), l); // owner's token set exists from here on

    testing_env!(ctx(&agent()).build());
    let byte_cost = env::storage_byte_cost().as_yoctonear();
    let deposit_before = c.get_mandate(owner()).unwrap().storage_deposit.0;
    let usage_before = env::storage_usage();
    let o = c.create_order(owner(), l, "pk".to_string(), None);
    let charged = (deposit_before - c.get_mandate(owner()).unwrap().storage_deposit.0) / byte_cost;

    let long = "x".repeat(MAX_STRING_LEN);
    let usage = env::storage_usage();
    testing_env!(ctx(&seller())
        .attached_deposit(NearToken::from_yoctonear(FEE))
        .storage_usage(usage)
        .build());
    let _ = c.submit_delivery(o.id, long.clone(), long.clone());
    assert!(callback_at(
        &mut c,
        o.id,
        1,
        output(o.id, 1, true, Some(&long)),
        START + 1
    ));
    let used = env::storage_usage() - usage_before;
    assert!(
        used <= charged as u64,
        "used {used} bytes, charged {charged}"
    );
}

// ---------------------------------------------------------------- unused reserve refund

fn reserve_yocto() -> u128 {
    u128::from(DELIVERY_RESERVED_BYTES) * env::storage_byte_cost().as_yoctonear()
}

fn deposit_of(c: &Contract) -> u128 {
    c.get_mandate(owner()).unwrap().storage_deposit.0
}

/// Ready + one order already made, so the owner's token set exists and the
/// next order's cost is the steady-state cost.
fn warmed() -> (Contract, U64) {
    let (mut c, l) = ready();
    create_as(&mut c, &agent(), l);
    (c, l)
}

#[test]
fn cancel_returns_unused_delivery_reserve() {
    let (mut c, l) = warmed();
    let before = deposit_of(&c);
    let o = create_as(&mut c, &agent(), l);
    let gross = before - deposit_of(&c);
    testing_env!(ctx(&agent()).build());
    c.cancel_order(o.id);
    assert_eq!(before - deposit_of(&c), gross - reserve_yocto());
}

#[test]
fn refund_without_delivery_returns_unused_reserve() {
    let (mut c, l) = warmed();
    let before = deposit_of(&c);
    let o = create_as(&mut c, &agent(), l);
    let gross = before - deposit_of(&c);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    c.refund_expired(o.id);
    assert_eq!(before - deposit_of(&c), gross - reserve_yocto());
}

#[test]
fn refund_after_a_delivery_keeps_the_reserve() {
    let (mut c, l) = warmed();
    let before = deposit_of(&c);
    let o = create_as(&mut c, &agent(), l);
    let gross = before - deposit_of(&c);
    submit(&mut c, o.id);
    callback_at(&mut c, o.id, 1, output(o.id, 1, false, None), START + 1);
    testing_env!(ctx(&acc("anyone.testnet"))
        .block_timestamp(START + WINDOW)
        .build());
    c.refund_expired(o.id);
    assert_eq!(before - deposit_of(&c), gross, "delivery data was stored");
}

#[test]
fn print_storage_cost_breakdown() {
    let (mut c, l) = warmed();
    let byte_cost = env::storage_byte_cost().as_yoctonear();
    let before = deposit_of(&c);
    let o = create_as(&mut c, &agent(), l);
    let gross = (before - deposit_of(&c)) / byte_cost;
    testing_env!(ctx(&agent()).build());
    c.cancel_order(o.id);
    let net = (before - deposit_of(&c)) / byte_cost;
    println!(
        "per order: charged {gross} B, reserve {} B, kept after cancel/undelivered refund {net} B; byte cost {byte_cost} yocto",
        DELIVERY_RESERVED_BYTES
    );
}
