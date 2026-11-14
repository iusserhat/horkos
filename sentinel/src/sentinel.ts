/**
 * Watches a Horkos contract for new orders of the configured owners, applies
 * the rules and reports alerts. With auto_cancel, a "block" alert on an order
 * that is still Open is answered with cancel_order, signed by the owner's
 * agent (its function-call key already allows cancel_order).
 */
import { HorkosAgent, HorkosClient, type Listing, type Order } from "../../sdk/src/index.js";
import { evaluate, type Alert, type RuleConfig } from "./rules.js";

export interface OwnerWatch {
  owner: string;
  agent: string;
  autoCancel: boolean;
  /** Sellers the owner trusts besides the mandate's allow-list. */
  trustedSellers?: string[];
}

export interface Report {
  order: Order;
  alerts: Alert[];
  cancelled?: { ok: boolean; detail: string };
}

export interface SentinelDeps {
  client: HorkosClient;
  /** Agent clients able to cancel, by owner (only for owners with autoCancel). */
  agents: Map<string, HorkosAgent>;
  owners: OwnerWatch[];
  rules: RuleConfig;
  referencePrices: Record<string, bigint>;
  report: (r: Report) => void | Promise<void>;
}

const ns2ms = (ns: string) => Number(BigInt(ns) / 1_000_000n);

export class Sentinel {
  private seen = new Set<string>();
  private listings = new Map<string, Listing>();
  private listingsAt = 0;
  private history = new Map<string, Order[]>();

  constructor(private readonly d: SentinelDeps) {}

  private async refreshListings() {
    if (Date.now() - this.listingsAt < 60_000 && this.listings.size) return;
    for (let i = this.listings.size; ; i++) {
      const l = await this.d.client.getListing(i);
      if (!l) break;
      this.listings.set(String(i), l);
    }
    this.listingsAt = Date.now();
  }

  /**
   * Reads existing orders as history (not alerts). Orders with an id >= fromId
   * are left unseen, so the next tick evaluates them.
   */
  async prime(fromId = Infinity): Promise<number> {
    const ids = (await this.allOrderIds()).filter((id) => Number(id) < fromId);
    for (const id of ids) {
      const o = await this.d.client.getOrder(id);
      if (o) this.remember(o);
      this.seen.add(id);
    }
    return ids.length;
  }

  private remember(o: Order) {
    const list = this.history.get(o.buyer) ?? [];
    const i = list.findIndex((x) => x.id === o.id);
    if (i >= 0) list[i] = o;
    else list.push(o);
    this.history.set(o.buyer, list);
  }

  private async allOrderIds(): Promise<string[]> {
    const out: string[] = [];
    for (let from = 0; ; from += 100) {
      const ids = await this.d.client.listOrderIds(from, 100);
      out.push(...ids);
      if (ids.length < 100) break;
    }
    return out;
  }

  /** One pass: evaluates every new order of a watched owner. */
  async tick(): Promise<Report[]> {
    const reports: Report[] = [];
    const ids = await this.allOrderIds();
    const fresh = ids.filter((id) => !this.seen.has(id));
    if (!fresh.length) return reports;
    await this.refreshListings();
    for (const id of fresh) {
      const order = await this.d.client.getOrder(id);
      if (!order) continue;
      this.seen.add(id);
      const watch = this.d.owners.find((w) => w.owner === order.buyer);
      if (!watch) continue;
      const r = await this.check(order, watch);
      this.remember(order);
      reports.push(r);
      await this.d.report(r);
    }
    return reports;
  }

  private async check(order: Order, watch: OwnerWatch): Promise<Report> {
    const listing = this.listings.get(order.listing_id) ?? (await this.d.client.getListing(order.listing_id));
    const mandate = await this.d.client.getMandate(order.buyer);
    const past = this.history.get(order.buyer) ?? [];
    const conditionHash = listing?.condition_hash ?? "";
    const comparable = [...this.listings.entries()]
      .filter(([id, l]) => id !== order.listing_id && l.condition_hash === conditionHash && l.seller !== order.seller)
      .map(([, l]) => BigInt(l.price));
    const amount = BigInt(order.amount);
    const alerts = evaluate(
      { id: order.id, seller: order.seller, amount, conditionHash, createdMs: ns2ms(order.created_at) },
      {
        knownSellers: [...(mandate?.allowed_sellers ?? []), ...(watch.trustedSellers ?? [])],
        settledSellers: past.filter((o) => o.status === "Settled").map((o) => o.seller),
        referencePrice: this.d.referencePrices[conditionHash],
        comparablePrices: comparable,
        recentOrderTimes: past.map((o) => ns2ms(o.created_at)),
        maxPerOrder: BigInt(mandate?.max_per_order ?? "0"),
        budgetBefore: BigInt(mandate?.balance ?? "0") + amount,
      },
      this.d.rules,
    );
    const report: Report = { order, alerts };
    if (watch.autoCancel && alerts.some((a) => a.severity === "block")) {
      const agent = this.d.agents.get(order.buyer);
      const now = await this.d.client.getOrder(order.id);
      if (!agent) report.cancelled = { ok: false, detail: "no agent key loaded" };
      else if (now?.status !== "Open") report.cancelled = { ok: false, detail: `order is ${now?.status}; only Open orders can be cancelled` };
      else {
        try {
          const after = await agent.cancel(order.id);
          report.cancelled = { ok: after.status === "Cancelled", detail: `status ${after.status}` };
        } catch (e) {
          report.cancelled = { ok: false, detail: (e as Error).message.slice(0, 200) };
        }
      }
    }
    return report;
  }
}
