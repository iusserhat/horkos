import { h, shorten } from "../../lib/dom";
import { txUrl } from "../../lib/config";
import { statusIcon, type Status } from "../../lib/status";
import type { History } from "../../lib/explorer-data";

const fmtTime = (t: number) => (Number.isFinite(t) ? new Date(t * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "time not on chain");

/** Same visual language as the home flow: status pills joined by arrows, each step with its call and tx. */
export function timeline(history: History) {
  const steps = history.events.flatMap((e) => e.to.map((st, i) => ({ st: st as Status, e, first: i === 0 })));
  const note =
    history.source === "repo"
      ? "History from the repository's record of demo transactions (docs/testnet.md)."
      : history.source === "nearblocks"
        ? "History found through the NearBlocks testnet API and checked against each transaction's events on RPC."
        : "Full history unavailable: NearBlocks did not answer or had no match. Timeline rebuilt from the order's fields on chain, without transaction links.";
  return h(
    "div",
    { class: "timeline" },
    h(
      "ol",
      { class: "tl-steps" },
      ...steps.map(({ st, e, first }) =>
        h(
          "li",
          { class: `tl-step st-${st}` },
          h("span", { class: "tl-pill" }, statusIcon(st), st),
          h(
            "span",
            { class: "tl-meta" },
            first ? h("span", { class: "mono" }, e.method) : h("span", { class: "mono muted" }, "same transaction"),
            first ? h("span", { class: "muted" }, fmtTime(e.t)) : null,
            first && e.tx ? h("a", { class: "tx", href: txUrl(e.tx), title: e.tx }, `tx ${shorten(e.tx)} ↗`) : null,
          ),
        ),
      ),
    ),
    h("p", { class: `tl-note${history.source === "reconstructed" ? " callout warn" : " muted"}` }, note),
  );
}
