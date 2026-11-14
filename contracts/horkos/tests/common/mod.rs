//! Shared by tests/invariants.rs and tests/attacks.rs. The same harness.rs is
//! copy of contracts/horkos-v2/tests/common/harness.rs (keep in sync).
#![allow(dead_code)]
pub use horkos as h;
pub const V2: bool = false;
include!("harness.rs");
