# Security policy

## Scope

Horkos runs on **NEAR testnet only**: `escrow.horkos.testnet`, `tusdc.horkos.testnet`, `faucet.horkos.testnet`, the verifier WASM pinned in the escrow, and the code in this repository (contracts, verifier, SDK, MCP server, gateway, demo, website). There is no mainnet deployment and no real money at stake. Known limitations and the trust model are listed in [docs/security.md](docs/security.md); reports about those are still welcome.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: the **Security** tab of this repository → **Report a vulnerability** (a GitHub security advisory). Do not open a public issue for a vulnerability.

Include the affected component, steps to reproduce, and the impact. Please test only against testnet and your own accounts, and do not disrupt other users' orders.

We aim to acknowledge reports within a few days. This is a hackathon project maintained by a small team, so there is no bug bounty.
