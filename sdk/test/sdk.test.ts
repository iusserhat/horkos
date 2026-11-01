/**
 * SDK tests against a local sandbox with real contracts and mock-outlayer.
 * Prereqs: contracts/scripts/build.sh (wasm) and the sandbox binary
 * (downloaded by contracts/scripts/test-sandbox.sh).
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Account, KeyPair } from "near-api-js";
import {
  generateBoxKeyPair,
  HorkosAgent,
  HorkosOwner,
  HorkosSeller,
  TGAS,
  type BoxKeyPair,
} from "../src/index.js";
import { LocalHttpStore, startSandbox, wasm, type Sandbox } from "./sandbox.js";

const USDC = 1_000_000n;
const NEAR = 10n ** 24n;
const SCHEMA = { type: "object", required: ["rows"], properties: { rows: { type: "array" } } };
const DATA = { rows: [{ t: 1, p: 2.5 }, { t: 2, p: 2.6 }] };

let sb: Sandbox;
let store: LocalHttpStore;
let contractId: string;
let outlayer: Account;
let agent: HorkosAgent;
let seller: HorkosSeller;
let ownerAcc: Account;
let sellerAcc: Account;
let tokenId: string;
let listingId: string;
let conditionUrl: string;
/** Test-only: the "verifier" key is the buyer key, so mock Passthrough output opens. */
let verifierKeys: BoxKeyPair;

async function deploy(sbx: Sandbox, name: string, file: string, init: string, args: object): Promise<Account> {
  const acc = await sbx.account(name, 10);
  await acc.deployContract(wasm(file));
  await acc.callFunction({ contractId: acc.accountId, methodName: init, args, gas: 100n * TGAS });
  return acc;
}

async function setMode(mode: string) {
  await outlayer.callFunction({ contractId: outlayer.accountId, methodName: "set_mode", args: { mode } });
}

async function ftBalance(id: string): Promise<bigint> {
  const v = await sb.provider.callFunction({ contractId: tokenId, method: "ft_balance_of", args: { account_id: id } });
  return BigInt(v as string);
}

before(async () => {
  sb = await startSandbox();
  store = new LocalHttpStore();
  await store.start();
  verifierKeys = await generateBoxKeyPair();

  ownerAcc = await sb.account("owner", 20);
  sellerAcc = await sb.account("seller", 20);
  const adminAcc = await sb.account("admin", 20);
  const agentFull = await sb.account("agent", 5);

  const token = await deploy(sb, "token", "test_token", "new", { owner_id: ownerAcc.accountId, total_supply: String(1_000n * USDC) });
  tokenId = token.accountId;
  const horkos = await deploy(sb, "horkos", "horkos", "new", { token: tokenId, admin: adminAcc.accountId });
  contractId = horkos.accountId;
  outlayer = await deploy(sb, "outlayer", "mock_outlayer", "new", {});
  await setMode("Passthrough");

  for (const id of [contractId, sellerAcc.accountId]) {
    await ownerAcc.callFunction({ contractId: tokenId, methodName: "storage_deposit", args: { account_id: id }, deposit: NEAR / 100n });
  }
  await adminAcc.callFunction({
    contractId,
    methodName: "set_verifier",
    args: {
      config: {
        outlayer: outlayer.accountId,
        wasm_url: "https://example.test/verifier.wasm",
        wasm_hash: "ab".repeat(32),
        build_target: "wasm32-wasip1",
        encryption_pubkey: verifierKeys.publicKey,
        secrets_profile: null,
        secrets_account: null,
        min_fee: String(NEAR / 100n),
        max_fee: String(NEAR),
      },
    },
    deposit: NEAR / 10n,
  });

  // The agent signs with a function-call key limited to create_order/cancel_order.
  const fc = KeyPair.fromRandom("ed25519");
  await agentFull.addFunctionCallAccessKey({
    publicKey: fc.getPublicKey().toString(),
    contractId,
    methodNames: ["create_order", "cancel_order"],
    allowance: NEAR,
  });
  const agentAcc = new Account(agentFull.accountId, sb.provider, fc.toString() as `ed25519:${string}`);

  const owner = new HorkosOwner({ contractId, account: ownerAcc });
  await owner.setMandate({
    agent: agentAcc.accountId,
    maxTotal: 100n * USDC,
    maxPerOrder: 10n * USDC,
    allowedSellers: [sellerAcc.accountId],
    expiresAtMs: Date.now() + 24 * 3_600_000,
    storageDeposit: NEAR,
  });
  await owner.deposit(100n * USDC);

  agent = new HorkosAgent({ contractId, account: agentAcc, owner: ownerAcc.accountId });
  seller = new HorkosSeller({ contractId, account: sellerAcc, store });
  ({ listingId, conditionUrl } = await seller.registerListing({ price: 5n * USDC, condition: SCHEMA, deliveryWindowMs: 3_600_000 }));
});

after(async () => {
  await store?.stop();
  await sb?.stop();
});

describe("HorkosAgent + HorkosSeller", () => {
  it("buys, delivers, settles, opens the data, and the seller withdraws", async () => {
    const { order, buyerKeys } = await agent.buy({ listingId, maxPrice: 5n * USDC, buyerKeys: verifierKeys });
    assert.equal(order.status, "Open");

    const seen = await new Promise<string>((resolve) => {
      const stop = seller.onOrder(async (o) => {
        stop();
        resolve(o.id);
      }, { intervalMs: 500 });
    });
    assert.equal(seen, order.id);

    const after = await seller.submitDelivery({ orderId: order.id, data: DATA, conditionUrl });
    assert.equal(after.status, "Settled");
    const settled = await agent.waitForSettlement(order.id, { timeoutMs: 10_000 });
    assert.equal(settled.status, "Settled");
    assert.deepEqual(await agent.openDeliveryJson(settled, buyerKeys), DATA);

    assert.equal(await seller.earnings(), String(5n * USDC));
    const before = await ftBalance(sellerAcc.accountId);
    await seller.withdraw();
    assert.equal((await ftBalance(sellerAcc.accountId)) - before, 5n * USDC);
  });

  it("refuses to open a delivery whose hosted ciphertext was swapped after verification", async () => {
    const { order, buyerKeys } = await agent.buy({ listingId, buyerKeys: verifierKeys });
    const settled = await seller.submitDelivery({ orderId: order.id, data: DATA, conditionUrl });
    const manifest = JSON.parse(new TextDecoder().decode(store.blobs.get(settled.delivery_ref!.split("/").pop()!)!.bytes));
    store.tamper(manifest.data_url, new Uint8Array(64));
    await assert.rejects(agent.openDelivery(settled, buyerKeys), /hash mismatch/);
  });

  it("an invalid delivery goes back to Delivered and cannot be opened", async () => {
    await setMode("Invalid");
    try {
      const { order, buyerKeys } = await agent.buy({ listingId, buyerKeys: verifierKeys });
      const after = await seller.submitDelivery({ orderId: order.id, data: { wrong: true }, conditionUrl });
      assert.equal(after.status, "Delivered");
      assert.equal(after.encrypted_key, null);
      await assert.rejects(agent.openDelivery(after, buyerKeys), /Delivered; nothing to open/);
    } finally {
      await setMode("Passthrough");
    }
  });

  it("checks maxPrice before sending a transaction", async () => {
    const before = (await agent.getMandate(ownerAcc.accountId))!.open_orders;
    await assert.rejects(agent.buy({ listingId, maxPrice: 4n * USDC }), /above maxPrice/);
    assert.equal((await agent.getMandate(ownerAcc.accountId))!.open_orders, before);
  });

  it("cancels an open order and the budget comes back", async () => {
    const m0 = (await agent.getMandate(ownerAcc.accountId))!;
    const { order } = await agent.buy({ listingId });
    const cancelled = await agent.cancel(order.id);
    assert.equal(cancelled.status, "Cancelled");
    assert.equal((await agent.getMandate(ownerAcc.accountId))!.balance, m0.balance);
  });

  it("the agent's function-call key cannot withdraw the owner's budget", async () => {
    await assert.rejects(
      agent.account.callFunction({
        contractId,
        methodName: "withdraw",
        args: { from: "Budget", amount: null },
        deposit: 1n,
      }),
      // near-api-js refuses this client-side ("Deposit is not allowed with
      // function call"); the protocol rejects it too (see the Rust sandbox
      // test agent_function_call_key_can_order_but_not_move_money).
      (e: Error) => {
        return /MethodNameMismatch|ReceiverMismatch|DepositWithFunctionCall|not allowed|function call access key/i.test(e.message + String((e as { cause?: unknown }).cause ?? ""));
      },
    );
  });
});
