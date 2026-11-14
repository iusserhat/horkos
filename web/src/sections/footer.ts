import { h } from "../lib/dom";
import { REPO, repoFile } from "../lib/config";
import { logo } from "../lib/brand";

export function footer() {
  return h(
    "footer",
    { class: "site-footer" },
    h(
      "div",
      { class: "wrap" },
      h("a", { class: "brand", href: "./" }, logo("#ffffff"), "horkos"),
      h("p", { class: "motto" }, "We don't resolve disputes. We prevent them."),
      h("p", { class: "footer-native" }, "Built on NEAR. Checked in a TEE."),
      h(
        "div",
        { class: "links" },
        h("a", { href: REPO }, "GitHub"),
        h("a", { href: repoFile("README.md") }, "README"),
        h("a", { href: repoFile("docs/architecture.md") }, "Architecture"),
        h("a", { href: repoFile("LICENSE") }, "MIT License"),
        h("span", { class: "built" }, "Built for NEAR Hackathon 2026 on NEAR testnet. Horkos was the Greek spirit who held people to their oaths."),
      ),
    ),
  );
}
