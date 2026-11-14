<!-- Draft message to the OutLayer team (Discord or GitHub issue). Not sent; the project owner sends it. -->

**Testnet: some executions never resolve and end at exactly 201 blocks (yield limit)**

Hi OutLayer team. We run a small verifier through `outlayer.testnet` for a NEAR hackathon project (Horkos, escrow for AI agent purchases). Since about 09:00 UTC on 14 Nov 2026 most of our runs fail the same way:

- The caller is our contract `escrow.horkos.testnet` (`request_execution`, WasmUrl source, pre-built `wasm32-wasip2`, sha256 `61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f`, secrets profile `verifier` / `horkos.testnet`, limits 10^10 instructions, 128 MB, 60 s, `payer_account_id` = the seller).
- Failed runs end **exactly 201 blocks (106 to 121 s) after `request_execution`**. `on_execution_response` logs `[[yNEAR charged: "1000000000000000000000"]]` and `Execution promise failed: Failed. Refunded 9000000000000000000000 yoctoNEAR` and returns `null`. No `execution_completed` event.
- Successful runs of the same WASM with the same kind of input resolve in 25 to 70 s; `execution_completed` reports about 35 M instructions and 4.9 to 6.4 s `time_ms`. A direct `{"cmd":"pubkey"}` run resolves in 45 blocks. Other accounts' runs completed normally during the same minutes.
- Failed request ids include **43883** (order 13, 09:10 UTC) and **44332** (order 14, ~10:27 UTC); the full list of failed transactions is in https://github.com/iusserhat/horkos/blob/main/docs/testnet.md ("Hosted seller A on Render").

Questions:
1. Is this worker or queue capacity on testnet (the run is picked up too late), or something in our request?
2. Is there a recommended setting for contracts that call `request_execution`: resource limits, a different source type (e.g. a hosted WASM on OutLayer instead of a gist URL), or retry guidance?

Our contract handles the `null` result (the order returns to `Delivered` and the seller retries), so nothing is lost; we'd just like to settle more often. Thanks!
