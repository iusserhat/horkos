import { h } from "../lib/dom";
import { CONTRACT, fmtUsdc } from "../lib/config";
import { view } from "../lib/rpc";
import { badge, type Status } from "../lib/status";

interface Token {
  token_id: string;
  metadata: { extra: string };
}

/** Last orders straight from chain: every order mints one NFT receipt whose metadata mirrors the order. */
function livePanel() {
  const list = h("ul", { class: "live-list", "aria-live": "polite" }, h("li", { class: "muted" }, "Reading escrow.horkos.testnet…"));
  const foot = h("p", { class: "live-foot mono" }, `${CONTRACT} · read from testnet RPC`);
  (async () => {
    try {
      const total = Number(await view<string>("nft_total_supply"));
      const from = Math.max(0, total - 4);
      const tokens = await view<Token[]>("nft_tokens", { from_index: String(from), limit: 4 });
      list.replaceChildren(
        ...tokens.reverse().map((t) => {
          const o = JSON.parse(t.metadata.extra) as { order_id: string; amount: string; seller: string; status: Status };
          return h(
            "li",
            {},
            h("span", { class: "oid" }, `#${o.order_id}`),
            h("span", { title: o.seller }, `${fmtUsdc(o.amount)} · ${o.seller.replace(/^horkos-|\.testnet$/g, "")}`),
            badge(o.status),
          );
        }),
      );
      foot.textContent = `${total} orders on ${CONTRACT} · read from testnet RPC`;
    } catch {
      list.replaceChildren(h("li", { class: "muted" }, "Testnet RPC did not answer. The explorer retries every 10 s."));
    }
  })();
  return h(
    "aside",
    { class: "live-panel panel", "aria-labelledby": "live-title" },
    h("h2", { id: "live-title" }, "Latest orders on testnet"),
    list,
    foot,
    h("p", { class: "live-foot" }, h("a", { href: "./explorer.html" }, "Open the explorer →")),
  );
}

export function hero() {
  return h(
    "section",
    { class: "hero", "aria-labelledby": "hero-title" },
    h(
      "div",
      { class: "wrap hero-grid" },
      h(
        "div",
        {},
        h("h1", { id: "hero-title" }, "Escrow for purchases made by AI agents."),
        h(
          "p",
          { class: "lead" },
          "Each order locks its price in a NEAR contract as an NFT receipt. The seller is paid only when the owner's mandate allows the order and a verifier accepts the delivery. Otherwise the money returns to the owner's budget.",
        ),
        h("p", { class: "principle" }, "We don't resolve disputes. We prevent them."),
        h(
          "div",
          { class: "hero-actions" },
          h("a", { class: "btn btn-primary", href: "./connect.html" }, "Connect your agent"),
          h("a", { class: "btn", href: "./explorer.html" }, "See it live →"),
        ),
      ),
      livePanel(),
    ),
  );
}
