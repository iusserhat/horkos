import { h } from "../lib/dom";

interface UseCase {
  title: string;
  tag: "Works today" | "Roadmap";
  gets: string;
  gives: string;
  checked: string;
  refund: string;
}

// From docs/DESIGN.md §8. Today the verifier checks JSON Schema only.
const CASES: UseCase[] = [
  {
    title: "Dataset purchase",
    tag: "Works today",
    gets: "A JSON dataset, e.g. 4 rows of NEAR/USD prices with timestamps.",
    gives: "The data encrypted on FastFS, the key sealed to the verifier.",
    checked: "JSON Schema: required fields, types, minimum row count.",
    refund: "The data fails the schema on every attempt, or nothing arrives before the deadline.",
  },
  {
    title: "Paid API result",
    tag: "Works today",
    gets: "One computed API response worth at least about $1 (cent-sized calls cost more in fees than they protect).",
    gives: "The response body as an encrypted delivery.",
    checked: "JSON Schema of the response.",
    refund: "Malformed response, or no response before the deadline.",
  },
  {
    title: "Agent-to-agent job with structured output",
    tag: "Works today",
    gets: "Labels or extracted fields from another agent, as JSON.",
    gives: "The output file; the buyer only reads it after the check.",
    checked: "Shape only: schema of the output. Hidden control samples are planned.",
    refund: "Wrong shape, missing fields, or no delivery by the deadline.",
  },
  {
    title: "Code against a test suite",
    tag: "Roadmap",
    gets: "A patch that makes the buyer's tests pass.",
    gives: "The patch, encrypted.",
    checked: "Planned: the verifier runs the test suite. Today it checks JSON Schema only.",
    refund: "Tests fail, or nothing arrives before the deadline.",
  },
];

export function useCases() {
  return h(
    "section",
    { class: "section", "aria-labelledby": "uses-title" },
    h(
      "div",
      { class: "wrap stack" },
      h("p", { class: "eyebrow" }, "Use cases"),
      h("h2", { id: "uses-title" }, "What a condition can check."),
      h("p", { class: "muted" }, "Today the verifier checks deliveries against a JSON Schema; code and test-suite checks are planned."),
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
          ),
        ),
      ),
    ),
  );
}
