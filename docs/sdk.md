# TypeScript SDK

`sdk/` (TypeScript, near-api-js 7.3.1, libsodium). Three role clients on top of a shared read client. Source: `sdk/src`; tests: `sdk/test` (6 on a local node, 5 end-to-end through the native verifier).

```bash
cd sdk && npm ci
```

Import from the repository (the package is not published to npm):

```ts
import { Account, JsonRpcProvider, FastFsStore, HorkosAgent, HorkosOwner, HorkosSeller } from "./sdk/src/index.js";
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });
```

Amounts are token base units (tUSDC: 6 decimals, so `5_000_000n` = 5 tUSDC). Each client takes `{ contractId, account, provider? }`; `account` signs that role's transactions.

## HorkosClient (shared reads)

| Method | Returns |
| --- | --- |
| `getOrder(id)` | `Order \| null` |
| `getListing(id)` | `Listing \| null` |
| `getMandate(owner)` | `Mandate \| null` |
| `getVerifier()` | Latest `{version, config}` or `null` |
| `getVerifierVersion(n)` | `VerifierConfig \| null` |
| `listOrderIds(from = 0, limit = 100)` | Order ids via `nft_tokens`, oldest first |

## HorkosOwner (the human; full-access key)

| Method | Contract call |
| --- | --- |
| `setMandate({agent, maxTotal, maxPerOrder, allowedSellers, expiresAtMs, maxOpenOrders?, storageDeposit})` | `set_mandate`; `storageDeposit` in yoctoNEAR (≈ 0.0152 NEAR per order) |
| `deposit(amount)` | Token `ft_transfer_call` to the escrow |
| `revoke()` | `revoke_mandate` |

```ts
const owner = new HorkosOwner({ contractId: "escrow.horkos.testnet", account: new Account("me.testnet", provider, ownerKey) });
await owner.setMandate({
  agent: "me-agent.testnet", maxTotal: 20_000_000n, maxPerOrder: 10_000_000n,
  allowedSellers: ["horkos-seller-a.testnet"], expiresAtMs: Date.now() + 7 * 86_400_000,
  storageDeposit: 5n * 10n ** 23n, // 0.5 NEAR
});
await owner.deposit(20_000_000n);
```

## HorkosAgent (function-call key)

Options add `owner`: the mandate whose budget it spends.

| Method | What it does |
| --- | --- |
| `buy({listingId, maxPrice?, verifierVersion?, buyerKeys?})` | Reads the listing, refuses locally if the price is above `maxPrice`, generates an X25519 buyer key pair if none is given, calls `create_order` pinned to the current verifier. Returns `{order, buyerKeys}`; keep `buyerKeys`, they are not on chain |
| `cancel(orderId)` | `cancel_order` |
| `waitForSettlement(orderId, {timeoutMs = 120000, intervalMs = 2000, until?})` | Polls until a final status (or one in `until`); keeps polling while a lagging RPC node does not see a new order yet |
| `openDelivery(orderOrId, buyerKeys)` | Opens `encrypted_key`, downloads the ciphertext, checks its sha256 against the sealed hash, decrypts. Throws on mismatch |
| `openDeliveryJson(orderOrId, buyerKeys)` | `openDelivery` + JSON parse |

```ts
const agent = new HorkosAgent({ contractId: "escrow.horkos.testnet", account: new Account("me-agent.testnet", provider, fcKey), owner: "me.testnet" });
const { order, buyerKeys } = await agent.buy({ listingId: "0", maxPrice: "10000000" });
const done = await agent.waitForSettlement(order.id, { timeoutMs: 5 * 60_000 });
if (done.status === "Settled") console.log(await agent.openDeliveryJson(done, buyerKeys));
```

## HorkosSeller

Options add `store: BlobStore` (where ciphertext, conditions and manifests go; `FastFsStore(account)` on testnet).

| Method | What it does |
| --- | --- |
| `registerListing({price, condition, deliveryWindowMs, storageDeposit?})` | Publishes `JSON.stringify(condition)` to the store, hashes it (`sha256:<hex>`), calls `register_listing`. Returns `{listingId, conditionHash, conditionUrl}` |
| `onOrder(handler, {intervalMs = 2000})` | Polls for `Open` orders of this seller and calls `handler` once per order. Returns a stop function |
| `submitDelivery({orderId, data, conditionUrl, fee?})` | Encrypts, uploads ciphertext and manifest, seals the key to the order's pinned verifier, calls `submit_delivery` with `fee` (default `min_fee`), waits for finality. Returns the order (`Settled` or `Delivered`) |
| `withdraw(amount?)` | `withdraw(Earnings)` |
| `earnings()` | `balance_of` |

```ts
const acc = new Account("seller.testnet", provider, sellerKey);
const seller = new HorkosSeller({ contractId: "escrow.horkos.testnet", account: acc, store: new FastFsStore(acc) });
const { listingId, conditionUrl } = await seller.registerListing({ price: 5_000_000n, condition: schema, deliveryWindowMs: 10 * 60_000 });
seller.onOrder(async (o) => { await seller.submitDelivery({ orderId: o.id, data: await fetchData(), conditionUrl }); });
```

## Lower-level helpers

`prepareDelivery`, `openDeliveryFrom`, `generateBoxKeyPair`, `encryptData`, `decryptData`, `sealPayload`, `openPayload`, `sha256`, `toHex` (`sdk/src/crypto.ts`, `seller.ts`, `agent.ts`), and the `BlobStore` interface for other storage.

## Tests

```bash
contracts/scripts/test-sandbox.sh       # builds the WASM and the local node first
(cd sdk && npm test)                    # 6 tests on a local node
(cd sdk && npm run test:verifier)       # 5 tests through the native verifier
```
