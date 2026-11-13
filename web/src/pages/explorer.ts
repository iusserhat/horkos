import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/components.css";
import { h, mount, qs } from "../lib/dom";
import { header } from "../sections/header";
import { footer } from "../sections/footer";

// Placeholder until this page is built (next stage); not published.
mount(qs("#header"), header("explorer"));
mount(qs("#main"), h("section", { class: "section" }, h("div", { class: "wrap" }, h("h1", {}, "In progress"))));
mount(qs("#footer"), footer());
