import { h, s } from "./dom";

export type Status = "Open" | "Verifying" | "Delivered" | "Settled" | "Refunded" | "Cancelled" | "Rejected";

/** Icon shape per status, so the badge never relies on color alone (brief §7). */
export function statusIcon(st: Status) {
  const a = { viewBox: "0 0 10 10", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.6" };
  switch (st) {
    case "Open":
      return s("svg", a, s("circle", { cx: 5, cy: 5, r: 3.6 }));
    case "Verifying":
      return s("svg", a, s("circle", { cx: 5, cy: 5, r: 3.6 }), s("path", { d: "M5 1.4 A3.6 3.6 0 0 1 5 8.6 Z", fill: "currentColor" }));
    case "Delivered":
      return s("svg", a, s("path", { d: "M5 1.2 L9 8.6 H1 Z" }));
    case "Settled":
      return s("svg", a, s("path", { d: "M1.4 5.2 L4 7.8 L8.8 2.4" }));
    case "Refunded":
      return s("svg", a, s("path", { d: "M8.6 3.4 H3 M5 1.2 L2.6 3.4 L5 5.6 M2.6 8.6 H8.6" }));
    case "Cancelled":
      return s("svg", a, s("circle", { cx: 5, cy: 5, r: 3.6 }), s("path", { d: "M2.4 7.6 L7.6 2.4" }));
    case "Rejected":
      return s("svg", a, s("path", { d: "M2 2 L8 8 M8 2 L2 8" }));
  }
}

export function badge(st: Status) {
  return h("span", { class: `badge st-${st}` }, statusIcon(st), st);
}
