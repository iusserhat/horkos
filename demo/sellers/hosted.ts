/**
 * Hosted seller A (Render free tier, testnet only). Stateless: every poll reads
 * the chain, so a restart or a second instance is safe.
 *
 *   SELLER_ACCOUNT_ID=horkos-seller-a.testnet SELLER_PRIVATE_KEY=ed25519:... npm run hosted
 *
 * Each POLL_MS (default 15 s) it reads every order. For this seller's orders on
 * a served listing (LISTINGS, default "0,3") that are Open, or Delivered after a
 * failed OutLayer run, and have at least MIN_REMAINING_MS (default 150 s) of
 * delivery window left, it fetches live CoinGecko data, checks it against the
 * listing's schema locally (never submits data that fails), and calls
 * submit_delivery with the verifier fee. A Delivered order is retried with
 * backoff (15, 30, 60, 120, 120... s) until the window is almost over: OutLayer
 * testnet sometimes fails a run and returns no result (order 13, 14 Nov 2026).
 * Never a double submit: the contract refuses a submit while one is Verifying,
 * and that refusal is logged as "already delivered", not as an error.
 *
 * HTTP on $PORT: GET /health (JSON; 503 when the last poll is older than
 * 2 minutes or the account holds less than 1 NEAR), GET / (one line).
 * Secrets are read from the environment and never logged or returned.
 */
import { createServer } from "node:http";
import { Account, FastFsStore, HorkosSeller, JsonRpcProvider, type Order } from "../../sdk/src/index.js";
import { compileCondition, type Check } from "../../gateway/src/validate.js";
import { sha256, toHex } from "../../sdk/src/index.js";
import { PROFILES } from "./profiles.js";

const VERSION = "hosted-seller 0.2.1";
const env = process.env;
const NETWORK = env.NETWORK ?? "testnet";
const CONTRACT = env.CONTRACT ?? "escrow.horkos.testnet";
const SELLER = env.SELLER_ACCOUNT_ID ?? "";
const KEY = env.SELLER_PRIVATE_KEY ?? "";
const FASTFS = "https://test.fastfs.io/horkos-seller-a.testnet/outlayer.testnet";

/** Listings seller A can serve: where the condition lives and how the data is made. */
const CATALOG: Record<string, { conditionUrl: string; data: () => Promise<unknown> }> = {
  // Demo listing: last 4 NEAR/USD points from CoinGecko's market_chart.
  "0": { conditionUrl: `${FASTFS}/84d788383d9e3a888a6a8e0852ba7500c72aac1d6a05d41e7d92a7b7a0a39496.json`, data: async () => PROFILES.a.data() },
  // Gateway listing: CoinGecko simple/price for NEAR (gateway/examples/coingecko.json).
  "3": {
    conditionUrl: `${FASTFS}/2abb3e2b80f1f421eb7937b1463d277aafdc817a89b12f84b25564bd1d3aca50.json`,
    data: async () => {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd&include_last_updated_at=true", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      return ((await res.json()) as { near: unknown }).near;
    },
  },
};
const LISTINGS = (env.LISTINGS ?? env.LISTING_ID ?? "0,3").split(",").map((s) => s.trim()).filter(Boolean);
const RPC_URLS = (env.RPC_URLS ?? "https://rpc.testnet.fastnear.com,https://rpc.testnet.near.org").split(",").map((s) => s.trim()).filter(Boolean);
const POLL_MS = Number(env.POLL_MS ?? 15_000);
/** Do not start a verification with less window than this: OutLayer took up to ~110 s on testnet. */
const MIN_REMAINING_MS = Number(env.MIN_REMAINING_MS ?? 150_000);
const BACKOFF_MS = [15_000, 30_000, 60_000, 120_000];
const WITHDRAW = env.WITHDRAW === "1";
const PORT = Number(env.PORT ?? 8080);
const ONE_NEAR = 10n ** 24n;
const STALE_MS = 120_000;

/** Problems shown on /health (no secrets: URLs, order ids and error texts only). */
const PROBLEMS = new Set(["retry", "not_delivered", "verification_failed", "delivery_failed", "poll_failed", "startup_failed"]);
const counts: Record<string, number> = {};
let lastProblem: Record<string, unknown> | null = null;

/** One JSON line per event; values are never secrets. */
const log = (event: string, fields: Record<string, unknown> = {}) => {
  const line = { t: new Date().toISOString(), event, ...fields };
  counts[event] = (counts[event] ?? 0) + 1;
  if (PROBLEMS.has(event)) lastProblem = line;
  console.log(JSON.stringify(line));
};

if (NETWORK !== "testnet") throw new Error("NETWORK must be testnet");
if (!SELLER) throw new Error("SELLER_ACCOUNT_ID is not set");
if (!KEY.startsWith("ed25519:")) throw new Error("SELLER_PRIVATE_KEY is not set or does not start with ed25519:");
for (const id of LISTINGS) if (!CATALOG[id]) throw new Error(`listing ${id} is not one this service can serve (${Object.keys(CATALOG).join(", ")})`);

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
  listings: LISTINGS,
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
/** Earliest next attempt per order (backoff after a failed verification). Memory only; a restart retries at once, which is safe. */
const nextTry = new Map<string, number>();
const conditions = new Map<string, { url: string; check: Check }>();

/** Loads each served listing's condition and checks it is the one fixed on chain. */
async function loadConditions(): Promise<void> {
  for (const id of LISTINGS) {
    const listing = await withRetry(`get_listing ${id}`, (c) => c.seller.getListing(id));
    if (!listing) throw new Error(`listing ${id} does not exist on ${CONTRACT}`);
    if (listing.seller !== SELLER) throw new Error(`listing ${id} belongs to ${listing.seller}, not ${SELLER}`);
    const url = CATALOG[id].conditionUrl;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`condition for listing ${id}: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hash = `sha256:${toHex(sha256(bytes))}`;
    if (hash !== listing.condition_hash) throw new Error(`condition for listing ${id} hashes to ${hash}, the listing has ${listing.condition_hash}`);
    conditions.set(id, { url, check: compileCondition(JSON.parse(new TextDecoder().decode(bytes))) });
  }
}

function wants(o: Order, nowMs: number): boolean {
  if (Number(BigInt(o.deadline) / 1_000_000n) - nowMs < MIN_REMAINING_MS) return false;
  if (o.status === "Open") return true;
  return o.status === "Delivered" && nowMs >= (nextTry.get(o.id) ?? 0);
}

async function deliver(o: Order): Promise<void> {
  inflight.add(o.id);
  const cond = conditions.get(o.listing_id)!;
  try {
    const data = await CATALOG[o.listing_id].data();
    const checked = cond.check(data);
    if (!checked.ok) {
      nextTry.set(o.id, Date.now() + 60_000);
      log("not_delivered", { order: o.id, reason: "data fails the listing's schema", errors: checked.errors });
      return;
    }
    log("delivering", { order: o.id, listing: o.listing_id, status: o.status, attempts: o.attempts, buyer: o.buyer });
    const after = await withRetry(`submit_delivery ${o.id}`, (c) => c.seller.submitDelivery({ orderId: o.id, data, conditionUrl: cond.url }));
    health.last_delivery_at = new Date().toISOString();
    if (after.status === "Delivered") {
      const wait = BACKOFF_MS[Math.min(after.attempts - 1, BACKOFF_MS.length - 1)];
      nextTry.set(o.id, Date.now() + wait);
      log("verification_failed", { order: o.id, attempts: after.attempts, retry_in_s: wait / 1000, note: "OutLayer gave no valid result; will retry while the window allows" });
    } else {
      nextTry.delete(o.id);
      log("delivered", { order: o.id, status: after.status, attempts: after.attempts });
    }
  } catch (e) {
    const m = msg(e);
    if (isAlreadyDelivered(m)) log("already_delivered", { order: o.id });
    else if (/Delivery deadline has passed/.test(m)) log("too_late", { order: o.id });
    else {
      nextTry.set(o.id, Date.now() + 30_000);
      log("delivery_failed", { order: o.id, error: m });
    }
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
  const nowMs = Date.now();
  let open = 0;
  const todo: Order[] = [];
  for (const id of ids) {
    if (done.has(id) || inflight.has(id)) continue;
    const o = await withRetry(`get_order ${id}`, (c) => c.seller.getOrder(id));
    if (!o) continue;
    if (o.seller !== SELLER || !LISTINGS.includes(o.listing_id) || ["Settled", "Refunded", "Cancelled"].includes(o.status)) {
      done.add(id);
      continue;
    }
    if (o.status === "Open" || o.status === "Verifying") open++;
    if (wants(o, nowMs)) todo.push(o);
  }
  health.open_orders = open;
  // In parallel, so one slow verification does not hold up other buyers; the
  // RPC retry covers nonce clashes between them.
  for (const o of todo) void deliver(o);

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
      await loadConditions();
      break;
    } catch (e) {
      log("startup_failed", { error: msg(e), retry_in_s: 30 });
      await sleep(30_000);
    }
  }
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
    res.writeHead(health.ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ...health, events: counts, last_problem: lastProblem }));
    return;
  }
  if (path === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end(`Horkos testnet seller ${SELLER}, listings ${LISTINGS.join(", ")} on ${CONTRACT}. Status: /health\n`);
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, () => log("started", { seller: SELLER, contract: CONTRACT, listings: LISTINGS, min_remaining_ms: MIN_REMAINING_MS, rpc: RPC_URLS, poll_ms: POLL_MS, port: PORT, version: VERSION }));

void loop();
