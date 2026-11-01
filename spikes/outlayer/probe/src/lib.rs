//! SPIKE: minimal contract that asks OutLayer to run the checker WASM in a
//! TEE and records exactly what comes back in the callback.

use near_sdk::serde_json::{self, json};
use near_sdk::{env, near, AccountId, Gas, PanicOnDefault, Promise, PromiseError};

const MAX_RESULT_LEN: usize = 4096;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Record {
    pub n: u64,
    pub ok: bool,
    /// Raw callback bytes as UTF-8 (or the error text).
    pub raw: String,
    pub block: u64,
}

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Probe {
    outlayer: AccountId,
    wasm_url: String,
    wasm_hash: String,
    next: u64,
    records: Vec<Record>,
}

#[near]
impl Probe {
    #[init]
    pub fn new(outlayer: AccountId, wasm_url: String, wasm_hash: String) -> Self {
        Self { outlayer, wasm_url, wasm_hash, next: 0, records: vec![] }
    }

    #[private]
    pub fn set_wasm(&mut self, wasm_url: String, wasm_hash: String) {
        self.wasm_url = wasm_url;
        self.wasm_hash = wasm_hash;
    }

    /// Attach NEAR for OutLayer's fee; the unused part goes back to the caller.
    #[payable]
    pub fn check(&mut self, input_data: String) -> Promise {
        let n = self.next;
        self.next += 1;
        let args = json!({
            "source": {"WasmUrl": {
                "url": self.wasm_url,
                "hash": self.wasm_hash,
                "build_target": "wasm32-wasip1"
            }},
            "resource_limits": {
                "max_instructions": 1_000_000_000u64,
                "max_memory_mb": 128,
                "max_execution_seconds": 30
            },
            "input_data": input_data,
            "response_format": "Json",
            "payer_account_id": env::predecessor_account_id()
        });
        Promise::new(self.outlayer.clone())
            .function_call(
                "request_execution".to_string(),
                serde_json::to_vec(&args).unwrap(),
                env::attached_deposit(),
                Gas::from_tgas(100),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .on_result(n),
            )
    }

    #[private]
    pub fn on_result(&mut self, n: u64) -> bool {
        let r: Result<Vec<u8>, PromiseError> = env::promise_result_checked(0, MAX_RESULT_LEN);
        let (ok, raw) = match r {
            Ok(bytes) => (true, String::from_utf8_lossy(&bytes).into_owned()),
            Err(e) => (false, format!("{e:?}")),
        };
        env::log_str(&format!("outlayer result #{n} ok={ok}: {raw}"));
        self.records.push(Record { n, ok, raw, block: env::block_height() });
        ok
    }

    pub fn get_records(&self) -> Vec<Record> {
        self.records.clone()
    }
}
