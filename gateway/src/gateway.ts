/**
 * The gateway: for every Open order on a configured listing, call the
 * seller's API, check the answer against the listing's schema locally, and
 * only then submit the delivery. Nothing is submitted when the check fails.
 */
import { readFileSync } from "node:fs";
import { HorkosSeller, sha256, toHex, type BlobStore, type Order } from "../../sdk/src/index.js";
import { conditionFileOf, type LoadedConfig, type ListingConfig } from "./config.js";
import { fetchSource, SourceError, type OrderVars } from "./source.js";
import { compileCondition, type Check } from "./validate.js";

/** FastFS (and so the delivery) holds files up to 1 MB; the ciphertext adds 40 bytes. */
const MAX_DELIVERY_BYTES = (1 << 20) - 64;

export type Log = (msg: string) => void;

export interface Condition {
  schema: unknown;
  /** `sha256:<hex>` exactly as the SDK registers it. */
  hash: string;
  check: Check;
}

/** Reads a schema file the way `registerListing` hashes it (JSON.stringify of the parsed file). */
export function readCondition(path: string): Condition {
  const schema = JSON.parse(readFileSync(path, "utf8"));
  const hash = `sha256:${toHex(sha256(new TextEncoder().encode(JSON.stringify(schema))))}`;
  return { schema, hash, check: compileCondition(schema) };
}

export type Outcome =
  | { kind: "delivered"; status: string }
  | { kind: "rejected"; errors: string[] }
  | { kind: "source-error"; message: string; transient: boolean };

/** Fetches and checks the data for one order, without submitting. Used by `check` and `run`. */
export async function produce(
  listing: ListingConfig,
  cond: Condition,
  vars: OrderVars,
  opts: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {},
): Promise<{ ok: true; data: unknown } | Exclude<Outcome, { kind: "delivered" }>> {
  let data: unknown;
  try {
    data = await fetchSource(listing.source, vars, opts);
  } catch (e) {
    if (e instanceof SourceError) return { kind: "source-error", message: e.message, transient: e.transient };
    throw e;
  }
  const res = cond.check(data);
  if (!res.ok) return { kind: "rejected", errors: res.errors };
  if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_DELIVERY_BYTES)
    return { kind: "rejected", errors: ["data is over the 1 MB delivery limit"] };
  return { ok: true, data };
}

export interface GatewayOptions {
  loaded: LoadedConfig;
  seller: HorkosSeller;
  store: BlobStore;
  log?: Log;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  /** Delay before the single retry of a transient source error; default 15000. */
  retryDelayMs?: number;
}

interface Active {
  listing: ListingConfig;
  cond: Condition;
  conditionUrl: string;
}

export class Gateway {
  private readonly active = new Map<string, Active>();
  private readonly log: Log;
  private stopPolling?: () => void;
  readonly outcomes = new Map<string, Outcome>();

  constructor(private readonly o: GatewayOptions) {
    this.log = o.log ?? ((m) => console.log(`${new Date().toISOString()} ${m}`));
  }

  /**
   * Checks each listing against the chain (exists, belongs to the seller,
   * same condition hash) and makes sure its condition is published.
   */
  async prepare(): Promise<void> {
    const { config, rel } = this.o.loaded;
    for (const l of config.listings) {
      if (!l.listing_id) throw new Error("a listing has no listing_id; run `register` first");
      const cond = readCondition(rel(conditionFileOf(l)));
      const onChain = await this.o.seller.getListing(l.listing_id);
      if (!onChain) throw new Error(`listing ${l.listing_id} does not exist on ${config.contract}`);
      if (onChain.seller !== config.seller) throw new Error(`listing ${l.listing_id} belongs to ${onChain.seller}, not ${config.seller}`);
      if (onChain.condition_hash !== cond.hash)
        throw new Error(`listing ${l.listing_id}: condition file hashes to ${cond.hash}, the listing has ${onChain.condition_hash}`);
      let conditionUrl = l.condition_url;
      if (!conditionUrl) {
        conditionUrl = await this.o.store.put(new TextEncoder().encode(JSON.stringify(cond.schema)), "application/json");
        this.log(`listing ${l.listing_id}: condition published at ${conditionUrl}`);
      }
      this.active.set(l.listing_id, { listing: l, cond, conditionUrl });
    }
  }

  /** Handles one order; never throws for source or schema problems. */
  async handle(order: Order): Promise<Outcome | undefined> {
    const a = this.active.get(order.listing_id);
    if (!a) {
      this.log(`order ${order.id}: listing ${order.listing_id} is not in this config; ignored`);
      return undefined;
    }
    if (BigInt(order.deadline) <= BigInt(Date.now()) * 1_000_000n) {
      this.log(`order ${order.id}: past its delivery deadline; skipped (anyone can call refund_expired)`);
      return undefined;
    }
    const vars = { order_id: order.id, buyer: order.buyer, listing_id: order.listing_id };
    let res = await produce(a.listing, a.cond, vars, this.o);
    if ("kind" in res && res.kind === "source-error" && res.transient) {
      this.log(`order ${order.id}: ${res.message}; retrying once`);
      await new Promise((r) => setTimeout(r, this.o.retryDelayMs ?? 15_000));
      res = await produce(a.listing, a.cond, vars, this.o);
    }
    let outcome: Outcome;
    if ("ok" in res) {
      const after = await this.o.seller.submitDelivery({ orderId: order.id, data: res.data, conditionUrl: a.conditionUrl });
      outcome = { kind: "delivered", status: after.status };
      this.log(`order ${order.id}: delivered; status ${after.status}`);
    } else {
      outcome = res;
      if (res.kind === "rejected") this.log(`order ${order.id}: NOT delivered, data fails the condition: ${res.errors.join("; ")}`);
      else this.log(`order ${order.id}: NOT delivered, ${res.message}`);
    }
    this.outcomes.set(order.id, outcome);
    return outcome;
  }

  /** Starts polling for Open orders. Returns once listings are prepared. */
  async start(): Promise<void> {
    await this.prepare();
    const ids = [...this.active.keys()].join(", ");
    this.log(`gateway for ${this.o.loaded.config.seller} on ${this.o.loaded.config.contract}: listings ${ids}; waiting for orders`);
    this.stopPolling = this.o.seller.onOrder(
      async (order) => {
        this.log(`order ${order.id}: received (listing ${order.listing_id}, buyer ${order.buyer}, ${order.amount} units)`);
        try {
          await this.handle(order);
        } catch (e) {
          this.log(`order ${order.id}: submit failed: ${(e as Error).message}`);
        }
      },
      { intervalMs: this.o.loaded.config.poll_ms ?? 5_000 },
    );
  }

  stop(): void {
    this.stopPolling?.();
  }
}
