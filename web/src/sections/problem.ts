import { h } from "../lib/dom";

export function problem() {
  return h(
    "section",
    { class: "section band band-paper", "aria-labelledby": "problem-title" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "pf-grid" },
        h(
          "article",
          { class: "pf-card panel" },
          h("p", { class: "eyebrow eb-coral" }, "The problem"),
          h("h2", { id: "problem-title" }, "Someone always has to go first."),
          h("p", {}, "If the agent pays first, a stablecoin transfer can't be undone when the data never arrives or is garbage. If the seller delivers first, the buyer already has what it paid for."),
          h("p", {}, "And a prompt-injected agent can pay a seller its owner never approved."),
        ),
        h(
          "article",
          { class: "pf-card pf-fix panel" },
          h("p", { class: "eyebrow eb-white" }, "The fix"),
          h("h2", {}, "Nobody goes first."),
          h("p", {}, "The contract holds the money, a verifier holds the key, and both are released in the same transaction. The owner's mandate decides what the agent may buy at all."),
          h("p", {}, "There is nothing left to argue about afterwards."),
        ),
      ),
      h("p", { class: "pf-contrast" }, "Most agent markets settle quality disputes after the money moves. Horkos checks the delivery first."),
    ),
  );
}
