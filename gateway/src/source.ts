/**
 * Calls the seller's own API for one order and extracts the part to deliver.
 * Placeholders: {order_id}, {buyer}, {listing_id} (URL-encoded in the URL),
 * {env:NAME} anywhere, and `env:NAME` as a whole header or body value.
 * Resolved values never reach the log: errors name the URL template only.
 */
import type { SourceConfig } from "./config.js";

export const MAX_RESPONSE_BYTES = 1 << 20;

export interface OrderVars {
  order_id: string;
  buyer: string;
  listing_id: string;
}

export class SourceError extends Error {
  /** Worth one more try later (network error, timeout, 429, 5xx). */
  constructor(message: string, readonly transient: boolean) {
    super(message);
  }
}

type Env = Record<string, string | undefined>;

function envValue(name: string, env: Env): string {
  const v = env[name];
  if (v === undefined || v === "") throw new SourceError(`environment variable ${name} is not set`, false);
  return v;
}

/** Replaces placeholders in one string. `encode` URL-encodes order values (for the URL). */
export function fill(s: string, vars: OrderVars, env: Env, encode = false): string {
  const whole = /^env:([A-Za-z_][A-Za-z0-9_]*)$/.exec(s);
  if (whole) return envValue(whole[1], env);
  return s.replace(/\{(order_id|buyer|listing_id|env:[A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k: string) => {
    if (k.startsWith("env:")) return envValue(k.slice(4), env);
    const v = vars[k as keyof OrderVars];
    return encode ? encodeURIComponent(v) : v;
  });
}

function fillDeep(v: unknown, vars: OrderVars, env: Env): unknown {
  if (typeof v === "string") return fill(v, vars, env);
  if (Array.isArray(v)) return v.map((x) => fillDeep(x, vars, env));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, vars, env)]));
  return v;
}

/** `a.b[0].c`, `a.b.0.c`; empty or `$` selects the whole value. */
export function selectPath(value: unknown, path: string | undefined): unknown {
  const p = (path ?? "").trim().replace(/^\$\.?/, "");
  if (p === "") return value;
  let cur = value;
  for (const key of p.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (key === "") throw new SourceError(`json_path "${path}" is malformed`, false);
    if (cur === null || typeof cur !== "object" || !(key in cur)) throw new SourceError(`json_path "${path}" not found in the response`, false);
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > max) throw new SourceError(`response is ${declared} bytes, over the ${max}-byte limit`, false);
  const out: Uint8Array[] = [];
  let n = 0;
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel();
      throw new SourceError(`response is over the ${max}-byte limit`, false);
    }
    out.push(value);
  }
  return Buffer.concat(out);
}

/** Fetches the source for one order and returns the selected JSON value. */
export async function fetchSource(
  src: SourceConfig,
  vars: OrderVars,
  opts: { env?: Env; fetch?: typeof fetch; maxBytes?: number } = {},
): Promise<unknown> {
  const env = opts.env ?? process.env;
  const method = src.method ?? "GET";
  const url = fill(src.url, vars, env, true);
  const headers: Record<string, string> = { accept: "application/json" };
  for (const [k, v] of Object.entries(src.headers ?? {})) headers[k.toLowerCase()] = fill(v, vars, env);
  let body: string | undefined;
  if (method === "POST" && src.body !== undefined) {
    body = JSON.stringify(fillDeep(src.body, vars, env));
    headers["content-type"] ??= "application/json";
  }
  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(url, { method, headers, body, redirect: "follow", signal: AbortSignal.timeout(src.timeout_ms ?? 15_000) });
  } catch (e) {
    throw new SourceError(`${method} ${src.url} failed: ${(e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message}`, true);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new SourceError(`${method} ${src.url} answered HTTP ${res.status}`, res.status === 429 || res.status >= 500);
  }
  const bytes = await readCapped(res, opts.maxBytes ?? MAX_RESPONSE_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SourceError(`${method} ${src.url} did not return JSON`, false);
  }
  return selectPath(json, src.json_path);
}
