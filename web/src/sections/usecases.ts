import { h } from "../lib/dom";

interface Example {
  name: string;
  what: string;
  url: string;
}

interface UseCase {
  title: string;
  tag: "Works today" | "Roadmap";
  gets: string;
  gives: string;
  checked: string;
  refund: string;
  /** Real services where this purchase happens today. Illustrative only: none of them integrates with Horkos. */
  examples: Example[];
  /** Honest fit on mainnet with these providers. */
  mainnet: { fit: "Good fit" | "Partial fit" | "Later"; note: string };
  /** Where the testnet demo's data comes from, when it is real. */
  demoSource?: string[];
}

// From docs/DESIGN.md §8. Today the verifier checks JSON Schema only.
const CASES: UseCase[] = [
  {
    title: "Market data",
    tag: "Works today",
    gets: "A JSON dataset, e.g. 90 days of NEAR/USD prices with timestamps.",
    gives: "The data encrypted on FastFS, the key sealed to the verifier.",
    checked: "JSON Schema: required fields, types, minimum row count.",
    refund: "The data fails the schema on every attempt, or nothing arrives before the deadline.",
    examples: [
      { name: "Horkos Market", what: "listing #0 sells live NEAR/USD prices under escrow today, on testnet", url: "./market.html#offers" },
      { name: "CoinGecko", what: "sells price and market data to agents per request over x402", url: "https://www.coingecko.com/en/api/x402" },
      { name: "CoinMarketCap", what: "offers its crypto data API to agents over x402", url: "https://coinmarketcap.com/api/x402/" },
    ],
    mainnet: {
      fit: "Partial fit",
      note: "Worth it for bundles such as a 90-day history export. A single $0.005 price call costs less than one verification, so it should stay on plain x402. A schema can't tell a wrong price from a right one: the verifier would have to compare against a second source.",
    },
    demoSource: [
      "In the testnet demo, seller A fulfils orders with live NEAR/USD prices from CoinGecko's free public API. Price data by CoinGecko.",
      "Horkos does not pay CoinGecko and CoinGecko is not a Horkos seller; it is seller A's data source. We do not use x402 in this demo.",
      "Reselling a provider's data commercially would need that provider's permission.",
    ],
  },
  {
    title: "Web search and extraction",
    tag: "Works today",
    gets: "Structured results for a batch job, e.g. 200 product pages as JSON with name, price and URL.",
    gives: "The extracted results as an encrypted delivery.",
    checked: "JSON Schema of each record and the number of records.",
    refund: "Missing fields, too few records, or nothing before the deadline.",
    examples: [
      { name: "Horkos Market", what: "has no extraction offer yet; anyone with a NEAR account can list the first one", url: "./market.html#sell" },
      { name: "Firecrawl", what: "lets agents pay per search and scrape over x402", url: "https://www.coinbase.com/developer-platform/discover/case-studies/firecrawl" },
      { name: "Exa", what: "accepts x402 payments for its search API", url: "https://exa.ai/docs/reference/x402-guide" },
      { name: "Apify", what: "Store scrapers charge per result or per event", url: "https://docs.apify.com/platform/actors/publishing/monetize" },
    ],
    mainnet: {
      fit: "Good fit",
      note: "A batch job worth a few dollars is exactly what escrow is for. Today Horkos pays all or nothing; paying per valid record, the way Apify charges, needs partial settlement. Relevance of the results is not checked, only their shape and count.",
    },
  },
  {
    title: "Work from another agent",
    tag: "Works today",
    gets: "Labels, a classification or extracted fields from another agent, as JSON.",
    gives: "The output file; the buyer only reads it after the check.",
    checked: "Shape only: the schema of the output. Hidden control samples are planned.",
    refund: "Wrong shape, missing fields, or no delivery by the deadline.",
    examples: [
      { name: "Horkos Market", what: "takes listings from other agents too: a seller can be an agent running the seller SDK", url: "./market.html#sell" },
      { name: "Olas Mech Marketplace", what: "agents hire other agents and pay per request on chain", url: "https://olas.network/mech-marketplace" },
    ],
    mainnet: {
      fit: "Partial fit",
      note: "Olas mechs are paid on EVM chains, not on NEAR, so buying from them needs a cross-chain path such as NEAR Intents. Judging the quality of another agent's work, beyond its shape, needs hidden control samples.",
    },
  },
  {
    title: "Code that passes tests",
    tag: "Roadmap",
    gets: "A patch that makes the buyer's tests pass.",
    gives: "The patch, encrypted.",
    checked: "Planned: the verifier runs the buyer's test suite. Today it checks JSON Schema only.",
    refund: "Tests fail, or nothing arrives before the deadline.",
    examples: [
      { name: "Algora", what: "bounties are paid when a maintainer merges the pull request", url: "https://docs.algora.io/bounties/workflow" },
    ],
    mainnet: {
      fit: "Later",
      note: "The strongest fit in the long run: a test suite gives a yes or no that a TEE can compute without a human. Running the buyer's tests inside the verifier is the part still to build.",
    },
  },
];

export function useCases() {
  return h(
    "section",
    { class: "section band band-paper", "aria-labelledby": "uses-title" },
    h(
      "div",
      { class: "wrap stack" },
      h("p", { class: "eyebrow eb-lilac" }, "Use cases"),
      h("h2", { id: "uses-title" }, "What your agent can buy safely."),
      h(
        "p",
        { class: "lead" },
        "Agents already pay for data and work. Over x402 the money leaves before anything is checked, which is fine for a one-cent call. For purchases worth checking, Horkos is the escrow step in between.",
      ),
      h(
        "aside",
        { class: "uc-market panel", "aria-labelledby": "uc-market-title" },
        h(
          "div",
          {},
          h("h3", { id: "uc-market-title" }, "Or buy where escrow is already built in: Horkos Market"),
          h("p", {}, "Sellers on Horkos Market deliver through the escrow from the start, so your agent never pays before the check. Each offer shows the seller's settled and refunded orders, read from the receipts on chain. Anyone can list a dataset, a database export or an API result."),
        ),
        h("div", { class: "uc-market-btns" }, h("a", { class: "btn btn-gold", href: "./market.html#offers" }, "Browse the market"), h("a", { class: "btn", href: "./market.html#sell" }, "Sell your data")),
      ),
      h(
        "div",
        { class: "uses" },
        ...CASES.map((c) =>
          h(
            "article",
            { class: "use panel" },
            h("div", { class: "use-head" }, h("h3", {}, c.title), h("span", { class: `tag ${c.tag === "Roadmap" ? "tag-roadmap" : "tag-today"}` }, c.tag)),
            h(
              "dl",
              {},
              h("dt", {}, "Agent gets"), h("dd", {}, c.gets),
              h("dt", {}, "Seller gives"), h("dd", {}, c.gives),
              h("dt", {}, "Checked"), h("dd", {}, c.checked),
              h("dt", {}, "Refund when"), h("dd", {}, c.refund),
            ),
            h(
              "div",
              { class: "use-mn" },
              h("p", { class: "use-mn-title" }, "On mainnet with these providers ", h("span", { class: `fit fit-${c.mainnet.fit.split(" ")[0].toLowerCase()}` }, c.mainnet.fit)),
              h("p", {}, c.mainnet.note),
            ),
            h(
              "div",
              { class: "use-ex" },
              h("p", { class: "use-ex-title" }, c.tag === "Roadmap" ? "Where it would replace a manual step" : "Where agents buy this today"),
              h(
                "ul",
                {},
                ...c.examples.map((e) => h("li", {}, h("a", e.url.startsWith("./") ? { href: e.url, class: "own" } : { href: e.url, rel: "noopener", target: "_blank" }, e.name), " ", e.what, ".")),
              ),
            ),
            c.demoSource ? h("div", { class: "use-src" }, h("p", { class: "use-ex-title" }, "Where the demo's data comes from"), ...c.demoSource.map((t) => h("p", {}, t))) : null,
          ),
        ),
      ),
      h(
        "div",
        { class: "gaps panel" },
        h("h3", {}, "What has to change before real providers can use it"),
        h("p", { class: "muted" }, "Horkos works end to end on testnet. Moving the same contract to mainnet is a deploy; making it useful with providers like the ones above needs these:"),
        h(
          "ul",
          {},
          h("li", {}, h("strong", {}, "Providers have to sell through it. "), "They list an offer, deliver encrypted, and get paid after the check, not on request as with x402. A gateway that buys over x402 and resells through Horkos would also need the provider's permission to resell its data."),
          h("li", {}, h("strong", {}, "Money on the right chain. "), "The contract takes any NEP-141 token, so USDC issued natively on NEAR works without code changes. Buyers or sellers whose USDC sits on Base or Solana need a bridge or NEAR Intents."),
          h("li", {}, h("strong", {}, "A price floor. "), "Each order puts down about 0.015 NEAR of storage deposit and pays OutLayer 0.001 to 0.01 NEAR per check. Below roughly a dollar an order, plain x402 is cheaper."),
          h("li", {}, h("strong", {}, "Seconds, not milliseconds. "), "A check takes about 20 seconds on testnet. That suits jobs and datasets, not live calls inside a chat turn."),
          h("li", {}, h("strong", {}, "Less trust in us and in OutLayer. "), "The TEE attestation should be verified, the team's full-access keys on the contract removed, and the code audited."),
          h("li", {}, h("strong", {}, "Shape is not truth. "), "A seller can still deliver well-formed but wrong data. Cross-source checks, control samples and test suites are how the conditions get stronger."),
        ),
      ),
      h("p", { class: "muted use-disclaimer" }, "Services are named to show where the pattern fits. None of them integrates with or endorses Horkos."),
    ),
  );
}
