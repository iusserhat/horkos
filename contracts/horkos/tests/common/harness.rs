// Test harness over the contract's public API in near-sdk's mocked
// blockchain. Included by common/mod.rs, which sets `h` (the crate) and `V2`.

use std::collections::HashMap;

use h::{Contract, Order, OrderStatus, VerifierConfig, WithdrawSource};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_sdk::json_types::{U128, U64};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{env, testing_env, AccountId, NearToken, PromiseError, PromiseOrValue, PromiseResult};

pub const T: u64 = 1_000_000_000;
pub const START: u64 = 1_000_000 * T;
pub const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const USDC: u128 = 1_000_000;
pub const FEE: u128 = NEAR / 100;
pub const WINDOW: u64 = 600 * T;
pub const HASH: &str = "17ad13a91e319c56f3662a77e17eee15b429ddb5ac4bb58be3ab501e363c38ab";

pub fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
pub fn horkos() -> AccountId { acc("horkos.testnet") }
pub fn token() -> AccountId { acc("tusdc.testnet") }
pub fn admin() -> AccountId { acc("admin.testnet") }
pub fn owner() -> AccountId { acc("alice.testnet") }
pub fn agent() -> AccountId { acc("agent.alice.testnet") }
pub fn seller() -> AccountId { acc("seller.testnet") }
pub fn bob() -> AccountId { acc("bob.testnet") }
pub fn carol() -> AccountId { acc("carol.testnet") }

/// Mocked context that keeps the storage usage of the previous call
/// (create_order measures its storage growth).
pub fn call(who: &AccountId, deposit: u128, now: u64) {
    let usage = env::storage_usage();
    testing_env!(VMContextBuilder::new()
        .current_account_id(horkos())
        .signer_account_id(who.clone())
        .predecessor_account_id(who.clone())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(now)
        .storage_usage(usage)
        .build());
}

pub fn callback_env(now: u64, result: PromiseResult) {
    let usage = env::storage_usage();
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(horkos())
            .predecessor_account_id(horkos())
            .block_timestamp(now)
            .storage_usage(usage)
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result],
    );
}

pub fn verifier() -> VerifierConfig {
    VerifierConfig {
        outlayer: acc("outlayer.testnet"),
        wasm_url: format!("https://example.test/{HASH}.wasm"),
        wasm_hash: HASH.to_string(),
        build_target: "wasm32-wasip2".to_string(),
        encryption_pubkey: "verifier-x25519-pubkey-base64".to_string(),
        secrets_profile: None,
        secrets_account: None,
        min_fee: U128(FEE),
        max_fee: U128(10 * FEE),
    }
}

/// Contract with a verifier, alice's mandate (budget `budget` tUSDC, 10 per
/// order, total 1000, seller allowed) and one 5 tUSDC listing. Returns the listing id.
pub fn setup(budget: u128) -> (Contract, U64) {
    // Fresh, empty storage: testing_env! would carry the previous run's state over.
    near_sdk::env::set_blockchain_interface(near_sdk::MockedBlockchain::new(
        VMContextBuilder::new().current_account_id(horkos()).predecessor_account_id(acc("deployer.testnet")).block_timestamp(START).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        vec![],
        Default::default(),
        Default::default(),
        None,
    ));
    call(&acc("deployer.testnet"), 0, START);
    let mut c = Contract::new(token(), admin());
    call(&admin(), NEAR, START);
    c.set_verifier(verifier());
    call(&owner(), 5 * NEAR, START);
    c.set_mandate(agent(), U128(1000 * USDC), U128(10 * USDC), vec![seller()], U64(START + 365 * 86_400 * T), Some(100));
    call(&token(), 0, START);
    match c.ft_on_transfer(owner(), U128(budget * USDC), String::new()) {
        PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
    call(&seller(), NEAR, START);
    let l = c.register_listing(U128(5 * USDC), "sha256:abc".to_string(), U64(WINDOW));
    (c, l)
}

pub fn holder(c: &Contract, id: &U64) -> AccountId {
    c.nft_token(id.0.to_string()).unwrap().owner_id
}

/// Deterministic xorshift64.
pub struct Rng(u64);
impl Rng {
    pub fn new(seed: u64) -> Self { Rng(seed.max(1)) }
    pub fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    pub fn pick<T: Clone>(&mut self, xs: &[T]) -> T { xs[(self.next() % xs.len() as u64) as usize].clone() }
    pub fn chance(&mut self, pct: u64) -> bool { self.next() % 100 < pct }
}

/// What the test expects, kept outside the contract.
pub struct Model {
    pub deposited: u128,
    pub withdrawn: u128,
    pub finals: HashMap<u64, OrderStatus>,
    pub ids: Vec<U64>,
    pub accounts: Vec<AccountId>,
}

fn sum_balances(c: &Contract, m: &Model) -> u128 {
    m.accounts.iter().map(|a| c.balance_of(a.clone()).0).sum()
}

pub fn check(c: &Contract, m: &Model, ctx: &str) {
    let mandate = c.get_mandate(owner()).unwrap();
    let orders: Vec<Order> = m.ids.iter().map(|id| c.get_order(*id).unwrap()).collect();
    let open: u128 = orders.iter().filter(|o| !o.status.is_final()).map(|o| o.amount.0).sum();
    let held = mandate.balance.0 + open + sum_balances(c, m);
    assert_eq!(m.deposited, held + m.withdrawn, "conservation broken after {ctx}");
    let n_open = orders.iter().filter(|o| !o.status.is_final()).count() as u32;
    assert_eq!(mandate.open_orders, n_open, "open_orders after {ctx}");
    for o in &orders {
        if let Some(f) = m.finals.get(&o.id.0) {
            assert_eq!(o.status, *f, "order {} left its final state after {ctx}", o.id.0);
        }
        if o.status == OrderStatus::Settled {
            assert!(o.encrypted_key.is_some(), "settled order {} has no key", o.id.0);
        }
    }
}

/// Runs one random sequence; returns the number of operations applied.
pub fn run_sequence(seed: u64, len: usize) -> u64 {
    let mut rng = Rng::new(seed);
    let (mut c, listing) = setup(200);
    let mut m = Model { deposited: 200 * USDC, withdrawn: 0, finals: HashMap::new(), ids: vec![], accounts: vec![owner(), seller(), bob(), carol()] };
    let mut now = START;
    let mut ops = 0u64;
    for _ in 0..len {
        now += 1 + rng.next() % (120 * T);
        let open: Vec<U64> = m.ids.iter().copied().filter(|id| !c.get_order(*id).unwrap().status.is_final()).collect();
        let op = rng.next() % 9;
        let label;
        match op {
            0 | 1 => {
                let mandate = c.get_mandate(owner()).unwrap();
                if mandate.balance.0 < 5 * USDC || open.len() >= 90 { continue; }
                call(&agent(), 0, now);
                let o = c.create_order(owner(), listing, "pk-buyer-0000000000000000000000000000000000".to_string(), None);
                m.ids.push(o.id);
                label = format!("create {}", o.id.0);
            }
            2 => {
                if !V2 || open.is_empty() { continue; }
                let id = rng.pick(&open);
                let from = holder(&c, &id);
                let to = rng.pick(&[owner(), bob(), carol()]);
                if to == from { continue; }
                call(&from, 1, now);
                c.nft_transfer(to.clone(), id.0.to_string(), None, None);
                assert_eq!(holder(&c, &id), to);
                label = format!("transfer {} {} -> {}", id.0, from, to);
            }
            3 => {
                let ready: Vec<U64> = open.iter().copied().filter(|id| {
                    let o = c.get_order(*id).unwrap();
                    matches!(o.status, OrderStatus::Open | OrderStatus::Delivered) && now < o.deadline.0
                }).collect();
                if ready.is_empty() { continue; }
                let id = rng.pick(&ready);
                call(&seller(), FEE, now);
                let _ = c.submit_delivery(id, "https://data.test/x".to_string(), "sealed".to_string());
                label = format!("deliver {}", id.0);
            }
            4 => {
                let verifying: Vec<U64> = open.iter().copied().filter(|id| c.get_order(*id).unwrap().status == OrderStatus::Verifying).collect();
                if verifying.is_empty() { continue; }
                let id = rng.pick(&verifying);
                let o = c.get_order(id).unwrap();
                let h_before = holder(&c, &id);
                let seller_before = c.balance_of(seller()).0;
                let kind = rng.next() % 4;
                let result = match kind {
                    0 | 1 => PromiseResult::Successful(format!(r#"{{"order_id":"{}","attempt":{},"valid":true,"buyer_sealed_key":"key-{}","data_sha256":null}}"#, id.0, o.attempts, id.0).into_bytes()),
                    2 => PromiseResult::Successful(format!(r#"{{"order_id":"{}","attempt":{},"valid":false,"buyer_sealed_key":null,"data_sha256":null}}"#, id.0, o.attempts).into_bytes()),
                    _ => PromiseResult::Failed,
                };
                callback_env(now, result);
                let settled = c.on_verified(id, o.attempts, U128(FEE));
                let after = c.get_order(id).unwrap();
                if settled {
                    assert!(kind <= 1 && now < o.deadline.0);
                    assert_eq!(after.status, OrderStatus::Settled);
                    assert_eq!(c.balance_of(seller()).0, seller_before + o.amount.0, "seller credited");
                    assert_eq!(holder(&c, &id), h_before, "key stays on the current holder's receipt");
                    m.finals.insert(id.0, OrderStatus::Settled);
                } else {
                    assert_eq!(after.status, OrderStatus::Delivered);
                }
                label = format!("verify {} kind {kind}", id.0);
            }
            5 => {
                let cancellable: Vec<U64> = open.iter().copied().filter(|id| c.get_order(*id).unwrap().status == OrderStatus::Open).collect();
                if cancellable.is_empty() { continue; }
                let id = rng.pick(&cancellable);
                let hd = holder(&c, &id);
                let caller = if hd == owner() && rng.chance(50) { agent() } else { hd.clone() };
                label = format!("cancel {} by {caller}", id.0);
                refund_and_check(&mut c, &mut m, id, &hd, now, |c| {
                    call(&caller, 0, now);
                    c.cancel_order(id);
                }, OrderStatus::Cancelled);
            }
            6 => {
                if open.is_empty() { continue; }
                let id = rng.pick(&open);
                let o = c.get_order(id).unwrap();
                now = now.max(o.deadline.0);
                let hd = holder(&c, &id);
                label = format!("expire {}", id.0);
                refund_and_check(&mut c, &mut m, id, &hd, now, |c| {
                    call(&acc("anyone.testnet"), 0, now);
                    c.refund_expired(id);
                }, OrderStatus::Refunded);
            }
            7 => {
                let who = rng.pick(&[seller(), bob(), carol(), owner()]);
                let bal = c.balance_of(who.clone()).0;
                if bal == 0 { continue; }
                let amount = 1 + rng.next() as u128 % bal;
                call(&who, 1, now);
                let _ = c.withdraw(WithdrawSource::Earnings, Some(U128(amount)));
                let ok = rng.chance(80);
                callback_env(now, PromiseResult::Successful(vec![]));
                let res = if ok { Ok(()) } else { Err(PromiseError::Failed) };
                c.on_withdraw(who.clone(), WithdrawSource::Earnings, U128(amount), res);
                if ok { m.withdrawn += amount; }
                label = format!("withdraw earnings {who} {amount} ok={ok}");
            }
            _ => {
                let bal = c.get_mandate(owner()).unwrap().balance.0;
                if bal == 0 { continue; }
                let amount = 1 + rng.next() as u128 % bal.min(20 * USDC);
                call(&owner(), 1, now);
                let _ = c.withdraw(WithdrawSource::Budget, Some(U128(amount)));
                let ok = rng.chance(80);
                callback_env(now, PromiseResult::Successful(vec![]));
                let res = if ok { Ok(()) } else { Err(PromiseError::Failed) };
                c.on_withdraw(owner(), WithdrawSource::Budget, U128(amount), res);
                if ok { m.withdrawn += amount; }
                label = format!("withdraw budget {amount} ok={ok}");
            }
        }
        ops += 1;
        check(&c, &m, &format!("seed {seed}: {label}"));
    }
    ops
}

/// Applies a cancel or expiry and checks the refund went to the holder.
fn refund_and_check(c: &mut Contract, m: &mut Model, id: U64, hd: &AccountId, _now: u64, f: impl FnOnce(&mut Contract), want: OrderStatus) {
    let o = c.get_order(id).unwrap();
    let budget_before = c.get_mandate(owner()).unwrap().balance.0;
    let holder_before = c.balance_of(hd.clone()).0;
    f(c);
    let after = c.get_order(id).unwrap();
    assert_eq!(after.status, want);
    let budget_after = c.get_mandate(owner()).unwrap().balance.0;
    if *hd == owner() {
        assert_eq!(budget_after, budget_before + o.amount.0, "refund to the buyer's budget");
    } else {
        assert_eq!(budget_after, budget_before, "budget unchanged when someone else holds the receipt");
        assert_eq!(c.balance_of(hd.clone()).0, holder_before + o.amount.0, "refund to the holder");
    }
    m.finals.insert(id.0, want);
}
