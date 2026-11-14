/**
 * Gateway config: one JSON file, no secrets. Secrets are referenced as
 * `env:NAME` (whole value) or `{env:NAME}` (inside a string) and read from
 * the environment when a request is made.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Network = "testnet";

export interface SourceConfig {
  /** May contain {order_id}, {buyer}, {listing_id} and {env:NAME}. */
  url: string;
  method?: "GET" | "POST";
  /** Values are literal, `env:NAME`, or contain the placeholders above. */
  headers?: Record<string, string>;
  /** POST only. String values may contain placeholders or be `env:NAME`. */
  body?: unknown;
  /** Part of the response to deliver: `data.items[0]`; empty or "$" = whole body. */
  json_path?: string;
  /** Request timeout, default 15000. */
  timeout_ms?: number;
}

export interface CreateConfig {
  price_tusdc: number;
  deliver_within_min: number;
  condition_file: string;
  description?: string;
}

export interface ListingConfig {
  listing_id?: string;
  /** JSON Schema the delivery must satisfy; required with `listing_id` unless `create` names it. */
  condition_file?: string;
  /** Public URL of the condition; written by `register`. Uploaded at start if missing. */
  condition_url?: string;
  create?: CreateConfig;
  source: SourceConfig;
}

export interface GatewayConfig {
  network: Network;
  contract: string;
  seller: string;
  /** Optional; default https://test.rpc.fastnear.com. */
  rpc_url?: string;
  /** Order polling interval, default 5000. */
  poll_ms?: number;
  listings: ListingConfig[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** Throws with every problem found, so one run shows all of them. */
export function parseConfig(raw: unknown): GatewayConfig {
  const errs: string[] = [];
  const need = (ok: boolean, msg: string) => ok || errs.push(msg);
  if (!isObj(raw)) throw new Error("config: must be a JSON object");
  need(raw.network === "testnet", "network: \"testnet\" (the only network supported so far)");
  need(typeof raw.contract === "string" && ACCOUNT.test(raw.contract), "contract: a NEAR account id");
  need(typeof raw.seller === "string" && ACCOUNT.test(raw.seller), "seller: a NEAR account id");
  need(raw.rpc_url === undefined || (typeof raw.rpc_url === "string" && /^https?:\/\//.test(raw.rpc_url)), "rpc_url: an http(s) URL");
  need(raw.poll_ms === undefined || (Number.isInteger(raw.poll_ms) && (raw.poll_ms as number) >= 1000), "poll_ms: integer ≥ 1000");
  if (!Array.isArray(raw.listings) || raw.listings.length === 0) errs.push("listings: a non-empty array");
  else
    raw.listings.forEach((l: unknown, i: number) => {
      const p = `listings[${i}]`;
      if (!isObj(l)) return void errs.push(`${p}: an object`);
      need(l.listing_id === undefined || (typeof l.listing_id === "string" && /^\d+$/.test(l.listing_id)), `${p}.listing_id: a decimal string`);
      need(l.listing_id !== undefined || l.create !== undefined, `${p}: needs listing_id or create`);
      if (l.create !== undefined) {
        const c = l.create;
        if (!isObj(c)) errs.push(`${p}.create: an object`);
        else {
          need(typeof c.price_tusdc === "number" && c.price_tusdc > 0, `${p}.create.price_tusdc: a number > 0`);
          need(Number.isInteger(c.deliver_within_min) && (c.deliver_within_min as number) > 0, `${p}.create.deliver_within_min: an integer > 0`);
          need(typeof c.condition_file === "string", `${p}.create.condition_file: a path`);
          need(c.description === undefined || typeof c.description === "string", `${p}.create.description: a string`);
        }
      }
      need(l.condition_file === undefined || typeof l.condition_file === "string", `${p}.condition_file: a path`);
      need(l.condition_file !== undefined || isObj(l.create), `${p}: needs condition_file (or create.condition_file)`);
      need(l.condition_url === undefined || typeof l.condition_url === "string", `${p}.condition_url: a URL`);
      const s = l.source;
      if (!isObj(s)) return void errs.push(`${p}.source: an object`);
      need(typeof s.url === "string" && /^https?:\/\//.test(s.url), `${p}.source.url: an http(s) URL`);
      need(s.method === undefined || s.method === "GET" || s.method === "POST", `${p}.source.method: "GET" or "POST"`);
      need(s.headers === undefined || (isObj(s.headers) && Object.values(s.headers).every((v) => typeof v === "string")), `${p}.source.headers: string values`);
      need(s.body === undefined || s.method === "POST", `${p}.source.body: only with method POST`);
      need(s.json_path === undefined || typeof s.json_path === "string", `${p}.source.json_path: a string`);
      need(s.timeout_ms === undefined || (Number.isInteger(s.timeout_ms) && (s.timeout_ms as number) > 0), `${p}.source.timeout_ms: integer > 0`);
      if (typeof s.url === "string" && /[?&][^=]*(key|token|secret)[^=]*=[^{&]/i.test(s.url))
        errs.push(`${p}.source.url: looks like it holds a secret; use {env:NAME}`);
    });
  if (errs.length) throw new Error(`config has ${errs.length} problem(s):\n  - ${errs.join("\n  - ")}`);
  return raw as unknown as GatewayConfig;
}

export interface LoadedConfig {
  config: GatewayConfig;
  path: string;
  /** Resolves a path in the config relative to the config file. */
  rel: (p: string) => string;
}

export function loadConfig(path: string): LoadedConfig {
  const abs = resolve(path);
  const config = parseConfig(JSON.parse(readFileSync(abs, "utf8")));
  return { config, path: abs, rel: (p) => resolve(dirname(abs), p) };
}

/** Writes the config back (2-space JSON), e.g. after `register` filled in listing_id. */
export function saveConfig(loaded: LoadedConfig): void {
  writeFileSync(loaded.path, JSON.stringify(loaded.config, null, 2) + "\n");
}

export const conditionFileOf = (l: ListingConfig): string => (l.condition_file ?? l.create?.condition_file)!;

export const rpcUrlOf = (c: GatewayConfig): string => c.rpc_url ?? "https://test.rpc.fastnear.com";
