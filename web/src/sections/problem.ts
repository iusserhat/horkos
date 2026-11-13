import { h, s } from "../lib/dom";

/** Small two-party diagram: who moves first, and what goes missing. */
function scenario(title: string, caption: string, payFirst: boolean) {
  const svg = s(
    "svg",
    { viewBox: "0 0 320 120", role: "img", "aria-label": caption, class: "problem-svg" },
    s("defs", {}, s("marker", { id: `pa-${payFirst ? 1 : 2}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse", class: "arrow-active" }, s("path", { d: "M0 0 L10 5 L0 10 Z" }))),
    s("rect", { x: 8, y: 36, width: 88, height: 48, rx: 6, class: "node" }),
    s("text", { x: 52, y: 65, "text-anchor": "middle", class: "node-label" }, "Agent"),
    s("rect", { x: 224, y: 36, width: 88, height: 48, rx: 6, class: "node" }),
    s("text", { x: 268, y: 65, "text-anchor": "middle", class: "node-label" }, "Seller"),
    // what is sent
    s("path", { d: payFirst ? "M100 50 H216" : "M220 50 H104", class: "edge done", "marker-end": `url(#pa-${payFirst ? 1 : 2})` }),
    s("text", { x: 160, y: 40, "text-anchor": "middle", class: "edge-label" }, payFirst ? "5 USDC" : "data"),
    // what never comes back
    s("path", { d: payFirst ? "M216 74 H104" : "M104 74 H220", class: "edge missing" }),
    s("text", { x: 160, y: 102, "text-anchor": "middle", class: "edge-label miss" }, payFirst ? "no data" : "no payment"),
    s("path", { d: "M154 68 l12 12 m0 -12 l-12 12", class: "cross" }),
  );
  return h("figure", { class: "problem-card panel" }, svg, h("figcaption", {}, h("strong", {}, title), " ", caption));
}

export function problem() {
  return h(
    "section",
    { class: "section", "aria-labelledby": "problem-title" },
    h(
      "div",
      { class: "wrap problem" },
      h(
        "div",
        { class: "stack" },
        h("p", { class: "eyebrow" }, "The problem"),
        h("h2", { id: "problem-title" }, "One side always moves first."),
        h("p", {}, "An agent that pays first has no way to get the money back when the data never arrives or is garbage; a stablecoin transfer cannot be reversed."),
        h("p", {}, "A seller that delivers first can be told the data was bad by a buyer who already has it."),
        h("p", {}, "A prompt-injected agent can also pay a seller its owner never approved. Horkos keeps the money in the contract until both the owner's rules and the delivery check pass."),
      ),
      h(
        "div",
        { class: "problem-figs" },
        scenario("Pay first:", "the agent sends 5 USDC, the data never comes.", true),
        scenario("Deliver first:", "the seller sends the data, the payment never comes.", false),
      ),
    ),
  );
}
