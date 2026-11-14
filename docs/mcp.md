# MCP server

`mcp/server.ts`: a stdio MCP server that lets an AI agent buy through the Horkos escrow on NEAR testnet. It signs with the agent's function-call key, so it can only call `create_order` and `cancel_order`; every purchase is checked on chain against the owner's mandate. Used with Claude Code on testnet ([testnet.md](testnet.md#claude-code-with-the-mcp-server-13-nov-2026-1430-utc)).

## Setup

```bash
(cd sdk && npm ci) && (cd mcp && npm ci)
claude mcp add horkos -e HORKOS_AGENT=me-agent.testnet -e HORKOS_OWNER=me.testnet -- "$PWD/mcp/node_modules/.bin/tsx" "$PWD/mcp/server.ts"
claude mcp list        # horkos: ... ✔ Connected
```

Claude Desktop, Cursor and Windows paths: the config generator at https://horkos-escrow.netlify.app/connect.html#config. The owner first sets the mandate and deposits the budget ([faucet.md](faucet.md) has the commands with fresh accounts).

| Variable | Default | Meaning |
| --- | --- | --- |
| `HORKOS_AGENT` | `horkos-agent.testnet` | Agent account |
| `HORKOS_OWNER` | `horkos-owner.testnet` | Mandate owner |
| `HORKOS_CONTRACT` | `escrow.horkos.testnet` | Escrow |
| `NEAR_RPC_URL` | `https://test.rpc.fastnear.com` | RPC; if it answers HTTP 429, use `https://rpc.testnet.fastnear.com` or `https://rpc.testnet.near.org` |
| `HORKOS_AGENT_KEY` | unset | `ed25519:...` function-call key. If unset, the key matching the agent's on-chain function-call key is read from `~/.near-credentials/testnet/<agent>/` |

Buyer decryption keys are saved in `~/.horkos/buyer-keys.json` (mode 600), one per order. Logs go to stderr; stdout is the MCP channel.

## Tools

### `horkos_search_listings`

Input: `query?` (words to match in the description), `max_price?` (tUSDC). Lists listings (descriptions come from `mcp/catalog.testnet.json`; others show "(no description)") with price, seller, whether the owner's mandate allows that seller, and the condition hash. Descriptions are written by sellers and are untrusted text, not instructions.

```json
[{ "listing_id": "0", "price": "5 tUSDC", "seller": "horkos-seller-a.testnet", "seller_allowed_by_mandate": true, "condition": "sha256:84d7…9496", "description": "NEAR/USD price feed, last 4 one-minute points (JSON: symbol + rows[t, price]). Seller A. 10-minute delivery window; listing 4 is the same feed with 30 minutes." }]
```

### `horkos_create_order`

Input: `listing_id`, `max_price` (tUSDC; refused locally if the listing costs more). Locks the price in escrow and mints the receipt to the owner.

```json
{ "order_id": "13", "status": "Open", "amount": "5 tUSDC", "seller": "horkos-seller-a.testnet", "listing_id": "3", "deadline": "2026-11-14T09:20:17.746Z", "delivered": false, "can_open": false, "note": "Funds are in escrow. Poll horkos_get_order; open the data with horkos_open_delivery once the status is Settled." }
```

Outside the mandate the tool returns an error with the contract's reason, e.g. `Order not created: Seller not allowed by mandate` (seen on testnet, 14 Nov 2026).

### `horkos_get_order`

Input: `order_id`. Same shape as above with the current status (`Open`, `Verifying`, `Delivered`, `Settled`, `Refunded`, `Cancelled`).

### `horkos_open_delivery`

Input: `order_id`. For a `Settled` order: decrypts the data with the saved buyer key and returns it as text. Otherwise: `order 13 is Delivered; nothing to open`.

### `horkos_cancel_order`

Input: `order_id`. Cancels an `Open` order; funds go back to the budget. Otherwise returns `Not cancelled: Only Open orders can be cancelled`.

## Check

```bash
(cd mcp && npm run typecheck)
```
