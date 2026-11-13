/**
 * NEAR Wallet Selector on testnet (Meteor, MyNearWallet).
 *
 * Every transaction is signed in the user's wallet. This module never reads,
 * creates or stores a private key: sign-in does not request a function-call
 * key for the contract, so the selector has no local key to sign with.
 */
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { Buffer } from "buffer";

export const NETWORK = "testnet";
export const CONTRACT_ID = "escrow.horkos.testnet";
const DEFAULT_GAS = 30_000_000_000_000n; // 30 Tgas

let ready: Promise<{ selector: WalletSelector; modal: WalletSelectorModal; functionCall: typeof import("@near-wallet-selector/core").actionCreators.functionCall }> | null = null;

/** Loads the selector on first use (keeps it out of the page bundle). Its dependencies expect Node's `Buffer`, `global` and `process`. */
function init() {
  ready ??= (async () => {
    const g = globalThis as { Buffer?: typeof Buffer; global?: typeof globalThis; process?: unknown };
    g.Buffer ??= Buffer;
    g.global ??= globalThis;
    g.process ??= { env: {}, versions: {}, nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)) };
    const [{ actionCreators, setupWalletSelector }, { setupModal }, { setupMeteorWallet }, { setupMyNearWallet }] = await Promise.all([
      import("@near-wallet-selector/core"),
      import("@near-wallet-selector/modal-ui"),
      import("@near-wallet-selector/meteor-wallet"),
      import("@near-wallet-selector/my-near-wallet"),
      import("@near-wallet-selector/modal-ui/styles.css"),
    ]);
    const selector = await setupWalletSelector({
      network: NETWORK,
      modules: [setupMeteorWallet(), setupMyNearWallet()],
    });
    // No contractId: no function-call key is created, so every call goes to the wallet.
    const modal = setupModal(selector, { theme: "auto", description: "Sign in with a NEAR testnet wallet." });
    return { selector, modal, functionCall: actionCreators.functionCall };
  })();
  return ready;
}

/** The signed-in account, or null. */
export async function accountId(): Promise<string | null> {
  const { selector } = await init();
  return selector.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
}

/** Opens the wallet modal; resolves with the account once signed in, or null if the modal is closed. */
export async function connect(): Promise<string | null> {
  const { selector, modal } = await init();
  const current = await accountId();
  if (current) return current;
  return new Promise((resolve) => {
    const done = (id: string | null) => {
      sub.unsubscribe();
      hide.remove();
      resolve(id);
    };
    const sub = selector.store.observable.subscribe((s) => {
      const id = s.accounts.find((a) => a.active)?.accountId;
      if (id) done(id);
    });
    const hide = modal.on("onHide", ({ hideReason }) => {
      if (hideReason === "user-triggered") done(null);
    });
    modal.show();
  });
}

export async function disconnect(): Promise<void> {
  const { selector } = await init();
  if (!selector.isSignedIn()) return;
  await (await selector.wallet()).signOut();
}

/**
 * Signs and sends one function call in the user's wallet.
 * `deposit` is in yoctoNEAR, `gas` in gas units (default 30 Tgas).
 * Browser-redirect wallets (MyNearWallet) leave the page and may return nothing.
 */
export async function signAndSend(receiverId: string, methodName: string, args: object, deposit: bigint | string = 0n, gas: bigint | string = DEFAULT_GAS) {
  const { selector, functionCall } = await init();
  const signerId = await accountId();
  if (!signerId) throw new Error("No wallet connected");
  const wallet = await selector.wallet();
  return wallet.signAndSendTransaction({
    signerId,
    receiverId,
    actions: [functionCall(methodName, args, BigInt(gas), BigInt(deposit))],
  });
}
