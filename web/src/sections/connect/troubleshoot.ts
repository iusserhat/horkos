import { h } from "../../lib/dom";

const ITEMS: [string, Node[] | string][] = [
  ["The seller delivered good data but the order is Delivered, not Settled", "OutLayer testnet sometimes fails a run without a reason; the callback then carries no result and the contract moves the order back to Delivered. The seller calls submit_delivery again (attempt 2) before the deadline. If the deadline passes first, anyone calls refund_expired and the price returns to the budget."],
  ["Insufficient storage deposit: need … yoctoNEAR, have …", "Each order uses about 0.0152 NEAR from the owner's storage deposit. Call set_mandate again with the same values and attach more NEAR; the deposit adds up. revoke_mandate refunds what is left."],
  ["Too many open orders", "The mandate's open-order cap is reached (default 50). Wait for orders to settle or refund, cancel Open ones, or call set_mandate with max_open_orders up to 100."],
  ["Seller not allowed by mandate · Price exceeds max_per_order · Insufficient mandate balance · Mandate expired", "The contract refused the order; nothing was created and no funds moved. Change the mandate with set_mandate if the purchase was intended."],
  ["Caller is not the mandate's agent", "The call was signed by a different account than mandate.agent. Check HORKOS_AGENT and that the key belongs to that account."],
  ["function-call key … not found; set HORKOS_AGENT_KEY", "The MCP server could not find a keychain file whose public key matches the agent's on-chain function-call key. Create the key with save-to-legacy-keychain (step 3b) or export HORKOS_AGENT_KEY in the shell that starts your client."],
  ["no buyer key for order … on this machine", "horkos_open_delivery needs the buyer key that horkos_create_order saved in ~/.horkos/buyer-keys.json on the machine that placed the order."],
];

export function troubleshoot() {
  return h(
    "section",
    { class: "guide-section", id: "troubleshooting", "aria-labelledby": "ts-title" },
    h("h2", { id: "ts-title" }, "7. Troubleshooting"),
    h("dl", { class: "ts-list" }, ...ITEMS.flatMap(([q, a]) => [h("dt", { class: "mono" }, q), h("dd", {}, ...(typeof a === "string" ? [a] : a))])),
  );
}
