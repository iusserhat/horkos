import { h } from "../lib/dom";
import { CONTRACT, fmtUsdc } from "../lib/config";
import { view } from "../lib/rpc";
import { badge, type Status } from "../lib/status";

interface Token {
  token_id: string;
  metadata: { extra: string; updated_at: string };
}

const ago = (ms: number) => {
  const sec = Math.max(0, (Date.now() - ms) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};

/** Newest 5 orders, swapping in the newest Settled / Refunded / Cancelled one if a status is missing. */
function pick(tokens: Token[]) {
  const newest = [...tokens].reverse();
  const chosen = newest.slice(0, 5);
  for (const st of ["Settled", "Refunded", "Cancelled"]) {
    const has = (t: Token) => JSON.parse(t.metadata.extra).status === st;
    if (chosen.some(has)) continue;
    const found = newest.find(has);
    if (!found) continue;
    // replace the oldest entry whose status is not the only one of its kind
    for (let i = chosen.length - 1; i >= 0; i--) {
      const sti = JSON.parse(chosen[i].metadata.extra).status;
      if (chosen.filter((t) => JSON.parse(t.metadata.extra).status === sti).length > 1) {
        chosen.splice(i, 1);
        break;
      }
    }
    chosen.push(found);
  }
  return chosen.sort((a, b) => Number(b.token_id) - Number(a.token_id));
}

/** Orders straight from chain: every order mints one NFT receipt whose metadata mirrors the order. */
function livePanel() {
  const list = h("ul", { class: "live-list", "aria-live": "polite" }, h("li", { class: "muted" }, "Reading escrow.horkos.testnet…"));
  const foot = h("p", { class: "live-foot mono" }, `${CONTRACT} · read from testnet RPC`);
  (async () => {
    try {
      const total = Number(await view<string>("nft_total_supply"));
      const tokens: Token[] = [];
      for (let from = 0; from < total; from += 50) tokens.push(...(await view<Token[]>("nft_tokens", { from_index: String(from), limit: 50 })));
      list.replaceChildren(
        ...pick(tokens).map((t) => {
          const o = JSON.parse(t.metadata.extra) as { order_id: string; amount: string; seller: string; status: Status };
          const when = Number(t.metadata.updated_at);
          return h(
            "li",
            {},
            h("span", { class: "oid" }, `#${o.order_id}`),
            h(
              "span",
              { class: "live-what" },
              h("span", { title: o.seller }, `${fmtUsdc(o.amount)} · ${o.seller.replace(/^horkos-|\.testnet$/g, "")}`),
              h("time", { class: "live-time mono", datetime: new Date(when).toISOString(), title: new Date(when).toISOString() }, ago(when)),
            ),
            badge(o.status),
          );
        }),
      );
      foot.textContent = `${total} orders on ${CONTRACT} · time = last status change · read from testnet RPC`;
    } catch {
      list.replaceChildren(h("li", { class: "muted" }, "Testnet RPC did not answer. The explorer retries every 10 s."));
    }
  })();
  return h(
    "aside",
    { class: "live-panel panel", "aria-labelledby": "live-title" },
    h("h2", { id: "live-title" }, "Orders on testnet"),
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
