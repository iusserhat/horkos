import { h, mount, shorten } from "../../lib/dom";
import { receiptCard, type ReceiptToken } from "../../lib/receipt";
import { IS_V2, txUrl } from "../../lib/config";
import type { Order, ReceiptTransfer, VerifierConfig } from "../../lib/explorer-data";

export function receiptsView() {
  const root = h("div", { class: "receipt-grid" });
  const render = (tokens: ReceiptToken[], orders: Order[], verifiers: (VerifierConfig & { version: number })[], transfers = new Map<string, ReceiptTransfer[]>()) => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    mount(
      root,
      ...[...tokens].reverse().map((t) => {
        const order = byId.get(t.token_id);
        const cfg = verifiers.find((x) => x.version === order?.verifier_version);
        const card = receiptCard(t, undefined, cfg ? { version: cfg.version, wasm_hash: cfg.wasm_hash } : undefined);
        const wrap = h("div", { class: "rc-wrap", id: `receipt-${t.token_id}` }, card);
        if (!IS_V2 || !order) return wrap;
        const moves = transfers.get(t.token_id) ?? [];
        const passed = t.owner_id !== order.buyer || moves.length > 0;
        wrap.append(
          h(
            "div",
            { class: "rc-holder" },
            h("p", {}, h("b", {}, "Holder "), h("span", { class: "mono" }, t.owner_id), passed ? h("span", { class: "rc-passed" }, "passed on") : null),
            h("p", { class: "muted" }, "Buyer ", h("span", { class: "mono" }, order.buyer)),
            moves.length
              ? h(
                  "ol",
                  { class: "rc-moves plain" },
                  ...moves.map((m) => h("li", {}, h("span", { class: "mono" }, `${m.from} → ${m.to}`), " · ", h("a", { class: "tx", href: txUrl(m.tx), title: m.tx }, `tx ${shorten(m.tx, 4, 4)}`))),
                )
              : null,
          ),
        );
        return wrap;
      }),
    );
  };
  return { el: root, render };
}
