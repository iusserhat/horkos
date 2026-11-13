import { h } from "../../lib/dom";
import data from "../../data/mcp-conversations.json";
import { renderMarkdown } from "../../lib/md";

export function conversations() {
  return h(
    "section",
    { class: "guide-section", id: "examples", "aria-labelledby": "examples-title" },
    h("h2", { id: "examples-title" }, "5. Ask your agent → what you see"),
    h("p", { class: "muted" }, `Two real runs: ${data.client}, ${data.network}, ${data.date}. Seller A was running for the first one. Replies are verbatim (Markdown rendered).`),
    ...data.conversations.map((c) =>
      h(
        "figure",
        { class: "convo panel" },
        h("p", {}, h("span", { class: "cp-who mono" }, "You"), c.prompt),
        h(
          "ol",
          { class: "convo-tools mono", "aria-label": "Tool calls" },
          ...c.tools.map((t) => h("li", {}, `${t.tool} ${JSON.stringify(t.args)}`)),
        ),
        h("div", {}, h("span", { class: "cp-who mono" }, "Agent"), renderMarkdown(c.reply)),
      ),
    ),
    h(
      "p",
      {},
      "In the second run Claude declined on its own and no create_order was sent. The contract does not depend on that: when the call is sent anyway, it fails with ",
      h("code", {}, "Seller not allowed by mandate"),
      " (see the rejected example under horkos_create_order).",
    ),
  );
}
