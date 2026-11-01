<!--
Draft GitHub issue for https://github.com/out-layer/outlayer/issues/new
Not sent automatically; the project owner submits it manually.
Title line below goes into the issue title field; everything after the
horizontal rule goes into the body.
-->

**Title:** Trust model question: full-access keys on the operator account that can call `resolve_execution`

---

Hi OutLayer team. We're building on OutLayer for a NEAR hackathon project (Horkos, an escrow protocol for AI agent purchases, NEAR testnet). Before we describe the trust model to our users, we'd like to check that we've read it correctly.

### What we observed

1. The docs say only registered TEE worker keys can finalize results:
   > "This key is added to the main OutLayer contract and is the **only key authorized** to call `resolve_execution` to finalize execution results."
   — https://app.outlayer.ai/docs/tee-attestation

2. In the contract source, `resolve_execution` and `submit_execution_output_and_resolve` check the predecessor against `operator_id`:
   - `contract/src/lib.rs`, `fn assert_operator` (`env::predecessor_account_id() == self.operator_id`)
   - `contract/src/execution.rs`, `resolve_execution` / `submit_execution_output_and_resolve`

3. `get_config` returns the operator account:
   ```
   near contract call-function as-read-only outlayer.near get_config json-args '{}' network-config mainnet now
   # ["owner.outlayer.near", "worker.outlayer.near"]
   ```
   Same on testnet: `["owner.outlayer.testnet", "worker.outlayer.testnet"]`.

4. Each operator account has **3 full-access keys** alongside the function-call keys scoped to `resolve_execution` etc.:
   ```
   near account list-keys worker.outlayer.near network-config mainnet now
   near account list-keys worker.outlayer.testnet network-config testnet now
   ```
   (Checked 1 Nov 2026.)

5. The calling contract's callback receives only the output (`ExecutionResponse` carries `success`, `output`, `error`, `resources_used`; no signature, quote or code hash), so a contract can't tell a TEE-produced result from one submitted another way.

### Our reading

A holder of one of those full-access keys could sign a `resolve_execution` call with any result without going through a TEE, and calling contracts can't tell the difference on-chain. The TEE attestation is still published and can be checked off-chain after the fact.

### Questions

1. Is this reading correct?
2. What are the full-access keys on `worker.outlayer.near` / `worker.outlayer.testnet` used for (deployment, upgrades, key rotation)? Is there a plan to remove them or move control to a multisig, DAO or timelock?
3. The trust-verification docs mention that results are "signed by the worker key". Is that per-result signature exposed somewhere a contract or an off-chain verifier can check it?
4. Is this an accurate way for us to describe the trust model to our users?
   > "Verification runs in OutLayer's TEE; the contract trusts OutLayer's operator for the result; the TEE attestation can be verified off-chain afterwards."

Thanks for building OutLayer. Happy to share more details about our setup if useful.
