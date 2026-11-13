import { h } from "../lib/dom";
import { REPO } from "../lib/config";
import { themeToggle } from "../lib/theme";

export type Page = "home" | "connect" | "explorer";

export function header(page: Page) {
  const link = (href: string, label: string, p?: Page) => h("a", { href, "aria-current": p === page ? "page" : null }, label);
  return h(
    "header",
    { class: "site-header" },
    h(
      "div",
      { class: "wrap" },
      h("a", { class: "brand", href: "./" }, "HORKOS"),
      h(
        "nav",
        { class: "nav", "aria-label": "Main" },
        link("./#how", "How it works"),
        link("./connect.html", "Connect", "connect"),
        link("./explorer.html", "Explorer", "explorer"),
        h("a", { href: REPO }, "GitHub"),
      ),
      themeToggle(),
    ),
  );
}
