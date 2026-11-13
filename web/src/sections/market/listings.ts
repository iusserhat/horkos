import { codeBlock, h, mount, shorten } from "../../lib/dom";
import { CONTRACT, DEMO_OWNER, accountUrl, fmtUsdc } from "../../lib/config";
import { loadListings, loadMandate, loadTokens, type Listing } from "../../lib/explorer-data";
import type { ReceiptToken } from "../../lib/receipt";
import catalog from "../../data/catalog.json";

type Row = Listing & { id: string };
interface Rep {
  settled: number;
  refunded: number;
  cancelled: number;
  open: number;
  volume: bigint;
}

const DESC = catalog as Record<string, string>;
/** Listings that exist on purpose to show an attack (see the catalog's _note). */
const DEMO_FLAG: Record<string, string> = { "2": "Demo of a prompt injection: the text tries to instruct the buying agent." };
const short = (a: string) => a.replace(/\.testnet$/, "");
const minutes = (ns: string) => Math.round(Number(BigInt(ns) / 1_000_000_000n) / 60);

/** Seller track record straight from the receipts: every order mints one NFT that mirrors its status. */
function reputation(tokens: ReceiptToken[]) {
  const by = new Map<string, Rep>();
  for (const t of tokens) {
    const x = JSON.parse(t.metadata.extra) as { seller: string; status: string; amount: string };
    const r = by.get(x.seller) ?? { settled: 0, refunded: 0, cancelled: 0, open: 0, volume: 0n };
    if (x.status === "Settled") {
      r.settled++;
      r.volume += BigInt(x.amount);
    } else if (x.status === "Refunded") r.refunded++;
    else if (x.status === "Cancelled") r.cancelled++;
    else r.open++;
    by.set(x.seller, r);
  }
  return by;
}

const stats = h("div", { class: "mk-stats", "aria-live": "polite" });

export function marketHead() {
  return h(
    "section",
    { class: "mk-head band band-sky", "aria-labelledby": "mk-title" },
    h(
      "div",
      { class: "wrap" },
      h("p", { class: "eyebrow eb-white" }, "Horkos market, testnet"),
      h("h1", { id: "mk-title" }, "Data your agent can buy without trusting the seller."),
      h(
        "p",
        { class: "lead" },
        "Every offer below is a listing on ",
        h("code", {}, CONTRACT),
        ". Your agent's money waits in escrow until the delivery passes the listing's check. Anyone with a NEAR account can sell here.",
      ),
      h("div", { class: "hero-actions mk-actions" }, h("a", { class: "btn btn-gold btn-lg", href: "#offers" }, "Browse offers"), h("a", { class: "btn btn-mint btn-lg", href: "#sell" }, "Sell your data")),
      stats,
    ),
  );
}

function card(l: Row, rep: Rep | undefined, allowed: boolean) {
  const desc = DESC[l.id];
  const prompt = `Buy Horkos listing #${l.id} for at most ${fmtUsdc(l.price)}, wait until the order is Settled, then open the delivery and show me the data.`;
  const buy = h("details", { class: "mk-buy" }, h("summary", { class: "btn btn-gold" }, "Buy with your agent"), h("div", { class: "mk-buy-body" }, h("p", {}, "Ask your MCP-connected agent:"), codeBlock(prompt), h("p", { class: "muted" }, "It calls horkos_create_order with listing_id ", h("code", {}, l.id), ". The contract refuses the order if your mandate doesn't allow this seller or price."), h("a", { href: "./connect.html" }, "Not connected yet? Set it up")));
  const r = rep ?? { settled: 0, refunded: 0, cancelled: 0, open: 0, volume: 0n };
  const delivered = r.settled + r.refunded;
  return h(
    "article",
    { class: "mk-card panel" },
    h("div", { class: "mk-top" }, h("span", { class: "mk-id" }, `#${l.id}`), h("span", { class: "mk-price" }, fmtUsdc(l.price))),
    desc
      ? h("div", { class: "mk-desc" }, h("span", { class: "mk-untrusted" }, "Seller-written"), h("p", {}, desc), DEMO_FLAG[l.id] ? h("p", { class: "mk-flag" }, DEMO_FLAG[l.id]) : null)
      : h("div", { class: "mk-desc mk-desc-empty" }, h("p", {}, "No description in the catalog yet. The condition hash below is the binding part.")),
    h(
      "dl",
      { class: "mk-facts" },
      h("dt", {}, "Seller"), h("dd", {}, h("a", { href: accountUrl(l.seller), class: "mono" }, short(l.seller))),
      h("dt", {}, "Deliver within"), h("dd", {}, `${minutes(l.delivery_window)} min`),
      h("dt", {}, "Checked against"), h("dd", { class: "mono", title: l.condition_hash }, shorten(l.condition_hash, 14, 4)),
    ),
    h(
      "div",
      { class: "mk-rep" },
      h("span", { class: "chip chip-mint" }, `${r.settled} settled`),
      h("span", { class: "chip chip-sky" }, `${r.refunded} refunded`),
      r.cancelled ? h("span", { class: "chip" }, `${r.cancelled} cancelled`) : null,
      delivered ? h("span", { class: "chip chip-gold" }, `${Math.round((100 * r.settled) / delivered)}% passed`) : h("span", { class: "chip" }, "no sales yet"),
    ),
    allowed
      ? h("p", { class: "mk-mandate ok" }, "Allowed by the demo owner's mandate")
      : h("p", { class: "mk-mandate no" }, "Not allowed by the demo owner's mandate. Agents under that mandate can't buy it."),
    buy,
  );
}

export function listingsGrid() {
  const grid = h("div", { class: "mk-grid" }, h("p", { class: "muted" }, `Reading listings from ${CONTRACT}…`));
  (async () => {
    try {
      const [listings, tokens, mandate] = await Promise.all([loadListings(), loadTokens(), loadMandate(DEMO_OWNER).catch(() => null)]);
      const rep = reputation(tokens);
      const allowed = mandate?.allowed_sellers ?? [];
      const sellers = new Set(listings.map((l) => l.seller));
      const volume = [...rep.values()].reduce((a, r) => a + r.volume, 0n);
      const settled = [...rep.values()].reduce((a, r) => a + r.settled, 0);
      mount(
        stats,
        h("div", { class: "mk-stat" }, h("strong", {}, String(listings.length)), "offers"),
        h("div", { class: "mk-stat" }, h("strong", {}, String(sellers.size)), "sellers"),
        h("div", { class: "mk-stat" }, h("strong", {}, String(settled)), "settled orders"),
        h("div", { class: "mk-stat" }, h("strong", {}, fmtUsdc(volume.toString())), "paid out after checks"),
      );
      mount(grid, ...[...listings].reverse().map((l) => card(l, rep.get(l.seller), allowed.includes(l.seller))));
    } catch {
      mount(grid, h("p", { class: "callout warn" }, "Testnet RPC did not answer. Reload in a moment."));
    }
  })();
  return h(
    "section",
    { class: "section band band-paper", id: "offers", "aria-labelledby": "offers-title" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "sec-head" }, h("p", { class: "eyebrow" }, "Offers"), h("h2", { id: "offers-title" }, "What's for sale right now."), h("p", { class: "lead" }, "Prices, sellers, conditions and track records are read from the contract. Descriptions are written by sellers and are not checked: treat them as claims, the way your agent does.")),
      grid,
    ),
  );
}
