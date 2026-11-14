/**
 * Hosted seller A (Render free tier, testnet only). Stateless: every poll reads
 * the chain, so a restart or a second instance is safe.
 *
 *   SELLER_ACCOUNT_ID=horkos-seller-a.testnet SELLER_PRIVATE_KEY=ed25519:... npm run hosted
 *
 * Each POLL_MS (default 15 s) it reads every order, and for this seller's orders
 * on LISTING_ID that are Open (or Delivered with attempts < MAX_ATTEMPTS, e.g.
 * after a failed OutLayer run) and still inside the delivery window, it fetches
 * live CoinGecko data and calls submit_delivery with the verifier fee. The
 * contract refuses a second submit while one is Verifying, and that refusal
 * is logged as "already delivered", not as an error.
 *
 * HTTP on $PORT: GET /health (JSON; 503 when the last poll is older than
 * 2 minutes or the account holds less than 1 NEAR), GET / (one line).
 * Secrets are read from the environment and never logged or returned.
 */
import { createServer } from "node:http";
import { Account, FastFsStore, HorkosSeller, JsonRpcProvider, type Order } from "../../sdk/src/index.js";
import { PROFILES } from "./profiles.js";

const VERSION = "hosted-seller 0.1.0";
const env = process.env;
const NETWORK = env.NETWORK ?? "testnet";
const CONTRACT = env.CONTRACT ?? "escrow.horkos.testnet";
const SELLER = env.SELLER_ACCOUNT_ID ?? "";
const KEY = env.SELLER_PRIVATE_KEY ?? "";
const LISTING_ID = env.LISTING_ID ?? "0";
const CONDITION_URL =
  env.CONDITION_URL ??
  "https://test.fastfs.io/horkos-seller-a.testnet/outlayer.testnet/84d788383d9e3a888a6a8e0852ba7500c72aac1d6a05d41e7d92a7b7a0a39496.json";
const RPC_URLS = (env.RPC_URLS ?? "https://rpc.testnet.fastnear.com,https://rpc.testnet.near.org").split(",").map((s) => s.trim()).filter(Boolean);
const POLL_MS = Number(env.POLL_MS ?? 15_000);
const MAX_ATTEMPTS = Number(env.MAX_ATTEMPTS ?? 2);
const WITHDRAW = env.WITHDRAW === "1";
const PORT = Number(env.PORT ?? 8080);
const ONE_NEAR = 10n ** 24n;
const STALE_MS = 120_000;

/** One JSON line per event; values are never secrets. */
const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));

if (NETWORK !== "testnet") throw new Error("NETWORK must be testnet");
if (!SELLER) throw new Error("SELLER_ACCOUNT_ID is not set");
if (!KEY.startsWith("ed25519:")) throw new Error("SELLER_PRIVATE_KEY is not set or does not start with ed25519:");

// One seller client per RPC URL; on an RPC error the next one is used.
const clients = RPC_URLS.map((url) => {
  const account = new Account(SELLER, new JsonRpcProvider({ url }), KEY as `ed25519:${string}`);
  return { url, account, seller: new HorkosSeller({ contractId: CONTRACT, account, store: new FastFsStore(account) }) };
});
let current = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
/** Contract refusals: retrying cannot help. */
const isFinal = (m: string) => /Smart contract panicked|ExecutionError|FunctionCallError/.test(m);
const isAlreadyDelivered = (m: string) => /A verification is already in progress|Order cannot accept a delivery/.test(m);

/** Runs `fn` with backoff (1, 2, 4 s), moving to the next RPC URL after each failure. */
async function withRetry<T>(what: string, fn: (c: (typeof clients)[number]) => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    const c = clients[current];
    try {
      return await fn(c);
    } catch (e) {
      const m = msg(e);
      if (isFinal(m) || i + 1 >= tries) throw e;
      current = (current + 1) % clients.length;
      log("retry", { what, rpc: c.url, next_rpc: clients[current].url, attempt: i + 1, error: m });
      await sleep(1000 * 2 ** i);
    }
  }
}

const health = {
  ok: false,
  seller: SELLER,
  listing_id: LISTING_ID,
  last_poll_at: null as string | null,
  last_delivery_at: null as string | null,
  open_orders: 0,
  near_balance: null as string | null,
  version: VERSION,
};
let balanceYocto = 0n;
let lastPollMs = 0;
/** Orders that can never need us again (other seller, other listing, final status). Memory only. */
const done = new Set<string>();
const inflight = new Set<string>();

function wants(o: Order, nowNs: bigint): boolean {
  if (BigInt(o.deadline) <= nowNs) return false;
  if (o.status === "Open") return true;
  return o.status === "Delivered" && o.attempts < MAX_ATTEMPTS;
}

async function deliver(o: Order): Promise<void> {
  inflight.add(o.id);
  try {
    const data = await PROFILES.a.data();
    log("delivering", { order: o.id, status: o.status, attempts: o.attempts, buyer: o.buyer });
    const after = await withRetry(`submit_delivery ${o.id}`, (c) => c.seller.submitDelivery({ orderId: o.id, data, conditionUrl: CONDITION_URL }));
    health.last_delivery_at = new Date().toISOString();
    log("delivered", { order: o.id, status: after.status });
  } catch (e) {
    const m = msg(e);
    if (isAlreadyDelivered(m)) log("already_delivered", { order: o.id });
    else if (/Delivery deadline has passed/.test(m)) log("too_late", { order: o.id });
    else log("delivery_failed", { order: o.id, error: m });
  } finally {
    inflight.delete(o.id);
  }
}

async function poll(): Promise<void> {
  const ids: string[] = [];
  for (let from = 0; ; from += 100) {
    const page = await withRetry("nft_tokens", (c) => c.seller.listOrderIds(from, 100));
    ids.push(...page);
    if (page.length < 100) break;
  }
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  let open = 0;
  const todo: Order[] = [];
  for (const id of ids) {
    if (done.has(id) || inflight.has(id)) continue;
    const o = await withRetry(`get_order ${id}`, (c) => c.seller.getOrder(id));
    if (!o) continue;
    if (o.seller !== SELLER || o.listing_id !== LISTING_ID || ["Settled", "Refunded", "Cancelled"].includes(o.status)) {
      done.add(id);
      continue;
    }
    if (o.status === "Open" || o.status === "Verifying") open++;
    if (wants(o, nowNs)) todo.push(o);
  }
  health.open_orders = open;
  for (const o of todo) await deliver(o);

  balanceYocto = await withRetry("balance", (c) => c.account.getBalance());
  health.near_balance = (Number(balanceYocto / 10n ** 21n) / 1000).toFixed(3);
  if (WITHDRAW) {
    const earned = BigInt(await withRetry("balance_of", (c) => c.seller.earnings()));
    if (earned > 0n) {
      await withRetry("withdraw", (c) => c.seller.withdraw());
      log("withdrew", { units: earned.toString() });
    }
  }
  lastPollMs = Date.now();
  health.last_poll_at = new Date(lastPollMs).toISOString();
}

async function loop(): Promise<void> {
  for (;;) {
    try {
      await poll();
    } catch (e) {
      log("poll_failed", { error: msg(e) });
    }
    await sleep(POLL_MS);
  }
}

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/health") {
    health.ok = Date.now() - lastPollMs < STALE_MS && balanceYocto >= ONE_NEAR;
    res.writeHead(health.ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(health));
    return;
  }
  if (path === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end(`Horkos testnet seller ${SELLER}, listing ${LISTING_ID} on ${CONTRACT}. Status: /health\n`);
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => log("started", { seller: SELLER, contract: CONTRACT, listing: LISTING_ID, rpc: RPC_URLS, poll_ms: POLL_MS, port: PORT, version: VERSION }));

void loop();
