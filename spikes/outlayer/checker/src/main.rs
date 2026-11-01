//! SPIKE: OutLayer delivery checker (WASI P1).
//!
//! stdin:  {"schema": <JSON Schema subset>, "data": <any JSON>}
//! stdout: {"valid": bool, "errors": [..max 3..], "input_sha256": "<hex>"}
//!
//! Supported keywords: type, required, properties, additionalProperties
//! (bool), items, minItems, maxItems, minLength, maxLength, minimum,
//! maximum, enum. Output stays well under OutLayer's 900-byte limit.

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::io::{self, Read, Write};

const MAX_ERRORS: usize = 3;
const MAX_ERROR_LEN: usize = 120;

fn main() {
    let mut raw = Vec::new();
    let out = match io::stdin().read_to_end(&mut raw) {
        Ok(_) => run(&raw),
        Err(e) => json!({"valid": false, "errors": [format!("stdin: {e}")]}),
    };
    let mut stdout = io::stdout();
    stdout.write_all(out.to_string().as_bytes()).unwrap();
    stdout.flush().unwrap();
}

fn run(raw: &[u8]) -> Value {
    let input_sha256 = hex(&Sha256::digest(raw));
    let parsed: Value = match serde_json::from_slice(raw) {
        Ok(v) => v,
        Err(e) => return result(false, vec![format!("input is not JSON: {e}")], &input_sha256),
    };
    let (Some(schema), Some(data)) = (parsed.get("schema"), parsed.get("data")) else {
        return result(false, vec!["input needs `schema` and `data`".into()], &input_sha256);
    };
    let mut errors = Vec::new();
    check(schema, data, "$", &mut errors);
    result(errors.is_empty(), errors, &input_sha256)
}

fn result(valid: bool, mut errors: Vec<String>, input_sha256: &str) -> Value {
    errors.truncate(MAX_ERRORS);
    for e in errors.iter_mut() {
        e.truncate(MAX_ERROR_LEN);
    }
    json!({"valid": valid, "errors": errors, "input_sha256": input_sha256})
}

fn check(schema: &Value, data: &Value, path: &str, errors: &mut Vec<String>) {
    let Some(s) = schema.as_object() else { return };
    if let Some(t) = s.get("type").and_then(Value::as_str) {
        if !type_matches(t, data) {
            errors.push(format!("{path}: expected {t}"));
            return;
        }
    }
    if let Some(options) = s.get("enum").and_then(Value::as_array) {
        if !options.contains(data) {
            errors.push(format!("{path}: not in enum"));
        }
    }
    match data {
        Value::Object(obj) => check_object(s, obj, path, errors),
        Value::Array(arr) => {
            if let Some(min) = s.get("minItems").and_then(Value::as_u64) {
                if (arr.len() as u64) < min {
                    errors.push(format!("{path}: fewer than {min} items"));
                }
            }
            if let Some(max) = s.get("maxItems").and_then(Value::as_u64) {
                if (arr.len() as u64) > max {
                    errors.push(format!("{path}: more than {max} items"));
                }
            }
            if let Some(item_schema) = s.get("items") {
                for (i, item) in arr.iter().enumerate() {
                    check(item_schema, item, &format!("{path}[{i}]"), errors);
                }
            }
        }
        Value::String(st) => {
            let len = st.chars().count() as u64;
            if let Some(min) = s.get("minLength").and_then(Value::as_u64) {
                if len < min {
                    errors.push(format!("{path}: shorter than {min}"));
                }
            }
            if let Some(max) = s.get("maxLength").and_then(Value::as_u64) {
                if len > max {
                    errors.push(format!("{path}: longer than {max}"));
                }
            }
        }
        Value::Number(n) => {
            let x = n.as_f64().unwrap_or(f64::NAN);
            if let Some(min) = s.get("minimum").and_then(Value::as_f64) {
                if x < min {
                    errors.push(format!("{path}: below {min}"));
                }
            }
            if let Some(max) = s.get("maximum").and_then(Value::as_f64) {
                if x > max {
                    errors.push(format!("{path}: above {max}"));
                }
            }
        }
        _ => {}
    }
}

fn check_object(s: &Map<String, Value>, obj: &Map<String, Value>, path: &str, errors: &mut Vec<String>) {
    if let Some(req) = s.get("required").and_then(Value::as_array) {
        for key in req.iter().filter_map(Value::as_str) {
            if !obj.contains_key(key) {
                errors.push(format!("{path}: missing `{key}`"));
            }
        }
    }
    let props = s.get("properties").and_then(Value::as_object);
    for (key, value) in obj {
        match props.and_then(|p| p.get(key)) {
            Some(sub) => check(sub, value, &format!("{path}.{key}"), errors),
            None => {
                if s.get("additionalProperties") == Some(&Value::Bool(false)) {
                    errors.push(format!("{path}: unexpected `{key}`"));
                }
            }
        }
    }
}

fn type_matches(t: &str, v: &Value) -> bool {
    match t {
        "object" => v.is_object(),
        "array" => v.is_array(),
        "string" => v.is_string(),
        "integer" => v.as_i64().is_some() || v.as_u64().is_some(),
        "number" => v.is_number(),
        "boolean" => v.is_boolean(),
        "null" => v.is_null(),
        _ => false,
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
