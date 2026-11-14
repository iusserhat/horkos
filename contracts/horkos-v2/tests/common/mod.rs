//! Shared by tests/invariants.rs and tests/attacks.rs. The same harness.rs is
//! used for v1 (contracts/horkos/tests/common).
#![allow(dead_code)]
pub use horkos_v2 as h;
pub const V2: bool = true;
include!("harness.rs");
