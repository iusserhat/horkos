import { h } from "../lib/dom";
import { repoFile, txUrl } from "../lib/config";

const tx = (hash: string, label: string) => h("a", { href: txUrl(hash), title: `Transaction ${hash}` }, `${label} ↗`);

export function security() {
  return h(
    "section",
    { class: "section band band-paper", "aria-labelledby": "sec-title" },
    h(
      "div",
      { class: "wrap" },
      h("p", { class: "eyebrow eb-mint" }, "Security model and limits"),
      h("h2", { id: "sec-title" }, "What the contract enforces, and what it trusts."),
      h(
        "div",
        { class: "sec-grid" },
        h(
          "div",
          { class: "sec-card panel" },
          h("h3", {}, "Enforced on chain"),
          h(
            "ul",
            { class: "sec-list" },
            h("li", {}, "The agent's only key is a function-call key for ", h("code", {}, "create_order"), " and ", h("code", {}, "cancel_order"), ". ", h("span", { class: "muted" }, "(tx: "), tx("CAAqVKNCBhdDUG3dk8Pir72nUiH6ZXQgVgGJAQPD2Xqd", "key added"), h("span", { class: "muted" }, " · "), tx("AHSj5g6T8hf8un6j3PdeVhHn3SjAWgcu13AD6uVqxMjc", "full-access key deleted"), h("span", { class: "muted" }, ")")),
            h("li", {}, "Mandate caps, allowed sellers and expiry are checked by the contract on every order, so a leaked agent key can only buy within them."),
            h("li", {}, "Each order keeps the verifier version (WASM sha256) it was created with; a new version cannot change open orders."),
            h("li", {}, "Open-order cap per mandate (default 50) and per-order storage paid from the owner's deposit."),
            h("li", {}, "A gitleaks scan of the full git history found no secrets. ", h("a", { href: repoFile("docs/security.md") }, "Scan record")),
          ),
        ),
        h(
          "div",
          { class: "sec-card sec-limits panel" },
          h("h3", {}, "Known limitations"),
          h(
            "ul",
            { class: "sec-list" },
            h("li", {}, "Testnet only."),
            h("li", {}, "OutLayer's TEE attestation is not verified on chain; the contract trusts OutLayer's operator for the result."),
            h("li", {}, "OutLayer testnet sometimes fails a run without a reason; the order returns to Delivered and the seller resubmits."),
            h("li", {}, "Conditions are JSON Schema only; Horkos checks shape, not quality."),
            h("li", {}, "Receipt NFTs are transferable only on the v2 contract (escrow-v2.horkos.testnet), which has no verifier build of its own yet, so v2 orders cannot settle through OutLayer."),
            h("li", {}, "The contract accounts still have full-access keys held by the team, which could redeploy the code."),
          ),
        ),
      ),
    ),
  );
}
