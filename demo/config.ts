/**
 * Demo configuration (NEAR testnet). Keys are read from the near-cli legacy
 * keychain (~/.near-credentials/testnet); nothing secret is stored in the repo.
 * Account names are listed in docs/TESTNET.md.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider } from "../sdk/src/index.js";

export const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
export const CONTRACT = process.env.HORKOS_CONTRACT ?? "escrow.horkos.testnet";
export const TOKEN = process.env.HORKOS_TOKEN ?? "tusdc.horkos.testnet";
export const TOKEN_OWNER = "horkos.testnet";

export const ACCOUNTS = {
  owner: "horkos-owner.testnet",
  agent: "horkos-agent.testnet",
  sellerA: "horkos-seller-a.testnet", // delivers data that matches the schema
  sellerB: "horkos-seller-b.testnet", // delivers data that does not
  sellerC: "horkos-seller-c.testnet", // not on the owner's allowed-seller list
} as const;

export const USDC = 1_000_000n; // tUSDC has 6 decimals
export const NEAR = 10n ** 24n;

export const provider = new JsonRpcProvider({ url: RPC_URL });

const CREDS = join(homedir(), ".near-credentials", "testnet");

type KeyFile = { account_id: string; public_key: string; private_key?: string; secret_key?: string };
const secretOf = (k: KeyFile) => (k.private_key ?? k.secret_key) as `ed25519:${string}`;

/** Account signing with the key in `<id>.json` (full access for the demo's humans). */
export function account(id: string): Account {
  const file = join(CREDS, `${id}.json`);
  if (!existsSync(file)) throw new Error(`no key for ${id} in ${CREDS}`);
  return new Account(id, provider, secretOf(JSON.parse(readFileSync(file, "utf8"))));
}

/**
 * The agent signs with its function-call key (create_order / cancel_order
 * on the escrow only), never with a full-access key.
 */
export async function agentAccount(): Promise<Account> {
  const id = ACCOUNTS.agent;
  const keys = await provider.viewAccessKeyList({ accountId: id });
  const fc = keys.keys.find((k) => typeof k.access_key.permission === "object");
  if (!fc) throw new Error(`${id} has no function-call key`);
  const dir = join(CREDS, id);
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    const k = JSON.parse(readFileSync(join(dir, f), "utf8")) as KeyFile;
    if (k.public_key === fc.public_key) return new Account(id, provider, secretOf(k));
  }
  throw new Error(`function-call key ${fc.public_key} of ${id} not found in ${dir}`);
}

export const fmt = (units: bigint | string) => `${Number(BigInt(units)) / 1e6} tUSDC`;
