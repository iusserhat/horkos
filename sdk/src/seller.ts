import { HorkosClient, TGAS, type ClientOptions } from "./client.js";
import { encryptData, sealPayload, sha256, toHex } from "./crypto.js";
import type { BlobStore } from "./storage.js";
import type { DeliveryManifest, Order } from "./types.js";

export interface SellerOptions extends ClientOptions {
  /** Where ciphertext, conditions and manifests are published. */
  store: BlobStore;
}

export interface RegisteredListing {
  listingId: string;
  /** `sha256:<hex>` of the condition bytes, stored on chain. */
  conditionHash: string;
  /** Public URL of the condition; pass it to `submitDelivery`. */
  conditionUrl: string;
}

const NEAR = 10n ** 24n;

/**
 * Encrypts and publishes a delivery, returning what `submit_delivery` takes.
 * Exposed so the verifier can be tested on exactly what sellers produce.
 */
export async function prepareDelivery(args: {
  orderId: string;
  data: Uint8Array | unknown;
  conditionUrl: string;
  verifierPublicKey: string;
  store: BlobStore;
}): Promise<{ deliveryRef: string; sealedKey: string }> {
  const plaintext = args.data instanceof Uint8Array ? args.data : new TextEncoder().encode(JSON.stringify(args.data));
  const { key, ciphertext } = await encryptData(plaintext);
  const dataUrl = await args.store.put(ciphertext, "application/octet-stream");
  const manifest: DeliveryManifest = { v: 1, order_id: args.orderId, data_url: dataUrl, condition_url: args.conditionUrl };
  const deliveryRef = await args.store.put(new TextEncoder().encode(JSON.stringify(manifest)), "application/json");
  const sealedKey = await sealPayload({ key, ciphertextSha256: sha256(ciphertext) }, args.verifierPublicKey);
  return { deliveryRef, sealedKey };
}

/** Seller side: list, watch for orders, deliver, withdraw. */
export class HorkosSeller extends HorkosClient {
  private readonly store: BlobStore;

  constructor(opts: SellerOptions) {
    super(opts);
    this.store = opts.store;
  }

  /**
   * Publishes the condition (e.g. a JSON Schema) and registers a listing.
   * `storageDeposit` pays for the listing record; the excess is refunded.
   */
  async registerListing(args: {
    price: bigint | string;
    condition: unknown;
    deliveryWindowMs: number;
    storageDeposit?: bigint;
  }): Promise<RegisteredListing> {
    const bytes = new TextEncoder().encode(JSON.stringify(args.condition));
    const conditionUrl = await this.store.put(bytes, "application/json");
    const conditionHash = `sha256:${toHex(sha256(bytes))}`;
    const listingId = await this.account.callFunction<string>({
      contractId: this.contractId,
      methodName: "register_listing",
      args: {
        price: String(args.price),
        condition_hash: conditionHash,
        delivery_window: String(BigInt(args.deliveryWindowMs) * 1_000_000n),
      },
      deposit: args.storageDeposit ?? NEAR / 10n,
      gas: 50n * TGAS,
    });
    return { listingId, conditionHash, conditionUrl };
  }

  /**
   * Calls `handler` once for every `Open` order addressed to this seller.
   * Polls the receipt enumeration; returns a function that stops polling.
   */
  onOrder(handler: (order: Order) => void | Promise<void>, opts: { intervalMs?: number } = {}): () => void {
    const seen = new Set<string>();
    let stopped = false;
    const me = this.account.accountId;
    const tick = async () => {
      if (stopped) return;
      try {
        for (let from = 0; ; from += 100) {
          const ids = await this.listOrderIds(from, 100);
          for (const id of ids) {
            if (seen.has(id)) continue;
            const order = await this.getOrder(id);
            if (!order || order.seller !== me) {
              seen.add(id);
              continue;
            }
            if (order.status !== "Open") continue;
            seen.add(id);
            await handler(order);
          }
          if (ids.length < 100) break;
        }
      } catch (e) {
        console.error("HorkosSeller.onOrder:", e);
      }
      if (!stopped) setTimeout(tick, opts.intervalMs ?? 2_000);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }

  /**
   * Encrypts and publishes `data`, then submits the delivery with OutLayer's
   * fee (default: the pinned verifier's `min_fee`). Returns the order after
   * the transaction (Settled or Delivered once the verifier answered).
   */
  async submitDelivery(args: {
    orderId: string | number;
    data: Uint8Array | unknown;
    conditionUrl: string;
    fee?: bigint;
  }): Promise<Order> {
    const order = await this.getOrder(args.orderId);
    if (!order) throw new Error(`order ${args.orderId} not found`);
    const verifier = await this.getVerifierVersion(order.verifier_version);
    if (!verifier) throw new Error(`verifier version ${order.verifier_version} not found`);

    const { deliveryRef, sealedKey } = await prepareDelivery({
      orderId: order.id,
      data: args.data,
      conditionUrl: args.conditionUrl,
      verifierPublicKey: verifier.encryption_pubkey,
      store: this.store,
    });

    await this.account.callFunction({
      contractId: this.contractId,
      methodName: "submit_delivery",
      args: { order_id: order.id, delivery_ref: deliveryRef, sealed_key: sealedKey },
      deposit: args.fee ?? BigInt(verifier.min_fee),
      gas: 300n * TGAS,
      waitUntil: "FINAL",
    });
    return (await this.getOrder(order.id))!;
  }

  /** Withdraws seller earnings (default: all) to this account's token balance. */
  async withdraw(amount?: bigint | string): Promise<void> {
    await this.account.callFunction({
      contractId: this.contractId,
      methodName: "withdraw",
      args: { from: "Earnings", amount: amount === undefined ? null : String(amount) },
      deposit: 1n,
      gas: 50n * TGAS,
      waitUntil: "FINAL",
    });
  }

  earnings(): Promise<string> {
    return this.view("balance_of", { account_id: this.account.accountId });
  }
}
