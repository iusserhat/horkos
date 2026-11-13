import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/components.css";
import "../styles/home.css";
import "../styles/connect.css";
import "../styles/explorer.css";
import { h, mount, qs, shorten, tabs } from "../lib/dom";
import { CONTRACT, DEMO_OWNER, txUrl } from "../lib/config";
import { badge } from "../lib/status";
import { knownOwners, loadListings, loadMandate, loadOrders, loadTokens, loadVerifiers, rejectedCalls, type Listing, type Mandate, type Order, type VerifierConfig } from "../lib/explorer-data";
import type { ReceiptToken } from "../lib/receipt";
import { header } from "../sections/header";
import { footer } from "../sections/footer";
import { ordersView } from "../sections/explorer/orders";
import { receiptsView } from "../sections/explorer/receipts";
import { mandatesView } from "../sections/explorer/mandates";
import { verifiersView } from "../sections/explorer/verifiers";
import { listingsView } from "../sections/explorer/listings";

const REFRESH_MS = 10_000;
let tokens: ReceiptToken[] = [];
let orders: Order[] = [];
let verifiers: (VerifierConfig & { version: number })[] = [];
let listings: (Listing & { id: string })[] = [];
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
const tabList = tabs(
  PANELS.map(([l]) => l),
  (i) => {
    mount(panel, PANELS[i][1]);
    panel.setAttribute("aria-labelledby", `ex-tab-${i}`);
  },
  "ex",
);
mount(panel, PANELS[0][1]);

async function refreshMandates() {
  await Promise.all(
    knownOwners(tokens, searched).map(async (o) => {
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
  rv.render(tokens, orders, verifiers);
  mv.render(mandates, DEMO_OWNER);
  vv.render(verifiers);
  lv.render(listings, mandates.get(DEMO_OWNER)?.allowed_sellers ?? []);
}

function tickStatus() {
  if (!lastOk) return;
  const s = Math.round((Date.now() - lastOk) / 1000);
  status.textContent = `${CONTRACT} · ${orders.length} orders · updated ${s}s ago · ${paused ? "updates paused" : "refreshes every 10 s"}`;
}

async function refresh() {
  try {
    tokens = await loadTokens();
    orders = await loadOrders(tokens);
    if (!verifiers.length || Date.now() - listingsAt > 60_000) {
      [verifiers, listings] = await Promise.all([loadVerifiers(), loadListings()]);
      listingsAt = Date.now();
    }
    await refreshMandates();
    lastOk = Date.now();
    errorBox.hidden = true;
    renderAll();
    if (!rejected.isConnected) ordersPanel.append(rejected);
  } catch {
    errorBox.hidden = false;
    errorBox.textContent = lastOk ? "Testnet RPC did not answer; showing the last data read. Retrying in 10 s." : "Testnet RPC did not answer. Retrying in 10 s.";
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
    h("h1", {}, "What is on escrow.horkos.testnet right now."),
    h("div", { class: "ex-bar" }, status, pauseBtn),
    errorBox,
    tabList,
    panel,
  ),
);
mount(qs("#footer"), footer());
refresh();
