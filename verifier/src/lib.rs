//! Horkos delivery verifier.
//!
//! Runs inside NEAR OutLayer's TEE (WASI P2). The Horkos contract calls it
//! from `submit_delivery` with:
//!
//! ```json
//! {"order_id": "7", "attempt": 1, "delivery_ref": "<manifest URL>",
//!  "sealed_key": "<base64>", "condition_hash": "sha256:<hex>", "buyer_pubkey": "<base64>"}
//! ```
//!
//! Steps: check the caller is the Horkos contract; open `sealed_key` with the
//! verifier's X25519 secret key (from OutLayer secrets) to get
//! `K || sha256(ciphertext)`; fetch the manifest, the condition and the
//! ciphertext; check both hashes; decrypt with `K`; validate the JSON against
//! the condition (JSON Schema); on success re-seal the same 64 bytes to
//! `buyer_pubkey`. Output (≤ 900 bytes):
//!
//! ```json
//! {"order_id": "7", "attempt": 1, "valid": true, "buyer_sealed_key": "<base64>",
//!  "data_sha256": "<hex>", "reason": null}
//! ```
//!
//! `{"cmd": "pubkey"}` prints the verifier's public key instead.
//!
//! Cryptography comes from RustCrypto crates that interoperate with
//! libsodium: `crypto_box` sealed boxes (= `crypto_box_seal`) and
//! `chacha20poly1305::XChaCha20Poly1305` (= `crypto_aead_xchacha20poly1305_ietf`).

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use crypto_box::aead::OsRng;
use crypto_box::{PublicKey, SecretKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const MAX_MANIFEST_BYTES: usize = 16 * 1024;
pub const MAX_CONDITION_BYTES: usize = 64 * 1024;
pub const MAX_DATA_BYTES: usize = 1024 * 1024;
const MAX_REASON_CHARS: usize = 120;
const NONCE_BYTES: usize = 24;

/// Fetches a URL's bytes (WASI HTTP in the TEE; files in local tests).
pub trait Fetch {
    fn get(&self, url: &str, max_bytes: usize) -> Result<Vec<u8>, String>;
}

/// Values the runtime provides.
pub struct Env {
    /// `NEAR_PREDECESSOR_ID` set by OutLayer: the account that called OutLayer.
    pub predecessor: Option<String>,
    /// The only caller accepted (compiled in, so pinned by the WASM hash).
    pub allowed_caller: String,
    /// Verifier X25519 secret key, hex (OutLayer secret `PROTECTED_VERIFIER_SK`).
    pub secret_hex: Option<String>,
}

#[derive(Deserialize)]
pub struct Input {
    pub order_id: String,
    pub attempt: u32,
    pub delivery_ref: String,
    pub sealed_key: String,
    pub condition_hash: String,
    pub buyer_pubkey: String,
}

#[derive(Deserialize)]
struct Manifest {
    v: u32,
    order_id: String,
    data_url: String,
    condition_url: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Output {
    pub order_id: String,
    pub attempt: u32,
    pub valid: bool,
    pub buyer_sealed_key: Option<String>,
    pub data_sha256: Option<String>,
    pub reason: Option<String>,
}

fn secret_key(env: &Env) -> Result<SecretKey, String> {
    let hex_key = env.secret_hex.as_deref().ok_or("verifier secret key not available")?;
    let bytes: [u8; 32] = hex::decode(hex_key.trim())
        .map_err(|_| "verifier secret key is not hex")?
        .try_into()
        .map_err(|_| "verifier secret key must be 32 bytes")?;
    Ok(SecretKey::from(bytes))
}

/// Entry point: raw stdin bytes in, JSON value out.
pub fn run(raw: &[u8], env: &Env, fetch: &dyn Fetch) -> Value {
    let parsed: Value = match serde_json::from_slice(raw) {
        Ok(v) => v,
        Err(e) => return json!({"valid": false, "reason": format!("input is not JSON: {e}")}),
    };
    if parsed.get("cmd").and_then(Value::as_str) == Some("pubkey") {
        return match secret_key(env) {
            Ok(sk) => json!({"pubkey": B64.encode(sk.public_key().as_bytes())}),
            Err(e) => json!({"error": e}),
        };
    }
    let input: Input = match serde_json::from_value(parsed.clone()) {
        Ok(i) => i,
        Err(e) => {
            return serde_json::to_value(Output {
                order_id: parsed["order_id"].as_str().unwrap_or_default().to_string(),
                attempt: parsed["attempt"].as_u64().unwrap_or(0) as u32,
                valid: false,
                buyer_sealed_key: None,
                data_sha256: None,
                reason: Some(truncate(format!("bad input: {e}"))),
            })
            .unwrap()
        }
    };
    serde_json::to_value(verify(&input, env, fetch)).unwrap()
}

/// Verifies one delivery. Never panics on bad data; failures are `valid: false`.
pub fn verify(input: &Input, env: &Env, fetch: &dyn Fetch) -> Output {
    let mut out = Output {
        order_id: input.order_id.clone(),
        attempt: input.attempt,
        valid: false,
        buyer_sealed_key: None,
        data_sha256: None,
        reason: None,
    };
    match check(input, env, fetch) {
        Ok((sealed_for_buyer, data_hash)) => {
            out.valid = true;
            out.buyer_sealed_key = Some(sealed_for_buyer);
            out.data_sha256 = Some(data_hash);
        }
        Err(Rejection { reason, data_hash }) => {
            out.reason = Some(truncate(reason));
            out.data_sha256 = data_hash;
        }
    }
    out
}

struct Rejection {
    reason: String,
    data_hash: Option<String>,
}

impl From<String> for Rejection {
    fn from(reason: String) -> Self {
        Self { reason, data_hash: None }
    }
}
impl From<&str> for Rejection {
    fn from(reason: &str) -> Self {
        reason.to_string().into()
    }
}

fn check(input: &Input, env: &Env, fetch: &dyn Fetch) -> Result<(String, String), Rejection> {
    // 1. Only the Horkos contract may use the verifier key: anyone else could
    //    otherwise have a seller's data key re-sealed to their own public key.
    if env.predecessor.as_deref() != Some(env.allowed_caller.as_str()) {
        return Err(format!("caller {:?} is not {}", env.predecessor, env.allowed_caller).into());
    }
    let sk = secret_key(env)?;

    // 2. Data key and the hash of the ciphertext it decrypts.
    let sealed = B64.decode(&input.sealed_key).map_err(|_| "sealed_key is not base64")?;
    let payload = sk.unseal(&sealed).map_err(|_| "sealed_key does not open with the verifier key")?;
    if payload.len() != 64 {
        return Err("sealed payload must be 64 bytes (key || sha256)".into());
    }
    let (key, expected_hash) = payload.split_at(32);

    // 3. Manifest → condition and ciphertext.
    let manifest: Manifest = serde_json::from_slice(&fetch.get(&input.delivery_ref, MAX_MANIFEST_BYTES)?)
        .map_err(|e| format!("manifest: {e}"))?;
    if manifest.v != 1 {
        return Err(format!("unsupported manifest version {}", manifest.v).into());
    }
    if manifest.order_id != input.order_id {
        return Err("manifest is for another order".into());
    }

    let condition = fetch.get(&manifest.condition_url, MAX_CONDITION_BYTES)?;
    let condition_hash = format!("sha256:{}", hex::encode(Sha256::digest(&condition)));
    if condition_hash != input.condition_hash {
        return Err("condition does not match the listing's condition_hash".into());
    }

    let ciphertext = fetch.get(&manifest.data_url, MAX_DATA_BYTES)?;
    let data_hash = Sha256::digest(&ciphertext);
    let data_hash_hex = hex::encode(data_hash);
    let reject = |reason: String| Rejection { reason, data_hash: Some(data_hash_hex.clone()) };
    if data_hash.as_slice() != expected_hash {
        return Err(reject("ciphertext hash does not match the sealed hash".into()));
    }

    // 4. Decrypt and check the condition.
    if ciphertext.len() <= NONCE_BYTES {
        return Err(reject("ciphertext too short".into()));
    }
    let (nonce, body) = ciphertext.split_at(NONCE_BYTES);
    let plaintext = XChaCha20Poly1305::new(key.into())
        .decrypt(XNonce::from_slice(nonce), body)
        .map_err(|_| reject("ciphertext does not decrypt with the sealed key".into()))?;
    let schema: Value = serde_json::from_slice(&condition).map_err(|e| reject(format!("condition is not JSON: {e}")))?;
    let instance: Value = serde_json::from_slice(&plaintext).map_err(|e| reject(format!("data is not JSON: {e}")))?;
    let validator = jsonschema::validator_for(&schema).map_err(|e| reject(format!("condition is not a valid JSON Schema: {e}")))?;
    if let Some(first) = validator.iter_errors(&instance).next() {
        return Err(reject(format!("schema: {} at {}", first, first.instance_path())));
    }

    // 5. Same 64 bytes, sealed to the buyer.
    let buyer: [u8; 32] = B64
        .decode(&input.buyer_pubkey)
        .map_err(|_| reject("buyer_pubkey is not base64".into()))?
        .try_into()
        .map_err(|_| reject("buyer_pubkey must be 32 bytes".into()))?;
    let sealed_for_buyer = PublicKey::from(buyer)
        .seal(&mut OsRng, &payload)
        .map_err(|_| reject("sealing for the buyer failed".into()))?;
    Ok((B64.encode(sealed_for_buyer), data_hash_hex))
}

fn truncate(mut s: String) -> String {
    if s.chars().count() > MAX_REASON_CHARS {
        s = s.chars().take(MAX_REASON_CHARS - 1).collect::<String>() + "…";
    }
    s
}

#[cfg(test)]
mod tests;
