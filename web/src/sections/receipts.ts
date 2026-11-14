import { h, mount, reducedMotion, s } from "../lib/dom";
import { receiptCard, type ReceiptToken, type VerifierRef } from "../lib/receipt";
import { view } from "../lib/rpc";
import type { Status } from "../lib/status";

// Order #5 as read from testnet on 13 Nov 2026 (shown until the live read returns).
const FALLBACK: ReceiptToken = {
  token_id: "5",
  owner_id: "horkos-owner.testnet",
  metadata: {
    title: "Horkos receipt #5",
    description: "Escrow receipt for an AI agent purchase",
    issued_at: "1794579775862",
    expires_at: "1794580375862",
    updated_at: "1794579792000",
    extra: JSON.stringify({ order_id: "5", amount: "5000000", token: "tusdc.horkos.testnet", seller: "horkos-seller-a.testnet", listing_id: "0", status: "Settled", deadline: "1794580375862883280" }),
  },
};
const FALLBACK_VERIFIER: VerifierRef = { version: 0, wasm_hash: "61370b5723c11477bd6b4231fc5b3bc7f1a4e0c6844a402feb31fc19470db80f" };

const STATES: { st: Status; by: string }[] = [
  { st: "Open", by: "create_order mints the receipt to the owner; the price is locked." },
  { st: "Verifying", by: "submit_delivery: the seller's delivery is being checked by the verifier in OutLayer." },
  { st: "Delivered", by: "on_verified got an invalid or missing result; the seller may resubmit before the deadline." },
  { st: "Settled", by: "on_verified accepted the delivery: the seller is paid, the buyer's key is stored." },
  { st: "Refunded", by: "refund_expired after the deadline: the price is back in the owner's budget." },
  { st: "Cancelled", by: "cancel_order while Open: the price is back in the owner's budget." },
];

const GLYPH: Record<string, string> = {
  Open: "M-16 -6h32v24h-32z M-10 -6v-7a10 10 0 0 1 20 0v7",
  Verifying: "M8 -2a12 12 0 1 1 -24 0a12 12 0 1 1 24 0 M5 8l11 11",
  Delivered: "M-18 -8h36v24h-36z M-18 -8l18 13 18-13",
  Settled: "M-17 1l11 11 23-24",
  Refunded: "M14 -9h-24l8-8 M-10 -9l8 8 M-15 5h25a7 7 0 0 1 0 14h-10",
  Cancelled: "M-14 -14l28 28 M14 -14l-28 28",
};

/** The receipt drawn as a seal; its colour and glyph follow the order status. */
function seal() {
  const ring = s("path", { id: "rc-ring", d: "M200,200 m-158,0 a158,158 0 1,1 316,0 a158,158 0 1,1 -316,0", fill: "none" });
  const label = s("textPath", { href: "#rc-ring", textLength: 985, lengthAdjust: "spacing" }, "RECEIPT #5 · 5 tUSDC · horkos-seller-a · escrow.horkos.testnet ·");
  const glyph = s("path", { class: "seal-glyph", transform: "translate(200 148)", d: GLYPH.Open });
  const state = s("text", { class: "seal-state", x: 200, y: 226, "text-anchor": "middle" }, "Open");
  const svg = s(
    "svg",
    { class: "seal", viewBox: "0 0 400 400", role: "img", "aria-label": "Receipt #5 seal" },
    s("defs", {}, ring),
    s("circle", { class: "seal-rim", cx: 200, cy: 200, r: 190 }),
    s("text", { class: "seal-ring" }, label),
    s(
      "g",
      { class: "seal-stamp" },
      s("circle", { class: "seal-core", cx: 200, cy: 200, r: 132 }),
      s("circle", { class: "seal-sweep", cx: 200, cy: 200, r: 132, "stroke-dasharray": "110 720" }),
      glyph,
      state,
      s("text", { class: "seal-amount", x: 200, y: 258, "text-anchor": "middle" }, "5 tUSDC"),
    ),
  );
  const set = (st: Status) => {
    svg.dataset.state = "";
    void svg.getBoundingClientRect();
    svg.dataset.state = st;
    glyph.setAttribute("d", GLYPH[st]);
    state.textContent = st;
    svg.setAttribute("aria-label", `Receipt #5 seal, status ${st}`);
  };
  return { svg, set };
}

export function receipts() {
  let token = FALLBACK;
  let verifier = FALLBACK_VERIFIER;
  let selected: Status = "Open";
  let auto = !reducedMotion();
  let timer = 0;
  const TOUR: Status[] = ["Open", "Verifying", "Settled"];

  const sealView = seal();
  const cardSlot = h("div", { class: "rc-slot" });
  const caption = h("p", { class: "rc-caption", "aria-live": "polite" });
  const json = h("code", {});
  const seg = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Receipt status" });

  const render = () => {
    mount(cardSlot, receiptCard(token, selected, verifier));
    sealView.set(selected);
    caption.replaceChildren(h("strong", {}, `${selected}: `), STATES.find((s) => s.st === selected)!.by);
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.st === selected ? "true" : "false"));
    json.textContent = JSON.stringify({ ...token.metadata, extra: JSON.parse(token.metadata.extra) }, null, 2);
  };
  const stopTour = () => {
    auto = false;
    window.clearTimeout(timer);
  };
  const tour = () => {
    if (!auto) return;
    const i = TOUR.indexOf(selected);
    selected = TOUR[(i + 1) % TOUR.length];
    render();
    timer = window.setTimeout(tour, selected === "Settled" ? 4200 : 2600);
  };

  STATES.forEach(({ st }) => {
    const b = h("button", { type: "button", role: "radio", "data-st": st, "aria-checked": "false" }, st);
    b.addEventListener("click", () => {
      stopTour();
      selected = st;
      render();
    });
    b.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      const i = STATES.findIndex((s) => s.st === selected);
      const n = k === "ArrowRight" || k === "ArrowDown" ? 1 : k === "ArrowLeft" || k === "ArrowUp" ? -1 : 0;
      if (!n) return;
      e.preventDefault();
      stopTour();
      selected = STATES[(i + n + STATES.length) % STATES.length].st;
      render();
      (seg.querySelector(`[data-st="${selected}"]`) as HTMLElement).focus();
    });
    seg.append(b);
  });

  (async () => {
    try {
      const [t, order] = await Promise.all([view<ReceiptToken>("nft_token", { token_id: "5" }), view<{ verifier_version: number }>("get_order", { order_id: "5" })]);
      const v = await view<{ wasm_hash: string }>("get_verifier_version", { version: order.verifier_version });
      token = t;
      verifier = { version: order.verifier_version, wasm_hash: v.wasm_hash };
      render();
    } catch {
      /* keep the snapshot */
    }
  })();
  if (!auto) selected = "Settled";
  render();
  if (auto) {
    // start the tour only once the section is on screen
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        timer = window.setTimeout(tour, 1600);
      }
    }, { threshold: 0.35 });
    queueMicrotask(() => io.observe(sealView.svg));
  }

  const why = (title: string, body: (Node | string)[], cls: string) => h("li", { class: `why ${cls}` }, h("h3", {}, title), h("p", {}, ...body));

  return h(
    "section",
    { class: "section band band-sky", id: "receipts", "aria-labelledby": "rc-title" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "sec-head" },
        h("p", { class: "eyebrow eb-white" }, "NFT receipts, real order #5"),
        h("h2", { id: "rc-title" }, "Watch the seal close."),
        h("p", { class: "lead" }, "Every order is an NFT whose status mirrors the escrow. Only the contract can change it."),
      ),
      h(
        "div",
        { class: "rc-stage panel" },
        h("div", { class: "rc-seal" }, sealView.svg, seg, caption),
        h("div", {}, cardSlot, h("p", { class: "muted rc-note" }, "The card is receipt #5 read live from testnet. The buttons only switch its status, to show how the same token reads in each state.")),
      ),
      h(
        "ul",
        { class: "why-grid" },
        why("It proves where the money is.", ["Locked, being checked, paid out or refunded: anyone can read it with ", h("code", {}, "nft_token"), "."], "w-mint"),
        why("Only the contract changes it.", ["Status moves only through create_order, submit_delivery, on_verified, refund_expired and cancel_order. There is no method to edit it by hand."], "w-gold"),
        why("Transferable on v2.", ["On the main contract the receipt stays with the buyer. On ", h("code", {}, "escrow-v2.horkos.testnet"), " it moves with ", h("code", {}, "nft_transfer"), " while the order is open, and a refund goes to whoever holds it."], "w-lilac"),
      ),
      h("details", { class: "rc-json" }, h("summary", {}, "Show the metadata exactly as nft_token returns it"), h("pre", { class: "code" }, json)),
    ),
  );
}
