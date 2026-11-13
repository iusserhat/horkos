import { h, mount } from "../../lib/dom";
import { receiptCard, type ReceiptToken } from "../../lib/receipt";
import type { Order, VerifierConfig } from "../../lib/explorer-data";

export function receiptsView() {
  const root = h("div", { class: "receipt-grid" });
  const render = (tokens: ReceiptToken[], orders: Order[], verifiers: (VerifierConfig & { version: number })[]) => {
    const vOf = new Map(orders.map((o) => [o.id, o.verifier_version]));
    mount(
      root,
      ...[...tokens].reverse().map((t) => {
        const v = vOf.get(t.token_id);
        const cfg = verifiers.find((x) => x.version === v);
        return receiptCard(t, undefined, cfg ? { version: cfg.version, wasm_hash: cfg.wasm_hash } : undefined);
      }),
    );
  };
  return { el: root, render };
}
