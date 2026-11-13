import { h, reducedMotion, s, tabs } from "../lib/dom";
import { badge, statusIcon, type Status } from "../lib/status";
import { EDGE_LABEL, NODES, SCENARIOS, type EdgeId, type NodeId, type Scenario } from "./flow-data";

type Box = { x: number; y: number; w: number; h: number };
type Track = "owner" | "agent" | "seller" | "tee" | "nft";
type Layout = { w: number; h: number; font: number; nodes: Record<NodeId, Box>; labelAt: Record<Track, number> };

const WIDE: Layout = {
  w: 960,
  h: 430,
  font: 15,
  nodes: {
    owner: { x: 40, y: 40, w: 190, h: 64 },
    seller: { x: 730, y: 40, w: 190, h: 64 },
    escrow: { x: 370, y: 160, w: 220, h: 88 },
    agent: { x: 40, y: 300, w: 190, h: 64 },
    tee: { x: 730, y: 300, w: 190, h: 64 },
    nft: { x: 385, y: 340, w: 190, h: 64 },
  },
  labelAt: { owner: 0.5, agent: 0.5, seller: 0.5, tee: 0.5, nft: 0.5 },
};

const NARROW: Layout = {
  w: 360,
  h: 610,
  font: 14,
  nodes: {
    owner: { x: 8, y: 8, w: 160, h: 64 },
    agent: { x: 192, y: 8, w: 160, h: 64 },
    escrow: { x: 90, y: 200, w: 180, h: 80 },
    seller: { x: 8, y: 380, w: 160, h: 64 },
    tee: { x: 192, y: 380, w: 160, h: 64 },
    nft: { x: 100, y: 538, w: 160, h: 64 },
  },
  // seller and tee labels sit at different heights so they never overlap when both are active
  labelAt: { owner: 0.5, agent: 0.5, seller: 0.3, tee: 0.72, nft: 0.5 },
};

/** Every edge runs along one track between the escrow and another node; `out` = from the escrow. */
const EDGES: Record<EdgeId, { track: Track; out: boolean }> = {
  "owner-escrow": { track: "owner", out: false },
  "escrow-owner": { track: "owner", out: true },
  "agent-escrow": { track: "agent", out: false },
  "escrow-agent": { track: "agent", out: true },
  "seller-escrow": { track: "seller", out: false },
  "escrow-seller": { track: "seller", out: true },
  "escrow-tee": { track: "tee", out: true },
  "tee-escrow": { track: "tee", out: false },
  "escrow-nft": { track: "nft", out: true },
};
const TRACKS: Track[] = ["owner", "agent", "seller", "tee", "nft"];

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Point where the ray from the box center towards (tx, ty) leaves the box, plus a gap. */
function exitPoint(b: Box, tx: number, ty: number, gap = 8) {
  const c = center(b);
  const dx = tx - c.x;
  const dy = ty - c.y;
  const sx = dx === 0 ? Infinity : (b.w / 2 + gap) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (b.h / 2 + gap) / Math.abs(dy);
  const k = Math.min(sx, sy);
  return { x: c.x + dx * k, y: c.y + dy * k };
}

function trackGeometry(layout: Layout, t: Track) {
  const E = layout.nodes.escrow;
  const N = layout.nodes[t];
  const a = exitPoint(E, center(N).x, center(N).y);
  const b = exitPoint(N, center(E).x, center(E).y);
  const k = layout.labelAt[t];
  return { a, b, label: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } };
}

function buildSvg(layout: Layout) {
  const svg = s("svg", {
    viewBox: `0 0 ${layout.w} ${layout.h}`,
    class: "flow-svg",
    role: "img",
    "aria-labelledby": "flow-svg-title",
    style: `--flow-font:${layout.font}px`,
  });
  svg.append(s("title", { id: "flow-svg-title" }, "Horkos order flow between owner, agent, escrow contract, NFT receipt, seller and OutLayer TEE"));
  const defs = s("defs");
  for (const kind of ["active", "rejected"]) {
    defs.append(
      s("marker", { id: `flow-arrow-${kind}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse", class: `arrow-${kind}` }, s("path", { d: "M0 0 L10 5 L0 10 Z" })),
    );
  }
  svg.append(defs);

  const charW = (layout.font - 2) * 0.6; // IBM Plex Mono advance width ≈ 0.6 em
  const tracks = new Map<Track, { line: SVGLineElement; pill: SVGGElement; rect: SVGRectElement; text: SVGTextElement; g: ReturnType<typeof trackGeometry> }>();
  const lineLayer = s("g");
  const labelLayer = s("g");
  for (const t of TRACKS) {
    const g = trackGeometry(layout, t);
    const line = s("line", { x1: g.a.x, y1: g.a.y, x2: g.b.x, y2: g.b.y, class: "flow-edge" });
    const rect = s("rect", { class: "flow-pill", rx: 4, height: layout.font + 8, y: g.label.y - (layout.font + 8) / 2 });
    const text = s("text", { x: g.label.x, y: g.label.y, "text-anchor": "middle", "dominant-baseline": "central", class: "flow-edge-label" });
    const pill = s("g", { class: "flow-pill-g", visibility: "hidden" }, rect, text);
    lineLayer.append(line);
    labelLayer.append(pill);
    tracks.set(t, { line, pill, rect, text, g });
  }
  svg.append(lineLayer);

  const nodes = new Map<NodeId, SVGGElement>();
  for (const id of Object.keys(layout.nodes) as NodeId[]) {
    const b = layout.nodes[id];
    const c = center(b);
    const g = s(
      "g",
      { class: `flow-node${id === "escrow" ? " is-escrow" : ""}` },
      s("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 8 }),
      s("text", { x: c.x, y: c.y - 6, "text-anchor": "middle", class: "flow-node-label" }, NODES[id].label),
      s("text", { x: c.x, y: c.y + 14, "text-anchor": "middle", class: "flow-node-sub" }, NODES[id].sub),
    );
    nodes.set(id, g);
    svg.append(g);
  }
  svg.append(labelLayer);
  const token = s("circle", { r: 6, class: "flow-token", cx: -20, cy: -20, opacity: 0 });
  svg.append(token);

  /** Shows `edges` as active (or rejected) and hides the other tracks' labels. Returns the first edge's endpoints. */
  const setEdges = (edges: EdgeId[], rejected: boolean) => {
    let first: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;
    for (const [t, tr] of tracks) {
      const id = edges.find((e) => EDGES[e].track === t);
      const kind = id ? (rejected ? "rejected" : "active") : "idle";
      tr.line.setAttribute("class", `flow-edge is-${kind}`);
      tr.line.removeAttribute("marker-start");
      tr.line.removeAttribute("marker-end");
      if (id) {
        const out = EDGES[id].out;
        tr.line.setAttribute(out ? "marker-end" : "marker-start", `url(#flow-arrow-${kind})`);
        const label = EDGE_LABEL[id];
        const w = label.length * charW + 14;
        tr.text.textContent = label;
        tr.text.setAttribute("class", `flow-edge-label is-${kind}`);
        tr.rect.setAttribute("x", String(tr.g.label.x - w / 2));
        tr.rect.setAttribute("width", String(w));
        tr.rect.setAttribute("class", `flow-pill is-${kind}`);
        tr.pill.setAttribute("visibility", "visible");
        if (!first) first = out ? { from: tr.g.a, to: tr.g.b } : { from: tr.g.b, to: tr.g.a };
      } else {
        tr.pill.setAttribute("visibility", "hidden");
      }
    }
    return first;
  };
  return { svg, nodes, token, setEdges };
}

export function flow() {
  let scenario: Scenario = SCENARIOS[0];
  let index = 0;
  let playing = !reducedMotion();
  let userPaused = false;
  let hovered = false;
  let visible = false;
  let timer: number | undefined;
  let raf: number | undefined;

  const narrowMq = window.matchMedia("(max-width: 640px)");
  let built = buildSvg(narrowMq.matches ? NARROW : WIDE);

  const STRIP: Status[] = ["Open", "Verifying", "Delivered", "Settled", "Refunded", "Cancelled"];
  const strip = h("ol", { class: "status-strip", "aria-label": "Order status" }, ...STRIP.map((st) => h("li", { "data-st": st }, statusIcon(st), st)));
  const figure = h("div", { class: "flow-figure panel" }, built.svg, strip);
  const stepCount = h("p", { class: "flow-count mono" });
  const stepTitle = h("h3", { class: "flow-title" });
  const contractLine = h("p", { class: "flow-contract" });
  const statusSlot = h("div", { class: "flow-status" });
  const dots = h("div", { class: "flow-dots", role: "group", "aria-label": "Steps" });
  const live = h("div", { class: "flow-caption", "aria-live": "polite" }, stepCount, stepTitle, contractLine, statusSlot);

  const prev = h("button", { class: "btn", type: "button", "aria-label": "Previous step" }, "← Prev");
  const play = h("button", { class: "btn flow-play", type: "button" });
  const next = h("button", { class: "btn", type: "button", "aria-label": "Next step" }, "Next →");

  const moveToken = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (raf) cancelAnimationFrame(raf);
    const t = built.token;
    if (reducedMotion()) {
      t.setAttribute("opacity", "0");
      return;
    }
    t.setAttribute("opacity", "1");
    const t0 = performance.now();
    const dur = 600;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      t.setAttribute("cx", String(from.x + (to.x - from.x) * e));
      t.setAttribute("cy", String(from.y + (to.y - from.y) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else t.setAttribute("opacity", "0");
    };
    raf = requestAnimationFrame(tick);
  };

  const render = () => {
    const step = scenario.steps[index];
    const first = built.setEdges(step.edges, Boolean(step.rejected));
    for (const [id, n] of built.nodes) {
      const cls = ["flow-node", id === "escrow" ? "is-escrow" : "", step.nodes.includes(id) ? "is-active" : "", step.dim?.includes(id) ? "is-dim" : ""];
      n.setAttribute("class", cls.filter(Boolean).join(" "));
    }
    built.token.setAttribute("class", `flow-token${step.rejected ? " is-rejected" : ""}`);
    strip.querySelectorAll("li").forEach((li) => {
      const on = li.dataset.st === step.status;
      li.className = on ? `is-current st-${step.status}` : "";
      if (on) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    strip.dataset.note = step.status === "Rejected" ? "No order was created" : step.status === null ? "No order yet" : "";
    if (first) moveToken(first.from, first.to);
    else built.token.setAttribute("opacity", "0");
    stepCount.textContent = `${scenario.label} · step ${index + 1} of ${scenario.steps.length}`;
    stepTitle.textContent = step.title;
    contractLine.replaceChildren(h("span", { class: "muted" }, "In the contract: "), step.contract);
    statusSlot.replaceChildren(h("span", { class: "muted" }, "Order: "), step.status ? badge(step.status) : h("span", { class: "muted" }, "no order yet"));
    dots.replaceChildren(
      ...scenario.steps.map((st, i) =>
        h("button", {
          class: "flow-dot",
          type: "button",
          "aria-label": `Step ${i + 1}: ${st.title}`,
          "aria-current": i === index ? "step" : null,
          onclick: () => {
            index = i;
            pauseByUser();
            render();
          },
        }),
      ),
    );
    play.textContent = playing ? "Pause" : "Play";
    play.setAttribute("aria-label", playing ? "Pause autoplay" : "Start autoplay");
    play.setAttribute("aria-pressed", playing ? "true" : "false");
  };

  const schedule = () => {
    window.clearTimeout(timer);
    if (!playing || hovered || !visible || document.hidden) return;
    timer = window.setTimeout(() => {
      index = (index + 1) % scenario.steps.length;
      render();
      schedule();
    }, 3500);
  };
  const pauseByUser = () => {
    userPaused = true;
    playing = false;
    schedule();
  };

  prev.addEventListener("click", () => {
    index = (index - 1 + scenario.steps.length) % scenario.steps.length;
    pauseByUser();
    render();
  });
  next.addEventListener("click", () => {
    index = (index + 1) % scenario.steps.length;
    pauseByUser();
    render();
  });
  play.addEventListener("click", () => {
    playing = !playing;
    userPaused = !playing;
    render();
    schedule();
  });

  const tabList = tabs(
    SCENARIOS.map((sc) => sc.label),
    (i) => {
      scenario = SCENARIOS[i];
      index = 0;
      render();
      schedule();
    },
    "flow",
  );

  const panel = h("div", { id: "flow-panel", role: "tabpanel", "aria-labelledby": "flow-tab-0", class: "flow-panel" }, figure, h("div", { class: "flow-side" }, live, h("div", { class: "flow-controls" }, prev, play, next, dots)));
  tabList.addEventListener("click", () => panel.setAttribute("aria-labelledby", tabList.querySelector('[aria-selected="true"]')?.id ?? "flow-tab-0"));

  panel.addEventListener("mouseenter", () => {
    hovered = true;
    schedule();
  });
  panel.addEventListener("mouseleave", () => {
    hovered = false;
    schedule();
  });
  panel.addEventListener("focusin", () => {
    hovered = true;
    schedule();
  });
  panel.addEventListener("focusout", () => {
    hovered = false;
    schedule();
  });
  document.addEventListener("visibilitychange", schedule);
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    schedule();
  }, { threshold: 0.3 }).observe(figure);
  narrowMq.addEventListener("change", () => {
    built = buildSvg(narrowMq.matches ? NARROW : WIDE);
    figure.replaceChildren(built.svg, strip);
    render();
  });
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
    if (e.matches) {
      playing = false;
      render();
      schedule();
    } else if (!userPaused) {
      playing = true;
      render();
      schedule();
    }
  });

  render();

  return h(
    "section",
    { class: "section", id: "how", "aria-labelledby": "how-title" },
    h(
      "div",
      { class: "wrap stack" },
      h("p", { class: "eyebrow" }, "How it works"),
      h("h2", { id: "how-title" }, "One order, step by step."),
      h("p", { class: "muted" }, "Each step names what escrow.horkos.testnet does at that point; the verification step runs off chain in OutLayer."),
      tabList,
      panel,
    ),
  );
}
