import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/components.css";
import "../styles/home.css";
import "../styles/connect.css";
import { h, mount, qs } from "../lib/dom";
import { header } from "../sections/header";
import { footer } from "../sections/footer";
import { install } from "../sections/connect/install";
import { generator } from "../sections/connect/generator";
import { mandate } from "../sections/connect/mandate";
import { toolsRef } from "../sections/connect/tools";
import { conversations } from "../sections/connect/conversations";
import { sdkExample } from "../sections/connect/sdk";
import { troubleshoot } from "../sections/connect/troubleshoot";

const TOC: [string, string][] = [
  ["install", "1 Install"],
  ["config", "2 Config"],
  ["mandate", "3 Mandate"],
  ["tools", "4 Tools"],
  ["examples", "5 Examples"],
  ["sdk", "6 SDK"],
  ["troubleshooting", "7 Troubleshooting"],
];

const toc = h(
  "nav",
  { class: "toc", "aria-label": "On this page" },
  h("details", { class: "toc-details", open: true }, h("summary", {}, "On this page"), h("ol", {}, ...TOC.map(([id, l]) => h("li", {}, h("a", { href: `#${id}` }, l))))),
);

// Collapsed on narrow screens so the guide starts at the top.
if (window.matchMedia("(max-width: 900px)").matches) toc.querySelector("details")?.removeAttribute("open");
mount(qs("#header"), header("connect"));
mount(
  qs("#main"),
  h(
    "div",
    { class: "wrap guide" },
    h(
      "header",
      { class: "guide-head" },
      h("p", { class: "eyebrow" }, "Connect your agent"),
      h("h1", {}, "Give an AI agent a budget it cannot overspend."),
      h("p", { class: "lead" }, "About five minutes with the MCP server: install, add one config entry, set a mandate on testnet, then ask your agent to buy. Tested with Claude Code on Linux; the Claude Desktop and Cursor configs follow those clients' documented formats."),
    ),
    h("div", { class: "guide-grid" }, toc, h("div", { class: "guide-body" }, install(), generator(), mandate(), toolsRef(), conversations(), sdkExample(), troubleshoot())),
  ),
);
mount(qs("#footer"), footer());
