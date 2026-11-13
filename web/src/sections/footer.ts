import { h } from "../lib/dom";
import { REPO, repoFile } from "../lib/config";

export function footer() {
  return h(
    "footer",
    { class: "site-footer" },
    h(
      "div",
      { class: "wrap" },
      h("a", { href: REPO }, "GitHub"),
      h("a", { href: repoFile("README.md") }, "README"),
      h("a", { href: repoFile("docs/DESIGN.md") }, "Design"),
      h("a", { href: repoFile("LICENSE") }, "MIT License"),
      h("span", { class: "built" }, "Built for NEAR Hackathon 2026 · NEAR testnet"),
    ),
  );
}
