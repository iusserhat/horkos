import type { Status } from "../lib/status";

export type NodeId = "owner" | "agent" | "escrow" | "nft" | "seller" | "tee";
export type EdgeId =
  | "owner-escrow"
  | "agent-escrow"
  | "escrow-nft"
  | "seller-escrow"
  | "escrow-tee"
  | "tee-escrow"
  | "escrow-agent"
  | "escrow-seller"
  | "escrow-owner";

export interface Step {
  title: string;
  /** What the contract actually does at this step (one line). */
  contract: string;
  edges: EdgeId[];
  nodes: NodeId[];
  /** Order state after the step; null before an order exists. */
  status: Status | null;
  /** Edge drawn as a rejected call. */
  rejected?: boolean;
  /** Nodes shown as inactive (nothing happens there). */
  dim?: NodeId[];
}

export interface Scenario {
  id: string;
  label: string;
  steps: Step[];
}

export const NODES: Record<NodeId, { label: string; sub: string }> = {
  owner: { label: "Owner", sub: "sets the mandate" },
  agent: { label: "Agent", sub: "function-call key" },
  escrow: { label: "Escrow contract", sub: "escrow.horkos.testnet" },
  nft: { label: "NFT receipt", sub: "NEP-171, 1 per order" },
  seller: { label: "Seller", sub: "encrypted delivery" },
  tee: { label: "OutLayer TEE", sub: "verifier WASM" },
};

export const EDGE_LABEL: Record<EdgeId, string> = {
  "owner-escrow": "set_mandate",
  "agent-escrow": "create_order",
  "escrow-nft": "mint",
  "seller-escrow": "submit_delivery",
  "escrow-tee": "request_execution",
  "tee-escrow": "on_verified",
  "escrow-agent": "encrypted_key",
  "escrow-seller": "withdraw",
  "escrow-owner": "refund_expired",
};

const mandate: Step = {
  title: "Owner sets the mandate",
  contract: "set_mandate stores the agent, total and per-order caps, allowed sellers and expiry; ft_transfer_call adds the tUSDC budget.",
  edges: ["owner-escrow"],
  nodes: ["owner", "escrow"],
  status: null,
};

const createOrder: Step = {
  title: "Agent calls create_order",
  contract: "Checks caller = mandate agent, seller allowed, price ≤ per-order cap and ≤ remaining budget; moves the price into escrow and mints the NFT receipt to the owner.",
  edges: ["agent-escrow", "escrow-nft"],
  nodes: ["agent", "escrow", "nft"],
  status: "Open",
};

const submit: Step = {
  title: "Seller calls submit_delivery",
  contract: "Stores the delivery reference and the data key sealed to the verifier; status → Verifying; calls OutLayer request_execution with the order's pinned verifier WASM.",
  edges: ["seller-escrow", "escrow-tee"],
  nodes: ["seller", "escrow", "tee"],
  status: "Verifying",
};

const verify: Step = {
  title: "Verifier runs in the TEE",
  contract: "Off-chain inside OutLayer: decrypts the data, checks it against the listing's JSON Schema, re-seals the data key to the buyer's public key.",
  edges: [],
  nodes: ["tee"],
  status: "Verifying",
};

export const SCENARIOS: Scenario[] = [
  {
    id: "happy",
    label: "Happy path",
    steps: [
      mandate,
      createOrder,
      submit,
      verify,
      {
        title: "on_verified settles the order",
        contract: "Result valid, order still Verifying, before the deadline → credits the seller's internal balance and stores the buyer's key, in one callback. Status → Settled.",
        edges: ["tee-escrow"],
        nodes: ["tee", "escrow", "nft"],
        status: "Settled",
      },
      {
        title: "Key opens, seller withdraws",
        contract: "The agent reads encrypted_key from the order and decrypts the data. The seller calls withdraw to move its balance out as tUSDC.",
        edges: ["escrow-agent", "escrow-seller"],
        nodes: ["escrow", "agent", "seller"],
        status: "Settled",
      },
    ],
  },
  {
    id: "no-delivery",
    label: "No delivery",
    steps: [
      mandate,
      createOrder,
      {
        title: "Seller never delivers",
        contract: "Nothing is called. The price stays locked in escrow; the order stays Open until its deadline.",
        edges: [],
        nodes: ["escrow"],
        dim: ["seller", "tee"],
        status: "Open",
      },
      {
        title: "Anyone calls refund_expired",
        contract: "After the deadline any account can call refund_expired: the price goes back to the owner's budget and the receipt shows Refunded.",
        edges: ["escrow-owner"],
        nodes: ["escrow", "owner", "nft"],
        dim: ["seller", "tee"],
        status: "Refunded",
      },
    ],
  },
  {
    id: "failed-check",
    label: "Failed check",
    steps: [
      createOrder,
      submit,
      {
        title: "Check fails, or no result",
        contract: "on_verified gets an invalid result (or none, if OutLayer fails the run): no payment, no key; status → Delivered.",
        edges: ["tee-escrow"],
        nodes: ["tee", "escrow"],
        status: "Delivered",
      },
      {
        title: "Seller resubmits",
        contract: "Before the deadline the seller may call submit_delivery again; attempts + 1; status → Verifying; a new OutLayer run.",
        edges: ["seller-escrow", "escrow-tee"],
        nodes: ["seller", "escrow", "tee"],
        status: "Verifying",
      },
      {
        title: "Valid on the next attempt",
        contract: "The callback for the latest attempt is valid → Settled. Results for older attempts are ignored.",
        edges: ["tee-escrow"],
        nodes: ["tee", "escrow", "nft"],
        status: "Settled",
      },
      {
        title: "Or: the deadline passes first",
        contract: "If no attempt passes before the deadline, refund_expired returns the price to the owner's budget. Status → Refunded.",
        edges: ["escrow-owner"],
        nodes: ["escrow", "owner", "nft"],
        status: "Refunded",
      },
    ],
  },
  {
    id: "out-of-mandate",
    label: "Out of mandate",
    steps: [
      { ...mandate, contract: "The mandate allows sellers A and B, at most 10 tUSDC per order." },
      {
        title: "Injected agent tries 500 tUSDC from seller C",
        contract: "create_order panics: \"Seller not allowed by mandate\". The transaction fails as a whole.",
        edges: ["agent-escrow"],
        nodes: ["agent", "escrow"],
        rejected: true,
        status: "Rejected",
      },
      {
        title: "Nothing was created",
        contract: "No order, no NFT receipt, no funds moved; budget and open-order count are unchanged.",
        edges: [],
        nodes: ["escrow"],
        dim: ["nft", "seller", "tee"],
        status: "Rejected",
      },
    ],
  },
];
