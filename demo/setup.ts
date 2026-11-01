/**
 * One-time testnet setup for the demo (idempotent):
 *   1. token storage registration for the owner and sellers
 *   2. tUSDC for the owner (minted by the token owner, horkos.testnet)
 *   3. owner's mandate: agent = horkos-agent, allowed sellers = A and B only
 *   4. budget deposit
 *   5. one listing per seller, condition published to FastFS
 * Requires the keys of these accounts in ~/.near-credentials/testnet.
 */
import { FastFsStore, HorkosOwner, HorkosSeller } from "../sdk/src/index.js";
import { ACCOUNTS, account, CONTRACT, fmt, NEAR, provider, TOKEN, TOKEN_OWNER, USDC } from "./config.js";
import { loadState, saveState } from "./state.js";
import { MARKET_SCHEMA, PROFILES } from "./sellers/profiles.js";

const BUDGET = 50n * USDC;

async function ftBalance(id: string): Promise<bigint> {
  return BigInt((await provider.callFunction({ contractId: TOKEN, method: "ft_balance_of", args: { account_id: id } })) as string);
}

async function ensureRegistered(id: string) {
  const reg = await provider.callFunction({ contractId: TOKEN, method: "storage_balance_of", args: { account_id: id } });
  if (reg) return;
  await account(id).callFunction({ contractId: TOKEN, methodName: "storage_deposit", args: { account_id: id }, deposit: NEAR / 100n });
  console.log(`registered ${id} with ${TOKEN}`);
}

const owner = new HorkosOwner({ contractId: CONTRACT, account: account(ACCOUNTS.owner) });

for (const id of [ACCOUNTS.owner, ACCOUNTS.sellerA, ACCOUNTS.sellerB, ACCOUNTS.sellerC]) await ensureRegistered(id);

if ((await ftBalance(ACCOUNTS.owner)) < BUDGET) {
  await account(TOKEN_OWNER).callFunction({ contractId: TOKEN, methodName: "mint", args: { account_id: ACCOUNTS.owner, amount: String(200n * USDC) } });
  console.log(`minted 200 tUSDC to ${ACCOUNTS.owner}`);
}

const mandate = await owner.setMandate({
  agent: ACCOUNTS.agent,
  maxTotal: BUDGET,
  maxPerOrder: 10n * USDC,
  allowedSellers: [ACCOUNTS.sellerA, ACCOUNTS.sellerB],
  expiresAtMs: Date.UTC(2026, 10, 30),
  // ~0.0152 NEAR per order is charged from this; unused part refunded on revoke.
  storageDeposit: NEAR / 2n,
});
console.log(`mandate: agent ${mandate.agent}, max ${fmt(mandate.max_total)} total / ${fmt(mandate.max_per_order)} per order, sellers ${mandate.allowed_sellers.join(", ")}`);
if (BigInt(mandate.balance) < 20n * USDC) {
  await owner.deposit(BUDGET - BigInt(mandate.balance));
  console.log(`deposited budget; balance now ${fmt((await owner.getMandate(ACCOUNTS.owner))!.balance)}`);
}

const state = loadState();
for (const p of Object.values(PROFILES)) {
  if (state[p.key]) continue;
  const acc = account(p.account);
  const seller = new HorkosSeller({ contractId: CONTRACT, account: acc, store: new FastFsStore(acc) });
  const listing = await seller.registerListing({ price: p.price, condition: MARKET_SCHEMA, deliveryWindowMs: p.deliveryWindowMs });
  state[p.key] = listing;
  saveState(state);
  console.log(`seller ${p.key}: listing ${listing.listingId} at ${fmt(p.price)}, condition ${listing.conditionUrl}`);
}
console.log("setup done");
