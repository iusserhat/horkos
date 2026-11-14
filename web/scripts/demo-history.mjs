// Build step: copies the demo orders' transaction history from docs/testnet.md
// into src/data/demo-history.json, so the explorer shows tx links for these
// orders without calling any third-party service.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const md = readFileSync(resolve(root, "../docs/testnet.md"), "utf8");
const m = md.match(/<!-- horkos-history:begin -->\s*```json\n([\s\S]*?)\n```\s*<!-- horkos-history:end -->/);
if (!m) throw new Error("docs/testnet.md: horkos-history block not found");
const data = JSON.parse(m[1]);
mkdirSync(resolve(root, "src/data"), { recursive: true });
writeFileSync(resolve(root, "src/data/demo-history.json"), JSON.stringify(data, null, 2) + "\n");
console.log(`demo-history.json: ${Object.keys(data.orders).length} orders, ${data.rejected.length} rejected calls`);

// The market page shows the off-chain listing descriptions the MCP server uses.
const catalog = JSON.parse(readFileSync(resolve(root, "../mcp/catalog.testnet.json"), "utf8"));
writeFileSync(resolve(root, "src/data/catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`catalog.json: ${Object.keys(catalog).filter((k) => !k.startsWith("_")).length} listing descriptions`);
