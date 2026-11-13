/** Small DOM helpers; every section module builds its markup with these. */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

function apply(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) {
      el.setAttribute(k, "");
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** HTML element: `h("a", { href: "/" }, "Home")`. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG element in the SVG namespace. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export const qs = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

/** Replaces the children of `target` with `nodes`. */
export function mount(target: Element | null, ...nodes: Child[]) {
  if (!target) return;
  target.replaceChildren();
  append(target, nodes);
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** `92QVpcmF…LmzA` with the full value kept for title/copy. */
export const shorten = (v: string, head = 6, tail = 4) => (v.length > head + tail + 1 ? `${v.slice(0, head)}…${v.slice(-tail)}` : v);

/** Code block with a copy button. */
export function codeBlock(code: string, label = "Copy") {
  const pre = h("pre", {}, h("code", {}, code));
  const btn = h("button", { class: "btn copy", type: "button", "aria-label": `${label} to clipboard` }, label);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select and copy";
    }
    setTimeout(() => (btn.textContent = label), 1600);
  });
  return h("div", { class: "code" }, pre, btn);
}

/** Accessible tabs: returns the tablist and calls `onSelect(index)` on change (click or arrow keys). */
export function tabs(labels: string[], onSelect: (i: number) => void, idPrefix: string, selected = 0) {
  const list = h("div", { class: "tabs", role: "tablist" });
  const buttons = labels.map((label, i) =>
    h("button", {
      class: "tab",
      role: "tab",
      type: "button",
      id: `${idPrefix}-tab-${i}`,
      "aria-controls": `${idPrefix}-panel`,
      "aria-selected": i === selected ? "true" : "false",
      tabindex: i === selected ? "0" : "-1",
    }, label),
  );
  const select = (i: number, focus = false) => {
    buttons.forEach((b, j) => {
      b.setAttribute("aria-selected", j === i ? "true" : "false");
      b.tabIndex = j === i ? 0 : -1;
    });
    if (focus) buttons[i].focus();
    onSelect(i);
  };
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => select(i));
    b.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === "ArrowRight") select((i + 1) % buttons.length, true);
      else if (k === "ArrowLeft") select((i - 1 + buttons.length) % buttons.length, true);
      else if (k === "Home") select(0, true);
      else if (k === "End") select(buttons.length - 1, true);
      else return;
      e.preventDefault();
    });
    list.append(b);
  });
  return list;
}
