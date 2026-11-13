import { h } from "./dom";

/** Inline: **bold** and `code`; everything else stays text (built with DOM nodes, never innerHTML). */
function inline(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let m; (m = re.exec(text)); ) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h("strong", {}, m[1]) : h("code", {}, m[2]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal Markdown for recorded agent replies: paragraphs, "- " lists, pipe tables. */
export function renderMarkdown(src: string) {
  const root = h("div", { class: "md" });
  for (const block of src.trim().split(/\n{2,}/)) {
    const lines = block.split("\n");
    if (lines.every((l) => l.trim().startsWith("|"))) {
      const rows = lines.filter((l) => !/^\|\s*-/.test(l.trim())).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      const [head, ...body] = rows;
      root.append(h("table", { class: "md-table" }, h("thead", {}, h("tr", {}, ...head.map((c) => h("th", { scope: "col" }, ...inline(c))))), h("tbody", {}, ...body.map((r) => h("tr", {}, ...r.map((c) => h("td", {}, ...inline(c))))))));
    } else if (lines.slice(1).length > 0 && lines.slice(1).every((l) => l.startsWith("- "))) {
      const items = lines.filter((l) => l.startsWith("- "));
      const intro = lines.filter((l) => !l.startsWith("- "));
      if (intro.length) root.append(h("p", {}, ...inline(intro.join(" "))));
      if (items.length) root.append(h("ul", {}, ...items.map((l) => h("li", {}, ...inline(l.slice(2))))));
    } else {
      root.append(h("p", {}, ...inline(lines.join(" "))));
    }
  }
  return root;
}
