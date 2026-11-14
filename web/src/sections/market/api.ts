import { codeBlock, h, mount } from "../../lib/dom";
import { CONTRACT } from "../../lib/config";
import { accountError } from "../../lib/accounts";

/** gateway/ is merged and checked on testnet (docs/gateway.md: listing 3, order 12 Settled). */
const GATEWAY_READY = true;

export function apiGuide() {
  const v = {
    seller: "your-name.testnet",
    mode: "create" as "create" | "existing",
    listing: "0",
    price: "5",
    window: "10",
    desc: "NEAR/USD price feed, last 4 points (JSON: symbol + rows[t, price])",
    url: "https://api.example.com/prices?pair=NEAR-USD&order={order_id}",
    method: "GET" as "GET" | "POST",
    header: "Authorization",
    envVar: "MY_API_KEY",
    path: "data",
  };
  const out = h("div", { class: "s-out" });
  const err = h("p", { class: "tk-err", "aria-live": "polite" });

  const render = () => {
    const e = accountError(v.seller);
    err.textContent = e ? `Seller account: ${e}` : "";
    const listing: Record<string, unknown> =
      v.mode === "existing"
        ? { listing_id: v.listing, condition_file: "schema.json" }
        : { create: { price_tusdc: Number(v.price) || 0, deliver_within_min: Number(v.window) || 10, condition_file: "schema.json", description: v.desc } };
    const source: Record<string, unknown> = { url: v.url, method: v.method };
    if (v.header.trim()) source.headers = { [v.header.trim()]: `env:${v.envVar.trim() || "MY_API_KEY"}` };
    if (v.method === "POST") source.body = { order_id: "{order_id}", buyer: "{buyer}" };
    if (v.path.trim()) source.json_path = v.path.trim();
    const cfg = { network: "testnet", contract: CONTRACT, seller: v.seller, listings: [{ ...listing, source }] };
    const env = v.header.trim() ? `export ${v.envVar.trim() || "MY_API_KEY"}=...        # your API's secret, stays on your server\n` : "";
    mount(
      out,
      h("p", { class: "s-label" }, "horkos-gateway.json"),
      codeBlock(JSON.stringify(cfg, null, 2)),
      h("p", { class: "s-label" }, "Run it on your server"),
      codeBlock(
        `git clone https://github.com/iusserhat/horkos && cd horkos\n(cd sdk && npm ci) && cd gateway && npm ci\n` +
          `export HORKOS_SELLER_KEY=ed25519:...   # the seller account's key; or keep it in ~/.near-credentials\n` +
          env +
          `npm run gateway -- check --config horkos-gateway.json     # calls your API once and checks it against the schema\n` +
          (v.mode === "create" ? `npm run gateway -- register --config horkos-gateway.json  # opens the listing and saves its id\n` : "") +
          `npm run gateway -- run --config horkos-gateway.json       # delivers every new order`,
      ),
    );
  };

  const input = (key: keyof typeof v, label: string, attrs: Record<string, string> = {}) => {
    const el = h("input", { type: "text", value: String(v[key]), spellcheck: "false", autocomplete: "off", ...attrs });
    el.addEventListener("input", () => {
      (v as Record<string, string>)[key] = el.value;
      render();
    });
    return h("label", { class: "s-field" }, h("span", {}, label), el);
  };
  const select = (key: "mode" | "method", label: string, opts: [string, string][], onChange?: () => void) => {
    const el = h("select", {}, ...opts.map(([val, txt]) => h("option", { value: val, selected: v[key] === val ? true : null }, txt)));
    el.addEventListener("change", () => {
      (v as Record<string, string>)[key] = el.value;
      onChange?.();
      render();
    });
    return h("label", { class: "s-field" }, h("span", {}, label), el);
  };

  const createBox = h("div", { class: "s-sub" }, h("div", { class: "s-row" }, input("price", "Price (tUSDC)", { inputmode: "decimal" }), input("window", "Deliver within (min)", { inputmode: "numeric" })), input("desc", "Description buyers see"));
  const existingBox = h("div", { class: "s-sub", hidden: true }, input("listing", "Listing id", { inputmode: "numeric" }));
  const swap = () => {
    createBox.hidden = v.mode !== "create";
    existingBox.hidden = v.mode !== "existing";
  };

  render();
  return h(
    "section",
    { class: "section band band-mint", id: "api", "aria-labelledby": "api-title" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "sec-head" },
        h("p", { class: "eyebrow eb-white" }, "Sell from your own API"),
        h("h2", { id: "api-title" }, "Plug your API into Horkos. No upload, no new code."),
        h("p", { class: "lead" }, "Horkos Gateway runs next to your service. For each order it calls your API, checks the answer against your listing's schema, and only then delivers it through the escrow. You get paid when the verifier agrees."),
        GATEWAY_READY ? null : h("p", { class: "callout warn" }, "Horkos Gateway is being merged today. The config format below is final; the commands work once docs/gateway.md is in the repository."),
      ),
      h(
        "ol",
        { class: "api-flow" },
        h("li", {}, h("strong", {}, "Order comes in. "), "An agent orders your listing; the price waits in escrow."),
        h("li", {}, h("strong", {}, "Gateway calls your API. "), "With ", h("code", {}, "{order_id}"), ", ", h("code", {}, "{buyer}"), " and ", h("code", {}, "{listing_id}"), " filled in, and your API key from an environment variable."),
        h("li", {}, h("strong", {}, "Checked before it's sent. "), "If the answer doesn't match your schema, nothing is delivered and no verifier fee is spent."),
        h("li", {}, h("strong", {}, "Delivered and paid. "), "Encrypted, verified in OutLayer's TEE, and your balance is credited when it settles."),
      ),
      h(
        "div",
        { class: "s-grid" },
        h(
          "form",
          { class: "s-form panel", onsubmit: (e: Event) => e.preventDefault() },
          h("h3", {}, "Generate your gateway config"),
          h("p", { class: "muted" }, "Built in your browser; nothing is sent. Secrets never go in the file: it names environment variables instead."),
          input("seller", "Seller account (receives the payments)"),
          err,
          select("mode", "Listing", [["create", "Open a new listing"], ["existing", "Use a listing I already have"]], swap),
          createBox,
          existingBox,
          input("url", "Your API URL"),
          h("div", { class: "s-row" }, select("method", "Method", [["GET", "GET"], ["POST", "POST"]]), input("path", "Field with the data (optional)")),
          h("div", { class: "s-row" }, input("header", "Auth header (optional)"), input("envVar", "Environment variable with the secret")),
          h("p", { class: "muted" }, "Your schema goes in schema.json next to the config; the ", h("a", { href: "#sell" }, "seller script generator"), " above hashes it the same way."),
        ),
        out,
      ),
    ),
  );
}
