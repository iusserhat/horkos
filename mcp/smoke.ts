/**
 * Smoke test against testnet: drives server.ts over stdio like an MCP client.
 * Spends testnet tUSDC from the owner's mandate (5 tUSDC per settled buy).
 *   tsx smoke.ts cancel   buy listing 0 and cancel it at once (run with sellers stopped)
 *   tsx smoke.ts buy      buy listing 0, wait for Settled, open the data (seller A must be running)
 *   tsx smoke.ts open N   open the data of Settled order N
 *   tsx smoke.ts inject   try listing 2 (500 tUSDC, seller not allowed): must be rejected
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mode = process.argv[2] ?? "inject";
const client = new Client({ name: "horkos-smoke", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "server.ts"], cwd: import.meta.dirname, stderr: "inherit" }));

async function call(name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const t = r.content.map((c) => c.text).join("\n");
  console.log(`\n> ${name} ${JSON.stringify(args)}${r.isError ? "  [error]" : ""}\n${t}`);
  return { text: t, isError: Boolean(r.isError) };
}

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
await call("horkos_search_listings", { max_price: 10 });

if (mode === "cancel") {
  const r = await call("horkos_create_order", { listing_id: "0", max_price: 10 });
  const id = JSON.parse(r.text).order_id;
  await call("horkos_cancel_order", { order_id: id });
} else if (mode === "buy") {
  const r = await call("horkos_create_order", { listing_id: "0", max_price: 10 });
  const id = JSON.parse(r.text).order_id;
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 5_000));
    const o = await call("horkos_get_order", { order_id: id });
    if (!o.isError && /"status": "(Settled|Delivered|Refunded)"/.test(o.text)) break;
  }
  await call("horkos_open_delivery", { order_id: id });
} else if (mode === "open") {
  await call("horkos_get_order", { order_id: process.argv[3] });
  await call("horkos_open_delivery", { order_id: process.argv[3] });
} else {
  await call("horkos_search_listings", { query: "premium" });
  await call("horkos_create_order", { listing_id: "2", max_price: 1000 });
}
await client.close();
