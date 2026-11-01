use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

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
