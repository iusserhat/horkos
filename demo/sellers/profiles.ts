/**
 * The three demo sellers. All publish the same JSON Schema condition; what
 * differs is what they deliver and whether the owner allowed them.
 */
import { ACCOUNTS, USDC } from "../config.js";

/** Condition published by every demo listing (checked by the verifier). */
export const MARKET_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["symbol", "rows"],
  additionalProperties: false,
  properties: {
    symbol: { type: "string", minLength: 1 },
    rows: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        required: ["t", "price"],
        properties: { t: { type: "integer", minimum: 0 }, price: { type: "number", minimum: 0 } },
      },
    },
  },
};

const now = () => Math.floor(Date.now() / 1000);
const validRows = () => [0, 60, 120, 180].map((d) => ({ t: now() - d, price: +(2.5 + Math.random() / 10).toFixed(4) }));

export interface SellerProfile {
  key: "a" | "b" | "c";
  account: string;
  title: string;
  price: bigint;
  deliveryWindowMs: number;
  data: () => unknown;
}

export const PROFILES: Record<"a" | "b" | "c", SellerProfile> = {
  a: {
    key: "a",
    account: ACCOUNTS.sellerA,
    title: "Seller A: delivers data that matches the schema",
    price: 5n * USDC,
    deliveryWindowMs: 10 * 60_000,
    data: () => ({ symbol: "NEAR/USD", rows: validRows() }),
  },
  b: {
    key: "b",
    account: ACCOUNTS.sellerB,
    title: "Seller B: delivers data that does not match the schema",
    price: 5n * USDC,
    // Short window so demo 2 shows the timeout refund within minutes.
    deliveryWindowMs: 3 * 60_000,
    data: () => ({ symbol: "NEAR/USD", rows: [{ time: "yesterday", price: "2.5" }] }),
  },
  c: {
    key: "c",
    account: ACCOUNTS.sellerC,
    title: "Seller C: not on the owner's allowed-seller list",
    price: 500n * USDC,
    deliveryWindowMs: 10 * 60_000,
    data: () => ({ symbol: "NEAR/USD", rows: validRows() }),
  },
};
