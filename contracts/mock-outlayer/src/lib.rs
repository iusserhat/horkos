//! TEST ONLY. Stands in for OutLayer's `request_execution` in sandbox tests.
//!
//! Real OutLayer yields until a TEE worker resolves; this mock answers in the
//! same call, which is enough to exercise the caller's callback with real
//! gas and real promise results. It keeps the attached fee (OutLayer would
//! refund the unused part to the payer).

use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, PanicOnDefault, PromiseOrValue};

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Mode {
    /// Echo order_id/attempt with valid = true and a buyer key.
    Valid,
    /// Echo order_id/attempt with valid = false.
    Invalid,
    /// Return JSON null, like OutLayer after a failed run.
    Null,
    /// Panic, like OutLayer rejecting the request.
    Reject,
    /// Valid, and hand the seller's sealed payload back as the buyer's.
    /// Lets SDK tests exercise decryption when the test makes the verifier
    /// key equal to the buyer key. A real verifier re-seals to the buyer.
    Passthrough,
    /// Like real OutLayer: yield until an off-chain worker calls
    /// `resolve_execution` with the verifier's stdout (demo fallback runs the
    /// real verifier code natively as that worker).
    Worker,
}

/// A request waiting for the off-chain worker.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Pending {
    pub request_id: u64,
    pub predecessor_id: String,
    pub input_data: String,
    yield_id: near_sdk::YieldId,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct MockOutlayer {
    mode: Mode,
    requests: u64,
    last_args: String,
    pending: Vec<Pending>,
}

#[near]
impl MockOutlayer {
    #[init]
    pub fn new() -> Self {
        Self {
            mode: Mode::Valid,
            requests: 0,
            last_args: String::new(),
            pending: Vec::new(),
        }
    }

    pub fn set_mode(&mut self, mode: Mode) {
        self.mode = mode;
    }

    #[payable]
    #[allow(unused_variables)]
    pub fn request_execution(
        &mut self,
        source: Value,
        resource_limits: Option<Value>,
        input_data: Option<String>,
        secrets_ref: Option<Value>,
        response_format: Option<String>,
        payer_account_id: Option<String>,
        params: Option<Value>,
    ) -> PromiseOrValue<Value> {
        if self.mode == Mode::Reject {
            env::panic_str("mock outlayer: request rejected");
        }
        self.requests += 1;
        let input: Value = near_sdk::serde_json::from_str(input_data.as_deref().unwrap_or("{}"))
            .unwrap_or(Value::Null);
        self.last_args =
            json!({"source": source, "payer_account_id": payer_account_id}).to_string();
        if self.mode == Mode::Worker {
            let (promise, yield_id) = near_sdk::Promise::new_yield(
                "on_resolved",
                b"{}",
                near_sdk::Gas::from_tgas(10),
                near_sdk::GasWeight(0),
            );
            self.pending.push(Pending {
                request_id: self.requests,
                predecessor_id: env::predecessor_account_id().to_string(),
                input_data: input_data.unwrap_or_default(),
                yield_id,
            });
            return PromiseOrValue::Promise(promise);
        }
        PromiseOrValue::Value(match self.mode {
            Mode::Null | Mode::Reject => Value::Null,
            Mode::Passthrough => json!({
                "order_id": input["order_id"],
                "attempt": input["attempt"],
                "valid": true,
                "buyer_sealed_key": input["sealed_key"],
                "data_sha256": null,
            }),
            mode => json!({
                "order_id": input["order_id"],
                "attempt": input["attempt"],
                "valid": mode == Mode::Valid,
                "buyer_sealed_key": (mode == Mode::Valid).then(|| "x".repeat(108)),
                "data_sha256": "ab".repeat(32),
            }),
        })
    }

    /// Worker side: hand the verifier's output to the yielded request.
    pub fn resolve_execution(&mut self, request_id: u64, output: String) {
        let pos = self
            .pending
            .iter()
            .position(|p| p.request_id == request_id)
            .unwrap_or_else(|| env::panic_str("Execution request not found"));
        let p = self.pending.remove(pos);
        if p.yield_id.resume(output.as_bytes()).is_err() {
            env::panic_str("yield already timed out");
        }
    }

    /// Yield callback: the worker's output as JSON, or null on timeout/bad JSON.
    #[private]
    pub fn on_resolved(&mut self) -> Value {
        match env::promise_result_checked(0, 1000) {
            Ok(bytes) => near_sdk::serde_json::from_slice(&bytes).unwrap_or(Value::Null),
            Err(_) => Value::Null,
        }
    }

    pub fn get_pending(&self) -> Vec<Pending> {
        self.pending.clone()
    }

    pub fn get_requests(&self) -> u64 {
        self.requests
    }

    pub fn get_last_args(&self) -> String {
        self.last_args.clone()
    }
}
