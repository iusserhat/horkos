/** A seller service: watches for orders and delivers through Horkos. */
import { FastFsStore, HorkosSeller } from "../../sdk/src/index.js";
import { account, CONTRACT } from "../config.js";
import { loadState } from "../state.js";
import { PROFILES } from "./profiles.js";

export function startSeller(key: "a" | "b" | "c", log: (m: string) => void = console.log): () => void {
  const profile = PROFILES[key];
  const state = loadState()[key];
  if (!state) throw new Error(`seller ${key} has no listing; run \`npm run setup\` first`);
  const acc = account(profile.account);
  const seller = new HorkosSeller({ contractId: CONTRACT, account: acc, store: new FastFsStore(acc) });
  log(`[seller ${key}] ${profile.title}; listing ${state.listingId}; waiting for orders`);
  return seller.onOrder(async (order) => {
    log(`[seller ${key}] order ${order.id} received; delivering`);
    const after = await seller.submitDelivery({ orderId: order.id, data: profile.data(), conditionUrl: state.conditionUrl });
    log(`[seller ${key}] order ${order.id} after verification: ${after.status}`);
  }, { intervalMs: 3_000 });
}
