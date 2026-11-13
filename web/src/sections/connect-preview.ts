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
    { class: "section", "aria-labelledby": "cp-title" },
    h(
      "div",
      { class: "wrap" },
      h("p", { class: "eyebrow" }, "Connect your agent"),
      h("h2", { id: "cp-title" }, "Three steps from mandate to a verified purchase."),
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
          h("a", { class: "btn", href: "./connect.html" }, "Full guide →"),
        ),
        h(
          "div",
          { class: "stack" },
          codeBlock(CONFIG),
          h(
            "figure",
            { class: "cp-chat panel" },
            h("p", {}, h("span", { class: "cp-who mono" }, "Ask your agent"), "Find a NEAR/USD price feed and buy it without spending more than 10 tUSDC, then show me the data."),
            h("p", { class: "mono cp-tools" }, "horkos_search_listings → horkos_create_order → horkos_get_order ×4 → horkos_open_delivery"),
            h("p", {}, h("span", { class: "cp-who mono" }, "Agent"), "I bought the NEAR/USD feed for 5 tUSDC, half your 10 tUSDC cap. Order 6 went from Open to Verifying to Settled over three polls, about 20 seconds apart, and I opened it only after it said Settled."),
            h("figcaption", { class: "muted" }, "Claude Code (Sonnet) with the Horkos MCP server on testnet, 13 Nov 2026; reply shortened."),
          ),
        ),
      ),
    ),
  );
}
