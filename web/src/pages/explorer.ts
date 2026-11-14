import "@fontsource/fredoka/latin-500.css";
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/fredoka/latin-700.css";
import "@fontsource/nunito/latin-500.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/components.css";
import "../styles/home.css";
import "../styles/connect.css";
import "../styles/explorer.css";
import { h, mount, qs, shorten, tabs } from "../lib/dom";
import { CONTRACT, CONTRACT_V1, CONTRACT_V2, DEMO_OWNER, IS_V2, txUrl } from "../lib/config";
import { badge } from "../lib/status";
import { knownOwners, loadListings, loadMandate, loadOrders, loadTokens, loadTransfers, loadVerifiers, rejectedCalls, type Listing, type Mandate, type Order, type ReceiptTransfer, type VerifierConfig } from "../lib/explorer-data";
import type { ReceiptToken } from "../lib/receipt";
import { header } from "../sections/header";
import { footer } from "../sections/footer";
import { ordersView } from "../sections/explorer/orders";
import { receiptsView } from "../sections/explorer/receipts";
import { mandatesView } from "../sections/explorer/mandates";
import { verifiersView } from "../sections/explorer/verifiers";
import { listingsView } from "../sections/explorer/listings";

const REFRESH_MS = 30_000;
/** Set from the static snapshot (web/public/snapshot-v1|v2.json) until live data arrives. */
let snapshotAt = 0;
let tokens: ReceiptToken[] = [];
let orders: Order[] = [];
let verifiers: (VerifierConfig & { version: number })[] = [];
let listings: (Listing & { id: string })[] = [];
let transfers = new Map<string, ReceiptTransfer[]>();
let transfersAt = 0;
const mandates = new Map<string, Mandate | null>();
const searched: string[] = [];
let lastOk = 0;
let paused = false;
let timer: number | undefined;
let listingsAt = 0;

const ov = ordersView();
const rv = receiptsView();
const mv = mandatesView((owner) => {
  if (!searched.includes(owner)) searched.push(owner);
  refreshMandates().then(renderAll);
});
const vv = verifiersView();
const lv = listingsView();

const status = h("p", { class: "ex-status mono", "aria-live": "polite" }, `${CONTRACT} · reading testnet…`);
const errorBox = h("p", { class: "callout warn", hidden: true });
const pauseBtn = h("button", { class: "btn", type: "button", "aria-pressed": "false" }, "Pause updates");

const rejected = h(
  "details",
  { class: "rejected" },
  h("summary", {}, `Rejected create_order calls (${rejectedCalls.length}): no order, no receipt`),
  h(
    "ul",
    { class: "plain" },
    ...rejectedCalls.map((r) =>
      h("li", {}, badge("Rejected"), " ", h("span", { class: "mono" }, r.reason), h("span", { class: "muted" }, ` · ${r.note} · `), h("a", { class: "tx", href: txUrl(r.tx), title: r.tx }, `tx ${shorten(r.tx)} ↗`)),
    ),
  ),
);

// The rejected-calls list is added after the first load so it does not jump down when the table appears (CLS).
const ordersPanel = h("div", {}, ov.el);
const PANELS: [string, HTMLElement][] = [
  ["Orders", ordersPanel],
  ["Receipts", rv.el],
  ["Mandates", mv.el],
  ["Verifiers", vv.el],
  ["Listings", lv.el],
];
const panel = h("div", { id: "ex-panel", role: "tabpanel", "aria-labelledby": "ex-tab-0", class: "ex-panel" });
const startTab = location.hash.startsWith("#receipt") ? 1 : 0;
const tabList = tabs(
  PANELS.map(([l]) => l),
  (i) => {
    mount(panel, PANELS[i][1]);
    panel.setAttribute("aria-labelledby", `ex-tab-${i}`);
  },
  "ex",
  startTab,
);
mount(panel, PANELS[startTab][1]);
panel.setAttribute("aria-labelledby", `ex-tab-${startTab}`);
let scrolled = false;

async function refreshMandates() {
  await Promise.all(
    knownOwners(tokens, [...searched, ...orders.map((o) => o.buyer)]).map(async (o) => {
      try {
        mandates.set(o, await loadMandate(o));
      } catch {
        /* keep the previous value */
      }
    }),
  );
}

function renderAll() {
  ov.render(orders, tokens);
  rv.render(tokens, orders, verifiers, transfers);
  if (!scrolled && location.hash.startsWith("#receipt-")) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("rc-target");
      scrolled = true;
    }
  }
  mv.render(mandates, DEMO_OWNER);
  vv.render(verifiers);
  lv.render(listings, mandates.get(DEMO_OWNER)?.allowed_sellers ?? []);
}

const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

function tickStatus() {
  if (!lastOk) {
    if (snapshotAt) status.textContent = `${CONTRACT} · ${orders.length} orders · snapshot from ${hhmm(snapshotAt)} UTC · ${errorBox.hidden ? "reading live data…" : "live data unavailable, retrying"}`;
    return;
  }
  const s = Math.round((Date.now() - lastOk) / 1000);
  status.textContent = `${CONTRACT} · ${orders.length} orders · live, updated ${s}s ago · ${paused ? "updates paused" : "refreshes every 30 s"}`;
}

/** Shows the build-time snapshot at once, so the page is never empty. */
async function loadSnapshot() {
  try {
    const res = await fetch(`./snapshot-${IS_V2 ? "v2" : "v1"}.json`, { cache: "no-cache" });
    if (!res.ok) return;
    const snap = await res.json();
    if (lastOk) return; // live data won the race
    tokens = snap.tokens;
    orders = snap.orders;
    listings = snap.listings;
    verifiers = snap.verifiers;
    transfers = new Map(Object.entries(snap.transfers ?? {}) as [string, ReceiptTransfer[]][]);
    for (const [owner, m] of Object.entries(snap.mandates ?? {})) mandates.set(owner, m as Mandate | null);
    snapshotAt = snap.takenAt;
    renderAll();
    if (!IS_V2 && !rejected.isConnected) ordersPanel.append(rejected);
    tickStatus();
  } catch {
    /* live data only */
  }
}

async function refresh() {
  try {
    const t = await loadTokens();
    const o = await loadOrders(t);
    if (!listingsAt || Date.now() - listingsAt > 60_000) {
      const [v, l] = await Promise.all([loadVerifiers(), loadListings()]);
      verifiers = v;
      listings = l;
      listingsAt = Date.now();
    }
    tokens = t;
    orders = o;
    if (IS_V2 && Date.now() - transfersAt > 60_000) {
      try {
        transfers = await loadTransfers();
        transfersAt = Date.now();
      } catch {
        /* keep the previous list */
      }
    }
    await refreshMandates();
    lastOk = Date.now();
    errorBox.hidden = true;
    renderAll();
    if (!IS_V2 && !rejected.isConnected) ordersPanel.append(rejected);
  } catch {
    errorBox.hidden = false;
    errorBox.textContent = lastOk
      ? "Testnet RPC did not answer; showing the last data read. Retrying in 30 s."
      : snapshotAt
        ? `Testnet RPC did not answer; showing the snapshot from ${hhmm(snapshotAt)} UTC. Retrying in 30 s.`
        : "Testnet RPC did not answer. Retrying in 30 s.";
  }
  tickStatus();
  schedule();
}

function schedule() {
  window.clearTimeout(timer);
  if (paused || document.hidden) return;
  timer = window.setTimeout(refresh, REFRESH_MS);
}

pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume updates" : "Pause updates";
  pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
  tickStatus();
  if (!paused) refresh();
  else window.clearTimeout(timer);
});
document.addEventListener("visibilitychange", () => (document.hidden ? window.clearTimeout(timer) : refresh()));
setInterval(tickStatus, 1000);

mount(qs("#header"), header("explorer"));
mount(
  qs("#main"),
  h(
    "div",
    { class: "wrap explorer" },
    h("p", { class: "eyebrow" }, "Explorer · read-only"),
    h("h1", {}, `What is on ${CONTRACT} right now.`),
    h(
      "nav",
      { class: "ex-switch", "aria-label": "Contract" },
      h("a", { href: "./explorer.html", "aria-current": IS_V2 ? null : "page" }, h("b", {}, "v1"), " ", h("span", { class: "mono" }, CONTRACT_V1)),
      h("a", { href: "./explorer.html?contract=v2", "aria-current": IS_V2 ? "page" : null }, h("b", {}, "v2"), " ", h("span", { class: "mono" }, CONTRACT_V2), " · transferable receipts"),
    ),
    h("div", { class: "ex-bar" }, status, pauseBtn),
    errorBox,
    tabList,
    panel,
  ),
);
mount(qs("#footer"), footer());
loadSnapshot().then(refresh);
