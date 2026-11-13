# Progress (updated 13 Nov 2026, ~16:15 TSİ)

Deadline: 14 Nov 23:59 UTC. Decision point 20:00 TSİ today: if OutLayer testnet still fails, the video uses the sandbox demo and README says so (already worded in the Status table).

Done: contract + token on testnet, SDK, demo 3 on testnet. Verifier v0 on a public gist (sha256 `61370b57…`), secret `PROTECTED_VERIFIER_SK` created by the owner (WasmHash + build lock). OutLayer testnet outage since ~12:00 UTC (`docs/TESTNET.md`). Sandbox fallback works: `cd demo && npm run sandbox` runs demos 1–3 with mock-outlayer `Worker` mode + native verifier. README status/step 6 and `docs/DEMO_CHECKLIST.md` written.

Running: retry script (scratchpad `retry.sh`), pubkey call every 30 min, 4 tries from 15:14.

Next:
1. If a retry succeeds: `set_verifier` v0 (values in `docs/VERIFIER_SETUP.md`), demos 1–2 on testnet, tx ids → `docs/TESTNET.md`, README status.
2. Verify README "Try it" from a fresh clone (needs a local commit first).
3. Agent key rotation (owner approves), record video. MCP only after owner approval.
