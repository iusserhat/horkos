# Seller gateway

`gateway/` turns an existing JSON API into a Horkos listing without writing seller code. For every `Open` order on a configured listing it calls the API, checks the answer against the listing's JSON Schema **locally**, and only then submits the encrypted delivery. If the check fails, nothing is submitted: the order stays `Open` and is refunded at its deadline, and the seller pays no verifier fee.

Testnet proof (listing 3, order 12 `Settled`, 14 Nov 2026): [TESTNET.md](TESTNET.md#seller-gateway-configuration-only-14-nov-2026-0856-utc).

## Five-minute setup (testnet)

1. A testnet account with a key in the near-cli legacy keychain (`~/.near-credentials/testnet/<seller>.json`), or the key in `HORKOS_SELLER_KEY=ed25519:...`. The account needs a little NEAR for gas and the listing's storage deposit (0.1 NEAR).
2. Install: `cd gateway && npm ci`.
3. Copy `examples/coingecko.json` and `examples/coingecko-schema.json`, set `seller` to your account, and point `source` at your API.
4. Dry run, no chain access: `npm run gateway -- check --config my.json`. It calls the API once per listing and prints `OK` with the data, or `FAIL` with the schema errors. Exit code 1 on failure.
5. Create the listing: `npm run gateway -- register --config my.json`. It publishes the schema to FastFS, calls `register_listing`, and writes `listing_id` and `condition_url` back into the file.
6. Serve orders: `npm run gateway -- run --config my.json` (the default command). It polls for `Open` orders every `poll_ms` and logs one line per order. Stop with Ctrl-C.

A buyer's agent can then buy the listing with the SDK or the MCP server (`horkos_buy`).

## Config reference

One JSON file, **no secrets**. Paths are relative to the config file.

| Field | Type | Notes |
| --- | --- | --- |
| `network` | `"testnet"` | The only accepted value. |
| `contract` | string | Escrow contract, e.g. `escrow.horkos.testnet`. |
| `seller` | string | Seller account; must own every listing. |
| `rpc_url` | string, optional | Default `https://test.rpc.fastnear.com`. |
| `poll_ms` | integer ≥ 1000, optional | Default 5000. |
| `listings` | array, non-empty | See below. |
| `listings[].listing_id` | decimal string | Existing listing. Either this or `create`. |
| `listings[].condition_file` | path | JSON Schema; must hash to the listing's `condition_hash`. |
| `listings[].condition_url` | string, optional | Written by `register`; uploaded at start if missing. |
| `listings[].create.price_tusdc` | number > 0 | Used by `register`. |
| `listings[].create.deliver_within_min` | integer > 0 | Delivery window. |
| `listings[].create.condition_file` | path | Schema for the new listing. |
| `listings[].create.description` | string, optional | Local note only; not stored on chain. |
| `listings[].source.url` | http(s) URL | May contain `{order_id}`, `{buyer}`, `{listing_id}`, `{env:NAME}` (order values are URL-encoded). |
| `listings[].source.method` | `"GET"` \| `"POST"` | Default `GET`. |
| `listings[].source.headers` | object of strings | A value may be `env:NAME` or contain placeholders. |
| `listings[].source.body` | any JSON, POST only | String values may be `env:NAME` or contain placeholders. |
| `listings[].source.json_path` | string | Part of the response to deliver, e.g. `data.items[0]`; `""` or `$` = whole body. |
| `listings[].source.timeout_ms` | integer > 0 | Default 15000. |

The config is checked as a whole and every problem is listed in one error.

## What happens per order

1. Skip if the listing is not in the config or the delivery deadline has passed.
2. Call the source (response capped at 1 MB, must be JSON), select `json_path`.
3. Validate with ajv (draft-07, or 2020-12 when `$schema` says so).
4. Pass: `submit_delivery` (the SDK encrypts the data, stores it on FastFS, and the contract asks the OutLayer verifier). Fail: log `NOT delivered` with the reasons; nothing is sent.
5. A network error, timeout, HTTP 429 or 5xx is retried once after 15 s; other errors are not retried.

At start, each listing is checked against the chain: it exists, belongs to `seller`, and its `condition_hash` equals the hash of `condition_file`. A mismatch stops the gateway.

## Security notes

- Secrets never go in the config. Use `env:NAME` / `{env:NAME}`; a URL with a literal `key=`, `token=` or `secret=` query value is rejected.
- Error messages show the URL template, never resolved secret values.
- The seller key is read from `HORKOS_SELLER_KEY` or the local keychain and never written anywhere. The testnet proof used a full-access key on a dedicated seller account; narrower keys were not tested.
- The local check is a convenience for the seller. What decides payment is the verifier in OutLayer's TEE, against the condition fixed at listing time.
- Reselling a third party's data commercially needs that provider's permission; CoinGecko in the example is a data source, not a partner.

## Tests

```bash
cd gateway && npm ci
npm test                 # 17 unit tests: config, placeholders, fake HTTP server, schema check, Gateway.handle
npm run test:sandbox     # 2 tests on a local node (after contracts/scripts/test-sandbox.sh built the WASM): passing source settles, failing source submits nothing
```
