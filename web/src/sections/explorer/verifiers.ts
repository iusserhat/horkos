import { h, mount } from "../../lib/dom";
import type { VerifierConfig } from "../../lib/explorer-data";

const near = (yocto: string) => `${Number(BigInt(yocto) / 10n ** 18n) / 1e6} NEAR`;

export function verifiersView() {
  const root = h("div", {});
  const render = (verifiers: (VerifierConfig & { version: number })[]) =>
    mount(
      root,
      ...[...verifiers].reverse().map((v) =>
        h(
          "article",
          { class: "panel verifier" },
          h("h3", {}, `Version ${v.version}`, h("span", { class: "muted" }, " · pinned by every order created while it was the latest")),
          h(
            "dl",
            { class: "kv" },
            h("dt", {}, "WASM sha256"), h("dd", { class: "mono break" }, v.wasm_hash),
            h("dt", {}, "WASM URL"), h("dd", { class: "break" }, h("a", { href: v.wasm_url }, v.wasm_url.includes("gist.githubusercontent.com") ? "GitHub gist (raw, pinned to a commit)" : v.wasm_url)),
            h("dt", {}, "Runs on"), h("dd", { class: "mono" }, `${v.outlayer} · ${v.build_target}`),
            h("dt", {}, "Public key"), h("dd", { class: "mono break" }, v.encryption_pubkey),
            h("dt", {}, "Secret"), h("dd", { class: "mono" }, v.secrets_profile ? `${v.secrets_profile} / ${v.secrets_account}` : "none"),
            h("dt", {}, "Fee"), h("dd", { class: "mono" }, `seller attaches ${near(v.min_fee)} – ${near(v.max_fee)} per attempt; OutLayer charges the run's cost and refunds the rest to the seller`),
          ),
        ),
      ),
    );
  return { el: root, render };
}
