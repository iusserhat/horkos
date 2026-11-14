/**
 * Sentinel rules: pure functions over one order and its context. No chain
 * access here, so every rule is unit-tested.
 *
 * Severity "block" means the order should not go through: with auto-cancel on,
 * Sentinel cancels it while it is still Open. "warn" only alerts.
 */

export type Severity = "warn" | "block";

export interface Alert {
  rule: "price_deviation" | "lookalike_seller" | "new_seller" | "burst" | "near_limit";
  severity: Severity;
  message: string;
}

export interface RuleConfig {
  /** Block when the price is this many percent above (or below) the reference. */
  priceDeviationPct: number;
  /** Block a seller whose name is this close (edits) to a known seller but not equal. */
  lookalikeMaxDistance: number;
  /** Block when the owner has more than this many orders within burstWindowMs. */
  burstCount: number;
  burstWindowMs: number;
  /** Warn when the order uses at least this percent of the remaining budget or of max_per_order. */
  nearLimitPct: number;
}

export const DEFAULT_RULES: RuleConfig = {
  priceDeviationPct: 50,
  lookalikeMaxDistance: 2,
  burstCount: 3,
  burstWindowMs: 10 * 60_000,
  nearLimitPct: 80,
};

export interface OrderFacts {
  id: string;
  seller: string;
  /** Token base units. */
  amount: bigint;
  conditionHash: string;
  createdMs: number;
}

export interface Context {
  /** Allowed sellers on the mandate plus sellers the owner already trusts. */
  knownSellers: string[];
  /** Sellers this owner has had a Settled order with. */
  settledSellers: string[];
  /** Explicit reference price for this condition (token base units), if configured. */
  referencePrice?: bigint;
  /** Prices of other listings with the same condition hash (the second source when no reference is set). */
  comparablePrices: bigint[];
  /** Creation times (ms) of this owner's other recent orders. */
  recentOrderTimes: number[];
  /** Mandate values in token base units. */
  maxPerOrder: bigint;
  /** Budget left before this order was created (balance + this order's amount). */
  budgetBefore: bigint;
}

const fmt = (u: bigint) => `${Number(u) / 1e6} tUSDC`;

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Folds common look-alike characters so "se11er" and "seller" compare equal. */
export function skeleton(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(testnet|near)$/, "")
    .replace(/[1|!i]/g, "l")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/3/g, "e")
    .replace(/rn/g, "m")
    .replace(/[-_.]/g, "");
}

export function median(xs: bigint[]): bigint | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2n;
}

export function evaluate(order: OrderFacts, ctx: Context, cfg: RuleConfig = DEFAULT_RULES): Alert[] {
  const alerts: Alert[] = [];

  const ref = ctx.referencePrice ?? median(ctx.comparablePrices);
  if (ref !== undefined && ref > 0n) {
    const dev = (Number(order.amount - ref) / Number(ref)) * 100;
    if (Math.abs(dev) > cfg.priceDeviationPct) {
      const src = ctx.referencePrice !== undefined ? "the configured reference" : `the median of ${ctx.comparablePrices.length} comparable listing(s)`;
      alerts.push({ rule: "price_deviation", severity: "block", message: `order ${order.id}: ${fmt(order.amount)} is ${dev > 0 ? "+" : ""}${dev.toFixed(0)}% vs ${fmt(ref)} (${src})` });
    }
  }

  if (!ctx.knownSellers.includes(order.seller)) {
    const close = ctx.knownSellers.find((k) => editDistance(order.seller, k) <= cfg.lookalikeMaxDistance || skeleton(order.seller) === skeleton(k));
    if (close) alerts.push({ rule: "lookalike_seller", severity: "block", message: `order ${order.id}: seller ${order.seller} looks like ${close}` });
  } else {
    const twin = ctx.knownSellers.find((k) => k !== order.seller && skeleton(k) === skeleton(order.seller));
    if (twin) alerts.push({ rule: "lookalike_seller", severity: "block", message: `order ${order.id}: allowed seller ${order.seller} looks like ${twin}; check the allow-list` });
  }

  if (!ctx.settledSellers.includes(order.seller)) {
    alerts.push({ rule: "new_seller", severity: "warn", message: `order ${order.id}: first order with ${order.seller}` });
  }

  const recent = ctx.recentOrderTimes.filter((t) => t !== order.createdMs && order.createdMs - t >= 0 && order.createdMs - t <= cfg.burstWindowMs).length + 1;
  if (recent > cfg.burstCount) {
    alerts.push({ rule: "burst", severity: "block", message: `order ${order.id}: ${recent} orders within ${Math.round(cfg.burstWindowMs / 60_000)} min` });
  }

  const pct = (part: bigint, whole: bigint) => (whole > 0n ? (Number(part) / Number(whole)) * 100 : 0);
  const ofBudget = pct(order.amount, ctx.budgetBefore);
  const ofCap = pct(order.amount, ctx.maxPerOrder);
  if (ofBudget >= cfg.nearLimitPct || ofCap >= cfg.nearLimitPct) {
    alerts.push({ rule: "near_limit", severity: "warn", message: `order ${order.id}: uses ${ofBudget.toFixed(0)}% of the remaining budget and ${ofCap.toFixed(0)}% of max_per_order` });
  }
  return alerts;
}
