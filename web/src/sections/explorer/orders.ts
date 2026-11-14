import { CONTRACT } from "../../lib/config";
import { h, mount } from "../../lib/dom";
import { fmtUsdc } from "../../lib/config";
import { badge } from "../../lib/status";
import { orderHistory, type Order } from "../../lib/explorer-data";
import type { ReceiptToken } from "../../lib/receipt";
import { timeline } from "./timeline";

const rel = (ns: string) => {
  const d = Number(BigInt(ns) / 1_000_000n) - Date.now();
  const a = Math.abs(d) / 1000;
  const s = a < 60 ? `${Math.round(a)}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  return d >= 0 ? `in ${s}` : `${s} ago`;
};
const FINAL = new Set(["Settled", "Refunded", "Cancelled"]);
const utc = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export function ordersView() {
  let open: string | null = null;
  const historyCache = new Map<string, Promise<HTMLElement>>();
  const root = h("div", { class: "orders" });

  const render = (orders: Order[], tokens: ReceiptToken[]) => {
    // Keep keyboard focus on the same order across the 10 s refresh.
    const active = document.activeElement as HTMLElement | null;
    const focusedId = active?.classList.contains("order-toggle") ? active.dataset.id : null;
    const updated = new Map(tokens.map((t) => [t.token_id, Number(t.metadata.updated_at)]));
    const rows = orders.map((o) => {
      const expanded = open === o.id;
      const btn = h("button", { type: "button", class: "order-toggle", "data-id": o.id, "aria-expanded": expanded ? "true" : "false", "aria-controls": `order-${o.id}-detail`, "aria-label": `Order ${o.id}: ${expanded ? "hide" : "show"} status history` }, `${expanded ? "▾" : "▸"} #${o.id}`);
      btn.addEventListener("click", () => {
        open = expanded ? null : o.id;
        render(orders, tokens);
        if (!expanded) (root.querySelector(`#order-${o.id}-detail`) as HTMLElement | null)?.focus();
      });
      const row = h(
        "tr",
        { class: expanded ? "is-open" : "" },
        h("th", { scope: "row" }, btn),
        h("td", { "data-label": "Status" }, badge(o.status)),
        h("td", { "data-label": "Amount", class: "mono" }, fmtUsdc(o.amount)),
        h("td", { "data-label": "Seller", class: "mono" }, o.seller),
        h("td", { "data-label": "Deadline" }, FINAL.has(o.status) ? h("span", { class: "mono muted", title: utc(o.deadline) }, utc(o.deadline).slice(5, 16)) : h("span", { title: utc(o.deadline) }, rel(o.deadline))),
        h("td", { "data-label": "Attempts", class: "mono" }, String(o.attempts)),
        h("td", { "data-label": "Verifier", class: "mono" }, `v${o.verifier_version}`),
      );
      if (!expanded) return [row];
      const slot = h("div", { class: "order-detail", id: `order-${o.id}-detail`, tabindex: "-1" }, h("p", { class: "muted" }, "Loading history…"));
      // History rarely changes; keep it per order and status so the 10 s refresh does not refetch it.
      const key = `${o.id}:${o.status}:${o.attempts}`;
      if (!historyCache.has(key)) historyCache.set(key, orderHistory(o, updated.get(o.id) ?? Date.now()).then(timeline));
      historyCache.get(key)!.then((el) => mount(slot, el));
      return [row, h("tr", { class: "detail-row" }, h("td", { colspan: "7" }, slot))];
    });
    mount(
      root,
      h("p", { class: "muted ex-hint" }, "Select an order number to see its status history with transaction links."),
      h(
        "table",
        { class: "data-table" },
        h("caption", { class: "visually-hidden" }, `Orders on ${CONTRACT}, newest first. Select an order number to show its status history.`),
        h("thead", {}, h("tr", {}, ...["Order", "Status", "Amount", "Seller", "Deadline", "Attempts", "Verifier"].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", {}, ...rows.flat()),
      ),
    );
    if (focusedId) root.querySelector<HTMLElement>(`.order-toggle[data-id="${focusedId}"]`)?.focus();
  };
  return { el: root, render };
}
