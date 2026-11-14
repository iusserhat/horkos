/**
 * Horkos Sentinel CLI.
 *
 *   npm run sentinel -- --config sentinel.json            watch (Ctrl-C to stop)
 *   npm run sentinel -- --config sentinel.json --once --from 30   evaluate orders 30 and later once, then exit
 *
 * Keys: for owners with "auto_cancel": true, the agent's function-call key is
 * read from the near-cli legacy keychain (~/.near-credentials/<network>/<agent>/),
 * or from SENTINEL_AGENT_KEY_<AGENT> (dots and dashes as underscores, upper case).
 * Nothing is sent anywhere except NEAR RPC and the optional webhook.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Account, HorkosAgent, HorkosClient, JsonRpcProvider } from "../../sdk/src/index.js";
import { DEFAULT_RULES, type RuleConfig } from "./rules.js";
import { Sentinel, type OwnerWatch, type Report } from "./sentinel.js";

interface FileConfig {
  network: "testnet" | "mainnet";
  contract: string;
  rpc?: string;
  poll_ms?: number;
  webhook?: string | null;
  owners: { owner: string; agent: string; auto_cancel?: boolean; trusted_sellers?: string[] }[];
  rules?: Partial<{ price_deviation_pct: number; lookalike_max_distance: number; burst_count: number; burst_window_min: number; near_limit_pct: number }>;
  /** condition_hash -> price in tUSDC */
  reference_prices?: Record<string, number>;
}

const { values } = parseArgs({ options: { config: { type: "string" }, once: { type: "boolean" }, from: { type: "string" } } });
if (!values.config) {
  console.error("usage: npm run sentinel -- --config <file.json> [--once] [--from <order id>]");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(values.config, "utf8")) as FileConfig;
const rpc = cfg.rpc ?? (cfg.network === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com");
const provider = new JsonRpcProvider({ url: rpc });
const rules: RuleConfig = {
  priceDeviationPct: cfg.rules?.price_deviation_pct ?? DEFAULT_RULES.priceDeviationPct,
  lookalikeMaxDistance: cfg.rules?.lookalike_max_distance ?? DEFAULT_RULES.lookalikeMaxDistance,
  burstCount: cfg.rules?.burst_count ?? DEFAULT_RULES.burstCount,
  burstWindowMs: (cfg.rules?.burst_window_min ?? DEFAULT_RULES.burstWindowMs / 60_000) * 60_000,
  nearLimitPct: cfg.rules?.near_limit_pct ?? DEFAULT_RULES.nearLimitPct,
};

type KeyFile = { public_key: string; private_key?: string; secret_key?: string };
async function agentAccount(id: string): Promise<Account> {
  const envKey = process.env[`SENTINEL_AGENT_KEY_${id.replace(/[.-]/g, "_").toUpperCase()}`];
  if (envKey) return new Account(id, provider, envKey as `ed25519:${string}`);
  const keys = await provider.viewAccessKeyList({ accountId: id });
  const fc = keys.keys.filter((k) => typeof k.access_key.permission === "object").map((k) => k.public_key);
  const dir = join(homedir(), ".near-credentials", cfg.network, id);
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    const k = JSON.parse(readFileSync(join(dir, f), "utf8")) as KeyFile;
    if (fc.includes(k.public_key)) return new Account(id, provider, (k.private_key ?? k.secret_key) as `ed25519:${string}`);
  }
  throw new Error(`no function-call key for ${id} in ${dir}; set SENTINEL_AGENT_KEY_...`);
}

const owners: OwnerWatch[] = cfg.owners.map((o) => ({ owner: o.owner, agent: o.agent, autoCancel: Boolean(o.auto_cancel), trustedSellers: o.trusted_sellers }));
const agents = new Map<string, HorkosAgent>();
for (const o of owners.filter((x) => x.autoCancel)) {
  agents.set(o.owner, new HorkosAgent({ contractId: cfg.contract, account: await agentAccount(o.agent), owner: o.owner }));
}
const referencePrices = Object.fromEntries(Object.entries(cfg.reference_prices ?? {}).map(([k, v]) => [k, BigInt(Math.round(v * 1e6))]));

const stamp = () => new Date().toISOString().slice(11, 19);
async function report(r: Report) {
  const head = `[${stamp()}] order ${r.order.id} (${r.order.buyer} → ${r.order.seller}, ${Number(r.order.amount) / 1e6} tUSDC)`;
  if (!r.alerts.length) console.log(`${head}: no alerts`);
  for (const a of r.alerts) console.log(`${head}: ${a.severity.toUpperCase()} ${a.rule}: ${a.message}`);
  if (r.cancelled) console.log(`${head}: auto-cancel ${r.cancelled.ok ? "DONE" : "NOT DONE"} (${r.cancelled.detail})`);
  if (cfg.webhook && r.alerts.length) {
    await fetch(cfg.webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order: r.order, alerts: r.alerts, cancelled: r.cancelled ?? null }) }).catch((e) => console.error(`webhook: ${(e as Error).message}`));
  }
}

const client = new HorkosClient({ contractId: cfg.contract, account: new Account(cfg.owners[0].owner, provider) });
const sentinel = new Sentinel({ client, agents, owners, rules, referencePrices, report });
const n = await sentinel.prime(values.from !== undefined ? Number(values.from) : Infinity);
console.log(`[${stamp()}] watching ${cfg.contract} for ${owners.map((o) => `${o.owner}${o.autoCancel ? " (auto-cancel)" : ""}`).join(", ")}; ${n} earlier orders read as history`);
if (values.once) {
  await sentinel.tick();
  process.exit(0);
}
for (;;) {
  try {
    await sentinel.tick();
  } catch (e) {
    console.error(`[${stamp()}] ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, cfg.poll_ms ?? 3000));
}
