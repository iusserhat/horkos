/**
 * Where sellers put ciphertext, conditions and manifests. The verifier (in
 * OutLayer's TEE) and the buyer fetch them by URL, so URLs must be public and
 * should be content-addressed (the buyer also checks the ciphertext hash).
 */
import { Account } from "near-api-js";
import { sha256, toHex } from "./crypto.js";

export interface BlobStore {
  /** Stores bytes and returns a URL that serves exactly those bytes. */
  put(bytes: Uint8Array, contentType: string): Promise<string>;
}

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const bstr = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  return concat(u32(bytes.length), bytes);
};
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const EXT: Record<string, string> = {
  "application/json": "json",
  "application/octet-stream": "bin",
};

/**
 * FastFS: files are written as the borsh-encoded arguments of a
 * `__fastdata_fastfs` function call (the call fails by design; the FastFS
 * indexer reads the arguments) and served at
 * `https://<host>/<sender>/<receiver>/<sha256>.<ext>`.
 * Format follows out-layer/outlayer-cli `src/commands/upload.rs` (simple
 * variant, files up to 1 MB).
 */
export class FastFsStore implements BlobStore {
  constructor(
    private readonly account: Account,
    private readonly opts: { receiver?: string; host?: string } = {},
  ) {}

  async put(bytes: Uint8Array, contentType: string): Promise<string> {
    if (bytes.length > 1 << 20) throw new Error("FastFsStore: files over 1 MB are not supported");
    const receiver = this.opts.receiver ?? "outlayer.testnet";
    const host = this.opts.host ?? "test.fastfs.io";
    const path = `${toHex(sha256(bytes))}.${EXT[contentType] ?? "bin"}`;
    // enum FastfsData::Simple(SimpleFastfs { relative_path, content: Some(FastfsFileContent { mime_type, content }) })
    const args = concat(new Uint8Array([0]), bstr(path), new Uint8Array([1]), bstr(contentType), u32(bytes.length), bytes);
    try {
      await this.account.callFunction({
        contractId: receiver,
        methodName: "__fastdata_fastfs",
        args,
        gas: 1_000_000_000_000n,
      });
    } catch {
      // Expected: the receiver has no such method. The data is in the
      // transaction arguments, which is what FastFS indexes.
    }
    return `https://${host}/${this.account.accountId}/${receiver}/${path}`;
  }
}
