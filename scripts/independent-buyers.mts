/**
 * Lists buyers on the Horkos contracts that are not the team's own test
 * accounts, with their orders and create_order transactions.
 *
 *   cd demo && npx tsx ../scripts/independent-buyers.mts
 *
 * Team accounts: the list below (every account named in docs/testnet.md).
 * Read-only: NEAR RPC views and the NearBlocks API. Prints "independent buyers: 0"
 * when there are none.
 */
const RPC = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
const CONTRACTS = ["escrow.horkos.testnet", "escrow-v2.horkos.testnet"];
const TEAM = new Set([
  "horkos.testnet", "horkos-owner.testnet", "horkos-agent.testnet",
  "horkos-seller-a.testnet", "horkos-seller-b.testnet", "horkos-seller-c.testnet",
  "hk-judge-1114.testnet", "hk-judge-1114-agent.testnet",
  "hk-try1-1252.testnet", "hk-try1-1252-agent.testnet", "hk-try2-1252.testnet", "hk-try2-1252-agent.testnet",
  "hk-try3-1252.testnet", "hk-try3-1252-agent.testnet",
  "hk-v2buyer-1114.testnet", "hk-v2agent-1114.testnet", "hk-v2holder-1114.testnet", "hk-friend-1114.testnet",
]);

async function view<T>(contract: string, method: string, args: object): Promise<T> {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }),
  });
  const j = await r.json();
  if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error ?? j.result.error).slice(0, 200));
  return JSON.parse(Buffer.from(j.result.result).toString());
}

type Order = { id: string; buyer: string; agent: string; seller: string; amount: string; status: string; created_at: string };

let total = 0;
for (const contract of CONTRACTS) {
  const orders: Order[] = [];
  for (let id = 0; ; id++) {
    const o = await view<Order | null>(contract, "get_order", { order_id: String(id) });
    if (!o) break;
    orders.push(o);
  }
  const outside = orders.filter((o) => !TEAM.has(o.buyer) || !TEAM.has(o.agent));
  console.log(`${contract}: ${orders.length} orders, ${outside.length} by buyers outside the team list`);
  if (!outside.length) continue;
  const list = await (await fetch(`https://api-testnet.nearblocks.io/v1/account/${contract}/txns-only?per_page=100&order=desc`)).json();
  const creates = ((list.txns ?? []) as any[]).filter((t) => (t.actions ?? []).some((a: any) => a.method === "create_order"));
  for (const o of outside) {
    const t = Number(BigInt(o.created_at) / 1_000_000_000n);
    const tx = creates.find((c) => c.signer_account_id === o.agent && Math.abs(Number(BigInt(c.block_timestamp) / 1_000_000_000n) - t) <= 5);
    console.log(`  order ${o.id}: buyer ${o.buyer}, agent ${o.agent}, seller ${o.seller}, ${Number(o.amount) / 1e6} tUSDC, ${o.status}${tx ? `, https://testnet.nearblocks.io/txns/${tx.transaction_hash}` : ""}`);
  }
  total += new Set(outside.map((o) => o.buyer)).size;
}
console.log(`independent buyers: ${total}`);
