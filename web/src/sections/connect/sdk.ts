import { codeBlock, h } from "../../lib/dom";

const CODE = `// From a clone of the repo (the SDK is not published to npm): sdk/src
import { Account, HorkosAgent, JsonRpcProvider } from "../sdk/src/index.js";

const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
// The agent's function-call key, read from your keychain or env (never hard-code it)
const account = new Account("my-agent.testnet", provider, process.env.HORKOS_AGENT_KEY as \`ed25519:\${string}\`);
const agent = new HorkosAgent({ contractId: "escrow.horkos.testnet", account, owner: "my-owner.testnet" });

const { order, buyerKeys } = await agent.buy({ listingId: "0", maxPrice: 10_000_000n }); // 10 tUSDC
const settled = await agent.waitForSettlement(order.id, { timeoutMs: 15 * 60_000 });
if (settled.status === "Settled") {
  console.log(await agent.openDeliveryJson(settled, buyerKeys));
} else {
  console.log("not settled:", settled.status); // Refunded after the deadline
}`;

export function sdkExample() {
  return h(
    "section",
    { class: "guide-section", id: "sdk", "aria-labelledby": "sdk-title" },
    h("h2", { id: "sdk-title" }, "6. Without MCP: the TypeScript SDK"),
    h("p", {}, "The MCP server is a thin layer over this SDK. Keep ", h("code", {}, "buyerKeys"), " until the order settles: it is the only key that opens the data."),
    codeBlock(CODE),
  );
}
