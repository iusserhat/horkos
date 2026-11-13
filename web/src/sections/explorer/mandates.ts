import { h, mount } from "../../lib/dom";
import { accountUrl, fmtUsdc } from "../../lib/config";
import { accountError } from "../../lib/accounts";
import type { Mandate } from "../../lib/explorer-data";

const pct = (a: string, b: string) => (BigInt(b) === 0n ? 0 : Number((BigInt(a) * 1000n) / BigInt(b)) / 10);
const date = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString().slice(0, 10);
const near = (yocto: string) => `${(Number(BigInt(yocto) / 10n ** 18n) / 1e6).toFixed(4)} NEAR`;

function mandateCard(m: Mandate, selected: boolean) {
  const p = pct(m.spent, m.max_total);
  return h(
    "article",
    { class: `mandate panel${selected ? " is-selected" : ""}` },
    h("div", { class: "mandate-head" }, h("h3", { class: "mono" }, h("a", { href: accountUrl(m.owner) }, m.owner)), h("span", { class: `tag ${m.active ? "tag-today" : "tag-roadmap"}` }, m.active ? "Active" : "Revoked")),
    h(
      "div",
      { class: "progress-wrap" },
      h("div", { class: "progress-label" }, h("span", {}, "Spent"), h("span", { class: "mono" }, `${fmtUsdc(m.spent)} of ${fmtUsdc(m.max_total)} (${p}%)`)),
      h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(p), "aria-label": `Spent ${p}% of the total cap` }, h("span", { style: `width:${Math.min(100, p)}%` })),
    ),
    h(
      "dl",
      { class: "kv" },
      h("dt", {}, "Agent"), h("dd", { class: "mono" }, m.agent),
      h("dt", {}, "Budget left"), h("dd", { class: "mono" }, fmtUsdc(m.balance)),
      h("dt", {}, "Per order"), h("dd", { class: "mono" }, `≤ ${fmtUsdc(m.max_per_order)}`),
      h("dt", {}, "Allowed sellers"), h("dd", {}, h("ul", { class: "plain mono" }, ...m.allowed_sellers.map((s) => h("li", {}, s)))),
      h("dt", {}, "Open orders"), h("dd", { class: "mono" }, `${m.open_orders} / ${m.max_open_orders}`),
      h("dt", {}, "Expires"), h("dd", { class: "mono" }, date(m.expires_at)),
      h("dt", {}, "Storage deposit"), h("dd", { class: "mono" }, near(m.storage_deposit)),
    ),
  );
}

export function mandatesView(onSearch: (owner: string) => void) {
  let selected: string | null = null;
  const input = h("input", { id: "mandate-search", type: "search", placeholder: "owner.testnet", spellcheck: "false", autocomplete: "off", "aria-describedby": "mandate-search-msg" });
  const msg = h("p", { id: "mandate-search-msg", class: "field-hint", "aria-live": "polite" }, "There is no view that lists mandates; owners with orders are listed, and any owner can be looked up by name.");
  const form = h(
    "form",
    { class: "mandate-search", role: "search" },
    h("label", { for: "mandate-search" }, "Look up a mandate by owner account"),
    h("div", { class: "search-row" }, input, h("button", { class: "btn", type: "submit" }, "Look up")),
    msg,
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim().toLowerCase();
    const err = accountError(v);
    if (err) {
      msg.textContent = err;
      return;
    }
    selected = v;
    msg.textContent = `Looking up ${v}…`;
    onSearch(v);
  });
  const list = h("div", { class: "mandate-list" });
  const render = (mandates: Map<string, Mandate | null>, defaultOwner: string) => {
    const sel = selected ?? defaultOwner;
    if (selected && mandates.has(selected)) msg.textContent = mandates.get(selected) ? `Showing ${selected}.` : `No mandate for ${selected}.`;
    const entries = [...mandates.entries()].filter(([, m]) => m !== null) as [string, Mandate][];
    entries.sort(([a], [b]) => (a === sel ? -1 : b === sel ? 1 : a.localeCompare(b)));
    mount(list, ...entries.map(([o, m]) => mandateCard(m, o === sel)));
  };
  return { el: h("div", {}, form, list), render };
}
