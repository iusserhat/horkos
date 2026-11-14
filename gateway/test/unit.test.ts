/** Unit tests: config, placeholders, the source call against a fake HTTP server, the local schema check. */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { parseConfig, type ListingConfig } from "../src/config.js";
import { Gateway, produce, type Condition } from "../src/gateway.js";
import { fetchSource, fill, selectPath, SourceError } from "../src/source.js";
import { compileCondition } from "../src/validate.js";

const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["usd", "last_updated_at"],
  properties: { usd: { type: "number", exclusiveMinimum: 0 }, last_updated_at: { type: "integer" } },
};
const cond: Condition = { schema: SCHEMA, hash: "sha256:x", check: compileCondition(SCHEMA) };

let server: Server;
let base = "";
const seen: { url: string; method: string; headers: IncomingMessage["headers"]; body: string }[] = [];

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ url: req.url!, method: req.method!, headers: req.headers, body });
      const path = new URL(req.url!, "http://x").pathname;
      if (path === "/good") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ near: { usd: 2.51, last_updated_at: 1763100000 } }));
      if (path === "/bad") return void res.writeHead(200).end(JSON.stringify({ near: { usd: "2.51" } }));
      if (path === "/auth") {
        if (req.headers.authorization !== "Bearer s3cret") return void res.writeHead(401).end();
        return void res.writeHead(200).end(JSON.stringify({ data: { usd: 1, last_updated_at: 2 } }));
      }
      if (path === "/echo") return void res.writeHead(200).end(body);
      if (path === "/big") return void res.writeHead(200).end(JSON.stringify({ pad: "x".repeat(2 << 20) }));
      if (path === "/html") return void res.writeHead(200).end("<html></html>");
      if (path === "/busy") return void res.writeHead(503).end();
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));

const vars = { order_id: "7", buyer: "alice.testnet", listing_id: "3" };
const listing = (source: ListingConfig["source"]): ListingConfig => ({ listing_id: "3", condition_file: "x.json", source });

describe("config", () => {
  const ok = {
    network: "testnet",
    contract: "escrow.horkos.testnet",
    seller: "s.testnet",
    listings: [{ listing_id: "1", condition_file: "s.json", source: { url: "https://api.example.com/d?o={order_id}", headers: { Authorization: "env:K" } } }],
  };
  it("accepts a valid config", () => assert.equal(parseConfig(ok).seller, "s.testnet"));
  it("lists every problem at once", () => {
    const bad = { network: "mainnet", contract: "Bad Id", seller: "s.testnet", listings: [{ source: { url: "ftp://x", method: "PUT" } }] };
    const msg = (() => {
      try {
        parseConfig(bad);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    })();
    for (const part of ["network", "contract", "needs listing_id or create", "needs condition_file", "source.url", "source.method"]) assert.match(msg, new RegExp(part));
  });
  it("refuses a secret written into the URL", () => {
    const c = structuredClone(ok);
    c.listings[0].source.url = "https://api.example.com/d?api_key=abc123";
    assert.throws(() => parseConfig(c), /holds a secret/);
    c.listings[0].source.url = "https://api.example.com/d?api_key={env:KEY}";
    assert.doesNotThrow(() => parseConfig(c));
  });
  it("rejects a body on GET", () => {
    const c = structuredClone(ok) as typeof ok & { listings: { source: Record<string, unknown> }[] };
    c.listings[0].source.body = { a: 1 };
    assert.throws(() => parseConfig(c), /only with method POST/);
  });
});

describe("placeholders and json_path", () => {
  it("fills order values, URL-encoding them in URLs", () => {
    assert.equal(fill("/x?b={buyer}&o={order_id}", { ...vars, buyer: "a b&c" }, {}, true), "/x?b=a%20b%26c&o=7");
    assert.equal(fill("id {listing_id}", vars, {}), "id 3");
  });
  it("reads env: values and fails clearly when unset", () => {
    assert.equal(fill("env:TOKEN", vars, { TOKEN: "t" }), "t");
    assert.equal(fill("Bearer {env:TOKEN}", vars, { TOKEN: "t" }), "Bearer t");
    assert.throws(() => fill("env:MISSING", vars, {}), /MISSING is not set/);
  });
  it("selects paths", () => {
    const v = { a: { b: [{ c: 1 }, { c: 2 }] } };
    assert.equal(selectPath(v, "a.b[1].c"), 2);
    assert.equal(selectPath(v, "$.a.b.0.c"), 1);
    assert.deepEqual(selectPath(v, ""), v);
    assert.throws(() => selectPath(v, "a.x"), /not found/);
  });
});

describe("fetchSource (fake HTTP server)", () => {
  it("GETs with order values and returns the selected part", async () => {
    const data = await fetchSource({ url: `${base}/good?order={order_id}&buyer={buyer}`, json_path: "near" }, vars);
    assert.deepEqual(data, { usd: 2.51, last_updated_at: 1763100000 });
    assert.equal(seen.at(-1)!.url, "/good?order=7&buyer=alice.testnet");
  });
  it("sends headers from the environment", async () => {
    const src = { url: `${base}/auth`, headers: { Authorization: "Bearer {env:API_KEY}" }, json_path: "data" };
    assert.deepEqual(await fetchSource(src, vars, { env: { API_KEY: "s3cret" } }), { usd: 1, last_updated_at: 2 });
    await assert.rejects(fetchSource(src, vars, { env: { API_KEY: "wrong" } }), /HTTP 401/);
  });
  it("POSTs a JSON body with placeholders", async () => {
    const out = await fetchSource({ url: `${base}/echo`, method: "POST", body: { order: "{order_id}", key: "env:K", n: 5 } }, vars, { env: { K: "v" } });
    assert.deepEqual(out, { order: "7", key: "v", n: 5 });
    assert.equal(seen.at(-1)!.headers["content-type"], "application/json");
  });
  it("stops reading past 1 MB", async () => {
    await assert.rejects(fetchSource({ url: `${base}/big` }, vars), /limit/);
  });
  it("rejects non-JSON, and marks 5xx as transient", async () => {
    await assert.rejects(fetchSource({ url: `${base}/html` }, vars), /did not return JSON/);
    await assert.rejects(fetchSource({ url: `${base}/busy` }, vars), (e: SourceError) => e.transient && /503/.test(e.message));
  });
  it("never puts secret values in error messages", async () => {
    const err = await fetchSource({ url: `${base}/nope?k={env:K}` }, vars, { env: { K: "hunter2" } }).catch((e) => e as Error);
    assert.ok(err instanceof Error && !err.message.includes("hunter2"));
  });
});

describe("local schema check", () => {
  it("passes good data and explains bad data", async () => {
    assert.deepEqual(await produce(listing({ url: `${base}/good`, json_path: "near" }), cond, vars), { ok: true, data: { usd: 2.51, last_updated_at: 1763100000 } });
    const bad = await produce(listing({ url: `${base}/bad`, json_path: "near" }), cond, vars);
    assert.ok("kind" in bad && bad.kind === "rejected");
    assert.match(bad.errors.join(" "), /usd|last_updated_at/);
  });
  it("supports draft-07 schemas too", () => {
    const c = compileCondition({ $schema: "http://json-schema.org/draft-07/schema#", type: "array", minItems: 2 });
    assert.equal(c([1, 2]).ok, true);
    assert.equal(c([1]).ok, false);
  });
});

describe("Gateway.handle", () => {
  const order = (id: string, minutes = 10) => ({
    id, buyer: "alice.testnet", agent: "a.testnet", seller: "s.testnet", amount: "5000000", listing_id: "3",
    created_at: "0", deadline: String(BigInt(Date.now() + minutes * 60_000) * 1_000_000n), buyer_pubkey: "",
    delivery_ref: null, encrypted_key: null, status: "Open" as const, verifier_version: 1, attempts: 0,
  });
  function gateway(url: string) {
    const submitted: string[] = [];
    const seller = { submitDelivery: async (a: { orderId: string }) => (submitted.push(a.orderId), { status: "Settled" }) };
    const gw = new Gateway({ loaded: {} as never, seller: seller as never, store: {} as never, log: () => {}, retryDelayMs: 10 });
    (gw as unknown as { active: Map<string, unknown> }).active.set("3", { listing: listing({ url, json_path: "near" }), cond, conditionUrl: "u" });
    return { gw, submitted };
  }
  it("submits when the data passes", async () => {
    const { gw, submitted } = gateway(`${base}/good`);
    assert.deepEqual(await gw.handle(order("1")), { kind: "delivered", status: "Settled" });
    assert.deepEqual(submitted, ["1"]);
  });
  it("submits nothing when the data fails, the source fails, or the order expired", async () => {
    const bad = gateway(`${base}/bad`);
    assert.equal((await bad.gw.handle(order("2")))?.kind, "rejected");
    const busy = gateway(`${base}/busy`);
    const before = seen.length;
    assert.equal((await busy.gw.handle(order("3")))?.kind, "source-error");
    assert.equal(seen.length - before, 2, "one retry for a transient error");
    const late = gateway(`${base}/good`);
    assert.equal(await late.gw.handle(order("4", -1)), undefined);
    assert.deepEqual([...bad.submitted, ...busy.submitted, ...late.submitted], []);
  });
});
