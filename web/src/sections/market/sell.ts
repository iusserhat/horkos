import { codeBlock, h, mount } from "../../lib/dom";
import { CONTRACT } from "../../lib/config";

const EXAMPLE_SCHEMA = `{
  "type": "object",
  "required": ["symbol", "rows"],
  "properties": {
    "symbol": { "const": "NEAR/USD" },
    "rows": {
      "type": "array",
      "minItems": 4,
      "items": {
        "type": "object",
        "required": ["t", "price"],
        "properties": { "t": { "type": "integer" }, "price": { "type": "number" } }
      }
    }
  }
}`;

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Same bytes the SDK hashes: JSON.stringify of the parsed condition. */
async function conditionHash(schema: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(schema));
  return `sha256:${toHex(await crypto.subtle.digest("SHA-256", bytes))}`;
}

function script(seller: string, priceUnits: string, minutes: number, schema: string) {
  return `// sell.ts: run with \`npx tsx sell.ts\` from a clone of the repo (the SDK is not on npm yet).
import { Account, JsonRpcProvider, FastFsStore, HorkosSeller } from "./sdk/src/index.js";

const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
// Your key comes from your own environment; never paste it into a website.
const account = new Account("${seller}", provider, process.env.HORKOS_SELLER_KEY as \`ed25519:\${string}\`);
const seller = new HorkosSeller({ contractId: "${CONTRACT}", account, store: new FastFsStore(account) });

// 1. Publish the condition and register the listing (one time).
const { listingId, conditionUrl } = await seller.registerListing({
  price: "${priceUnits}", // tUSDC has 6 decimals
  deliveryWindowMs: ${minutes} * 60_000,
  condition: ${schema.replace(/\n/g, "\n  ")},
});
console.log("listed as #" + listingId);

// 2. Deliver every order. Payment reaches you after the verifier's check.
seller.onOrder(async (order) => {
  const data = await loadMyData(); // your dataset, database export or API result, as JSON
  const after = await seller.submitDelivery({ orderId: order.id, data, conditionUrl });
  console.log(\`order \${order.id}: \${after.status}\`);
});

async function loadMyData(): Promise<unknown> {
  throw new Error("return the JSON you sell here");
}`;
}

export function sellGuide() {
  const sellerIn = h("input", { id: "s-seller", type: "text", value: "your-name.testnet", autocomplete: "off", spellcheck: "false" });
  const priceIn = h("input", { id: "s-price", type: "number", value: "5", min: "0.000001", step: "0.01" });
  const winIn = h("input", { id: "s-win", type: "number", value: "10", min: "1", max: "1440", step: "1" });
  const schemaIn = h("textarea", { id: "s-schema", rows: "14", spellcheck: "false" }, EXAMPLE_SCHEMA);
  const hashOut = h("p", { class: "s-hash mono", "aria-live": "polite" });
  const out = h("div", {});

  const render = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(schemaIn.value);
    } catch {
      hashOut.textContent = "The condition is not valid JSON yet.";
      hashOut.classList.add("bad");
      return;
    }
    hashOut.classList.remove("bad");
    const price = Math.max(0, Number(priceIn.value) || 0);
    const units = BigInt(Math.round(price * 1e6)).toString();
    const minutes = Math.min(1440, Math.max(1, Math.round(Number(winIn.value) || 10)));
    const seller = sellerIn.value.trim() || "your-name.testnet";
    hashOut.textContent = `condition_hash ${await conditionHash(parsed)}`;
    mount(out, codeBlock(script(seller, units, minutes, JSON.stringify(parsed, null, 2))));
  };
  for (const el of [sellerIn, priceIn, winIn, schemaIn]) el.addEventListener("input", () => void render());
  void render();

  const field = (label: string, input: HTMLElement, hint?: string) => h("label", { class: "s-field" }, h("span", {}, label), input, hint ? h("small", { class: "muted" }, hint) : null);
  const step = (n: number, title: string, body: string) => h("li", { class: "st-card" }, h("span", { class: "st-num" }, String(n)), h("h3", {}, title), h("p", {}, body));

  return h(
    "section",
    { class: "section band band-butter", id: "sell", "aria-labelledby": "sell-title" },
    h(
      "div",
      { class: "wrap" },
      h("div", { class: "sec-head" }, h("p", { class: "eyebrow eb-white" }, "Sell your data"), h("h2", { id: "sell-title" }, "List a dataset, get paid after the check."), h("p", { class: "lead" }, "A database export, a price history, a scrape, an API result: anything you can hand over as JSON and describe with a JSON Schema.")),
      h(
        "ol",
        { class: "st-flow mk-pay" },
        step(1, "You list", "register_listing stores your price, delivery window and the hash of your condition. Anyone with a NEAR account can call it."),
        h("span", { class: "st-arrow", "aria-hidden": "true" }, "→"),
        step(2, "An agent orders", "create_order moves the price from its owner's mandate into escrow. The agent's key can't send money anywhere else."),
        h("span", { class: "st-arrow", "aria-hidden": "true" }, "→"),
        step(3, "You deliver", "Your seller service encrypts the data and calls submit_delivery. OutLayer opens it in a TEE and checks it against your condition."),
        h("span", { class: "st-arrow", "aria-hidden": "true" }, "→"),
        h("li", { class: "st-card st-last" }, h("span", { class: "st-num" }, "4"), h("h3", {}, "You get paid"), h("p", {}, "When the check passes, on_verified credits your balance in the contract in the same call that releases the buyer's key. withdraw sends the tUSDC to your account.")),
      ),
      h(
        "div",
        { class: "s-grid" },
        h(
          "form",
          { class: "s-form panel", onsubmit: (e: Event) => e.preventDefault() },
          h("h3", {}, "Generate your seller script"),
          h("p", { class: "muted" }, "Nothing here is sent anywhere. The page only builds the script and hashes your condition in the browser."),
          field("Seller account", sellerIn, "The NEAR testnet account that will receive the payments."),
          h("div", { class: "s-row" }, field("Price (tUSDC)", priceIn), field("Deliver within (min)", winIn)),
          field("Condition (JSON Schema the delivery must pass)", schemaIn),
          hashOut,
        ),
        h(
          "div",
          { class: "s-out" },
          out,
          h(
            "div",
            { class: "callout warn s-notes" },
            h("p", {}, h("strong", {}, "Keep the script running. "), "Deliveries are signed by your account and carry OutLayer's fee, so a website can't deliver for you without holding your full key. A deposit-funded delivery key is on the roadmap."),
            h("p", {}, h("strong", {}, "Descriptions live off chain. "), "The contract stores price, seller, condition hash and window. To show a description on this page, add it to ", h("code", {}, "mcp/catalog.testnet.json"), " with a pull request."),
            h("p", {}, h("strong", {}, "Buyers need tUSDC. "), "On testnet only horkos.testnet can mint it. Ask in the repository's issues for test tokens."),
          ),
        ),
      ),
    ),
  );
}
