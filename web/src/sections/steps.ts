import { h, s } from "../lib/dom";

/**
 * "How an order moves": one order in four steps, each a glass bubble on the
 * sticker system. A wavy ink path joins the bubbles; on first view a gold
 * "payment" dot travels along it once and a seal pops on the last step
 * (static under prefers-reduced-motion). The path is measured from the
 * rendered bubbles, so it follows the layout: 4 across, 2×2, or a column.
 */

const TX = "https://testnet.nearblocks.io/txns/";
const REPO = "https://github.com/iusserhat/horkos/blob/main/";

type Step = { tag: string; tint: string; title: string; body: string; proof: [string, string] };

const STEPS: Step[] = [
  {
    tag: "Agents",
    tint: "sky",
    title: "Your agent places an order",
    body: "Claude or any MCP agent picks a listing and orders within the budget its owner set.",
    proof: [`${TX}E2qVhqF9HpWqTCbTwRTktxd65dV4HRR3x8ng9BgqueGo`, "Order 26, placed by an agent"],
  },
  {
    tag: "Real world",
    tint: "mint",
    title: "For data from the real world",
    body: "Prices, filings, weather: the seller fetches it live and delivers it encrypted.",
    proof: [`${TX}22SUFSDMVzJ2N2Joq37m9dNSKvTzM3YyPTQrfMXwC3hs`, "Order 26, live NEAR/USD prices delivered"],
  },
  {
    tag: "Security",
    tint: "coral",
    title: "Checked before anyone is paid",
    body: "The mandate blocks orders outside the owner's limits. A TEE checks the delivery against the listing.",
    proof: [`${REPO}evidence/attestation/README.md`, "TEE attestation for settled orders"],
  },
  {
    tag: "NFTs",
    tint: "lilac",
    title: "Closed on an NFT receipt",
    body: "Every order is a receipt that carries the claim. Pass it on, and the refund goes with it.",
    proof: [`${TX}4NFBbMtoh9cmkm8HoWW8b1ty41GcB3A3yoL4KWF66tti`, "Receipt passed on, refund paid to the new holder"],
  },
];

const seal = () =>
  s(
    "svg",
    { class: "lq-seal", viewBox: "0 0 44 44", "aria-hidden": "true" },
    s("circle", { cx: 22, cy: 22, r: 19, fill: "var(--gold)", stroke: "var(--ink)", "stroke-width": 3 }),
    s("path", { d: "M14 23l6 6 11-12", fill: "none", stroke: "var(--ink)", "stroke-width": 3.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );

export function steps() {
  const items = STEPS.map((st, i) =>
    h(
      "li",
      { class: `lq-bubble lq-${st.tint}` },
      h("span", { class: "lq-num", "aria-hidden": "true" }, String(i + 1)),
      h("span", { class: "lq-tag" }, st.tag),
      h("h3", {}, st.title),
      h("p", {}, st.body),
      h("a", { class: "lq-proof", href: st.proof[0], target: "_blank", rel: "noopener" }, "see it on testnet", h("span", { class: "visually-hidden" }, `: ${st.proof[1]}`), " ↗"),
      i === 3 ? seal() : null,
    ),
  );
  const path = s("path", { class: "lq-path", d: "" });
  const dot = s("circle", { class: "lq-dot", r: 7, cx: -20, cy: -20 });
  const svg = s("svg", { class: "lq-wire", "aria-hidden": "true" }, path, dot);
  const list = h("ol", { class: "lq-flow" }, ...items);
  const stage = h("div", { class: "lq-stage" }, svg, list);

  const section = h(
    "section",
    { class: "section band lq-band", id: "steps", "aria-labelledby": "steps-title" },
    h("span", { class: "lq-blob lq-b1", "aria-hidden": "true" }),
    h("span", { class: "lq-blob lq-b2", "aria-hidden": "true" }),
    h("span", { class: "lq-blob lq-b3", "aria-hidden": "true" }),
    h("span", { class: "lq-blob lq-b4", "aria-hidden": "true" }),
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "sec-head" }, h("h2", { id: "steps-title" }, "How an order moves"), h("p", { class: "lead" }, "One order, four steps. Nobody is paid until the delivery checks out.")),
      stage,
    ),
  );

  // Path through the bubbles, measured from the layout.
  const draw = () => {
    const box = stage.getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.setAttribute("width", String(box.width));
    svg.setAttribute("height", String(box.height));
    const column = getComputedStyle(list).gridTemplateColumns.split(" ").length === 1;
    const rects = items.map((li) => {
      const r = li.getBoundingClientRect();
      return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top };
    });
    let d = "";
    if (column) {
      // Down the left gutter, a gentle wave past each bubble.
      const x = 18;
      d = `M ${x} ${rects[0].t + 24}`;
      for (let i = 1; i < rects.length; i++) {
        const y0 = rects[i - 1].t + 24;
        const y1 = rects[i].t + 24;
        const amp = i % 2 ? 14 : -14;
        d += ` C ${x + amp} ${y0 + (y1 - y0) / 3}, ${x - amp} ${y0 + (2 * (y1 - y0)) / 3}, ${x} ${y1}`;
      }
      d += ` L ${x} ${rects[rects.length - 1].t + 60}`;
    } else {
      // From each bubble's side to the next one, looping through the gap.
      for (let i = 0; i < rects.length - 1; i++) {
        const a = rects[i];
        const b = rects[i + 1];
        const sameRow = b.l > a.l;
        const ay = (a.t + a.b) / 2;
        const by = (b.t + b.b) / 2;
        if (sameRow) {
          const gap = b.l - a.r;
          d += `${i ? " " : ""}M ${a.r} ${ay} C ${a.r + gap * 0.9} ${ay}, ${b.l - gap * 0.9} ${by}, ${b.l} ${by}`;
        } else {
          // 2×2: from the bottom of bubble 2 back to the top of bubble 3.
          const ax = (a.l + a.r) / 2;
          const bx = (b.l + b.r) / 2;
          d += ` M ${ax} ${a.b} C ${ax} ${a.b + 70}, ${bx} ${b.t - 70}, ${bx} ${b.t}`;
        }
      }
    }
    path.setAttribute("d", d);
  };
  new ResizeObserver(draw).observe(stage);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) {
    section.classList.add("lq-done");
  } else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        draw();
        const len = path.getTotalLength();
        const t0 = performance.now();
        const ms = 2600;
        section.classList.add("lq-run");
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / ms);
          const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const p = path.getPointAtLength(ease * len);
          dot.setAttribute("cx", String(p.x));
          dot.setAttribute("cy", String(p.y));
          if (k < 1) requestAnimationFrame(tick);
          else section.classList.add("lq-done");
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );
    io.observe(stage);
  } else {
    section.classList.add("lq-done");
  }
  return section;
}
