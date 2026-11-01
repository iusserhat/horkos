use super::*;
use std::collections::HashMap;

const CALLER: &str = "escrow.horkos.testnet";

struct MapFetch(HashMap<String, Vec<u8>>);
impl Fetch for MapFetch {
    fn get(&self, url: &str, max: usize) -> Result<Vec<u8>, String> {
        let b = self.0.get(url).cloned().ok_or_else(|| format!("GET {url}: HTTP 404"))?;
        if b.len() > max {
            return Err("too large".into());
        }
        Ok(b)
    }
}

fn schema() -> Value {
    json!({
        "type": "object",
        "required": ["symbol", "rows"],
        "properties": {
            "symbol": {"type": "string"},
            "rows": {"type": "array", "minItems": 1, "items": {
                "type": "object", "required": ["t", "price"],
                "properties": {"t": {"type": "integer"}, "price": {"type": "number", "minimum": 0}}
            }}
        }
    })
}

struct Fixture {
    verifier: SecretKey,
    buyer: SecretKey,
    fetch: MapFetch,
    input: Input,
    key: [u8; 32],
    ciphertext: Vec<u8>,
}

fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Vec<u8> {
    let nonce = [7u8; NONCE_BYTES];
    let mut out = nonce.to_vec();
    out.extend(XChaCha20Poly1305::new(key.into()).encrypt(XNonce::from_slice(&nonce), plaintext).unwrap());
    out
}

/// A delivery as the SDK builds it: manifest + condition + ciphertext,
/// `K || sha256(ciphertext)` sealed to the verifier.
fn fixture(data: Value) -> Fixture {
    let verifier = SecretKey::generate(&mut OsRng);
    let buyer = SecretKey::generate(&mut OsRng);
    let key = [42u8; 32];
    let ciphertext = encrypt(&key, data.to_string().as_bytes());
    let condition = schema().to_string().into_bytes();
    let mut payload = key.to_vec();
    payload.extend(Sha256::digest(&ciphertext));
    let sealed = verifier.public_key().seal(&mut OsRng, &payload).unwrap();
    let manifest = json!({"v": 1, "order_id": "7", "data_url": "https://x/data", "condition_url": "https://x/cond"});
    let fetch = MapFetch(HashMap::from([
        ("https://x/manifest".to_string(), manifest.to_string().into_bytes()),
        ("https://x/cond".to_string(), condition.clone()),
        ("https://x/data".to_string(), ciphertext.clone()),
    ]));
    let input = Input {
        order_id: "7".into(),
        attempt: 1,
        delivery_ref: "https://x/manifest".into(),
        sealed_key: B64.encode(sealed),
        condition_hash: format!("sha256:{}", hex::encode(Sha256::digest(&condition))),
        buyer_pubkey: B64.encode(buyer.public_key().as_bytes()),
    };
    Fixture { verifier, buyer, fetch, input, key, ciphertext }
}

fn env(f: &Fixture) -> Env {
    Env {
        predecessor: Some(CALLER.into()),
        allowed_caller: CALLER.into(),
        secret_hex: Some(hex::encode(f.verifier.to_bytes())),
    }
}

fn good_data() -> Value {
    json!({"symbol": "NEAR/USD", "rows": [{"t": 1, "price": 2.5}, {"t": 2, "price": 2.6}]})
}

fn assert_rejected(out: &Output, needle: &str) {
    assert!(!out.valid, "expected rejection, got {out:?}");
    assert!(out.buyer_sealed_key.is_none());
    let reason = out.reason.as_deref().unwrap_or_default();
    assert!(reason.contains(needle), "reason {reason:?} should contain {needle:?}");
}

#[test]
fn valid_delivery_is_resealed_to_the_buyer() {
    let f = fixture(good_data());
    let out = verify(&f.input, &env(&f), &f.fetch);
    assert!(out.valid, "{out:?}");
    assert_eq!(out.order_id, "7");
    assert_eq!(out.attempt, 1);
    assert_eq!(out.data_sha256.as_deref(), Some(hex::encode(Sha256::digest(&f.ciphertext)).as_str()));
    let opened = f.buyer.unseal(&B64.decode(out.buyer_sealed_key.unwrap()).unwrap()).unwrap();
    assert_eq!(&opened[..32], &f.key);
    assert_eq!(&opened[32..], Sha256::digest(&f.ciphertext).as_slice());
}

#[test]
fn data_that_fails_the_schema_is_rejected() {
    let f = fixture(json!({"symbol": "NEAR/USD", "rows": [{"time": "yesterday", "price": "2.5"}]}));
    let out = verify(&f.input, &env(&f), &f.fetch);
    assert_rejected(&out, "schema:");
    assert!(out.data_sha256.is_some(), "hash reported for diagnostics");
}

#[test]
fn data_that_is_not_json_is_rejected() {
    let mut f = fixture(good_data());
    let ct = encrypt(&f.key, b"not json at all");
    let mut payload = f.key.to_vec();
    payload.extend(Sha256::digest(&ct));
    f.input.sealed_key = B64.encode(f.verifier.public_key().seal(&mut OsRng, &payload).unwrap());
    f.fetch.0.insert("https://x/data".into(), ct);
    assert_rejected(&verify(&f.input, &env(&f), &f.fetch), "data is not JSON");
}

#[test]
fn only_the_horkos_contract_may_call() {
    let f = fixture(good_data());
    let mut e = env(&f);
    e.predecessor = Some("attacker.testnet".into());
    assert_rejected(&verify(&f.input, &e, &f.fetch), "is not escrow.horkos.testnet");
    e.predecessor = None;
    assert_rejected(&verify(&f.input, &e, &f.fetch), "is not escrow.horkos.testnet");
}

#[test]
fn missing_secret_key_is_rejected() {
    let f = fixture(good_data());
    let mut e = env(&f);
    e.secret_hex = None;
    assert_rejected(&verify(&f.input, &e, &f.fetch), "secret key not available");
}

#[test]
fn key_sealed_to_another_verifier_is_rejected() {
    let f = fixture(good_data());
    let mut e = env(&f);
    e.secret_hex = Some(hex::encode(SecretKey::generate(&mut OsRng).to_bytes()));
    assert_rejected(&verify(&f.input, &e, &f.fetch), "does not open");
}

#[test]
fn swapped_ciphertext_is_rejected() {
    let mut f = fixture(good_data());
    let other = encrypt(&f.key, good_data().to_string().as_bytes());
    let mut other = other;
    other[NONCE_BYTES] ^= 1;
    f.fetch.0.insert("https://x/data".into(), other);
    assert_rejected(&verify(&f.input, &env(&f), &f.fetch), "ciphertext hash does not match");
}

#[test]
fn wrong_key_with_matching_hash_does_not_decrypt() {
    let mut f = fixture(good_data());
    let mut payload = vec![9u8; 32];
    payload.extend(Sha256::digest(&f.ciphertext));
    f.input.sealed_key = B64.encode(f.verifier.public_key().seal(&mut OsRng, &payload).unwrap());
    assert_rejected(&verify(&f.input, &env(&f), &f.fetch), "does not decrypt");
}

#[test]
fn condition_other_than_the_listing_is_rejected() {
    let mut f = fixture(good_data());
    f.fetch.0.insert("https://x/cond".into(), b"{}".to_vec()); // "anything goes"
    assert_rejected(&verify(&f.input, &env(&f), &f.fetch), "condition does not match");
}

#[test]
fn manifest_for_another_order_is_rejected() {
    let mut f = fixture(good_data());
    f.input.order_id = "8".into();
    assert_rejected(&verify(&f.input, &env(&f), &f.fetch), "another order");
}

#[test]
fn unreachable_data_is_rejected() {
    let mut f = fixture(good_data());
    f.fetch.0.remove("https://x/data");
    assert_rejected(&verify(&f.input, &env(&f), &f.fetch), "HTTP 404");
}

#[test]
fn oversized_data_is_rejected() {
    let mut f = fixture(good_data());
    f.fetch.0.insert("https://x/data".into(), vec![0; MAX_DATA_BYTES + 1]);
    assert_rejected(&verify(&f.input, &env(&f), &f.fetch), "too large");
}

#[test]
fn outputs_fit_outlayers_900_byte_limit() {
    let f = fixture(good_data());
    let ok = run(serde_json::to_string(&json!({
        "order_id": f.input.order_id, "attempt": 1, "delivery_ref": f.input.delivery_ref,
        "sealed_key": f.input.sealed_key, "condition_hash": f.input.condition_hash,
        "buyer_pubkey": f.input.buyer_pubkey,
    })).unwrap().as_bytes(), &env(&f), &f.fetch);
    assert_eq!(ok["valid"], true);
    assert!(ok.to_string().len() <= 900, "{} bytes", ok.to_string().len());

    let long = "x".repeat(10_000);
    let mut e = env(&f);
    e.predecessor = Some(long);
    let bad = serde_json::to_value(verify(&f.input, &e, &f.fetch)).unwrap();
    assert!(bad.to_string().len() <= 900, "{} bytes", bad.to_string().len());
}

#[test]
fn pubkey_command_prints_the_public_key() {
    let f = fixture(good_data());
    let out = run(br#"{"cmd":"pubkey"}"#, &env(&f), &f.fetch);
    assert_eq!(out["pubkey"], B64.encode(f.verifier.public_key().as_bytes()));
}

#[test]
fn malformed_input_is_rejected_without_panicking() {
    let f = fixture(good_data());
    assert_eq!(run(b"not json", &env(&f), &f.fetch)["valid"], false);
    let out = run(br#"{"order_id":"7","attempt":1}"#, &env(&f), &f.fetch);
    assert_eq!(out["valid"], false);
    assert_eq!(out["order_id"], "7");
}
