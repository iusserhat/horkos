/**
 * Captures real request/response pairs for the web guide (web/src/data/mcp-examples.json).
 * Creates one order for listing 0 and cancels it at once (testnet gas only; tUSDC returns to the budget).
 * Run with no seller service running: cd mcp && npx tsx capture-examples.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "horkos-capture", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "server.ts"], cwd: import.meta.dirname, stderr: "ignore" }));
const out: { tool: string; args: Record<string, unknown>; isError: boolean; response: string }[] = [];
async function call(tool: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name: tool, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const response = r.content.map((c) => c.text).join("\n");
  out.push({ tool, args, isError: Boolean(r.isError), response });
  return response;
}
await call("horkos_search_listings", { max_price: 10 });
await call("horkos_get_order", { order_id: "6" });
await call("horkos_open_delivery", { order_id: "6" });
const created = JSON.parse(await call("horkos_create_order", { listing_id: "0", max_price: 10 }));
await call("horkos_cancel_order", { order_id: created.order_id });
await call("horkos_create_order", { listing_id: "2", max_price: 1000 });
await client.close();
const file = resolve(import.meta.dirname, "../web/src/data/mcp-examples.json");
writeFileSync(file, JSON.stringify({ captured_at: new Date().toISOString(), network: "testnet", calls: out }, null, 2) + "\n");
console.log(out.map((c) => `${c.tool} ${c.isError ? "ERROR " : ""}${c.response.slice(0, 80).replace(/\n/g, " ")}`).join("\n"));
