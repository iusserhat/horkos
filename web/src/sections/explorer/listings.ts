import { CONTRACT } from "../../lib/config";
import { h, mount, shorten } from "../../lib/dom";
import { fmtUsdc } from "../../lib/config";
import type { Listing } from "../../lib/explorer-data";

export function listingsView() {
  const root = h("div", {});
  const render = (listings: (Listing & { id: string })[], allowed: string[]) =>
    mount(
      root,
      h(
        "table",
        { class: "data-table" },
        h("caption", { class: "visually-hidden" }, `Listings registered on ${CONTRACT}`),
        h("thead", {}, h("tr", {}, ...["Listing", "Seller", "Price", "Delivery window", "Condition", "Demo mandate"].map((c) => h("th", { scope: "col" }, c)))),
        h(
          "tbody",
          {},
          ...listings.map((l) =>
            h(
              "tr",
              {},
              h("th", { scope: "row", class: "mono" }, `#${l.id}`),
              h("td", { "data-label": "Seller", class: "mono" }, l.seller),
              h("td", { "data-label": "Price", class: "mono" }, fmtUsdc(l.price)),
              h("td", { "data-label": "Window", class: "mono" }, `${Number(BigInt(l.delivery_window) / 1_000_000_000n) / 60} min`),
              h("td", { "data-label": "Condition", class: "mono", title: l.condition_hash }, shorten(l.condition_hash, 13, 4)),
              h("td", { "data-label": "Demo mandate" }, allowed.includes(l.seller) ? "seller allowed" : h("span", { class: "danger" }, "seller not allowed")),
            ),
          ),
        ),
      ),
    );
  return { el: root, render };
}
