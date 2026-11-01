/**
 * End-to-end, local: the TypeScript SDK (libsodium) builds a real delivery,
 * the verifier (Rust, RustCrypto) checks it, and the SDK opens the result.
 * The verifier runs as a native binary reading file:// URLs; the WASM build
 * runs the same library code with HTTPS fetches instead.
 *
 * Run from sdk/:  npm run test:verifier
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  generateBoxKeyPair,
  openDeliveryFrom,
  prepareDelivery,
  sha256,
  toHex,
  type BlobStore,
  type BoxKeyPair,
} from "../../sdk/src/index.js";

const VERIFIER_DIR = resolve(import.meta.dirname, "..");
const TARGET = process.env.CARGO_TARGET_DIR ?? join(VERIFIER_DIR, "target");
const BIN = join(TARGET, "release", "horkos-verifier");
const CALLER = "escrow.horkos.testnet";

const SCHEMA = {
  type: "object",
  required: ["symbol", "rows"],
  properties: {
    symbol: { type: "string" },
    rows: {
      type: "array",
      minItems: 3,
      items: { type: "object", required: ["t", "price"], properties: { t: { type: "integer" }, price: { type: "number", minimum: 0 } } },
    },
  },
};
const GOOD = { symbol: "NEAR/USD", rows: [{ t: 1, price: 2.5 }, { t: 2, price: 2.6 }, { t: 3, price: 2.55 }] };
const BAD = { symbol: "NEAR/USD", rows: [{ time: "yesterday", price: "2.5" }] };

/** Content-addressed files under a temp dir, served as file:// URLs. */
class FileStore implements BlobStore {
  constructor(readonly dir: string) {}
  async put(bytes: Uint8Array, type: string): Promise<string> {
    const path = join(this.dir, `${toHex(sha256(bytes))}.${type === "application/json" ? "json" : "bin"}`);
    writeFileSync(path, bytes);
    return pathToFileURL(path).href;
  }
}
const fileFetch = (async (url: string | URL) => new Response(readFileSync(fileURLToPath(url)))) as typeof fetch;

let dir: string;
let store: FileStore;
let verifierKeys: BoxKeyPair;
let verifierSecretHex: string;
let conditionUrl: string;
let conditionHash: string;

function runVerifier(input: object, env: Record<string, string> = {}): Record<string, unknown> {
  const res = spawnSync(BIN, [], {
    input: JSON.stringify(input),
    env: { NEAR_PREDECESSOR_ID: CALLER, PROTECTED_VERIFIER_SK: verifierSecretHex, ...env },
  });
  assert.equal(res.status, 0, res.stderr.toString());
  const out = res.stdout.toString();
  assert.ok(out.length <= 900, `output is ${out.length} bytes`);
  return JSON.parse(out);
}

async function delivery(orderId: string, data: unknown, buyer: BoxKeyPair) {
  const { deliveryRef, sealedKey } = await prepareDelivery({ orderId, data, conditionUrl, verifierPublicKey: verifierKeys.publicKey, store });
  return { order_id: orderId, attempt: 1, delivery_ref: deliveryRef, sealed_key: sealedKey, condition_hash: conditionHash, buyer_pubkey: buyer.publicKey };
}

before(async () => {
  const build = spawnSync("cargo", ["build", "--release", "--quiet"], { cwd: VERIFIER_DIR, stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: TARGET } });
  assert.equal(build.status, 0, "cargo build failed");
  dir = mkdtempSync(join(tmpdir(), "horkos-verifier-e2e-"));
  store = new FileStore(dir);
  verifierKeys = await generateBoxKeyPair();
  verifierSecretHex = Buffer.from(verifierKeys.secretKey, "base64").toString("hex");
  const cond = new TextEncoder().encode(JSON.stringify(SCHEMA));
  conditionUrl = await store.put(cond, "application/json");
  conditionHash = `sha256:${toHex(sha256(cond))}`;
});

after(() => rmSync(dir, { recursive: true, force: true }));

describe("verifier on SDK-built deliveries", () => {
  it("derives the same public key from the secret as libsodium", () => {
    assert.equal(runVerifier({ cmd: "pubkey" }).pubkey, verifierKeys.publicKey);
  });

  it("accepts matching data and the buyer decrypts exactly what was delivered", async () => {
    const buyer = await generateBoxKeyPair();
    const input = await delivery("7", GOOD, buyer);
    const out = runVerifier(input);
    assert.equal(out.valid, true, String(out.reason));
    assert.equal(out.order_id, "7");
    assert.equal(out.attempt, 1);
    const plain = await openDeliveryFrom(
      { orderId: "7", deliveryRef: input.delivery_ref, encryptedKey: out.buyer_sealed_key as string },
      buyer,
      fileFetch,
    );
    assert.deepEqual(JSON.parse(new TextDecoder().decode(plain)), GOOD);
  });

  it("rejects data that fails the schema and gives the buyer no key", async () => {
    const out = runVerifier(await delivery("8", BAD, await generateBoxKeyPair()));
    assert.equal(out.valid, false);
    assert.equal(out.buyer_sealed_key, null);
    assert.match(String(out.reason), /^schema:/);
  });

  it("rejects calls that do not come from the Horkos contract", async () => {
    const out = runVerifier(await delivery("9", GOOD, await generateBoxKeyPair()), { NEAR_PREDECESSOR_ID: "attacker.testnet" });
    assert.equal(out.valid, false);
    assert.match(String(out.reason), /is not escrow\.horkos\.testnet/);
  });

  it("the re-sealed key does not open for anyone but the buyer", async () => {
    const buyer = await generateBoxKeyPair();
    const input = await delivery("10", GOOD, buyer);
    const out = runVerifier(input);
    await assert.rejects(
      openDeliveryFrom({ orderId: "10", deliveryRef: input.delivery_ref, encryptedKey: out.buyer_sealed_key as string }, await generateBoxKeyPair(), fileFetch),
    );
  });
});
