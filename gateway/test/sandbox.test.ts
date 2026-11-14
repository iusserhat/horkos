/**
 * Integration: a local NEAR sandbox with the real Horkos and token contracts
 * and mock-outlayer (Passthrough). The gateway runs from a config file against
 * two local "APIs": one returns data that matches the schema (order settles),
 * one does not (nothing is submitted, the order stays Open).
 * Prereqs: contracts/scripts/build.sh and the sandbox binary (see sdk/test/sandbox.ts).
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, it } from "node:test";
import { Account, HorkosAgent, HorkosOwner, HorkosSeller, KeyPair, generateBoxKeyPair, type Order } from "../../sdk/src/index.js";
import { LocalHttpStore, startSandbox, wasm, type Sandbox } from "../../sdk/test/sandbox.js";
import { loadConfig } from "../src/config.js";
import { Gateway } from "../src/gateway.js";

const TGAS = 10n ** 12n;
const NEAR = 10n ** 24n;
const USDC = 10n ** 6n;
const SCHEMA = { type: "object", required: ["usd", "last_updated_at"], properties: { usd: { type: "number" }, last_updated_at: { type: "integer" } } };

let sb: Sandbox;
let store: LocalHttpStore;
let api: Server;
let gw: Gateway;
let agent: HorkosAgent;
let seller: HorkosSeller;
let goodListing = "";
let badListing = "";
const apiCalls: string[] = [];
const logs: string[] = [];

async function deploy(name: string, file: string, init: string, args: object): Promise<Account> {
  const acc = await sb.account(name, 10);
  await acc.deployContract(wasm(file));
  await acc.callFunction({ contractId: acc.accountId, methodName: init, args, gas: 100n * TGAS });
  return acc;
}

before(async () => {
  sb = await startSandbox();
  store = new LocalHttpStore();
  await store.start();
  api = createServer((req, res) => {
    apiCalls.push(req.url!);
    const good = req.url!.startsWith("/good");
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ near: good ? { usd: 2.5, last_updated_at: 1763100000 } : { usd: "n/a" } }));
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  const apiBase = `http://127.0.0.1:${(api.address() as { port: number }).port}`;

  const keys = await generateBoxKeyPair();
  const ownerAcc = await sb.account("owner", 20);
  const sellerAcc = await sb.account("seller", 20);
  const adminAcc = await sb.account("admin", 20);
  const agentFull = await sb.account("agent", 5);
  const token = await deploy("token", "test_token", "new", { owner_id: ownerAcc.accountId, total_supply: String(1_000n * USDC) });
  const horkos = await deploy("horkos", "horkos", "new", { token: token.accountId, admin: adminAcc.accountId });
  const outlayer = await deploy("outlayer", "mock_outlayer", "new", {});
  await outlayer.callFunction({ contractId: outlayer.accountId, methodName: "set_mode", args: { mode: "Passthrough" } });
  for (const id of [horkos.accountId, sellerAcc.accountId])
    await ownerAcc.callFunction({ contractId: token.accountId, methodName: "storage_deposit", args: { account_id: id }, deposit: NEAR / 100n });
  await adminAcc.callFunction({
    contractId: horkos.accountId,
    methodName: "set_verifier",
    args: {
      config: {
        outlayer: outlayer.accountId, wasm_url: "https://example.test/verifier.wasm", wasm_hash: "ab".repeat(32), build_target: "wasm32-wasip1",
        encryption_pubkey: keys.publicKey, secrets_profile: null, secrets_account: null, min_fee: String(NEAR / 100n), max_fee: String(NEAR),
      },
    },
    deposit: NEAR / 10n,
  });
  const fc = KeyPair.fromRandom("ed25519");
  await agentFull.addFunctionCallAccessKey({ publicKey: fc.getPublicKey().toString(), contractId: horkos.accountId, methodNames: ["create_order", "cancel_order"], allowance: NEAR });
  const owner = new HorkosOwner({ contractId: horkos.accountId, account: ownerAcc });
  await owner.setMandate({ agent: agentFull.accountId, maxTotal: 100n * USDC, maxPerOrder: 10n * USDC, allowedSellers: [sellerAcc.accountId], expiresAtMs: Date.now() + 3_600_000, storageDeposit: NEAR });
  await owner.deposit(100n * USDC);
  agent = new HorkosAgent({ contractId: horkos.accountId, account: new Account(agentFull.accountId, sb.provider, fc.toString() as `ed25519:${string}`), owner: ownerAcc.accountId });

  // Listings registered the way `register` does it, then a config file pointing at them.
  seller = new HorkosSeller({ contractId: horkos.accountId, account: sellerAcc, store });
  const dir = mkdtempSync(join(tmpdir(), "horkos-gw-"));
  writeFileSync(join(dir, "schema.json"), JSON.stringify(SCHEMA));
  goodListing = (await seller.registerListing({ price: 5n * USDC, condition: SCHEMA, deliveryWindowMs: 3_600_000 })).listingId;
  badListing = (await seller.registerListing({ price: 5n * USDC, condition: SCHEMA, deliveryWindowMs: 3_600_000 })).listingId;
  const source = (path: string) => ({ url: `${apiBase}/${path}?order={order_id}&buyer={buyer}`, json_path: "near" });
  writeFileSync(
    join(dir, "horkos-gateway.json"),
    JSON.stringify({
      network: "testnet", contract: horkos.accountId, seller: sellerAcc.accountId, poll_ms: 1000,
      listings: [
        { listing_id: goodListing, condition_file: "schema.json", source: source("good") },
        { listing_id: badListing, condition_file: "schema.json", source: source("bad") },
      ],
    }),
  );
  gw = new Gateway({ loaded: loadConfig(join(dir, "horkos-gateway.json")), seller, store, log: (m) => logs.push(m) });
  await gw.start();
});

after(async () => {
  gw?.stop();
  await new Promise((r) => api?.close(r));
  await store?.stop();
  await sb?.stop();
});

async function until(orderId: string, pred: (o: Order) => boolean, ms = 30_000): Promise<Order> {
  const end = Date.now() + ms;
  for (;;) {
    const o = (await seller.getOrder(orderId))!;
    if (pred(o) || Date.now() > end) return o;
    await new Promise((r) => setTimeout(r, 500));
  }
}

it("passing source: the gateway delivers and the order settles", async () => {
  const { order } = await agent.buy({ listingId: goodListing });
  const o = await until(order.id, (x) => x.status === "Settled");
  assert.equal(o.status, "Settled");
  assert.ok(apiCalls.some((u) => u === `/good?order=${order.id}&buyer=${o.buyer}`));
});

it("failing source: nothing is submitted and the order stays Open", async () => {
  const { order } = await agent.buy({ listingId: badListing });
  await until(order.id, () => gw.outcomes.has(order.id));
  assert.equal(gw.outcomes.get(order.id)?.kind, "rejected");
  const o = (await seller.getOrder(order.id))!;
  assert.equal(o.status, "Open");
  assert.equal(o.delivery_ref, null);
  assert.equal(o.attempts, 0);
  assert.ok(logs.some((l) => l.includes(`order ${order.id}: NOT delivered`)));
});
