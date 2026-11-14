import { h } from "../lib/dom";

interface Stat {
  big: string;
  what: string;
  note: string;
  src: [string, string];
}

// Figures checked on 14 Nov 2026. Each tile names its source; nothing here is a Horkos number.
const TODAY: Stat[] = [
  { big: "196 million", what: "x402 payments since launch", note: "More than $42 million settled across 12 chains, as of 1 Nov 2026.", src: ["Fireblocks, citing agenteconomy.to", "https://www.fireblocks.com/blog/agent-economy-numbers-x402-data"] },
  { big: "$274,000", what: "x402 value in October 2026", note: "From 5.1 million payments: a few cents each. More than 95% of activity has been protocol signalling, not trade (Artemis).", src: ["Fireblocks; CoinDesk", "https://www.fireblocks.com/blog/agent-economy-numbers-x402-data"] },
  { big: "87%+", what: "of x402 payments are under 10 cents", note: "Cent-sized API calls: paying upfront is fine there, and escrow would cost more than it protects.", src: ["Chainalysis, via Fireblocks", "https://www.fireblocks.com/blog/agent-economy-numbers-x402-data"] },
  { big: "49% → 95%", what: "of x402 value on Base comes from payments of $1 or more", note: "From the earliest months to early 2026. The money is moving to the purchases worth checking.", src: ["Chainalysis, via Fireblocks", "https://www.fireblocks.com/blog/agent-economy-numbers-x402-data"] },
];

const TOMORROW: Stat[] = [
  { big: "$3–5 trillion", what: "agentic commerce by 2030", note: "McKinsey's global forecast for sales orchestrated by AI agents; up to $1 trillion in US retail alone.", src: ["McKinsey, Oct 2025", "https://www.mckinsey.com/industries/retail/our-insights/the-agentic-commerce-opportunity-how-ai-agents-are-ushering-in-a-new-era-for-consumers-and-merchants"] },
  { big: "$5.73 billion", what: "data marketplace platforms by 2030", note: "25.2% a year from 2025. The market Horkos Market sells into.", src: ["Grand View Research, Nov 2024", "https://www.grandviewresearch.com/press-release/global-data-marketplace-market"] },
  { big: "17% → 60%+", what: "of organisations running AI agents, now and within two years", note: "Gartner CIO survey for 2026, fielded mid-2025.", src: ["Gartner, via Fireblocks", "https://www.fireblocks.com/blog/agent-economy-numbers-x402-data"] },
];

const stat = (s: Stat, cls: string) =>
  h(
    "li",
    { class: `bm-stat ${cls}` },
    h("strong", {}, s.big),
    h("span", { class: "bm-what" }, s.what),
    h("p", {}, s.note),
    h("a", { href: s.src[1], rel: "noopener", target: "_blank", class: "bm-src" }, s.src[0]),
  );

const ROWS: [string, string][] = [
  ["$10 million", "$50,000"],
  ["$100 million", "$500,000"],
  ["$1 billion (0.1% of McKinsey's US retail figure)", "$5 million"],
];

export function business() {
  return h(
    "section",
    { class: "section band band-sky", id: "business", "aria-labelledby": "bm-title" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "sec-head" },
        h("p", { class: "eyebrow eb-white" }, "Business model and market"),
        h("h2", { id: "bm-title" }, "Small today, and aimed at the part that grows."),
        h("p", { class: "lead" }, "Agent payments are real but tiny so far, and almost all of them are too small to need escrow. Horkos is built for the purchases above about a dollar, where a failed delivery actually costs something."),
      ),
      h("h3", { class: "bm-h" }, "The market today"),
      h("ul", { class: "bm-grid" }, ...TODAY.map((s, i) => stat(s, ["c1", "c2", "c3", "c4"][i]))),
      h("h3", { class: "bm-h" }, "Where it is heading"),
      h("ul", { class: "bm-grid bm-grid-3" }, ...TOMORROW.map((s, i) => stat(s, ["c5", "c6", "c7"][i]))),
      h(
        "div",
        { class: "bm-model" },
        h(
          "article",
          { class: "panel bm-card" },
          h("h3", {}, "How Horkos makes money"),
          h("p", { class: "bm-status" }, "Planned for mainnet. On testnet Horkos charges nothing, and the contract has no fee yet."),
          h(
            "ol",
            {},
            h("li", {}, h("strong", {}, "0.5% settlement fee. "), "Taken from the seller only when an order settles. Refunds, cancellations and failed deliveries cost nothing. For comparison, Escrow.com charges 2.6% with a $50 minimum on deals under $5,000."),
            h("li", {}, h("strong", {}, "Stronger checks, priced per check. "), "Cross-source price checks, hidden control samples and test suites, on top of the free JSON Schema check."),
            h("li", {}, h("strong", {}, "Services for sellers. "), "A hosted seller service and a verified-seller bond for data providers who don't want to run their own."),
          ),
        ),
        h(
          "article",
          { class: "panel bm-card" },
          h("h3", {}, "What 0.5% would mean"),
          h("p", { class: "bm-status" }, "An illustration, not a forecast."),
          h(
            "table",
            { class: "bm-table" },
            h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Settled through Horkos in a year"), h("th", { scope: "col" }, "Revenue at 0.5%"))),
            h("tbody", {}, ...ROWS.map(([v, r]) => h("tr", {}, h("td", {}, v), h("td", {}, r)))),
          ),
          h("h3", { class: "bm-h2" }, "How we get there"),
          h(
            "ul",
            { class: "bm-gtm" },
            h("li", {}, "Bundles from sellers agents already pay over x402, such as data APIs and scrapers, sold through escrow when the order is worth checking."),
            h("li", {}, "Distribution through MCP: any agent framework that speaks MCP can buy through Horkos without new code."),
            h("li", {}, "Horkos Market as the first supply, with track records read from receipts on chain."),
          ),
        ),
      ),
      h("p", { class: "muted bm-foot" }, "Sources checked on 14 November 2026. Third-party figures use their own methods and don't always agree; we quote them as published."),
    ),
  );
}
