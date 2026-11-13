import { h, s } from "../lib/dom";

const INK = "#1d2140";
const st = { stroke: INK, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" };

const ICONS = [
  () => s("svg", { viewBox: "0 0 52 52", "aria-hidden": "true" }, s("rect", { x: 8, y: 6, width: 36, height: 42, rx: 6, fill: "#d9e3ff", ...st }), s("path", { d: "M16 18h20M16 27h14M16 36h18", fill: "none", ...st })),
  () => s("svg", { viewBox: "0 0 52 52", "aria-hidden": "true" }, s("rect", { x: 10, y: 22, width: 32, height: 24, rx: 6, fill: "#ffd873", ...st }), s("path", { d: "M17 22v-6a9 9 0 0 1 18 0v6", fill: "none", ...st })),
  () => s("svg", { viewBox: "0 0 52 52", "aria-hidden": "true" }, s("circle", { cx: 22, cy: 22, r: 13, fill: "#d8ccff", ...st }), s("path", { d: "M32 32l11 11", fill: "none", stroke: INK, "stroke-width": 4, "stroke-linecap": "round" })),
  () => s("svg", { viewBox: "0 0 52 52", "aria-hidden": "true" }, s("circle", { cx: 26, cy: 26, r: 20, fill: "#ffffff", ...st }), s("path", { d: "M17 27l6 6 12-13", fill: "none", ...st, "stroke-width": 3.5 })),
];

const STEPS: [string, string][] = [
  ["You set a mandate", "Budget, per-order cap, allowed sellers and expiry. The contract enforces it, not the agent."],
  ["Your agent buys", "create_order locks the price in escrow and mints an NFT receipt. The seller can't touch the money yet."],
  ["A verifier checks", "The seller's encrypted delivery is opened inside OutLayer's TEE and checked against the order's condition."],
  ["Paid, or refunded", "Pass: the seller is paid and your agent gets the key in one call. Nothing by the deadline: the money comes back."],
];

export function steps() {
  const cards: Node[] = [];
  STEPS.forEach(([title, body], i) => {
    if (i) cards.push(h("span", { class: "st-arrow", "aria-hidden": "true" }, "→"));
    cards.push(h("li", { class: `st-card${i === 3 ? " st-last" : ""}` }, h("span", { class: "st-num" }, String(i + 1)), ICONS[i](), h("h3", {}, title), h("p", {}, body)));
  });
  return h(
    "section",
    { class: "section band band-butter", id: "steps", "aria-labelledby": "steps-title" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "sec-head" }, h("p", { class: "eyebrow" }, "How it works"), h("h2", { id: "steps-title" }, "Four steps, one receipt.")),
      h("ol", { class: "st-flow" }, ...cards),
    ),
  );
}
