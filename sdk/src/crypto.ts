/**
 * Encryption for Horkos deliveries. All primitives come from libsodium
 * (libsodium-wrappers); nothing here implements cryptography itself.
 *
 * - Data: XChaCha20-Poly1305 (AEAD) under a fresh 32-byte key K.
 *   Ciphertext layout: nonce (24 bytes) || AEAD output.
 * - Key transport: libsodium sealed box (X25519) of `K || sha256(ciphertext)`.
 *   The seller seals it to the verifier's key; the verifier, after checking
 *   the delivery, re-seals the same 64 bytes to the buyer's key. The hash
 *   pins the exact ciphertext the verifier checked, so a seller cannot swap
 *   the hosted file afterwards.
 */
import sodium from "libsodium-wrappers";
import { createHash } from "node:crypto";

export interface BoxKeyPair {
  /** X25519 public key, base64 (standard, with padding). */
  publicKey: string;
  /** X25519 secret key, base64. Keep it private. */
  secretKey: string;
}

export interface SealedPayload {
  key: Uint8Array;
  ciphertextSha256: Uint8Array;
}

const KEY_BYTES = 32;
const HASH_BYTES = 32;

let ready: Promise<void> | undefined;
async function lib(): Promise<typeof sodium> {
  ready ??= sodium.ready;
  await ready;
  return sodium;
}

const b64 = (s: typeof sodium, bytes: Uint8Array) => s.to_base64(bytes, s.base64_variants.ORIGINAL);
const unb64 = (s: typeof sodium, text: string) => s.from_base64(text, s.base64_variants.ORIGINAL);

export function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/** New X25519 key pair for receiving a sealed data key (buyer) or for a test verifier. */
export async function generateBoxKeyPair(): Promise<BoxKeyPair> {
  const s = await lib();
  const kp = s.crypto_box_keypair();
  return { publicKey: b64(s, kp.publicKey), secretKey: b64(s, kp.privateKey) };
}

/** Encrypts `plaintext` under a fresh key. Returns the key and `nonce || ciphertext`. */
export async function encryptData(plaintext: Uint8Array): Promise<{ key: Uint8Array; ciphertext: Uint8Array }> {
  const s = await lib();
  const key = s.crypto_aead_xchacha20poly1305_ietf_keygen();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const body = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, null, null, nonce, key);
  const ciphertext = new Uint8Array(nonce.length + body.length);
  ciphertext.set(nonce, 0);
  ciphertext.set(body, nonce.length);
  return { key, ciphertext };
}

/** Decrypts `nonce || ciphertext`. Throws if the key is wrong or the data was altered. */
export async function decryptData(ciphertext: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  const s = await lib();
  const n = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (ciphertext.length <= n) throw new Error("ciphertext too short");
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext.subarray(n), null, ciphertext.subarray(0, n), key);
}

/** Seals `K || sha256(ciphertext)` to `recipientPublicKey` (base64). Returns base64. */
export async function sealPayload(payload: SealedPayload, recipientPublicKey: string): Promise<string> {
  const s = await lib();
  if (payload.key.length !== KEY_BYTES || payload.ciphertextSha256.length !== HASH_BYTES) {
    throw new Error("sealed payload must be a 32-byte key and a 32-byte hash");
  }
  const message = new Uint8Array(KEY_BYTES + HASH_BYTES);
  message.set(payload.key, 0);
  message.set(payload.ciphertextSha256, KEY_BYTES);
  return b64(s, s.crypto_box_seal(message, unb64(s, recipientPublicKey)));
}

/** Opens a sealed payload with the recipient's key pair. Throws if it was not sealed to it. */
export async function openPayload(sealed: string, keys: BoxKeyPair): Promise<SealedPayload> {
  const s = await lib();
  const message = s.crypto_box_seal_open(unb64(s, sealed), unb64(s, keys.publicKey), unb64(s, keys.secretKey));
  if (message.length !== KEY_BYTES + HASH_BYTES) throw new Error("unexpected sealed payload length");
  return { key: message.slice(0, KEY_BYTES), ciphertextSha256: message.slice(KEY_BYTES) };
}
