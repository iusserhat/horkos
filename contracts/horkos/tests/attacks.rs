//! Attack scenarios (test code only). Each one must be refused by the
//! contract, and the money must stay where it was. The same file runs for v1
//! (contracts/horkos/tests/attacks.rs); scenarios about receipt transfers
//! check v1's blanket refusal instead.

#[path = "common/mod.rs"]
mod common;
use common::*;

use h::OrderStatus;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_sdk::json_types::{U128, U64};
use near_sdk::PromiseResult;

/// Runs `f` and returns its panic message; fails the test if it did not panic.
fn refused(f: impl FnOnce()) -> String {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
    std::panic::set_hook(prev);
    let e = r.expect_err("the contract accepted the attack");
    e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default()
}

fn ordered() -> (h::Contract, U64) {
    let (mut c, l) = setup(50);
    call(&agent(), 0, START);
    let o = c.create_order(owner(), l, "pk-buyer".to_string(), None);
    (c, o.id)
}

#[test]
fn transferring_someone_elses_receipt_is_refused() {
    let (mut c, id) = ordered();
    call(&bob(), 1, START);
    let msg = refused(|| c.nft_transfer(bob(), id.0.to_string(), None, None));
    assert!(msg.contains(if V2 { "Sender not approved" } else { "non-transferable" }), "{msg}");
    assert_eq!(holder(&c, &id), owner());
}

#[test]
fn double_settlement_pays_once() {
    let (mut c, id) = ordered();
    call(&seller(), FEE, START + 1);
    let _ = c.submit_delivery(id, "https://data.test/x".to_string(), "sealed".to_string());
    let ok = || PromiseResult::Successful(format!(r#"{{"order_id":"{}","attempt":1,"valid":true,"buyer_sealed_key":"k","data_sha256":null}}"#, id.0).into_bytes());
    callback_env(START + 2, ok());
    assert!(c.on_verified(id, 1, U128(FEE)));
    callback_env(START + 3, ok());
    assert!(!c.on_verified(id, 1, U128(FEE)), "a replayed result must not settle again");
    assert_eq!(c.balance_of(seller()).0, 5 * USDC, "seller paid exactly once");
    assert_eq!(c.get_order(id).unwrap().status, OrderStatus::Settled);
}

#[test]
fn order_outside_the_mandate_is_refused() {
    let (mut c, _) = setup(50);
    call(&acc("evil-seller.testnet"), NEAR, START);
    let evil = c.register_listing(U128(5 * USDC), "sha256:abc".to_string(), U64(WINDOW));
    call(&agent(), 0, START);
    let msg = refused(|| {
        c.create_order(owner(), evil, "pk".to_string(), None);
    });
    assert!(msg.contains("Seller not allowed by mandate"), "{msg}");
    assert_eq!(c.get_mandate(owner()).unwrap().balance.0, 50 * USDC);
}

#[test]
fn prompt_injected_large_order_is_refused() {
    let (mut c, _) = setup(50);
    call(&seller(), NEAR, START);
    let premium = c.register_listing(U128(500 * USDC), "sha256:abc".to_string(), U64(WINDOW));
    call(&agent(), 0, START);
    let msg = refused(|| {
        c.create_order(owner(), premium, "pk".to_string(), None);
    });
    assert!(msg.contains("Price exceeds max_per_order"), "{msg}");
    assert_eq!(c.get_mandate(owner()).unwrap().spent.0, 0);
}

#[test]
fn delivery_after_the_deadline_is_refused() {
    let (mut c, id) = ordered();
    let deadline = c.get_order(id).unwrap().deadline.0;
    call(&seller(), FEE, deadline);
    let msg = refused(|| {
        let _ = c.submit_delivery(id, "https://data.test/x".to_string(), "sealed".to_string());
    });
    assert!(msg.contains("Delivery deadline has passed"), "{msg}");
}

#[test]
fn agent_key_cannot_withdraw_the_budget() {
    let (mut c, _) = ordered();
    // A function-call key cannot attach a deposit; withdraw needs exactly 1 yoctoNEAR.
    call(&agent(), 0, START);
    let msg = refused(|| {
        let _ = c.withdraw(h::WithdrawSource::Budget, None);
    });
    assert!(msg.contains("Requires attached deposit of exactly 1 yoctoNEAR"), "{msg}");
    // Even with a deposit, the budget belongs to the owner, not the agent.
    call(&agent(), 1, START);
    let msg = refused(|| {
        let _ = c.withdraw(h::WithdrawSource::Budget, None);
    });
    assert!(msg.contains("Nothing to withdraw") || msg.contains("No mandate"), "{msg}");
    assert_eq!(c.get_mandate(owner()).unwrap().balance.0, 45 * USDC);
}

/// A forged or replayed verifier result: for another attempt, or for another
/// order. (That only the contract's own OutLayer call can reach `on_verified`
/// is enforced by `#[private]` in the wasm entry point; a direct Rust call in
/// a unit test skips that guard, so it is tested on a real node:
/// integration-tests `callbacks_are_private`.)
#[test]
fn forged_verifier_result_does_not_settle() {
    let (mut c, id) = ordered();
    call(&seller(), FEE, START + 1);
    let _ = c.submit_delivery(id, "https://data.test/x".to_string(), "sealed".to_string());
    for (order_id, attempt) in [(id.0, 7u32), (id.0 + 99, 1u32)] {
        let forged = format!(r#"{{"order_id":"{order_id}","attempt":{attempt},"valid":true,"buyer_sealed_key":"k","data_sha256":null}}"#);
        callback_env(START + 2, PromiseResult::Successful(forged.into_bytes()));
        assert!(!c.on_verified(id, 1, U128(FEE)), "forged result for order {order_id} attempt {attempt} settled");
    }
    assert_ne!(c.get_order(id).unwrap().status, OrderStatus::Settled);
    assert_eq!(c.balance_of(seller()).0, 0);
}

#[test]
fn finished_receipt_cannot_be_transferred() {
    let (mut c, id) = ordered();
    let deadline = c.get_order(id).unwrap().deadline.0;
    call(&acc("anyone.testnet"), 0, deadline);
    c.refund_expired(id);
    call(&owner(), 1, deadline + 1);
    let msg = refused(|| c.nft_transfer(bob(), id.0.to_string(), None, None));
    assert!(msg.contains(if V2 { "Receipt is final" } else { "non-transferable" }), "{msg}");
}
