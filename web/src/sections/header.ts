import { h } from "../lib/dom";
import { REPO } from "../lib/config";
import { themeToggle } from "../lib/theme";
import { logo } from "../lib/brand";

export type Page = "home" | "connect" | "explorer" | "market";

export function header(page: Page) {
  const link = (href: string, label: string, p?: Page) => h("a", { href, "aria-current": p === page ? "page" : null }, label);
  return h(
    "header",
    { class: "site-header" },
    h(
      "div",
      { class: "wrap" },
      h("a", { class: "brand", href: "./", "aria-label": "Horkos home" }, logo(), "horkos"),
      h(
        "nav",
        { class: "nav", "aria-label": "Main" },
        link("./#how", "How it works"),
        link("./market.html", "Market", "market"),
        link("./explorer.html", "Explorer", "explorer"),
        link("./connect.html", "Docs", "connect"),
        h("a", { href: REPO }, "GitHub"),
        page === "connect" ? null : h("a", { class: "btn btn-gold nav-cta", href: "./connect.html" }, "Connect your agent"),
      ),
      themeToggle(),
    ),
  );
}
