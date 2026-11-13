import { h, mount } from "../lib/dom";
import { receiptCard, type ReceiptToken, type VerifierRef } from "../lib/receipt";
import { view } from "../lib/rpc";
import type { Status } from "../lib/status";

// Order #5 as read from testnet on 13 Nov 2026 (shown until the live read returns).
const FALLBACK: ReceiptToken = {
  token_id: "5",
  owner_id: "horkos-owner.testnet",
  metadata: {
    title: "Horkos receipt #5",
    description: "Escrow receipt for an AI agent purchase",
    issued_at: "1794579775862",
    expires_at: "1794580375862",
    updated_at: "1794579792000",
    extra: JSON.stringify({ order_id: "5", amount: "5000000", token: "tusdc.horkos.testnet", seller: "horkos-seller-a.testnet", listing_id: "0", status: "Settled", deadline: "1794580375862883280" }),
  },
};
const FALLBACK_VERIFIER: VerifierRef = { version: 0, wasm_hash: "61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f" };

const STATES: { st: Status; by: string }[] = [
  { st: "Open", by: "create_order mints the receipt to the owner; the price is locked." },
  { st: "Verifying", by: "submit_delivery: the seller's delivery is being checked by the verifier in OutLayer." },
  { st: "Delivered", by: "on_verified got an invalid or missing result; the seller may resubmit before the deadline." },
  { st: "Settled", by: "on_verified accepted the delivery: the seller is paid, the buyer's key is stored." },
  { st: "Refunded", by: "refund_expired after the deadline: the price is back in the owner's budget." },
  { st: "Cancelled", by: "cancel_order while Open: the price is back in the owner's budget." },
];

export function receipts() {
  let token = FALLBACK;
  let verifier = FALLBACK_VERIFIER;
  let selected: Status = "Settled";

  const cardSlot = h("div", { class: "rc-slot" });
  const caption = h("p", { class: "rc-caption", "aria-live": "polite" });
  const json = h("code", {});
  const seg = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Receipt status" });

  const render = () => {
    mount(cardSlot, receiptCard(token, selected, verifier));
    caption.replaceChildren(h("span", { class: "muted" }, `${selected}: `), STATES.find((s) => s.st === selected)!.by);
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.st === selected ? "true" : "false"));
    json.textContent = JSON.stringify({ ...token.metadata, extra: JSON.parse(token.metadata.extra) }, null, 2);
  };

  STATES.forEach(({ st }) => {
    const b = h("button", { type: "button", role: "radio", "data-st": st, "aria-checked": "false" }, st);
    b.addEventListener("click", () => {
      selected = st;
      render();
    });
    b.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      const i = STATES.findIndex((s) => s.st === selected);
      const n = k === "ArrowRight" || k === "ArrowDown" ? 1 : k === "ArrowLeft" || k === "ArrowUp" ? -1 : 0;
      if (!n) return;
      e.preventDefault();
      selected = STATES[(i + n + STATES.length) % STATES.length].st;
      render();
      (seg.querySelector(`[data-st="${selected}"]`) as HTMLElement).focus();
    });
    seg.append(b);
  });

  (async () => {
    try {
      const [t, order] = await Promise.all([view<ReceiptToken>("nft_token", { token_id: "5" }), view<{ verifier_version: number }>("get_order", { order_id: "5" })]);
      const v = await view<{ wasm_hash: string }>("get_verifier_version", { version: order.verifier_version });
      token = t;
      verifier = { version: order.verifier_version, wasm_hash: v.wasm_hash };
      render();
    } catch {
      /* keep the snapshot */
    }
  })();
  render();

  return h(
    "section",
    { class: "section", id: "receipts", "aria-labelledby": "rc-title" },
    h(
      "div",
      { class: "wrap" },
      h("p", { class: "eyebrow" }, "NFT receipts"),
      h("h2", { id: "rc-title" }, "Every order is an NFT that holds its own escrow state."),
      h(
        "div",
        { class: "rc-grid" },
        h(
          "div",
          {},
          seg,
          cardSlot,
          caption,
          h("p", { class: "muted rc-note" }, "Real receipt #5 from testnet; the buttons switch only the status, to show how the same token reads in each state."),
        ),
        h(
          "div",
          { class: "stack" },
          h("h3", { class: "rc-why-title" }, "Why it does something"),
          h(
            "ul",
            { class: "sec-list" },
            h("li", {}, h("strong", {}, "It proves where the money is. "), "The receipt's status mirrors the escrowed order on chain: locked, being verified, paid out or refunded. Anyone can read it with ", h("code", {}, "nft_token"), "."),
            h("li", {}, h("strong", {}, "Only the contract changes it. "), "Status moves only through create_order, submit_delivery, on_verified, refund_expired and cancel_order; there is no method to edit metadata by hand."),
            h("li", {}, h("strong", {}, "Not transferable in this version. "), "The receipt's owner is the escrow's buyer and the target of the encrypted data key; a transfer would need a new refund and key flow. ", h("code", {}, "nft_transfer"), " fails with \"Receipts are non-transferable in this version\"."),
          ),
          h("details", { class: "rc-json" }, h("summary", {}, "Metadata as nft_token returns it"), h("pre", { class: "code" }, json)),
        ),
      ),
    ),
  );
}
