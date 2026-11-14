/**
 * horkos-gateway CLI.
 *   npm run gateway -- register --config horkos-gateway.json
 *   npm run gateway -- check    --config horkos-gateway.json [--order 7 --buyer x.testnet]
 *   npm run gateway -- run      --config horkos-gateway.json   (default command)
 * The seller key comes from HORKOS_SELLER_KEY (ed25519:...) or from the
 * near-cli legacy keychain ~/.near-credentials/<network>/<seller>.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Account, FastFsStore, HorkosSeller, JsonRpcProvider } from "../../sdk/src/index.js";
import { conditionFileOf, loadConfig, rpcUrlOf, saveConfig, type GatewayConfig } from "./config.js";
import { Gateway, produce, readCondition } from "./gateway.js";

const USDC = 1_000_000;
const NEAR = 10n ** 24n;

function sellerKey(c: GatewayConfig): `ed25519:${string}` {
  const env = process.env.HORKOS_SELLER_KEY;
  if (env) {
    if (!env.startsWith("ed25519:")) throw new Error("HORKOS_SELLER_KEY must look like ed25519:...");
    return env as `ed25519:${string}`;
  }
  const file = join(homedir(), ".near-credentials", c.network, `${c.seller}.json`);
  if (!existsSync(file)) throw new Error(`no seller key: set HORKOS_SELLER_KEY or add ${file} (near-cli legacy keychain)`);
  const k = JSON.parse(readFileSync(file, "utf8")) as { private_key?: string; secret_key?: string };
  return (k.private_key ?? k.secret_key) as `ed25519:${string}`;
}

function sellerOf(c: GatewayConfig) {
  const account = new Account(c.seller, new JsonRpcProvider({ url: rpcUrlOf(c) }), sellerKey(c));
  const store = new FastFsStore(account);
  return { seller: new HorkosSeller({ contractId: c.contract, account, store }), store };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", default: "horkos-gateway.json" },
      order: { type: "string", default: "0" },
      buyer: { type: "string", default: "buyer.testnet" },
      listing: { type: "string" },
    },
  });
  const cmd = positionals[0] ?? "run";
  const loaded = loadConfig(values.config!);
  const { config, rel } = loaded;

  if (cmd === "check") {
    // One call per listing, no chain access and no delivery.
    let failed = 0;
    for (const [i, l] of config.listings.entries()) {
      const cond = readCondition(rel(conditionFileOf(l)));
      const vars = { order_id: values.order!, buyer: values.buyer!, listing_id: values.listing ?? l.listing_id ?? "0" };
      const res = await produce(l, cond, vars);
      const name = l.listing_id ? `listing ${l.listing_id}` : `listings[${i}]`;
      if ("ok" in res) console.log(`${name}: OK, the data matches ${conditionFileOf(l)}\n${JSON.stringify(res.data, null, 2).slice(0, 2000)}`);
      else {
        failed++;
        console.log(`${name}: FAIL, ${res.kind === "rejected" ? `data fails the condition: ${res.errors.join("; ")}` : res.message}`);
      }
    }
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (cmd === "register") {
    const { seller } = sellerOf(config);
    for (const l of config.listings) {
      if (l.listing_id || !l.create) continue;
      const cond = readCondition(rel(l.create.condition_file));
      const reg = await seller.registerListing({
        price: BigInt(Math.round(l.create.price_tusdc * USDC)),
        condition: cond.schema,
        deliveryWindowMs: l.create.deliver_within_min * 60_000,
        storageDeposit: NEAR / 10n,
      });
      l.listing_id = reg.listingId;
      l.condition_url = reg.conditionUrl;
      saveConfig(loaded);
      console.log(`registered listing ${reg.listingId} (${l.create.price_tusdc} tUSDC, ${l.create.deliver_within_min} min, ${reg.conditionHash}); written to ${loaded.path}`);
    }
    return;
  }

  if (cmd === "run") {
    const { seller, store } = sellerOf(config);
    const gw = new Gateway({ loaded, seller, store });
    await gw.start();
    const stop = () => {
      gw.stop();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    return;
  }

  throw new Error(`unknown command "${cmd}"; use register, check or run`);
}

main().catch((e) => {
  console.error(`horkos-gateway: ${(e as Error).message}`);
  process.exit(1);
});
