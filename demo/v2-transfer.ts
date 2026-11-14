/**
 * v2 on testnet: a transferred receipt settles and the NEW holder opens the data.
 *
 *   cd demo && npx tsx v2-transfer.ts
 *
 * Contract escrow-v2.horkos.testnet (transferable receipts, verifier version 1).
 * 1. Seller B registers a listing with the market-data schema (30-minute window).
 * 2. The buyer's agent orders it; receipt minted to the buyer.
 * 3. The buyer transfers the receipt to the holder account.
 * 4. The holder sets its own X25519 key on the receipt (set_receipt_pubkey).
 * 5. Seller B delivers live NEAR/USD prices; OutLayer's TEE verifies; Settled.
 * 6. The holder opens the data; the buyer's original key cannot.
 *
 * Keys come from the near-cli legacy keychain; the holder's X25519 key is kept
 * in ~/.horkos/v2-holder-box.json (mode 600), never in the repo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FastFsStore, HorkosAgent, HorkosSeller, generateBoxKeyPair, openDeliveryFrom, type Order } from "../sdk/src/index.js";
import { account } from "./config.js";
import { MARKET_SCHEMA, PROFILES } from "./sellers/profiles.js";

const CONTRACT = "escrow-v2.horkos.testnet";
const BUYER = "hk-v2buyer-1114.testnet";
const AGENT = "hk-v2agent-1114.testnet";
const HOLDER = "hk-v2holder-1114.testnet";
const SELLER = "horkos-seller-b.testnet";
const TGAS = 10n ** 12n;
const holderOf = async (id: string) => {
  const r = await fetch("https://rpc.testnet.fastnear.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "optimistic", account_id: CONTRACT, method_name: "get_receipt_holder", args_base64: Buffer.from(JSON.stringify({ order_id: id })).toString("base64") } }),
  });
  return JSON.parse(Buffer.from((await r.json()).result.result).toString()) as string;
};
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const sellerAcc = account(SELLER);
const seller = new HorkosSeller({ contractId: CONTRACT, account: sellerAcc, store: new FastFsStore(sellerAcc) });
const agent = new HorkosAgent({ contractId: CONTRACT, account: account(AGENT), owner: BUYER });
const buyerAcc = account(BUYER);
const holderAcc = account(HOLDER);

const verifier = await agent.getVerifier();
log(`verifier version ${verifier?.version}, wasm ${verifier?.config.wasm_hash}`);
if (verifier?.version !== 1) throw new Error("expected verifier version 1 (the v2 build)");

const listing = await seller.registerListing({ price: 5_000_000n, condition: MARKET_SCHEMA, deliveryWindowMs: 30 * 60_000 });
log(`listing ${listing.listingId} (${listing.conditionHash})`);

const { order, buyerKeys } = await agent.buy({ listingId: listing.listingId, maxPrice: 5_000_000n, verifierVersion: 1 });
log(`order ${order.id} ${order.status}; receipt holder ${await holderOf(order.id)}`);

await buyerAcc.callFunction({ contractId: CONTRACT, methodName: "nft_transfer", args: { receiver_id: HOLDER, token_id: order.id, memo: "v2 settle demo" }, deposit: 1n, gas: 30n * TGAS });
log(`receipt transferred; holder ${await holderOf(order.id)}`);

const holderKeys = await generateBoxKeyPair();
const dir = join(homedir(), ".horkos");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "v2-holder-box.json"), JSON.stringify({ [order.id]: holderKeys }), { mode: 0o600 });
await holderAcc.callFunction({ contractId: CONTRACT, methodName: "set_receipt_pubkey", args: { order_id: order.id, buyer_pubkey: holderKeys.publicKey }, deposit: 1n, gas: 30n * TGAS });
log("holder set its own key on the receipt");

let after: Order | null = null;
for (let attempt = 1; attempt <= 6; attempt++) {
  const data = await PROFILES.a.data();
  log(`attempt ${attempt}: delivering ${JSON.stringify(data)}`);
  after = await seller.submitDelivery({ orderId: order.id, data, conditionUrl: listing.conditionUrl });
  log(`after verification: ${after.status}`);
  if (after.status === "Settled") break;
  await new Promise((r) => setTimeout(r, 20_000));
}
if (after?.status !== "Settled" || !after.encrypted_key || !after.delivery_ref) throw new Error("not settled");

const delivery = { orderId: after.id, deliveryRef: after.delivery_ref, encryptedKey: after.encrypted_key };
const plain = new TextDecoder().decode(await openDeliveryFrom(delivery, holderKeys));
log(`NEW holder opened the data: ${plain}`);
try {
  await openDeliveryFrom(delivery, buyerKeys);
  log("UNEXPECTED: the original buyer key opened it too");
} catch {
  log("the original buyer key cannot open it (sealed to the holder's key)");
}
