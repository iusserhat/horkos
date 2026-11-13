import { s } from "./dom";

const INK = "#1d2140";

/** The Horkos mark: a gold seal with a check. `ring` is the outline colour (white on the dark footer). */
export function logo(ring = INK) {
  return s(
    "svg",
    { viewBox: "0 0 40 40", "aria-hidden": "true" },
    s("circle", { cx: 20, cy: 20, r: 17, fill: "#ffd873", stroke: ring, "stroke-width": 3 }),
    s("path", { d: "M13 20.5l5 5 9-10", fill: "none", stroke: INK, "stroke-width": 3.2, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  );
}

/** Hero mascot: a happy wax seal. */
export function mascot() {
  return s(
    "svg",
    { viewBox: "0 0 132 132", class: "mascot", "aria-hidden": "true" },
    s("path", {
      d: "M66 6l11 9 14-3 5 13 13 6-3 14 9 11-9 11 3 14-13 6-5 13-14-3-11 9-11-9-14 3-5-13-13-6 3-14-9-11 9-11-3-14 13-6 5-13 14 3z",
      fill: "#ffd873",
      stroke: INK,
      "stroke-width": 3.5,
      "stroke-linejoin": "round",
    }),
    s("circle", { cx: 66, cy: 66, r: 36, fill: "none", stroke: INK, "stroke-width": 2.5, "stroke-dasharray": "5 6" }),
    s("circle", { class: "eye", cx: 54, cy: 60, r: 4.5, fill: INK }),
    s("circle", { class: "eye", cx: 78, cy: 60, r: 4.5, fill: INK }),
    s("path", { d: "M54 74q12 11 24 0", fill: "none", stroke: INK, "stroke-width": 3.5, "stroke-linecap": "round" }),
    s("circle", { cx: 46, cy: 72, r: 5, fill: "#ffb4a0" }),
    s("circle", { cx: 86, cy: 72, r: 5, fill: "#ffb4a0" }),
  );
}

/** Hero doodles: the things an order is made of (coin, lock, key, receipt, sparkles). */
export function doodles() {
  const st = { stroke: INK, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" };
  const box = (cls: string, w: number, hgt: number, ...kids: SVGElement[]) =>
    s("svg", { class: `doodle ${cls}`, width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, "aria-hidden": "true" }, ...kids);
  return [
    box("d-coin", 86, 86,
      s("circle", { cx: 43, cy: 43, r: 30, fill: "#ffd873", ...st }),
      s("circle", { cx: 43, cy: 43, r: 21, fill: "none", stroke: INK, "stroke-width": 2.5, "stroke-dasharray": "4 5" }),
      s("text", { x: 43, y: 51, "text-anchor": "middle", "font-family": "Fredoka, sans-serif", "font-weight": 700, "font-size": 22, fill: INK }, "5")),
    box("d-lock", 96, 80,
      s("rect", { x: 22, y: 34, width: 52, height: 38, rx: 9, fill: "#aeebd3", ...st }),
      s("path", { d: "M34 34V24a14 14 0 0 1 28 0v10", fill: "none", ...st }),
      s("circle", { cx: 48, cy: 52, r: 5, fill: INK })),
    box("d-key", 96, 54,
      s("circle", { cx: 22, cy: 27, r: 15, fill: "#ffb4a0", ...st }),
      s("circle", { cx: 22, cy: 27, r: 5, fill: "#fff", stroke: INK, "stroke-width": 2.5 }),
      s("path", { d: "M37 27h48v10M73 27v8", fill: "none", ...st })),
    box("d-receipt", 70, 86,
      s("path", { d: "M8 6h54v70l-9-6-9 6-9-6-9 6-9-6-9 6z", fill: "#fff", ...st }),
      s("path", { d: "M18 24h34M18 36h26M18 48h30", fill: "none", ...st })),
    box("d-spark1", 26, 26, s("path", { d: "M13 1l3 9 9 3-9 3-3 9-3-9-9-3 9-3z", fill: "#fff", stroke: INK, "stroke-width": 2.5, "stroke-linejoin": "round" })),
    box("d-spark2", 24, 24, s("path", { d: "M12 1l3 8 8 3-8 3-3 8-3-8-8-3 8-3z", fill: "#ffd873", stroke: INK, "stroke-width": 2.5, "stroke-linejoin": "round" })),
  ];
}
