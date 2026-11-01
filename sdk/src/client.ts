import { Account, JsonRpcProvider } from "near-api-js";
import type { Listing, Mandate, Order, VerifierConfig, VerifierView } from "./types.js";

export const TGAS = 1_000_000_000_000n;

export interface ClientOptions {
  /** Horkos contract account, e.g. `escrow.horkos.testnet`. */
  contractId: string;
  /** Signs this side's transactions. */
  account: Account;
  /** Used for views; defaults to the account's provider. */
  provider?: JsonRpcProvider;
}

/** Read access to the contract, shared by the agent and seller clients. */
export class HorkosClient {
  readonly contractId: string;
  readonly account: Account;
  protected readonly provider: JsonRpcProvider;

  constructor(opts: ClientOptions) {
    this.contractId = opts.contractId;
    this.account = opts.account;
    this.provider = opts.provider ?? (opts.account.provider as JsonRpcProvider);
  }

  protected async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.provider.callFunction({ contractId: this.contractId, method, args })) as T;
  }

  getOrder(orderId: string | number): Promise<Order | null> {
    return this.view("get_order", { order_id: String(orderId) });
  }

  getListing(listingId: string | number): Promise<Listing | null> {
    return this.view("get_listing", { listing_id: String(listingId) });
  }

  getMandate(owner: string): Promise<Mandate | null> {
    return this.view("get_mandate", { owner });
  }

  getVerifier(): Promise<VerifierView | null> {
    return this.view("get_verifier");
  }

  getVerifierVersion(version: number): Promise<VerifierConfig | null> {
    return this.view("get_verifier_version", { version });
  }

  /** Orders whose receipt NFT exists, newest last (via NEP-181 enumeration). */
  async listOrderIds(fromIndex = 0, limit = 100): Promise<string[]> {
    const tokens = await this.view<{ token_id: string }[]>("nft_tokens", {
      from_index: String(fromIndex),
      limit,
    });
    return tokens.map((t) => t.token_id);
  }
}
