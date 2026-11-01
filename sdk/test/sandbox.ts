/**
 * Minimal local sandbox for SDK tests: starts the near-sandbox binary that
 * the Rust sandbox tests download (falls back to running it in Docker via
 * contracts/scripts/sandbox-docker.sh when the host glibc is too old), and
 * deploys the contracts built by contracts/scripts/build.sh.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as netServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair } from "near-api-js";
import { sha256, toHex, type BlobStore } from "../src/index.js";

const REPO = resolve(import.meta.dirname, "../..");
const TARGET = process.env.CARGO_TARGET_DIR ?? join(REPO, "contracts/target");

function findSandboxBinary(): string {
  if (process.env.NEAR_SANDBOX_REAL_BIN) return process.env.NEAR_SANDBOX_REAL_BIN;
  const build = join(TARGET, "debug/build");
  for (const dir of existsSync(build) ? readdirSync(build) : []) {
    if (!dir.startsWith("near-sandbox-")) continue;
    const near = join(build, dir, "out/.near");
    if (!existsSync(near)) continue;
    for (const v of readdirSync(near)) {
      const bin = join(near, v, "near-sandbox");
      if (existsSync(bin) && statSync(bin).isFile()) return bin;
    }
  }
  throw new Error("near-sandbox binary not found; run contracts/scripts/test-sandbox.sh once to download it");
}

function launcher(): { cmd: string; env: NodeJS.ProcessEnv } {
  const bin = findSandboxBinary();
  const native = spawnSync(bin, ["--version"]).status === 0;
  if (native) return { cmd: bin, env: process.env };
  return {
    cmd: join(REPO, "contracts/scripts/sandbox-docker.sh"),
    env: { ...process.env, NEAR_SANDBOX_REAL_BIN: bin },
  };
}

async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = netServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
    s.on("error", fail);
  });
}

export function wasm(name: string): Uint8Array {
  const path = join(TARGET, "near", name, `${name}.wasm`);
  if (!existsSync(path)) throw new Error(`${path} missing; run contracts/scripts/build.sh`);
  return new Uint8Array(readFileSync(path));
}

export interface Sandbox {
  provider: JsonRpcProvider;
  root: Account;
  /** Creates `<name>.test.near` with a fresh full-access key. */
  account(name: string, near: number): Promise<Account>;
  stop(): Promise<void>;
}

export async function startSandbox(): Promise<Sandbox> {
  const { cmd, env } = launcher();
  const home = mkdtempSync(join(tmpdir(), "horkos-sdk-sandbox-"));
  const init = spawnSync(cmd, ["--home", home, "init", "--fast"], { env, stdio: "ignore" });
  if (init.status !== 0) throw new Error(`sandbox init failed (exit ${init.status})`);
  const rpcPort = await freePort();
  const netPort = await freePort();
  const node: ChildProcess = spawn(
    cmd,
    ["--home", home, "run", "--rpc-addr", `127.0.0.1:${rpcPort}`, "--network-addr", `127.0.0.1:${netPort}`],
    { env, stdio: "ignore" },
  );
  const url = `http://127.0.0.1:${rpcPort}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${url}/status`)).ok) break;
    } catch {}
    if (i > 120) throw new Error("sandbox did not start");
    await new Promise((r) => setTimeout(r, 500));
  }
  const key = JSON.parse(readFileSync(join(home, "validator_key.json"), "utf8"));
  const provider = new JsonRpcProvider({ url });
  const root = new Account(key.account_id, provider, key.secret_key);
  return {
    provider,
    root,
    async account(name, near) {
      const kp = KeyPair.fromRandom("ed25519");
      const id = `${name}.${root.accountId}`;
      await root.createAccount({
        newAccountId: id,
        publicKey: kp.getPublicKey().toString(),
        nearToTransfer: BigInt(near) * 10n ** 24n,
      });
      return new Account(id, provider, kp.toString() as `ed25519:${string}`);
    },
    async stop() {
      node.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      if (node.exitCode === null) node.kill("SIGKILL");
    },
  };
}

/** Content-addressed in-memory HTTP blob store (the test stand-in for FastFS). */
export class LocalHttpStore implements BlobStore {
  readonly blobs = new Map<string, { bytes: Uint8Array; type: string }>();
  private server?: Server;
  private base = "";

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const blob = this.blobs.get((req.url ?? "").slice(1));
      if (!blob) return void res.writeHead(404).end();
      res.writeHead(200, { "content-type": blob.type }).end(Buffer.from(blob.bytes));
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    this.base = `http://127.0.0.1:${(this.server.address() as { port: number }).port}`;
  }

  async put(bytes: Uint8Array, type: string): Promise<string> {
    const path = `${toHex(sha256(bytes))}.${type === "application/json" ? "json" : "bin"}`;
    this.blobs.set(path, { bytes, type });
    return `${this.base}/${path}`;
  }

  /** Test helper: replace what a URL serves (simulates a seller swapping the file). */
  tamper(url: string, bytes: Uint8Array): void {
    const path = url.slice(this.base.length + 1);
    const blob = this.blobs.get(path);
    if (!blob) throw new Error("unknown blob");
    this.blobs.set(path, { bytes, type: blob.type });
  }

  async stop(): Promise<void> {
    await new Promise((r) => this.server?.close(r));
  }
}
