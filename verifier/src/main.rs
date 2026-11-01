//! WASI entry point: stdin JSON → stdout JSON (see lib.rs for the protocol).
//!
//! In OutLayer (target `wasm32-wasip2`) URLs are fetched over WASI HTTP and
//! must be `https://`. Built natively (local tests only), `file://` URLs are
//! read from disk instead.

use horkos_verifier::{run, Env, Fetch};
use std::io::{self, Read, Write};

/// The only account allowed to call the verifier. Compiled in, so it is
/// pinned by the WASM hash that the Horkos contract stores.
const ALLOWED_CALLER: &str = match option_env!("HORKOS_CONTRACT") {
    Some(c) => c,
    None => "escrow.horkos.testnet",
};

#[cfg(target_os = "wasi")]
struct HttpFetch;

#[cfg(target_os = "wasi")]
impl Fetch for HttpFetch {
    fn get(&self, url: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
        let mut url = url.to_string();
        for _ in 0..4 {
            if !url.starts_with("https://") {
                return Err(format!("only https URLs are fetched: {url}"));
            }
            let res = wasi_http_client::Client::new()
                .get(&url)
                .send()
                .map_err(|e| format!("GET {url}: {e}"))?;
            match res.status() {
                200 => {
                    let body = res.body().map_err(|e| format!("GET {url}: {e}"))?;
                    if body.len() > max_bytes {
                        return Err(format!("{url} is larger than {max_bytes} bytes"));
                    }
                    return Ok(body);
                }
                301 | 302 | 303 | 307 | 308 => {
                    url = res
                        .headers()
                        .iter()
                        .find(|(k, _)| k.eq_ignore_ascii_case("location"))
                        .map(|(_, v)| v.clone())
                        .ok_or_else(|| format!("GET {url}: redirect without Location"))?;
                }
                s => return Err(format!("GET {url}: HTTP {s}")),
            }
        }
        Err("too many redirects".into())
    }
}

#[cfg(not(target_os = "wasi"))]
struct FileFetch;

#[cfg(not(target_os = "wasi"))]
impl Fetch for FileFetch {
    fn get(&self, url: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
        let path = url
            .strip_prefix("file://")
            .ok_or_else(|| format!("native build reads file:// URLs only: {url}"))?;
        let bytes = std::fs::read(path).map_err(|e| format!("{path}: {e}"))?;
        if bytes.len() > max_bytes {
            return Err(format!("{url} is larger than {max_bytes} bytes"));
        }
        Ok(bytes)
    }
}

fn main() {
    let mut raw = Vec::new();
    let _ = io::stdin().read_to_end(&mut raw);
    let env = Env {
        predecessor: std::env::var("NEAR_PREDECESSOR_ID").ok(),
        allowed_caller: ALLOWED_CALLER.to_string(),
        secret_hex: std::env::var("PROTECTED_VERIFIER_SK").ok(),
    };
    #[cfg(target_os = "wasi")]
    let out = run(&raw, &env, &HttpFetch);
    #[cfg(not(target_os = "wasi"))]
    let out = run(&raw, &env, &FileFetch);
    let mut stdout = io::stdout();
    let _ = stdout.write_all(out.to_string().as_bytes());
    let _ = stdout.flush();
}
