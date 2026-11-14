import { h } from "../lib/dom";
import { REPO } from "../lib/config";

export function cta() {
  return h(
    "section",
    { class: "cta", "aria-labelledby": "cta-title" },
    h(
      "div",
      { class: "wrap cta-grid" },
      h(
        "div",
        {},
        h("p", { class: "eyebrow eb-white" }, "No wallet needed to try"),
        h("h2", { id: "cta-title" }, "Run the whole flow in a minute."),
        h("p", {}, h("code", {}, "npm run sandbox"), " starts a local NEAR chain and plays a settled order, a refund and a blocked purchase."),
      ),
      h(
        "div",
        { class: "cta-btns" },
        h("a", { class: "btn btn-gold btn-lg", href: "./try.html" }, "Try it step by step"),
        h("a", { class: "btn btn-mint btn-lg", href: "./explorer.html" }, "Open the live explorer"),
        h("a", { class: "btn btn-lg", href: REPO }, "Read the code on GitHub"),
      ),
    ),
  );
}
