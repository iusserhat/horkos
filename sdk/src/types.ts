/** JSON shapes returned by the Horkos contract (u64/u128 are decimal strings). */

export type OrderStatus = "Open" | "Verifying" | "Delivered" | "Settled" | "Refunded" | "Cancelled";

export const FINAL_STATUSES: readonly OrderStatus[] = ["Settled", "Refunded", "Cancelled"];

export interface Order {
  id: string;
  buyer: string;
  agent: string;
  seller: string;
  amount: string;
  listing_id: string;
  created_at: string;
  deadline: string;
  buyer_pubkey: string;
  delivery_ref: string | null;
  encrypted_key: string | null;
  status: OrderStatus;
  verifier_version: number;
  attempts: number;
}

export interface Listing {
  seller: string;
  price: string;
  condition_hash: string;
  delivery_window: string;
}

export interface Mandate {
  owner: string;
  agent: string;
  balance: string;
  spent: string;
  max_total: string;
  max_per_order: string;
  allowed_sellers: string[];
  expires_at: string;
  active: boolean;
  storage_deposit: string;
  open_orders: number;
  max_open_orders: number;
}

export interface VerifierConfig {
  outlayer: string;
  wasm_url: string;
  wasm_hash: string;
  build_target: string;
  encryption_pubkey: string;
  secrets_profile: string | null;
  secrets_account: string | null;
  min_fee: string;
  max_fee: string;
}

export interface VerifierView {
  version: number;
  config: VerifierConfig;
}

/**
 * What `delivery_ref` points to. The verifier fetches it, checks
 * sha256(condition) == listing.condition_hash and sha256(data) against the
 * sealed payload, decrypts and checks the data.
 */
export interface DeliveryManifest {
  v: 1;
  order_id: string;
  /** Ciphertext: nonce || XChaCha20-Poly1305 output. Content-addressed URL. */
  data_url: string;
  /** The listing's condition (e.g. a JSON Schema). */
  condition_url: string;
}
