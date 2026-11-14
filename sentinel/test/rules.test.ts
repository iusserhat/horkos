/** Unit tests for the Sentinel rules (no chain access). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_RULES, editDistance, evaluate, median, skeleton, type Context, type OrderFacts } from "../src/rules.js";

const T = 1_000_000n;
const order = (o: Partial<OrderFacts> = {}): OrderFacts => ({ id: "7", seller: "horkos-seller-a.testnet", amount: 5n * T, conditionHash: "sha256:x", createdMs: 1_000_000, ...o });
const ctx = (c: Partial<Context> = {}): Context => ({
  knownSellers: ["horkos-seller-a.testnet", "horkos-seller-b.testnet"],
  settledSellers: ["horkos-seller-a.testnet"],
  comparablePrices: [5n * T, 5n * T],
  recentOrderTimes: [],
  maxPerOrder: 10n * T,
  budgetBefore: 20n * T,
  ...c,
});
const rules = (a: ReturnType<typeof evaluate>) => a.map((x) => `${x.severity}:${x.rule}`).sort();

describe("helpers", () => {
  it("edit distance", () => {
    assert.equal(editDistance("kitten", "sitting"), 3);
    assert.equal(editDistance("abc", "abc"), 0);
    assert.equal(editDistance("", "ab"), 2);
  });
  it("skeleton folds look-alike characters", () => {
    assert.equal(skeleton("horkos-se11er-a.testnet"), skeleton("horkos-seller-a.testnet"));
    assert.equal(skeleton("h0rkos-seIler-a.near"), skeleton("horkos-seller-a.testnet"));
    assert.notEqual(skeleton("horkos-seller-b.testnet"), skeleton("horkos-seller-a.testnet"));
  });
  it("median", () => {
    assert.equal(median([]), undefined);
    assert.equal(median([3n, 1n, 2n]), 2n);
    assert.equal(median([1n, 3n]), 2n);
  });
});

describe("evaluate", () => {
  it("a normal order from a known, settled seller raises nothing", () => {
    assert.deepEqual(evaluate(order(), ctx()), []);
  });
  it("blocks a price far above comparable listings", () => {
    const a = evaluate(order({ amount: 9n * T }), ctx());
    assert.deepEqual(rules(a), ["block:price_deviation", "warn:near_limit"]);
    assert.match(a[0].message, /\+80% vs 5 tUSDC \(the median of 2 comparable listing\(s\)\)/);
  });
  it("uses the configured reference price before comparables", () => {
    const a = evaluate(order({ amount: 5n * T }), ctx({ referencePrice: 2n * T }));
    assert.ok(a.some((x) => x.rule === "price_deviation" && /configured reference/.test(x.message)));
  });
  it("no price alert without any reference", () => {
    assert.deepEqual(evaluate(order({ amount: 9n * T }), ctx({ comparablePrices: [] })).filter((x) => x.rule === "price_deviation"), []);
  });
  it("blocks a lookalike seller that is not on the allow-list", () => {
    const a = evaluate(order({ seller: "horkos-se11er-a.testnet" }), ctx());
    assert.ok(a.some((x) => x.rule === "lookalike_seller" && x.severity === "block" && /looks like horkos-seller-a\.testnet/.test(x.message)));
  });
  it("blocks when the allow-list itself holds a lookalike twin", () => {
    const a = evaluate(order({ seller: "horkos-se11er-a.testnet" }), ctx({ knownSellers: ["horkos-seller-a.testnet", "horkos-se11er-a.testnet"] }));
    assert.ok(a.some((x) => x.rule === "lookalike_seller" && /check the allow-list/.test(x.message)));
  });
  it("different sellers far apart are not lookalikes", () => {
    const a = evaluate(order({ seller: "weather-data.testnet" }), ctx());
    assert.ok(!a.some((x) => x.rule === "lookalike_seller"));
  });
  it("warns on the first order with a seller", () => {
    assert.deepEqual(rules(evaluate(order({ seller: "horkos-seller-b.testnet" }), ctx())), ["warn:new_seller"]);
  });
  it("blocks a burst of orders", () => {
    const now = 10 * 60_000;
    const a = evaluate(order({ createdMs: now }), ctx({ recentOrderTimes: [now - 1000, now - 2000, now - 3000] }));
    assert.ok(a.some((x) => x.rule === "burst" && x.severity === "block"));
    const b = evaluate(order({ createdMs: now }), ctx({ recentOrderTimes: [now - 1000, now - DEFAULT_RULES.burstWindowMs - 1] }));
    assert.ok(!b.some((x) => x.rule === "burst"));
  });
  it("warns near the mandate limits", () => {
    assert.ok(evaluate(order({ amount: 5n * T }), ctx({ budgetBefore: 6n * T })).some((x) => x.rule === "near_limit"));
    assert.ok(evaluate(order({ amount: 8n * T }), ctx({ comparablePrices: [8n * T] })).some((x) => x.rule === "near_limit"));
  });
  it("thresholds are configurable", () => {
    const a = evaluate(order({ amount: 6n * T }), ctx(), { ...DEFAULT_RULES, priceDeviationPct: 10 });
    assert.ok(a.some((x) => x.rule === "price_deviation"));
  });
});
