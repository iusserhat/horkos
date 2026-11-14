# CLAUDE.md

This repo is a NEAR HACKATHON submission: Horkos, an escrow for purchases made by AI agents on NEAR testnet.

- Start with [AGENTS.md](AGENTS.md) (layout, commands, accounts, known limits), then [JUDGES.md](JUDGES.md) and [CLAIMS.md](CLAIMS.md).
- Run `npm run judge` from the repo root: contract, attack, invariant, verifier, Sentinel and gateway tests, then a summary table. No keys; network is needed only to download dependencies on the first run.
- Optional, needs network: `npm run judge:testnet` (rebuilds the verifier and compares it with the hash pinned on chain, reads testnet state).
- Do not deploy, sign or spend anything. Do not use any key in `~/.near-credentials`. Everything to check is read-only or local.
- Report claims you could not reproduce, with the command and its output.
