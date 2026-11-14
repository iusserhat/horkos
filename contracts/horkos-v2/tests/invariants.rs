//! Randomized invariant tests (test code only; the contract is unchanged).
//!
//! Each run builds a fresh contract, then applies a random sequence of valid
//! operations: create, transfer (v2), deliver, verification ok / fail /
//! failed call, cancel, expire, withdraw. After every step it checks:
//!   1. Conservation: tokens deposited == mandate budget + open orders
//!      + internal balances + tokens withdrawn (what the contract must hold).
//!   2. Every order ends in exactly one final state and never leaves it.
//!   3. A refund goes to the receipt's holder at that moment (budget if the
//!      buyer holds it, else the holder's balance); a settlement credits the
//!      seller and stores the key on the receipt the holder owns.
//!   4. open_orders == number of non-final orders; spent matches the orders.
//!
//! Runs: INVARIANT_RUNS (default 300; `INVARIANT_RUNS=10000` locally).
//! Seed: INVARIANT_SEED (default 1).

#[path = "common/mod.rs"]
mod common;
use common::*;

#[test]
fn random_sequences_keep_invariants() {
    let runs: u64 = std::env::var("INVARIANT_RUNS").ok().and_then(|v| v.parse().ok()).unwrap_or(300);
    let seed: u64 = std::env::var("INVARIANT_SEED").ok().and_then(|v| v.parse().ok()).unwrap_or(1);
    let mut steps = 0u64;
    for r in 0..runs {
        steps += run_sequence(seed.wrapping_mul(1_000_003).wrapping_add(r), 40);
    }
    println!("invariants held over {runs} sequences, {steps} operations ({})", if V2 { "v2" } else { "v1" });
}
