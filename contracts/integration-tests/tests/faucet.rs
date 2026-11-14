//! Faucet on a local node: real tUSDC token, real cross-contract calls.
//! Build the wasm first: `contracts/scripts/build.sh`.

use near_workspaces::network::Sandbox;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};
use std::path::PathBuf;

const USDC: u128 = 1_000_000;

fn wasm(name: &str) -> Vec<u8> {
    let target = std::env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target"));
    std::fs::read(target.join("near").join(name).join(format!("{name}.wasm")))
        .expect("Run contracts/scripts/build.sh first")
}

async fn account(worker: &Worker<Sandbox>, name: &str) -> anyhow::Result<Account> {
    Ok(worker.root_account()?.create_subaccount(name).initial_balance(NearToken::from_near(5)).transact().await?.into_result()?)
}

async fn balance(token: &Contract, who: &Account) -> anyhow::Result<u128> {
    let v: Option<String> = token.view("ft_balance_of").args_json(json!({"account_id": who.id()})).await?.json()?;
    Ok(v.map(|s| s.parse().unwrap()).unwrap_or(0))
}

#[tokio::test]
async fn faucet_claim_registers_pays_and_limits() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let owner = account(&worker, "owner").await?;
    let token = worker.dev_deploy(&wasm("test_token")).await?;
    token.call("new").args_json(json!({"owner_id": owner.id(), "total_supply": (1_000 * USDC).to_string()})).transact().await?.into_result()?;
    let faucet = worker.dev_deploy(&wasm("faucet")).await?;
    faucet
        .call("new")
        .args_json(json!({"owner": owner.id(), "token": token.id(), "amount": (20 * USDC).to_string(), "cap": (40 * USDC).to_string()}))
        .transact()
        .await?
        .into_result()?;
    owner.call(token.id(), "storage_deposit").args_json(json!({"account_id": faucet.id()})).deposit(NearToken::from_millinear(10)).transact().await?.into_result()?;

    // Refill: only the owner's ft_transfer_call is kept.
    owner
        .call(token.id(), "ft_transfer_call")
        .args_json(json!({"receiver_id": faucet.id(), "amount": (100 * USDC).to_string(), "msg": ""}))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(balance(&token, faucet.as_account()).await?, 100 * USDC);

    // A new account, not registered with the token: claim registers it and pays 20 tUSDC.
    let alice = account(&worker, "alice").await?;
    let r = alice.call(faucet.id(), "claim").max_gas().transact().await?;
    assert!(r.is_success(), "{r:?}");
    assert!(r.json::<bool>()?);
    assert_eq!(balance(&token, &alice).await?, 20 * USDC);

    // Same account again within 24 h: refused, nothing sent.
    let again = alice.call(faucet.id(), "claim").max_gas().transact().await?;
    assert!(format!("{:?}", again.into_result().unwrap_err()).contains("Already claimed"));
    assert_eq!(balance(&token, &alice).await?, 20 * USDC);
    let next: Option<String> = faucet.view("next_claim_at").args_json(json!({"account_id": alice.id()})).await?.json()?;
    assert!(next.is_some());

    // A second account, already registered: still works; then the cap (40) stops a third.
    let bob = account(&worker, "bob").await?;
    bob.call(token.id(), "storage_deposit").args_json(json!({"account_id": bob.id()})).deposit(NearToken::from_millinear(10)).transact().await?.into_result()?;
    assert!(bob.call(faucet.id(), "claim").max_gas().transact().await?.json::<bool>()?);
    let carol = account(&worker, "carol").await?;
    let capped = carol.call(faucet.id(), "claim").max_gas().transact().await?;
    assert!(format!("{:?}", capped.into_result().unwrap_err()).contains("Faucet cap reached"));

    // Pause: only the owner.
    let p = alice.call(faucet.id(), "set_paused").args_json(json!({"paused": true})).transact().await?;
    assert!(p.is_failure());
    owner.call(faucet.id(), "set_paused").args_json(json!({"paused": true})).transact().await?.into_result()?;
    let info: Value = faucet.view("get_info").await?.json()?;
    assert_eq!(info["paused"], true);
    assert_eq!(info["distributed"], (40 * USDC).to_string());
    assert_eq!(balance(&token, faucet.as_account()).await?, 60 * USDC);
    Ok(())
}
