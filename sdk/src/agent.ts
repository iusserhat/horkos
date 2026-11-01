import { HorkosClient, TGAS, type ClientOptions } from "./client.js";
import { decryptData, generateBoxKeyPair, openPayload, sha256, toHex, type BoxKeyPair } from "./crypto.js";
import { FINAL_STATUSES, type DeliveryManifest, type Order, type OrderStatus } from "./types.js";

export interface AgentOptions extends ClientOptions {
  /** Mandate owner whose budget this agent spends. */
  owner: string;
}

export interface BuyArgs {
  listingId: string | number;
  /** Refuse before sending a transaction if the listing costs more (token base units). */
  maxPrice?: bigint | string;
  /** Verifier version the agent checked; the contract rejects the order if it changed. Defaults to the current one. */
  verifierVersion?: number;
  /** Key pair the data key will be sealed to. Generated if omitted. */
  buyerKeys?: BoxKeyPair;
}

export interface Purchase {
  order: Order;
  /** Needed by `openDelivery`. Store it; it is not on chain. */
  buyerKeys: BoxKeyPair;
}

/**
 * Agent (buyer) side. The agent's account may hold only a function-call key
 * limited to `create_order` / `cancel_order`; every limit is enforced by the
 * contract, not by this SDK.
 */
/**
 * Opens a delivery from its on-chain fields: unseals the buyer key, fetches
 * the manifest and ciphertext, checks the ciphertext is the one the verifier
 * checked, and decrypts. Exposed for testing the verifier end to end.
 */
export async function openDeliveryFrom(
  delivery: { orderId: string; deliveryRef: string; encryptedKey: string },
  buyerKeys: BoxKeyPair,
  get: typeof fetch = fetch,
): Promise<Uint8Array> {
  const payload = await openPayload(delivery.encryptedKey, buyerKeys);
  const manifest = (await (await get(delivery.deliveryRef)).json()) as DeliveryManifest;
  if (manifest.order_id !== delivery.orderId) throw new Error("delivery manifest is for another order");
  const res = await get(manifest.data_url);
  if (!res.ok) throw new Error(`fetching ${manifest.data_url}: HTTP ${res.status}`);
  const ciphertext = new Uint8Array(await res.arrayBuffer());
  if (toHex(sha256(ciphertext)) !== toHex(payload.ciphertextSha256)) {
    throw new Error("ciphertext hash mismatch: the hosted file is not the one that was verified");
  }
  return decryptData(ciphertext, payload.key);
}

export class HorkosAgent extends HorkosClient {
  readonly owner: string;

  constructor(opts: AgentOptions) {
    super(opts);
    this.owner = opts.owner;
  }

  async buy(args: BuyArgs): Promise<Purchase> {
    const listing = await this.getListing(args.listingId);
    if (!listing) throw new Error(`listing ${args.listingId} not found`);
    if (args.maxPrice !== undefined && BigInt(listing.price) > BigInt(args.maxPrice)) {
      throw new Error(`listing ${args.listingId} costs ${listing.price}, above maxPrice ${args.maxPrice}`);
    }
    const verifier = await this.getVerifier();
    if (!verifier) throw new Error("no verifier published on the contract");
    const buyerKeys = args.buyerKeys ?? (await generateBoxKeyPair());
    const order = await this.account.callFunction<Order>({
      contractId: this.contractId,
      methodName: "create_order",
      args: {
        owner: this.owner,
        listing_id: String(args.listingId),
        buyer_pubkey: buyerKeys.publicKey,
        verifier_version: args.verifierVersion ?? verifier.version,
      },
      gas: 100n * TGAS,
    });
    return { order, buyerKeys };
  }

  /** Cancels an `Open` order (before any delivery). */
  async cancel(orderId: string | number): Promise<Order> {
    return this.account.callFunction<Order>({
      contractId: this.contractId,
      methodName: "cancel_order",
      args: { order_id: String(orderId) },
      gas: 50n * TGAS,
    });
  }

  /**
   * Polls until the order reaches a final status (Settled, Refunded,
   * Cancelled) or one of `until`, and returns it. Throws on timeout.
   */
  async waitForSettlement(
    orderId: string | number,
    opts: { timeoutMs?: number; intervalMs?: number; until?: OrderStatus[] } = {},
  ): Promise<Order> {
    const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
    const stop = opts.until ?? FINAL_STATUSES;
    for (;;) {
      const order = await this.getOrder(orderId);
      if (!order) throw new Error(`order ${orderId} not found`);
      if (stop.includes(order.status)) return order;
      if (Date.now() > deadline) throw new Error(`order ${orderId} still ${order.status} after timeout`);
      await new Promise((r) => setTimeout(r, opts.intervalMs ?? 2_000));
    }
  }

  /**
   * Downloads and decrypts a settled delivery. Checks that the ciphertext is
   * exactly the one the verifier checked (hash sealed together with the key).
   */
  async openDelivery(
    orderOrId: Order | string | number,
    buyerKeys: BoxKeyPair,
    opts: { fetch?: typeof fetch } = {},
  ): Promise<Uint8Array> {
    const order = typeof orderOrId === "object" ? orderOrId : await this.getOrder(orderOrId);
    if (!order) throw new Error("order not found");
    if (order.status !== "Settled" || !order.encrypted_key || !order.delivery_ref) {
      throw new Error(`order ${order.id} is ${order.status}; nothing to open`);
    }
    return openDeliveryFrom(
      { orderId: order.id, deliveryRef: order.delivery_ref, encryptedKey: order.encrypted_key },
      buyerKeys,
      opts.fetch,
    );
  }

  /** `openDelivery` + UTF-8 JSON parse. */
  async openDeliveryJson<T = unknown>(orderOrId: Order | string | number, buyerKeys: BoxKeyPair, opts: { fetch?: typeof fetch } = {}): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.openDelivery(orderOrId, buyerKeys, opts))) as T;
  }
}
