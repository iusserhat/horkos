# Horkos documentation

Horkos is an escrow protocol for AI agent purchases on NEAR testnet: the price is locked in one contract and recorded as an NFT receipt, the seller is paid only when the delivery passes a machine-checkable condition checked in NEAR OutLayer's TEE, and otherwise the money returns after the deadline. Everything here describes what runs in this repository and on testnet today.

## Start here

| You are | Read |
| --- | --- |
| **Hackathon judge** | [faq.md](faq.md), then [architecture.md](architecture.md) and the transaction evidence in [testnet.md](testnet.md). To try it yourself: [faucet.md](faucet.md) and [mcp.md](mcp.md), or the [Try page](https://horkos-escrow.netlify.app/try.html) |
| **Agent developer** | [mcp.md](mcp.md) (connect an MCP agent), [sdk.md](sdk.md) (`HorkosAgent`, `HorkosOwner`), [contract-api.md](contract-api.md) (`create_order`, `set_mandate`) |
| **Data seller** | [gateway.md](gateway.md) (serve a listing from your API by config), [sdk.md](sdk.md) (`HorkosSeller`), [verifier.md](verifier.md) (what your delivery must pass) |
| **Security reviewer** | [security.md](security.md) (enforced rules, threat model, trusted parties, secret scan), [contract-api.md](contract-api.md), [verifier.md](verifier.md), [decisions.md](decisions.md), [../SECURITY.md](../SECURITY.md) |

## All documents

| Document | Contents |
| --- | --- |
| [architecture.md](architecture.md) | Components, order state machine, sequence diagrams, delivery protocol, trust model, fees and storage |
| [contract-api.md](contract-api.md) | Every public method of the escrow: caller, arguments, deposit, gas, exact error messages, events, views, NFT behaviour |
| [sdk.md](sdk.md) | TypeScript SDK reference with examples |
| [mcp.md](mcp.md) | MCP server setup and its five tools |
| [gateway.md](gateway.md) | Seller gateway: setup, config reference, security notes |
| [faucet.md](faucet.md) | tUSDC faucet: rules, methods, commands |
| [verifier.md](verifier.md) | What the TEE verifier checks, version pinning, how v0 was published |
| [testnet.md](testnet.md) | Accounts, deployments, transaction evidence |
| [security.md](security.md) | Enforced rules, threat model, known limitations, secret scan |
| [decisions.md](decisions.md) | Architecture decision records |
| [faq.md](faq.md) | Questions judges ask |
| [tr/](tr/) | Turkish originals of the design and decisions |
| [internal/](internal/) | Working notes, not product documentation |
| [brand/](brand/), [screenshots/](screenshots/) | Logo files, website screenshots |

Also at the root: [README](../README.md) (quick start, tests), [CHANGELOG](../CHANGELOG.md), [SECURITY](../SECURITY.md), [LICENSE](../LICENSE).
