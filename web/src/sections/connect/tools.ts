import { codeBlock, h } from "../../lib/dom";
import examples from "../../data/mcp-examples.json";

interface Tool {
  name: string;
  does: string;
  params: [string, string, string][];
}

const TOOLS: Tool[] = [
  { name: "horkos_search_listings", does: "Lists listings with price, seller and whether the owner's mandate allows that seller. Descriptions are seller-written text and are marked as untrusted.", params: [["query", "string, optional", "words to match in the description"], ["max_price", "number, optional", "maximum price in tUSDC"]] },
  { name: "horkos_create_order", does: "Buys a listing through the escrow. Fails with the contract's reason when the order is outside the mandate.", params: [["listing_id", "string", "from horkos_search_listings"], ["max_price", "number", "refuse if the listing costs more (tUSDC)"]] },
  { name: "horkos_get_order", does: "Order status: Open, Verifying, Delivered, Settled, Refunded or Cancelled.", params: [["order_id", "string", "id returned by horkos_create_order"]] },
  { name: "horkos_open_delivery", does: "Decrypts a Settled order's data with the buyer key saved when the order was created (~/.horkos/buyer-keys.json).", params: [["order_id", "string", "a Settled order placed from this machine"]] },
  { name: "horkos_cancel_order", does: "Cancels an order that is still Open; the price goes back to the budget.", params: [["order_id", "string", "an Open order"]] },
];

const pretty = (s: string) => {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
};

export function toolsRef() {
  const calls = examples.calls;
  return h(
    "section",
    { class: "guide-section", id: "tools", "aria-labelledby": "tools-title" },
    h("h2", { id: "tools-title" }, "4. The five tools"),
    h("p", { class: "muted" }, `Requests and responses below are real, captured from the server on ${examples.network} on ${examples.captured_at.slice(0, 10)}.`),
    ...TOOLS.map((t) => {
      const ex = calls.filter((c) => c.tool === t.name);
      return h(
        "article",
        { class: "tool", id: t.name },
        h("h3", { class: "mono" }, t.name),
        h("p", {}, t.does),
        h(
          "table",
          { class: "params" },
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Parameter"), h("th", { scope: "col" }, "Type"), h("th", { scope: "col" }, "Meaning"))),
          h("tbody", {}, ...t.params.map(([n, ty, m]) => h("tr", {}, h("td", { class: "mono" }, n), h("td", {}, ty), h("td", {}, m)))),
        ),
        ...ex.map((c) =>
          h(
            "div",
            { class: "tool-ex" },
            h("p", { class: "tool-ex-label mono" }, `Request${c.isError ? " (rejected)" : ""}`),
            codeBlock(JSON.stringify(c.args, null, 2)),
            h("p", { class: "tool-ex-label mono" }, c.isError ? "Response (isError: true)" : "Response"),
            codeBlock(pretty(c.response).split("\n").slice(0, 24).join("\n") + (pretty(c.response).split("\n").length > 24 ? "\n…" : "")),
          ),
        ),
      );
    }),
  );
}
