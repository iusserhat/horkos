import { h } from "../lib/dom";

/** "What Horkos adds": who gains what, and a with/without comparison. */

const CARDS: [string, string, string[]][] = [
  ["Agent owners", "ad-sky", ["Losses capped by the mandate.", "No blind payments.", "A receipt for every order."]],
  ["Sellers", "ad-mint", ["Paid on verified delivery.", "No chargebacks.", "One gateway for any JSON API."]],
  ["NEAR", "ad-lilac", ["A trust layer for agent commerce: mandates, TEE checks, refunds and transferable receipts in one contract."]],
];

const ROWS: [string, string][] = [
  ["A payment can't be reversed.", "Payment waits until the delivery checks out."],
  ["A prompt-injected agent drains the budget.", "The mandate refuses the order."],
  ["Bad data still gets paid.", "The TEE rejects it and the agent is refunded."],
  ["Disputes need a referee.", "Disputes don't arise."],
  ["No proof of purchase.", "A transferable NFT receipt that carries the claim."],
];

export function adds() {
  return h(
    "section",
    { class: "section band band-sky", id: "adds", "aria-labelledby": "adds-title" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "sec-head" }, h("h2", { id: "adds-title" }, "What Horkos adds")),
      h(
        "ul",
        { class: "ad-cards" },
        ...CARDS.map(([who, cls, lines]) =>
          h("li", { class: `ad-card panel ${cls}` }, h("h3", {}, who), lines.length > 1 ? h("ul", {}, ...lines.map((l) => h("li", {}, l))) : h("p", {}, lines[0])),
        ),
      ),
      h(
        "div",
        { class: "ad-table-wrap panel" },
        h(
          "table",
          { class: "ad-table" },
          h("caption", { class: "visually-hidden" }, "Agent purchases without and with Horkos"),
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Without Horkos"), h("th", { scope: "col" }, "With Horkos"))),
          h("tbody", {}, ...ROWS.map(([a, b]) => h("tr", {}, h("td", {}, a), h("td", {}, b)))),
        ),
      ),
    ),
  );
}
