// Writes web/public/snapshot-v1.json and snapshot-v2.json: receipts, orders,
// listings, verifier versions, mandates and (v2) receipt transfers, read from
// testnet. The explorer shows the snapshot at once and then updates from live
// RPC, so it is never empty when the RPC rate-limits a visitor.
//
//   cd web && npm run snapshot
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RPCS = ["https://rpc.testnet.fastnear.com", "https://test.rpc.fastnear.com"];
const CONTRACTS = { v1: "escrow.horkos.testnet", v2: "escrow-v2.horkos.testnet" };
const DEMO_OWNER = "horkos-owner.testnet";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(payload) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = RPCS[attempt % RPCS.length];
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const body = await res.json();
        if (!body.error) return body;
      }
    } catch {
      /* try the next endpoint */
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(`RPC failed: ${JSON.stringify(payload).slice(0, 120)}`);
}

async function view(contract, method, args = {}) {
  const body = await rpc({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } });
  if (body.result?.error) throw new Error(body.result.error);
  return JSON.parse(Buffer.from(body.result.result).toString());
}

async function transfers(contract) {
  const out = {};
  const list = await (await fetch(`https://api-testnet.nearblocks.io/v1/account/${contract}/txns-only?per_page=100&order=desc`)).json();
  const txs = (list.txns ?? []).filter((t) => t.outcomes?.status === true && (t.actions ?? []).some((a) => a.method === "nft_transfer"));
  for (const t of txs) {
    const body = await rpc({ jsonrpc: "2.0", id: 1, method: "tx", params: { tx_hash: t.transaction_hash, sender_account_id: t.signer_account_id, wait_until: "NONE" } });
    const fc = body.result?.transaction?.actions?.find((a) => a.FunctionCall?.method_name === "nft_transfer")?.FunctionCall;
    if (!fc) continue;
    const args = JSON.parse(Buffer.from(fc.args, "base64").toString());
    (out[args.token_id] ??= []).push({ from: t.signer_account_id, to: args.receiver_id, tx: t.transaction_hash, t: Number(BigInt(t.block_timestamp) / 1_000_000n) });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
  return out;
}

for (const [key, contract] of Object.entries(CONTRACTS)) {
  const total = Number(await view(contract, "nft_total_supply"));
  const tokens = [];
  for (let from = 0; from < total; from += 50) tokens.push(...(await view(contract, "nft_tokens", { from_index: String(from), limit: 50 })));
  const orders = [];
  for (const t of tokens) {
    const o = await view(contract, "get_order", { order_id: t.token_id });
    // The sealed key is public on chain but not needed here; keep only whether it exists.
    if (o) orders.push({ ...o, encrypted_key: o.encrypted_key ? "on-chain" : null });
  }
  orders.sort((a, b) => Number(b.id) - Number(a.id));
  const listings = [];
  for (let id = 0; id < 200; id++) {
    const l = await view(contract, "get_listing", { listing_id: String(id) });
    if (!l) break;
    listings.push({ ...l, id: String(id) });
  }
  const latest = await view(contract, "get_verifier");
  const verifiers = [];
  for (let v = 0; latest && v <= latest.version; v++) verifiers.push({ ...(await view(contract, "get_verifier_version", { version: v })), version: v });
  const owners = [...new Set([DEMO_OWNER, ...orders.map((o) => o.buyer), ...tokens.map((t) => t.owner_id)])];
  const mandates = {};
  for (const o of owners) mandates[o] = await view(contract, "get_mandate", { owner: o });
  const snap = { contract, takenAt: Date.now(), tokens, orders, listings, verifiers, mandates, transfers: key === "v2" ? await transfers(contract) : {} };
  const file = resolve(import.meta.dirname, "..", "public", `snapshot-${key}.json`);
  writeFileSync(file, JSON.stringify(snap) + "\n");
  console.log(`snapshot-${key}.json: ${contract}, ${orders.length} orders, ${listings.length} listings, ${verifiers.length} verifier version(s), ${Object.keys(snap.transfers).length} transferred receipt(s), ${new Date(snap.takenAt).toISOString()}`);
}
