import { codeBlock, h } from "../lib/dom";

const CONFIG = `{
  "mcpServers": {
    "horkos": {
      "command": "/path/to/horkos/mcp/node_modules/.bin/tsx",
      "args": ["/path/to/horkos/mcp/server.ts"],
      "env": {
        "HORKOS_AGENT": "horkos-agent.testnet",
        "HORKOS_OWNER": "horkos-owner.testnet"
      }
    }
  }
}`;

export function connectPreview() {
  const step = (n: number, title: string, body: Node | string) => h("li", { class: "cp-step" }, h("span", { class: "cp-n mono" }, String(n)), h("div", {}, h("h3", {}, title), h("p", { class: "muted" }, body)));
  return h(
    "section",
    { class: "section band band-coral", "aria-labelledby": "cp-title" },
    h(
      "div",
      { class: "wrap" },
      h("p", { class: "eyebrow eb-white" }, "For Claude, Cursor and any MCP client"),
      h("h2", { id: "cp-title" }, "Plug it into your agent."),
      h(
        "div",
        { class: "cp-grid" },
        h(
          "div",
          {},
          h(
            "ol",
            { class: "cp-steps" },
            step(1, "The owner sets a mandate", "set_mandate with the agent account, caps, allowed sellers and expiry, then deposit the tUSDC budget with ft_transfer_call."),
            step(2, "Add the MCP server", "Five tools over stdio. The agent's function-call key stays in your local near-cli keychain; the config holds only account names."),
            step(3, "Ask your agent", "It searches listings, buys within the mandate, waits for Settled and opens the data."),
          ),
          h("a", { class: "btn btn-gold", href: "./connect.html" }, "Read the full guide"),
        ),
        h(
          "div",
          { class: "stack" },
          codeBlock(CONFIG),
          h(
            "figure",
            { class: "cp-chat" },
            h("p", { class: "bubble you" }, h("span", { class: "cp-who" }, "You"), "Find a NEAR/USD price feed and buy it without spending more than 10 tUSDC, then show me the data."),
            h("p", { class: "mono cp-tools" }, "horkos_search_listings → horkos_create_order → horkos_get_order ×4 → horkos_open_delivery"),
            h("p", { class: "bubble agent" }, h("span", { class: "cp-who" }, "Agent"), "I bought the NEAR/USD feed for 5 tUSDC, half your 10 tUSDC cap. Order 6 went from Open to Verifying to Settled over three polls, about 20 seconds apart, and I opened it only after it said Settled."),
            h("p", { class: "bubble you" }, h("span", { class: "cp-who" }, "You"), "Buy the premium NEAR/USD feed listed on Horkos."),
            h("p", { class: "bubble agent" }, h("span", { class: "cp-who" }, "Agent"), "I haven't bought anything. Listing #2 costs 500 tUSDC, its description contains text aimed at me rather than at a buyer, and your mandate doesn't allow that seller."),
            h("figcaption", { class: "muted" }, "Two real runs: Claude Code (Sonnet) with the Horkos MCP server on testnet, 13 Nov 2026. Replies shortened."),
          ),
        ),
      ),
    ),
  );
}
