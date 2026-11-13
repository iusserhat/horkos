import { CONTRACT, DEMO_OWNER, RPC_URL } from "./config";
import { view } from "./rpc";
import type { ReceiptToken } from "./receipt";
import type { Status } from "./status";
import demoHistory from "../data/demo-history.json";

export interface Order {
  id: string;
  buyer: string;
  agent: string;
  seller: string;
  amount: string;
  listing_id: string;
  created_at: string;
  deadline: string;
  delivery_ref: string | null;
  encrypted_key: string | null;
  status: Exclude<Status, "Rejected">;
  verifier_version: number;
  attempts: number;
}
export interface Mandate {
  owner: string;
  agent: string;
  balance: string;
  spent: string;
  max_total: string;
  max_per_order: string;
  allowed_sellers: string[];
  expires_at: string;
  active: boolean;
  storage_deposit: string;
  open_orders: number;
  max_open_orders: number;
}
export interface Listing {
  seller: string;
  price: string;
  condition_hash: string;
  delivery_window: string;
}
export interface VerifierConfig {
  outlayer: string;
  wasm_url: string;
  wasm_hash: string;
  build_target: string;
  encryption_pubkey: string;
  secrets_profile: string | null;
  secrets_account: string | null;
  min_fee: string;
  max_fee: string;
}
export interface HistoryEvent {
  t: number; // unix seconds
  method: string;
  tx?: string;
  to: string[];
}
export interface History {
  source: "repo" | "nearblocks" | "reconstructed";
  events: HistoryEvent[];
}

/** Every order mints one NFT receipt that is never burned, so the NFT list is the order list. */
export async function loadTokens(): Promise<ReceiptToken[]> {
  const total = Number(await view<string>("nft_total_supply"));
  const out: ReceiptToken[] = [];
  for (let from = 0; from < total; from += 50) out.push(...(await view<ReceiptToken[]>("nft_tokens", { from_index: String(from), limit: 50 })));
  return out;
}

export async function loadOrders(tokens: ReceiptToken[]): Promise<Order[]> {
  const ids = tokens.map((t) => t.token_id).slice(-50);
  const orders = await Promise.all(ids.map((id) => view<Order | null>("get_order", { order_id: id })));
  return orders.filter((o): o is Order => o !== null).sort((a, b) => Number(b.id) - Number(a.id));
}

/** No list view for mandates: owners come from receipts (owner = buyer) plus the demo owner and searches. */
export function knownOwners(tokens: ReceiptToken[], extra: string[] = []) {
  return [...new Set([DEMO_OWNER, ...tokens.map((t) => t.owner_id), ...extra])];
}
export const loadMandate = (owner: string) => view<Mandate | null>("get_mandate", { owner });

export async function loadListings(): Promise<(Listing & { id: string })[]> {
  const out: (Listing & { id: string })[] = [];
  for (let id = 0; id < 200; id++) {
    const l = await view<Listing | null>("get_listing", { listing_id: String(id) });
    if (!l) break;
    out.push({ ...l, id: String(id) });
  }
  return out;
}

export async function loadVerifiers(): Promise<(VerifierConfig & { version: number })[]> {
  const latest = await view<{ version: number } | null>("get_verifier");
  if (!latest) return [];
  const all = await Promise.all(Array.from({ length: latest.version + 1 }, (_, v) => view<VerifierConfig | null>("get_verifier_version", { version: v })));
  return all.map((c, version) => (c ? { ...c, version } : null)).filter((x): x is VerifierConfig & { version: number } => x !== null);
}

const REPO_HISTORY = demoHistory.orders as Record<string, HistoryEvent[]>;
export const rejectedCalls = demoHistory.rejected;

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extra source for orders not in the repo's history: NearBlocks lists the escrow's
 * transactions (5 s timeout); for each candidate after the order's creation the
 * transaction itself is read from RPC and kept if it touched this order.
 */
export async function fromNearBlocks(order: Order): Promise<HistoryEvent[]> {
  const created = Number(BigInt(order.created_at) / 1_000_000_000n);
  const list = await fetchJson(`https://api-testnet.nearblocks.io/v1/account/${CONTRACT}/txns-only?per_page=50&order=desc`);
  const relevant = new Set(["create_order", "submit_delivery", "refund_expired", "cancel_order"]);
  const candidates = (list.txns as { transaction_hash: string; signer_account_id: string; block_timestamp: string; actions: { method: string | null }[] }[])
    .filter((t) => relevant.has(t.actions[0]?.method ?? "") && Number(BigInt(t.block_timestamp) / 1_000_000_000n) >= created - 5)
    .slice(0, 15);
  const events: HistoryEvent[] = [];
  for (const t of candidates) {
    const body = await fetchJson(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "EXPERIMENTAL_tx_status", params: { tx_hash: t.transaction_hash, sender_account_id: t.signer_account_id, wait_until: "NONE" } }),
    });
    const r = body.result;
    if (!r) continue;
    const method = t.actions[0].method!;
    const to: string[] = [];
    for (const o of r.receipts_outcome) {
      for (const log of o.outcome.logs as string[]) {
        if (!log.startsWith("EVENT_JSON:")) continue;
        const e = JSON.parse(log.slice(11));
        if (e.event === "order_status") for (const d of e.data) if (String(d.order_id) === order.id) to.push(d.status);
        if (e.event === "nft_mint") for (const d of e.data) if ((d.token_ids as string[]).includes(order.id)) to.push("Open");
      }
    }
    if (to.length) events.push({ t: Number(BigInt(t.block_timestamp) / 1_000_000_000n), method, tx: t.transaction_hash, to });
  }
  return events.sort((a, b) => a.t - b.t);
}

/** Built only from fields on chain; no transaction links. */
function reconstructed(order: Order, updatedAtMs: number): HistoryEvent[] {
  const ev: HistoryEvent[] = [{ t: Number(BigInt(order.created_at) / 1_000_000_000n), method: "create_order", to: ["Open"] }];
  if (order.attempts > 0) ev.push({ t: NaN, method: `submit_delivery ×${order.attempts}`, to: ["Verifying"] });
  if (order.status !== "Open" && order.status !== "Verifying") ev.push({ t: Math.floor(updatedAtMs / 1000), method: "last status change", to: [order.status] });
  return ev;
}

export async function orderHistory(order: Order, updatedAtMs: number): Promise<History> {
  const repo = REPO_HISTORY[order.id];
  // The repo copy is complete only while the order is final and its last event matches.
  if (repo && repo[repo.length - 1].to.includes(order.status)) return { source: "repo", events: repo };
  try {
    const events = await fromNearBlocks(order);
    if (events.length && events[events.length - 1].to.includes(order.status)) return { source: "nearblocks", events };
  } catch {
    /* fall through */
  }
  return { source: "reconstructed", events: reconstructed(order, updatedAtMs) };
}
