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

### A separate report: a testnet run that failed without a reason

Separate from the trust-model question, one of our testnet runs failed with no reason given, while runs before and after it worked:

- Time: 2026-11-13 14:04:23 UTC (block 277519809).
- Transaction: `JEGNjxrQbVSbfLSYio1v7DsPgS9PRH9HRbRtutLAYfKx` (signer `horkos-seller-a.testnet`, `submit_delivery` on `escrow.horkos.testnet`, which calls `outlayer.testnet` `request_execution`).
- OutLayer request id: 38907 (from the `execution_requested` event). Code source: `WasmUrl`, sha256 `61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f`, `secrets_ref` profile `verifier` / `horkos.testnet`.
- What we saw on chain: `[[yNEAR charged: "1000000000000000000000"]]`, then `Execution promise failed: Failed. Refunded 9000000000000000000000 yoctoNEAR`; no `execution_completed` event; our callback received no result. We don't know the dashboard execution id for this run.
- Context: a pubkey run of the same WASM with the same secret five minutes later worked (tx `295DUEG27RrHV2H3C3jHNqrG7QV44DEybt5rvbYadhbR`), and resubmitting the same delivery settled (attempt 2). Earlier the same day (about 12:00–12:49 UTC) every testnet run failed with "Failed to submit to NEAR: the chain did not take resolve_execution ... Smart contract panicked at src/execution.rs:1052:14: Execution request not found".

Question: is there a way for a calling contract, or for us off-chain, to learn why a run failed (an error code in the callback, or a public endpoint by request id)?

Thanks for building OutLayer. Happy to share more details about our setup if useful.
