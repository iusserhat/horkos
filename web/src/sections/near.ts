import { h } from "../lib/dom";

const ROWS: [string, string][] = [
  ["Function-call access keys", "The agent's key can call only create_order and cancel_order on the escrow, with a gas allowance; it cannot move tokens or add keys."],
  ["NEP-141 ft_transfer_call", "The owner deposits the tUSDC budget into the mandate in one call; the contract accepts it only for an existing mandate."],
  ["NEP-171", "One receipt NFT per order, minted to the owner, with the order's status in its metadata."],
  ["NEAR OutLayer (TEE)", "Runs the verifier WASM off chain, pinned by sha256, and returns the result to the contract's callback."],
  ["Named accounts", "Mandates and allowlists use readable names such as horkos-seller-a.testnet, so a policy is checkable by eye."],
];

export function builtOnNear() {
  return h(
    "section",
    { class: "section band band-butter", "aria-labelledby": "near-title" },
    h(
      "div",
      { class: "wrap" },
      h("p", { class: "eyebrow eb-white" }, "Built on NEAR"),
      h("h2", { id: "near-title" }, "Which NEAR feature does what."),
      h(
        "table",
        { class: "near-table panel" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Feature"), h("th", { scope: "col" }, "What it gives Horkos"))),
        h("tbody", {}, ...ROWS.map(([f, d]) => h("tr", {}, h("th", { scope: "row" }, f), h("td", {}, d)))),
      ),
    ),
  );
}
