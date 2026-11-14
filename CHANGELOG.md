# Changelog

## v0.2.0 (14 Nov 2026)

### Added
- Escrow contract v2 (`contracts/horkos-v2`, deployed as `escrow-v2.horkos.testnet`): transferable receipts (NEP-171 `nft_transfer` / `nft_transfer_call`, NEP-178 approvals, NEP-297 events). Refunds go to the current holder; final receipts are frozen; `set_receipt_pubkey`; `get_receipt_holder`. ADR-036. v1 unchanged.
- CI (GitHub Actions): contract, verifier, TypeScript, sandbox tests and the sandbox demo on every push.
- `scripts/reproduce-verifier.sh`: rebuilds the verifier WASM and compares its sha256 with the pinned hash.

## v0.1.0 (14 Nov 2026), NEAR Hackathon release

Testnet only.

### Added
- Escrow contract (`contracts/horkos`): on-chain mandates (per-order and total caps, allowed sellers, expiry, open-order cap, storage deposit), listings, orders with NEP-171 receipts (non-transferable), verification through NEAR OutLayer with per-order verifier pinning, timeout refunds, internal balances and `withdraw`.
- Test token tUSDC (`contracts/test-token`) and a capped faucet (`contracts/faucet`, 20 tUSDC per account per day).
- Verifier v0 (`verifier/`, WASI P2) running in OutLayer's TEE: checks caller, hashes and JSON Schema, re-seals the data key to the buyer.
- TypeScript SDK (`sdk/`): `HorkosOwner`, `HorkosAgent`, `HorkosSeller`, encryption, FastFS storage.
- MCP server (`mcp/`) with five tools.
- Seller gateway (`gateway/`): serve a listing from a JSON API by config, with local schema check.
- Demo seller services and scenarios (`demo/`), including a hosted seller A service (`demo/sellers/hosted.ts`, `render.yaml`).
- Website (`web/`): product page, try page, market, agent setup guide, live explorer; https://horkos-escrow.netlify.app.
- Documentation in `docs/` ([docs/README.md](docs/README.md)).

### Deployed on testnet
- `escrow.horkos.testnet`, `tusdc.horkos.testnet`, `faucet.horkos.testnet`; verifier version 0. Transactions: [docs/testnet.md](docs/testnet.md).
