import { HorkosClient, TGAS } from "./client.js";
import type { Mandate } from "./types.js";

/** Mandate owner (the human): budget, limits, revocation. Needs a full-access key. */
export class HorkosOwner extends HorkosClient {
  /** Creates or updates the mandate. `storageDeposit` (yoctoNEAR) pays for order storage (~0.0152 NEAR per order). */
  async setMandate(args: {
    agent: string;
    maxTotal: bigint | string;
    maxPerOrder: bigint | string;
    allowedSellers: string[];
    expiresAtMs: number;
    maxOpenOrders?: number;
    storageDeposit: bigint;
  }): Promise<Mandate> {
    return this.account.callFunction<Mandate>({
      contractId: this.contractId,
      methodName: "set_mandate",
      args: {
        agent: args.agent,
        max_total: String(args.maxTotal),
        max_per_order: String(args.maxPerOrder),
        allowed_sellers: args.allowedSellers,
        expires_at: String(BigInt(args.expiresAtMs) * 1_000_000n),
        max_open_orders: args.maxOpenOrders ?? null,
      },
      deposit: args.storageDeposit,
      gas: 50n * TGAS,
    });
  }

  /** Deposits budget with `ft_transfer_call` on the mandate's token. */
  async deposit(amount: bigint | string): Promise<void> {
    const token = await this.view<string>("get_token");
    await this.account.callFunction({
      contractId: token,
      methodName: "ft_transfer_call",
      args: { receiver_id: this.contractId, amount: String(amount), msg: "" },
      deposit: 1n,
      gas: 100n * TGAS,
      waitUntil: "FINAL",
    });
  }

  async revoke(): Promise<void> {
    await this.account.callFunction({
      contractId: this.contractId,
      methodName: "revoke_mandate",
      args: {},
      deposit: 1n,
      gas: 30n * TGAS,
    });
  }
}
