import { h, mount, shorten } from "../../lib/dom";
import { receiptCard, type ReceiptToken } from "../../lib/receipt";
import { IS_V2, fmtUsdc, repoFile, txUrl } from "../../lib/config";
import type { Order, ReceiptTransfer, VerifierConfig } from "../../lib/explorer-data";

/** Settled orders with an outlayer-verify transcript in evidence/attestation (all 5 layers PASS). */
const ATTESTED: Record<string, { file: string; request?: string }> = IS_V2
  ? { "1": { file: "v2-order-1-outlayer-verify.txt" } }
  : {
      "9": { file: "order-9-outlayer-verify.txt", request: "42776" },
      "15": { file: "order-15-outlayer-verify.txt", request: "44400" },
      "18": { file: "order-18-outlayer-verify.txt", request: "44600" },
      "26": { file: "order-26-outlayer-verify.txt" },
    };

/** What the receipt's escrow holds now, or where the money went. */
function ledger(order: Order, holderNow: string): string {
  const amt = fmtUsdc(order.amount);
  switch (order.status) {
    case "Settled":
      return `paid ${amt} to ${order.seller}`;
    case "Refunded":
      return `refunded ${amt} to ${holderNow}`;
    case "Cancelled":
      return `returned ${amt} to ${holderNow}`;
    default:
      return `holds ${amt}`;
  }
}

function ruling(order: Order, verifiers: (VerifierConfig & { version: number })[]) {
  const cfg = verifiers.find((v) => v.version === order.verifier_version);
  const att = ATTESTED[order.id];
  const na = () => h("span", { class: "muted" }, "not available");
  const row = (k: string, v: Node | string) => h("div", { class: "rc-row" }, h("dt", {}, k), h("dd", {}, v));
  return h(
    "details",
    { class: "rc-ruling" },
    h("summary", {}, "Verify this ruling"),
    h(
      "dl",
      {},
      row("Verifier sha256 (on chain)", cfg ? h("span", { class: "mono" }, cfg.wasm_hash) : na()),
      row("TEE attestation", att ? h("a", { href: repoFile(`evidence/attestation/${att.file}`), target: "_blank", rel: "noopener" }, "outlayer-verify: 5 × PASS ↗") : na()),
      row("OutLayer request id", att?.request ? h("span", { class: "mono" }, att.request) : na()),
      row("Rebuild and compare", h("code", {}, IS_V2 ? "scripts/reproduce-verifier.sh --match-paths --v2" : "scripts/reproduce-verifier.sh --chain --match-paths")),
    ),
  );
}

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
        if (order) {
          wrap.append(h("p", { class: `rc-ledger st-${order.status}` }, ledger(order, t.owner_id)));
          if (order.status === "Settled") wrap.append(ruling(order, verifiers));
        }
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
