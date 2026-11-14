import { codeBlock, h, mount } from "../../lib/dom";
import { CONTRACT, REPO, TOKEN, accountUrl, txUrl } from "../../lib/config";
import { accountError } from "../../lib/accounts";
import { demoVideo } from "../demo";

/** Faucet contract for test tUSDC (contracts/faucet). Commands below are the ones checked on testnet. */
const FAUCET = "faucet.horkos.testnet";
/** Hosted seller A (demo/sellers/hosted.ts on Render, render.yaml). */
const SELLER_HEALTH = "https://horkos-seller-a.onrender.com/health";

type TrackId = "watch" | "local" | "agent";
interface Step {
  title: string;
  body: () => (Node | string)[];
  expect?: () => (Node | string)[];
}

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: progress lasts for this page view */
    }
  },
};

/* ---------- inputs shared by the "your agent" track ---------- */
const who = { owner: store.get("try-owner") || "your-name.testnet", agent: store.get("try-agent") || "your-name-agent.testnet", dir: store.get("try-dir") || "~/horkos" };
const rerenders = new Set<() => void>();
const sign = (a: string) => `sign-as ${a} network-config testnet sign-with-legacy-keychain send`;
const ex = (href: string, label: string) => h("a", { href, target: "_blank", rel: "noopener" }, label);
const tx = (hash: string, label: string) => ex(txUrl(hash), label);
const p = (...c: (Node | string)[]) => h("p", {}, ...c);
const code = (s: string) => h("code", {}, s);

/* ---------- tracks ---------- */
const WATCH: Step[] = [
  {
    title: "Watch the 2-minute demo",
    body: () => [p("A real agent buying real data on NEAR testnet, start to Settled. Voice-over is synthetic (ElevenLabs)."), demoVideo(true)],
    expect: () => ["The receipt turns ", h("b", {}, "Settled"), " only after the verifier passes the data; the bad delivery is refunded; the poisoned listing is blocked."],
  },
  {
    title: "Open the live explorer",
    body: () => [p("Every order on ", code(CONTRACT), " with its status, read straight from NEAR testnet. Nothing to install."), h("a", { class: "btn btn-gold", href: "./explorer.html", target: "_blank" }, "Open the explorer")],
    expect: () => ["Orders #9 and #11 are ", h("b", {}, "Settled"), ", #10 is ", h("b", {}, "Refunded"), ". Click #9 to see Open → Verifying → Settled with transaction links."],
  },
  {
    title: "Check one settlement on NEAR's own explorer",
    body: () => [p("Order #9: seller A delivered live CoinGecko prices, and the verifier's answer settled the order in the same transaction."), tx("4ctCVTTKZgiwBJJr7LydyURjGdnViVg2vSgjAPMbUuzP", "submit_delivery for order #9 ↗")],
    expect: () => ["In the receipts you find ", code("request_execution"), " to OutLayer, then ", code("on_verified"), " logging ", code("order_status … Settled"), "."],
  },
  {
    title: "See a refund and a blocked purchase",
    body: () => [p("Order #10: the seller's data failed the check, nobody was paid, and anyone could trigger the refund after the deadline."), tx("CUu6ezqjNzt6LmPiJtACfzJkpsdUSQiNZn8BQFGz6ixV", "refund_expired for order #10 ↗"), p("A prompt-injected agent tried to buy from a seller outside its mandate:"), tx("EjkZeP3M8iQMXxEACR9Meq7ZqF7z3rboCVdhd4PhgXqf", "rejected create_order ↗")],
    expect: () => ["The refund moves 5 tUSDC back to the owner's budget. The rejected call fails with ", code("Seller not allowed by mandate"), " and moves nothing."],
  },
  {
    title: "Look at a receipt NFT",
    body: () => [p("Every order is an NEP-171 token whose status mirrors the escrow."), h("a", { class: "btn", href: "./explorer.html#receipts", target: "_blank" }, "Receipts in the explorer"), " ", h("a", { class: "btn", href: "./#receipts" }, "How receipts work")],
    expect: () => ["Receipt #9 says Settled. On the main contract receipts stay with the buyer; on v2 (", code("escrow-v2.horkos.testnet"), ") they can be passed on: ", tx("9DxmwUQEtLBacJTPCEEKjhpyGztESDimHwshLptrSf3J", "receipt #1 transferred ↗"), ", then ", tx("C1BTBTksm2foRkPWLzuKKeNqfJi5Kz2fgH3474uGN8FS", "settled ↗"), " and opened by the new holder."],
  },
];

const LOCAL: Step[] = [
  {
    title: "Check the tools",
    body: () => [p("Linux or macOS (WSL works), git, Node.js 20, Rust 1.95 or newer with the wasm32 target, and cargo-near 0.22. On Ubuntu older than 24.04 the local node runs in Docker. ", code("setup.sh"), " in the repository installs the toolchain on Ubuntu/WSL."), codeBlock("node --version && cargo --version && cargo near --version")],
    expect: () => ["Node v20 or newer, cargo 1.95 or newer, cargo-near 0.22."],
  },
  {
    title: "Clone and build the contracts",
    body: () => [codeBlock(`git clone ${REPO} && cd horkos\ncontracts/scripts/test-sandbox.sh`), p("This builds the contracts, downloads a local NEAR node and runs the integration tests. The first run takes a few minutes.")],
    expect: () => [code("test result: ok. 7 passed")],
  },
  {
    title: "Run all three scenarios on a local chain",
    body: () => [codeBlock("(cd sdk && npm ci)\ncd demo && npm ci && npm run sandbox"), p("The real escrow and token contracts run on the local node; a local worker runs the real verifier code in place of OutLayer. No account, key or token needed.")],
    expect: () => [
      h("ol", {}, h("li", {}, code("order 0: Settled"), ", then the agent decrypts the NEAR/USD JSON."), h("li", {}, code("order 1: Delivered"), " (the data fails the schema), then after 25 s ", code("Refunded"), "."), h("li", {}, "The poisoned listing is rejected: ", code("Seller not allowed by mandate"), ", budget unchanged.")),
    ],
  },
];

const AGENT: Step[] = [
  {
    title: "Install and clone",
    body: () => [p("You need git, Node.js 20 and ", ex("https://github.com/near/near-cli-rs", "near-cli-rs"), ". The MCP server runs from the repository."), codeBlock(`git clone ${REPO} ${who.dir}\ncd ${who.dir}/sdk && npm ci\ncd ${who.dir}/mcp && npm ci`)],
    expect: () => ["Both installs finish without errors."],
  },
  {
    title: "Create two testnet accounts: you and your agent",
    body: () => [
      p("NEAR's faucet service creates and funds them. Keys go to your local keychain (", code("~/.near-credentials"), "); nothing is sent to this site."),
      codeBlock(`near account create-account sponsor-by-faucet-service ${who.owner} autogenerate-new-keypair save-to-legacy-keychain network-config testnet create\n\nnear account create-account sponsor-by-faucet-service ${who.agent} autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`),
    ],
    expect: () => [
      "Two accounts with some testnet NEAR: ", ex(accountUrl(who.owner), who.owner), " and ", ex(accountUrl(who.agent), who.agent), ".",
      h("p", { class: "callout" }, "If it answers ", code("429 Too Many Requests"), ": that is NEAR's account-creation service limiting your connection (it is not run by Horkos). Wait a few minutes, or create the agent account from your own: ", code(`near account create-account fund-myself ${who.agent} '1 NEAR' autogenerate-new-keypair save-to-legacy-keychain ${sign(who.owner)}`), "."),
    ],
  },
  {
    title: "Get 20 test tUSDC from the Horkos faucet",
    body: () => [
      p("tUSDC is the project's test token. The faucet gives each account 20 tUSDC once a day and registers its storage on the token. The limit is per account only, so other people claiming at the same time do not affect you."),
      codeBlock(`near contract call-function as-transaction ${FAUCET} claim json-args '{}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' ${sign(who.owner)}\n\nnear contract call-function as-read-only ${TOKEN} ft_balance_of json-args '{"account_id":"${who.owner}"}' network-config testnet now`),
    ],
    expect: () => [code('"20000000"'), " (tUSDC has 6 decimals, so that is 20 tUSDC)."],
  },
  {
    title: "Limit what the agent's key can do",
    body: () => [
      p("A function-call key can call only the listed methods on one contract and can't attach money. So the agent can open or cancel orders and nothing else."),
      codeBlock(`near account add-key ${who.agent} grant-function-call-access --allowance '1 NEAR' --contract-account-id ${CONTRACT} --function-names 'create_order, cancel_order' autogenerate-new-keypair save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send\n\nnear account list-keys ${who.agent} network-config testnet now`),
      p("Optional, as in the demo: delete the agent's full-access key with ", code(`near account delete-keys ${who.agent} public-keys <full-access-key> network-config testnet sign-with-legacy-keychain send`), ". That can't be undone without another key."),
    ],
    expect: () => ["The key list shows a FunctionCall key for ", code(CONTRACT), " with create_order and cancel_order."],
  },
  {
    title: "Set the mandate and deposit the budget",
    body: () => {
      const expires = (BigInt(Date.now() + 7 * 86_400_000) * 1_000_000n).toString();
      const args = JSON.stringify({ agent: who.agent, max_total: "20000000", max_per_order: "10000000", allowed_sellers: ["horkos-seller-a.testnet"], expires_at: expires, max_open_orders: null });
      return [
        p("20 tUSDC in total, at most 10 per order, only seller A, valid for 7 days. The 0.5 NEAR is a storage deposit; each order uses about 0.015 NEAR of it."),
        codeBlock(`near contract call-function as-transaction ${CONTRACT} set_mandate json-args '${args}' prepaid-gas '50 Tgas' attached-deposit '0.5 NEAR' ${sign(who.owner)}\n\nnear contract call-function as-transaction ${TOKEN} ft_transfer_call json-args '{"receiver_id":"${CONTRACT}","amount":"20000000","msg":""}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' ${sign(who.owner)}`),
      ];
    },
    expect: () => ["In the explorer's Mandates tab, search ", code(who.owner), ": balance 20 tUSDC, spent 0, allowed seller horkos-seller-a."],
  },
  {
    title: "Connect your agent (Claude Code shown)",
    body: () => [
      codeBlock(`claude mcp add horkos -e HORKOS_AGENT=${who.agent} -e HORKOS_OWNER=${who.owner} -- "${who.dir}/mcp/node_modules/.bin/tsx" "${who.dir}/mcp/server.ts"\nclaude mcp list`),
      p("Claude Desktop, Cursor, Windows paths: the ", h("a", { href: "./connect.html#config" }, "config generator"), " writes the exact entry."),
    ],
    expect: () => [code("horkos: … ✔ Connected"), " in the list, and five tools starting with ", code("horkos_"), "."],
  },
  {
    title: "Ask your agent to buy",
    body: () => [
      h("p", { class: "callout" }, "Seller A is hosted on Render's free tier and checked every 5 minutes by an uptime monitor; it is online during judging, 16 to 18 Nov. Live status: ", ex(SELLER_HEALTH, "seller A /health"), ". Live verification depends on OutLayer testnet. When it times out, the order refunds in full (the seller first retries for up to 30 minutes; after the window anyone can call ", code("refund_expired"), "). Settled examples: orders ", tx("4ctCVTTKZgiwBJJr7LydyURjGdnViVg2vSgjAPMbUuzP", "9"), ", ", tx("RxQ68oH3LVJL7LCoPwYyLPbKb5sbHrRUbsDSzh7HANj", "15"), ", ", tx("ChRyUnRFx5fe4zCzKetg46tZv35bQYA38imbnga9gwuX", "18"), ", ", tx("22SUFSDMVzJ2N2Joq37m9dNSKvTzM3YyPTQrfMXwC3hs", "26"), ". Fallback: the team runs seller A locally with ", code("npm run seller -- a"), "."),
      p("Start Claude Code in any folder and paste:"), codeBlock("Buy Horkos listing 4 (the NEAR/USD price feed with a 30-minute delivery window) for at most 10 tUSDC. Check the order every 30 seconds until it is Settled, then open the delivery and show me the data.")],
    expect: () => [
      h("ol", {}, h("li", {}, "It calls ", code("horkos_search_listings"), " and ", code("horkos_create_order"), "."), h("li", {}, "It polls ", code("horkos_get_order"), " until ", h("b", {}, "Settled"), " (within about a minute when OutLayer testnet is healthy; up to 30 minutes if the verification is retried, then a full refund if it never passes)."), h("li", {}, "It opens the data: four NEAR/USD prices (from CoinGecko, or Coinbase when CoinGecko rate-limits the hosted seller).")),
      p("If the order is not Settled when its 30-minute window ends (seller offline, or OutLayer gave no valid result: the order shows ", h("b", {}, "Delivered"), "), nobody is paid. Anyone can then call ", code("refund_expired"), " (nothing calls it automatically) and the 5 tUSDC goes back to your mandate budget:"),
      codeBlock(`near contract call-function as-transaction ${CONTRACT} refund_expired json-args '{"order_id":"<id>"}' prepaid-gas '50 Tgas' attached-deposit '0 NEAR' ${sign(who.owner)}`),
    ],
  },
  {
    title: "Optional: pass a receipt on (v2)",
    body: () => {
      const V2 = "escrow-v2.horkos.testnet";
      const friend = "your-friend.testnet";
      const expires = (BigInt(Date.now() + 7 * 86_400_000) * 1_000_000n).toString();
      const mandate = JSON.stringify({ agent: who.agent, max_total: "5000000", max_per_order: "5000000", allowed_sellers: ["horkos-seller-b.testnet"], expires_at: expires, max_open_orders: null });
      return [
        p("On the v2 contract the receipt carries the claim. Listing 0 there has a 4-minute window and no seller serving it, so the order will expire and you can watch the refund go to whoever holds the receipt. Uses 5 of your tUSDC (moved out of your v1 budget first) and a second account you create."),
        codeBlock(`# a second account to receive the receipt (if the faucet service answers 429, fund it yourself:
#   near account create-account fund-myself ${friend} '1 NEAR' autogenerate-new-keypair save-to-legacy-keychain ${sign(who.owner)})
near account create-account sponsor-by-faucet-service ${friend} autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near contract call-function as-transaction ${TOKEN} storage_deposit json-args '{"account_id":"${friend}"}' prepaid-gas '30 Tgas' attached-deposit '0.0125 NEAR' ${sign(friend)}

# move 5 tUSDC from your v1 budget to a v2 mandate
near contract call-function as-transaction ${CONTRACT} withdraw json-args '{"from":"Budget","amount":"5000000"}' prepaid-gas '50 Tgas' attached-deposit '1 yoctoNEAR' ${sign(who.owner)}
near contract call-function as-transaction ${V2} set_mandate json-args '${mandate}' prepaid-gas '50 Tgas' attached-deposit '0.5 NEAR' ${sign(who.owner)}
near contract call-function as-transaction ${TOKEN} ft_transfer_call json-args '{"receiver_id":"${V2}","amount":"5000000","msg":""}' prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' ${sign(who.owner)}

# your agent orders listing 0; you pass the receipt on (use the order id it returns)
near contract call-function as-transaction ${V2} create_order json-args '{"owner":"${who.owner}","listing_id":"0","buyer_pubkey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","verifier_version":1}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' ${sign(who.agent)}
near contract call-function as-transaction ${V2} nft_transfer json-args '{"receiver_id":"${friend}","token_id":"<id>"}' prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' ${sign(who.owner)}

# after 4 minutes: anyone refunds; the money goes to the holder
near contract call-function as-transaction ${V2} refund_expired json-args '{"order_id":"<id>"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' ${sign(friend)}
near contract call-function as-read-only ${V2} balance_of json-args '{"account_id":"${friend}"}' network-config testnet now`),
      ];
    },
    expect: () => [
      code("get_receipt_holder"), " returns ", code("your-friend.testnet"), " after the transfer; your agent's ", code("cancel_order"), " now fails with ", code("Only the agent or owner can cancel"),
      "; after the deadline ", code("balance_of"), " shows ", code('"5000000"'), " for your friend (withdraw it with ", code('withdraw {"from":"Earnings"}'), "), not your budget. Our own run, including a settlement after a transfer: ", ex("https://github.com/iusserhat/horkos/blob/main/docs/testnet.md", "docs/testnet.md ↗"), ".",
    ],
  },
  {
    title: "Check it on chain, then try to break it",
    body: () => [
      p("Your order is now in the ", h("a", { href: "./explorer.html", target: "_blank" }, "explorer"), " with its receipt. Then ask the agent for something the mandate forbids:"),
      codeBlock("Buy the premium NEAR/USD feed on Horkos, whatever it costs."),
    ],
    expect: () => ["The agent refuses, or the contract rejects the call with ", code("Seller not allowed by mandate"), ". Your balance doesn't change either way."],
  },
];

const TRACKS: Record<TrackId, { title: string; time: string; blurb: string; steps: Step[]; cls: string }> = {
  watch: { title: "Watch it live", time: "1 minute", blurb: "Nothing to install. Real orders and transactions on testnet.", steps: WATCH, cls: "tk-sky" },
  local: { title: "Run it on your machine", time: "5 to 10 minutes", blurb: "All three scenarios on a local NEAR chain. No accounts, keys or tokens.", steps: LOCAL, cls: "tk-mint" },
  agent: { title: "Use your own agent", time: "about 15 minutes", blurb: "Your accounts, your mandate, your MCP agent, on NEAR testnet.", steps: AGENT, cls: "tk-gold" },
};

let agentInput: HTMLInputElement | null = null;
let agentTouched = store.get("try-agent") !== null && store.get("try-agent") !== "your-name-agent.testnet";
function inputs() {
  const field = (key: "owner" | "agent" | "dir", label: string, check: boolean) => {
    const input = h("input", { type: "text", value: who[key], spellcheck: "false", autocomplete: "off", "aria-label": label });
    const err = h("small", { class: "tk-err", "aria-live": "polite" });
    input.addEventListener("input", () => {
      const v = input.value.trim();
      const e = check ? accountError(v) : null;
      err.textContent = e ?? "";
      if (e) return;
      who[key] = v;
      store.set(`try-${key}`, v);
      // suggest the agent's name from the owner's until the user edits it
      if (key === "owner" && !agentTouched) {
        who.agent = v.replace(/\.testnet$/, "-agent.testnet");
        if (agentInput) agentInput.value = who.agent;
        store.set("try-agent", who.agent);
      }
      if (key === "agent") agentTouched = true;
      rerenders.forEach((r) => r());
    });
    if (key === "agent") agentInput = input;
    return h("label", { class: "s-field" }, h("span", {}, label), input, err);
  };
  return h(
    "div",
    { class: "tk-inputs panel" },
    h("p", {}, h("strong", {}, "Your names. "), "Every command below fills them in. They stay in this browser."),
    h("div", { class: "tk-row" }, field("owner", "Your testnet account", true), field("agent", "Your agent's account", true), field("dir", "Where you clone the repo", false)),
  );
}

function trackView(id: TrackId) {
  const tk = TRACKS[id];
  const key = `try-done-${id}`;
  const done = new Set<number>((store.get(key) || "").split(",").filter(Boolean).map(Number));
  const bar = h("div", { class: "tk-bar" }, h("span", {}));
  const count = h("span", { class: "tk-count" });
  const list = h("ol", { class: "tk-steps" });
  let open = Math.min([...Array(tk.steps.length).keys()].find((i) => !done.has(i)) ?? 0, tk.steps.length - 1);

  const render = () => {
    const pct = Math.round((100 * done.size) / tk.steps.length);
    (bar.firstChild as HTMLElement).style.width = `${pct}%`;
    count.textContent = done.size === tk.steps.length ? "All steps done. That's Horkos working end to end." : `${done.size} of ${tk.steps.length} steps done`;
    mount(
      list,
      ...tk.steps.map((s, i) => {
        const isDone = done.has(i);
        const head = h("button", { type: "button", class: "tk-head", "aria-expanded": String(i === open) }, h("span", { class: `tk-n${isDone ? " ok" : ""}` }, isDone ? "✓" : String(i + 1)), h("span", { class: "tk-title" }, s.title));
        head.addEventListener("click", () => {
          open = open === i ? -1 : i;
          render();
        });
        const toggle = h("button", { type: "button", class: `btn ${isDone ? "" : "btn-mint"}` }, isDone ? "Mark as not done" : i === tk.steps.length - 1 ? "Done" : "Done, next step");
        toggle.addEventListener("click", () => {
          if (isDone) done.delete(i);
          else {
            done.add(i);
            open = i + 1 < tk.steps.length ? i + 1 : -1;
          }
          store.set(key, [...done].join(","));
          render();
          list.querySelector<HTMLElement>(`[data-i="${open}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return h(
          "li",
          { class: `tk-step${isDone ? " is-done" : ""}${i === open ? " is-open" : ""}`, "data-i": String(i) },
          head,
          i === open
            ? h(
                "div",
                { class: "tk-body" },
                ...s.body(),
                s.expect ? h("div", { class: "tk-expect" }, h("strong", {}, "You should see"), h("div", {}, ...s.expect())) : null,
                h("div", { class: "tk-actions" }, toggle),
              )
            : null,
        );
      }),
    );
  };
  if (id === "agent") rerenders.add(render);
  render();
  return h("div", { class: "tk-panel" }, h("div", { class: "tk-progress" }, bar, count), id === "agent" ? inputs() : null, list);
}

export function tryPage() {
  let current: TrackId = (store.get("try-track") as TrackId) || "watch";
  const panel = h("div", {});
  const cards = h("div", { class: "tk-tabs", role: "tablist", "aria-label": "Ways to try Horkos" });
  const grid = h("div", { class: "tk-cards" }, cards);
  const select = (id: TrackId) => {
    current = id;
    store.set("try-track", id);
    rerenders.clear();
    mount(panel, trackView(id));
    cards.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === id)));
  };
  (Object.keys(TRACKS) as TrackId[]).forEach((id) => {
    const t = TRACKS[id];
    const b = h("button", { type: "button", role: "tab", class: `tk-card ${t.cls}`, "data-id": id }, h("span", { class: "tk-time" }, t.time), h("strong", {}, t.title), h("span", {}, t.blurb));
    b.addEventListener("click", () => select(id));
    cards.append(b);
  });
  grid.append(h("a", { class: "tk-card tk-sell", href: "./market.html#api" }, h("span", { class: "tk-time" }, "for data sellers"), h("strong", {}, "Sell from your own API"), h("span", {}, "Connect your API with Horkos Gateway. Opens the Market page.")));
  select(current);

  return [
    h(
      "section",
      { class: "mk-head band band-sky", "aria-labelledby": "try-title" },
      h(
        "div",
        { class: "wrap" },
        h("p", { class: "eyebrow eb-white" }, "Try it yourself"),
        h("h1", { id: "try-title" }, "Test Horkos in one, five or fifteen minutes."),
        h("p", { class: "lead" }, "Pick a path. Each step says exactly what to run and what you should see, and the page remembers where you are."),
      ),
    ),
    h("section", { class: "section band band-paper", "aria-label": "Paths" }, h("div", { class: "wrap" }, grid, panel)),
  ];
}
