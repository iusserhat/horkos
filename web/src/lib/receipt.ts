import { h, shorten } from "./dom";
import { fmtUsdc } from "./config";
import { badge, type Status } from "./status";

/** Token metadata exactly as `receipt_metadata` in contracts/horkos/src/nft.rs builds it. */
export interface ReceiptToken {
  token_id: string;
  owner_id: string;
  metadata: {
    title: string;
    description: string;
    issued_at: string;
    expires_at: string;
    updated_at: string;
    extra: string;
  };
}

/** Parsed `metadata.extra`. */
export interface ReceiptExtra {
  order_id: string;
  amount: string;
  token: string;
  seller: string;
  listing_id: string;
  status: Status;
  deadline: string;
}

/** Not in the NFT: read from `get_order` (verifier_version) and `get_verifier_version` (wasm_hash). */
export interface VerifierRef {
  version: number;
  wasm_hash: string;
}

const time = (ms: string) => new Date(Number(ms)).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export function receiptCard(token: ReceiptToken, statusOverride?: Status, verifier?: VerifierRef) {
  const x = JSON.parse(token.metadata.extra) as ReceiptExtra;
  const status = statusOverride ?? x.status;
  const row = (k: string, v: Node | string) => h("div", { class: "rc-row" }, h("dt", {}, k), h("dd", {}, v));
  return h(
    "article",
    { class: `receipt st-band-${status}`, "aria-label": `${token.metadata.title}, status ${status}` },
    h("div", { class: "rc-band" }, h("span", { class: "mono" }, "NEP-171 · HORKOS"), badge(status)),
    h("h3", { class: "rc-title" }, token.metadata.title),
    h("p", { class: "rc-amount mono" }, fmtUsdc(x.amount)),
    h(
      "dl",
      { class: "rc-fields" },
      row("Seller", h("span", { class: "mono" }, x.seller)),
      row("Owner", h("span", { class: "mono" }, token.owner_id)),
      row("Listing", h("span", { class: "mono" }, `#${x.listing_id}`)),
      row("Issued", h("span", { class: "mono" }, time(token.metadata.issued_at))),
      row("Deadline", h("span", { class: "mono" }, time(token.metadata.expires_at))),
    ),
    verifier
      ? h(
          "p",
          { class: "rc-verifier" },
          h("span", { class: "mono" }, `verifier v${verifier.version} · ${shorten(verifier.wasm_hash, 6, 4)}`),
          h("span", { class: "muted" }, " from the order, not stored in the NFT"),
        )
      : null,
  );
}
