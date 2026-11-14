<!-- Draft message to the OutLayer team (Discord or GitHub issue). Not sent; the project owner sends it. -->

**Testnet: executions never resolve and end at exactly 201 blocks (yield limit), for every caller since ~11:30 UTC 14 Nov**

Hi OutLayer team. We run a small verifier through `outlayer.testnet` for a NEAR hackathon project (Horkos, escrow for AI agent purchases). Since about 09:00 UTC on 14 Nov 2026 most of our runs fail the same way:

- The caller is our contract `escrow.horkos.testnet` (`request_execution`, WasmUrl source, pre-built `wasm32-wasip2`, sha256 `61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f`, secrets profile `verifier` / `horkos.testnet`, limits 10^10 instructions, 128 MB, 60 s, `payer_account_id` = the seller).
- Failed runs end **exactly 201 blocks (106 to 121 s) after `request_execution`**. `on_execution_response` logs `[[yNEAR charged: "1000000000000000000000"]]` and `Execution promise failed: Failed. Refunded 9000000000000000000000 yoctoNEAR` and returns `null`. No `execution_completed` event.
- Successful runs of the same WASM with the same kind of input resolve in 25 to 70 s; `execution_completed` reports about 35 M instructions and 4.9 to 6.4 s `time_ms`. Earlier on 14 Nov a direct `{"cmd":"pubkey"}` run (no network access) resolved in 45 blocks (tx `DzCN2kgbQ9Yv8oVaJU4Px8hUWDqVHWEXVe2SQNE64i22`).
- **It is not only us now.** From 12:07 to 12:27 UTC, 39 of 39 runs by other accounts (`tredio-oracle.testnet`, `zyx-dev.testnet`, `enclave.parry.testnet`; request ids 45008 to 45134) also ended at 201 blocks with "Execution promise failed". At 12:31 UTC our minimal `{"cmd":"pubkey"}` run from `horkos.testnet` (request **45170**, tx `F6dz4wBiha8hd8RmpTPQWkFWtYeq7iwLAxEcgDLCG1Qj`) failed the same way after 125 s.
- From 11:39 to 12:12 UTC, **49 of 49** attempts on five orders failed this way (request ids **44806 to 44865** and later); between 09:00 and 11:10 UTC 3 runs succeeded and about 12 failed.
- Failed request ids include **43883** (order 13, 09:10 UTC) and **44332** (order 14, ~10:27 UTC). Earlier successes for comparison: requests for orders 9, 15 and 18 (submit_delivery txs `4ctCVTTKZgiwBJJr7LydyURjGdnViVg2vSgjAPMbUuzP`, `RxQ68oH3LVJL7LCoPwYyLPbKb5sbHrRUbsDSzh7HANj`, `ChRyUnRFx5fe4zCzKetg46tZv35bQYA38imbnga9gwuX`).

Questions:
1. Is testnet worker or queue capacity down (runs are never picked up, or their result is never submitted before the yield times out)? Is there a status page we should watch?
2. Is there a recommended setting for contracts that call `request_execution`: resource limits, a different source type (e.g. a hosted WASM on OutLayer instead of a gist URL), or retry guidance?

Our contract handles the `null` result (the order returns to `Delivered` and the seller retries), so nothing is lost; we'd just like to settle more often. Thanks!
