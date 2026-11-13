import { codeBlock, h, mount } from "../../lib/dom";
import { onAccounts } from "../../lib/accounts";
import { CONTRACT, TOKEN } from "../../lib/config";

export function mandate() {
  const body = h("div", { class: "stack" });
  onAccounts(({ owner, agent }) => {
    const expires = (BigInt(Date.now() + 30 * 86_400_000) * 1_000_000n).toString();
    const sign = (who: string) => `sign-as ${who} network-config testnet sign-with-legacy-keychain send`;
    mount(
      body,
      h("h3", {}, "a) Create the agent account"),
      codeBlock(`near account create-account sponsor-by-faucet-service ${agent} autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`),
      h("h3", {}, "b) Give the agent a function-call key"),
      codeBlock(`near account add-key ${agent} grant-function-call-access --allowance '1 NEAR' --contract-account-id ${CONTRACT} --function-names 'create_order, cancel_order' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send`),
      h(
        "p",
        {},
        "Then delete the agent's full-access key (",
        h("code", {}, "near account delete-keys " + agent + " public-keys <full-access-key> network-config testnet sign-with-legacy-keychain send"),
        "). After that the agent account can only call those two methods. This cannot be undone without another key.",
      ),
      h("h3", {}, "c) Set the mandate (owner)"),
      codeBlock(
        `near contract call-function as-transaction ${CONTRACT} set_mandate json-args '${JSON.stringify({ agent, max_total: "50000000", max_per_order: "10000000", allowed_sellers: ["horkos-seller-a.testnet", "horkos-seller-b.testnet"], expires_at: expires, max_open_orders: null })}' prepaid-gas '50 Tgas' attached-deposit '0.5 NEAR' ${sign(owner)}`,
      ),
      h("p", { class: "muted" }, "Amounts are in tUSDC units (6 decimals): 50 tUSDC total, 10 per order. expires_at is in nanoseconds, here 30 days from now. The 0.5 NEAR is the storage deposit; each order uses about 0.0152 NEAR of it."),
      h("h3", {}, "d) Deposit the budget (owner)"),
      codeBlock(
        `near contract call-function as-transaction ${TOKEN} storage_deposit json-args '{"account_id":"${owner}"}' prepaid-gas '30 Tgas' attached-deposit '0.01 NEAR' ${sign(owner)}\n\n` +
          `near contract call-function as-transaction ${TOKEN} ft_transfer_call json-args '{"receiver_id":"${CONTRACT}","amount":"50000000","msg":""}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' ${sign(owner)}`,
      ),
      h(
        "div",
        { class: "callout warn" },
        h("strong", {}, "tUSDC is the project's test token. "),
        `Only horkos.testnet can mint it, so a new owner account starts with none. To try the full flow with your own accounts, ask for test tokens in the repository's issues, or deploy your own copy of contracts/test-token and contracts/horkos and set HORKOS_CONTRACT.`,
      ),
    );
  });
  return h(
    "section",
    { class: "guide-section", id: "mandate", "aria-labelledby": "mandate-title" },
    h("h2", { id: "mandate-title" }, "3. Set up the mandate"),
    h(
      "p",
      {},
      "The commands use the accounts from step 2. ",
      h("strong", {}, "Why the agent's key can call only create_order and cancel_order: "),
      "a NEAR function-call key can only call the listed methods on one contract and cannot attach deposits, so it cannot move tokens, withdraw or add keys. Spending limits are not in the key: the contract checks every create_order against the mandate. A leaked key can only buy within the mandate.",
    ),
    body,
  );
}
