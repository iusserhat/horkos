//! Sandbox tests: real wasm, real cross-contract calls, real gas.
//!
//! Build the contracts first: `contracts/scripts/build.sh`. The wasm files are
//! read from `$CARGO_TARGET_DIR/near/<crate>/<crate>.wasm` (default
//! `contracts/target`). OutLayer is replaced by `mock-outlayer`, which answers
//! `request_execution` in the same call (real OutLayer yields until a TEE
//! worker resolves); the callback path and its gas are the same.

use near_workspaces::network::Sandbox;
use near_workspaces::result::{ExecutionFinalResult, ExecutionOutcome};
use near_workspaces::types::{AccessKey, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};
use std::path::PathBuf;

const USDC: u128 = 1_000_000;
const HOUR_NS: u64 = 3_600 * 1_000_000_000;
const FEE: NearToken = NearToken::from_millinear(10);
/// Static gas the contract attaches to its callbacks (keep in sync with
/// horkos/src/delivery.rs and withdraw.rs). Tests fail if a path burns more
/// than half of it.
const ON_VERIFIED_TGAS: f64 = 10.0;
const ON_WITHDRAW_TGAS: f64 = 5.0;

fn wasm(name: &str) -> Vec<u8> {
    let target = std::env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target"));
    let path = target.join("near").join(name).join(format!("{name}.wasm"));
    std::fs::read(&path).unwrap_or_else(|e| {
        panic!(
            "{}: {e}. Run contracts/scripts/build.sh first.",
            path.display()
        )
    })
}

struct Env {
    worker: Worker<Sandbox>,
    token: Contract,
    horkos: Contract,
    outlayer: Contract,
    admin: Account,
    owner: Account,
    agent: Account,
    seller: Account,
    listing: u64,
}

async fn account(worker: &Worker<Sandbox>, name: &str, near: u128) -> anyhow::Result<Account> {
    Ok(worker
        .root_account()?
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(near))
        .transact()
        .await?
        .into_result()?)
}

async fn register(token: &Contract, who: &Account) -> anyhow::Result<()> {
    who.call(token.id(), "storage_deposit")
        .args_json(json!({"account_id": who.id()}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Deploys everything and walks a buyer to the point of having an open
/// mandate with 100 tUSDC, plus a 5 tUSDC listing from the allowed seller.
async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let admin = account(&worker, "admin", 20).await?;
    let owner = account(&worker, "owner", 20).await?;
    let agent = account(&worker, "agent", 5).await?;
    let seller = account(&worker, "seller", 20).await?;

    let token = worker.dev_deploy(&wasm("test_token")).await?;
    token
        .call("new")
        .args_json(json!({"owner_id": owner.id(), "total_supply": (1_000 * USDC).to_string()}))
        .transact()
        .await?
        .into_result()?;
    let horkos = worker.dev_deploy(&wasm("horkos")).await?;
    horkos
        .call("new")
        .args_json(json!({"token": token.id(), "admin": admin.id()}))
        .transact()
        .await?
        .into_result()?;
    let outlayer = worker.dev_deploy(&wasm("mock_outlayer")).await?;
    outlayer.call("new").transact().await?.into_result()?;

    let horkos_acc = horkos.as_account();
    register(&token, horkos_acc).await?;
    register(&token, &seller).await?;

    admin
        .call(horkos.id(), "set_verifier")
        .args_json(json!({"config": {
            "outlayer": outlayer.id(),
            "wasm_url": "https://example.test/verifier.wasm",
            "wasm_hash": "ab".repeat(32),
            "build_target": "wasm32-wasip1",
            "secrets_profile": null,
            "secrets_account": null,
            "min_fee": FEE.as_yoctonear().to_string(),
            "max_fee": NearToken::from_near(1).as_yoctonear().to_string(),
        }}))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .into_result()?;

    let now_ns = worker.view_block().await?.timestamp();
    owner
        .call(horkos.id(), "set_mandate")
        .args_json(json!({
            "agent": agent.id(),
            "max_total": (100 * USDC).to_string(),
            "max_per_order": (10 * USDC).to_string(),
            "allowed_sellers": [seller.id()],
            "expires_at": (now_ns + 24 * HOUR_NS).to_string(),
            "max_open_orders": null,
        }))
        .deposit(NearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(token.id(), "ft_transfer_call")
        .args_json(
            json!({"receiver_id": horkos.id(), "amount": (100 * USDC).to_string(), "msg": ""}),
        )
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let listing: Value = seller
        .call(horkos.id(), "register_listing")
        .args_json(json!({
            "price": (5 * USDC).to_string(),
            "condition_hash": "sha256:schema",
            "delivery_window": HOUR_NS.to_string(),
        }))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .json()?;
    let listing = listing.as_str().unwrap().parse()?;

    Ok(Env {
        worker,
        token,
        horkos,
        outlayer,
        admin,
        owner,
        agent,
        seller,
        listing,
    })
}

impl Env {
    async fn create_order(&self) -> anyhow::Result<u64> {
        let order: Value = self
            .agent
            .call(self.horkos.id(), "create_order")
            .args_json(json!({
                "owner": self.owner.id(),
                "listing_id": self.listing.to_string(),
                "buyer_pubkey": "x25519:buyer",
                "verifier_version": 0,
            }))
            .max_gas()
            .transact()
            .await?
            .into_result()?
            .json()?;
        Ok(order["id"].as_str().unwrap().parse()?)
    }

    async fn submit(&self, order_id: u64) -> anyhow::Result<ExecutionFinalResult> {
        Ok(self
            .seller
            .call(self.horkos.id(), "submit_delivery")
            .args_json(json!({
                "order_id": order_id.to_string(),
                "delivery_ref": "https://data.test/enc.bin",
                "sealed_key": "sealed-for-verifier",
            }))
            .deposit(FEE)
            .max_gas()
            .transact()
            .await?)
    }

    async fn set_mode(&self, mode: &str) -> anyhow::Result<()> {
        self.admin
            .call(self.outlayer.id(), "set_mode")
            .args_json(json!({"mode": mode}))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    async fn order(&self, id: u64) -> anyhow::Result<Value> {
        Ok(self
            .horkos
            .view("get_order")
            .args_json(json!({"order_id": id.to_string()}))
            .await?
            .json()?)
    }

    async fn earnings(&self, who: &Account) -> anyhow::Result<u128> {
        let v: Value = self
            .horkos
            .view("balance_of")
            .args_json(json!({"account_id": who.id()}))
            .await?
            .json()?;
        Ok(v.as_str().unwrap().parse()?)
    }

    async fn ft_balance(&self, who: &Account) -> anyhow::Result<u128> {
        let v: Value = self
            .token
            .view("ft_balance_of")
            .args_json(json!({"account_id": who.id()}))
            .await?
            .json()?;
        Ok(v.as_str().unwrap().parse()?)
    }
}

/// The receipt outcome executed by `horkos` whose logs contain `needle`.
fn horkos_outcome<'a>(
    res: &'a ExecutionFinalResult,
    horkos: &Contract,
    needle: &str,
) -> Option<&'a ExecutionOutcome> {
    res.receipt_outcomes()
        .iter()
        .find(|o| &o.executor_id == horkos.id() && o.logs.iter().any(|l| l.contains(needle)))
}

fn tgas(g: Gas) -> f64 {
    g.as_gas() as f64 / 1e12
}

// ------------------------------------------------------------------ tests

#[tokio::test]
async fn full_flow_settles_and_seller_withdraws() -> anyhow::Result<()> {
    let e = setup().await?;
    let id = e.create_order().await?;
    let receipt: Value = e
        .horkos
        .view("nft_token")
        .args_json(json!({"token_id": id.to_string()}))
        .await?
        .json()?;
    assert_eq!(receipt["owner_id"], e.owner.id().to_string());

    let res = e.submit(id).await?;
    assert!(res.is_success(), "{:?}", res.failures());
    assert_eq!(e.order(id).await?["status"], "Settled");
    assert_eq!(e.earnings(&e.seller).await?, 5 * USDC);
    let cb =
        horkos_outcome(&res, &e.horkos, "\"status\":\"Settled\"").expect("on_verified outcome");
    println!("GAS on_verified (settle): {:.2} Tgas", tgas(cb.gas_burnt));
    assert!(
        tgas(cb.gas_burnt) < ON_VERIFIED_TGAS / 2.0,
        "on_verified (settle) burns too much gas"
    );

    let before = e.ft_balance(&e.seller).await?;
    let res = e
        .seller
        .call(e.horkos.id(), "withdraw")
        .args_json(json!({"from": "Earnings", "amount": null}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(res.is_success(), "{:?}", res.failures());
    assert_eq!(e.ft_balance(&e.seller).await? - before, 5 * USDC);
    assert_eq!(e.earnings(&e.seller).await?, 0);
    let last = res
        .receipt_outcomes()
        .iter()
        .filter(|o| &o.executor_id == e.horkos.id())
        .last()
        .unwrap();
    println!(
        "GAS on_withdraw (success): {:.2} Tgas",
        tgas(last.gas_burnt)
    );
    assert!(
        tgas(last.gas_burnt) < ON_WITHDRAW_TGAS / 2.0,
        "on_withdraw (success) burns too much gas"
    );
    Ok(())
}

#[tokio::test]
async fn invalid_and_null_results_return_to_delivered_then_retry_settles() -> anyhow::Result<()> {
    let e = setup().await?;
    let id = e.create_order().await?;

    e.set_mode("Invalid").await?;
    let res = e.submit(id).await?;
    assert!(res.is_success(), "{:?}", res.failures());
    assert_eq!(e.order(id).await?["status"], "Delivered");
    assert_eq!(e.order(id).await?["encrypted_key"], Value::Null);
    let cb = horkos_outcome(&res, &e.horkos, "\"status\":\"Delivered\"").unwrap();
    println!("GAS on_verified (invalid): {:.2} Tgas", tgas(cb.gas_burnt));
    assert!(
        tgas(cb.gas_burnt) < ON_VERIFIED_TGAS / 2.0,
        "on_verified (invalid) burns too much gas"
    );

    e.set_mode("Null").await?;
    e.submit(id).await?.into_result()?;
    assert_eq!(e.order(id).await?["status"], "Delivered");

    e.set_mode("Valid").await?;
    e.submit(id).await?.into_result()?;
    let order = e.order(id).await?;
    assert_eq!(order["status"], "Settled");
    assert_eq!(order["attempts"], 3);
    Ok(())
}

#[tokio::test]
async fn rejected_outlayer_call_forwards_fee_to_seller() -> anyhow::Result<()> {
    let e = setup().await?;
    let id = e.create_order().await?;
    e.set_mode("Reject").await?;

    let before = e.seller.view_account().await?.balance;
    let res = e.submit(id).await?;
    let after = e.seller.view_account().await?.balance;
    assert_eq!(e.order(id).await?["status"], "Delivered");
    let cb = horkos_outcome(&res, &e.horkos, "fee returned to seller").expect("Err path ran");
    println!(
        "GAS on_verified (Err + fee transfer): {:.2} Tgas",
        tgas(cb.gas_burnt)
    );
    assert!(
        tgas(cb.gas_burnt) < ON_VERIFIED_TGAS / 2.0,
        "on_verified (Err + fee transfer) burns too much gas"
    );
    // Without the forwarded fee the seller would be down at least FEE; with
    // it, only the transaction's gas (incl. the unused-gas refund penalty).
    let lost = before.as_yoctonear() - after.as_yoctonear();
    assert!(
        lost < FEE.as_yoctonear() / 2,
        "seller lost {lost} yocto; the {FEE} fee was not returned"
    );
    Ok(())
}

#[tokio::test]
async fn failed_withdraw_to_unregistered_account_restores_balance() -> anyhow::Result<()> {
    let e = setup().await?;
    // A second seller who never registered with the token earns 5 tUSDC.
    let lone = account(&e.worker, "lone", 10).await?;
    e.owner
        .call(e.horkos.id(), "set_mandate")
        .args_json(json!({
            "agent": e.agent.id(),
            "max_total": (100 * USDC).to_string(),
            "max_per_order": (10 * USDC).to_string(),
            "allowed_sellers": [e.seller.id(), lone.id()],
            "expires_at": (e.worker.view_block().await?.timestamp() + 24 * HOUR_NS).to_string(),
            "max_open_orders": null,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    let l: Value = lone
        .call(e.horkos.id(), "register_listing")
        .args_json(json!({"price": (5 * USDC).to_string(), "condition_hash": "h", "delivery_window": HOUR_NS.to_string()}))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .json()?;
    let order: Value = e
        .agent
        .call(e.horkos.id(), "create_order")
        .args_json(json!({"owner": e.owner.id(), "listing_id": l, "buyer_pubkey": "pk", "verifier_version": null}))
        .max_gas()
        .transact()
        .await?
        .json()?;
    lone.call(e.horkos.id(), "submit_delivery")
        .args_json(json!({"order_id": order["id"], "delivery_ref": "r", "sealed_key": "k"}))
        .deposit(FEE)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(e.earnings(&lone).await?, 5 * USDC);

    let res = lone
        .call(e.horkos.id(), "withdraw")
        .args_json(json!({"from": "Earnings", "amount": null}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert_eq!(
        e.earnings(&lone).await?,
        5 * USDC,
        "balance restored after failed ft_transfer"
    );
    let cb = horkos_outcome(&res, &e.horkos, "balance restored").expect("on_withdraw restore ran");
    println!("GAS on_withdraw (restore): {:.2} Tgas", tgas(cb.gas_burnt));
    assert!(
        tgas(cb.gas_burnt) < ON_WITHDRAW_TGAS / 2.0,
        "on_withdraw (restore) burns too much gas"
    );
    Ok(())
}

#[tokio::test]
async fn callbacks_are_private() -> anyhow::Result<()> {
    let e = setup().await?;
    let res = e
        .seller
        .call(e.horkos.id(), "on_withdraw")
        .args_json(json!({"account": e.seller.id(), "from": "Earnings", "amount": "1"}))
        .max_gas()
        .transact()
        .await?;
    assert!(
        format!("{:?}", res.failures()).contains("is private"),
        "{:?}",
        res.failures()
    );

    let id = e.create_order().await?;
    let res = e
        .seller
        .call(e.horkos.id(), "on_verified")
        .args_json(json!({"order_id": id.to_string(), "attempt": 1, "fee": "0"}))
        .max_gas()
        .transact()
        .await?;
    assert!(
        format!("{:?}", res.failures()).contains("is private"),
        "{:?}",
        res.failures()
    );
    assert_eq!(e.order(id).await?["status"], "Open");
    Ok(())
}

#[tokio::test]
async fn agent_function_call_key_can_order_but_not_move_money() -> anyhow::Result<()> {
    let e = setup().await?;
    // Give the agent a function-call key limited to create_order/cancel_order.
    let sk = SecretKey::from_random(KeyType::ED25519);
    e.agent
        .batch(e.agent.id())
        .add_key(
            sk.public_key(),
            AccessKey::function_call_access(e.horkos.id(), &["create_order", "cancel_order"], None),
        )
        .transact()
        .await?
        .into_result()?;
    let agent_fc = Account::from_secret_key(e.agent.id().clone(), sk, &e.worker);

    let order: Value = agent_fc
        .call(e.horkos.id(), "create_order")
        .args_json(json!({"owner": e.owner.id(), "listing_id": e.listing.to_string(), "buyer_pubkey": "pk", "verifier_version": null}))
        .max_gas()
        .transact()
        .await?
        .into_result()?
        .json()?;
    assert_eq!(order["status"], "Open");

    // Not in the key's method list.
    let res = agent_fc
        .call(e.horkos.id(), "withdraw")
        .args_json(json!({"from": "Budget", "amount": null}))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await;
    assert!(
        res.is_err() || !res.unwrap().is_success(),
        "FC key must not call withdraw"
    );
    Ok(())
}

#[tokio::test]
async fn compromised_agent_out_of_mandate_order_is_rejected() -> anyhow::Result<()> {
    // Demo scenario 3: a prompt-injected agent tries to buy 500 tUSDC from an
    // unknown seller. The contract rejects it; no order, no receipt, no escrow.
    let e = setup().await?;
    let attacker = account(&e.worker, "attacker", 10).await?;
    let l: Value = attacker
        .call(e.horkos.id(), "register_listing")
        .args_json(json!({"price": (500 * USDC).to_string(), "condition_hash": "h", "delivery_window": HOUR_NS.to_string()}))
        .deposit(NearToken::from_millinear(100))
        .transact()
        .await?
        .json()?;
    let res = e
        .agent
        .call(e.horkos.id(), "create_order")
        .args_json(json!({"owner": e.owner.id(), "listing_id": l, "buyer_pubkey": "pk", "verifier_version": null}))
        .max_gas()
        .transact()
        .await?;
    assert!(format!("{:?}", res.failures()).contains("Seller not allowed by mandate"));
    let supply: Value = e.horkos.view("nft_total_supply").await?.json()?;
    assert_eq!(supply, "0");
    let m: Value = e
        .horkos
        .view("get_mandate")
        .args_json(json!({"owner": e.owner.id()}))
        .await?
        .json()?;
    assert_eq!(m["balance"], (100 * USDC).to_string());
    Ok(())
}
