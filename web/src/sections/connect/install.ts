import { codeBlock, h } from "../../lib/dom";
import { REPO } from "../../lib/config";

export function install() {
  return h(
    "section",
    { class: "guide-section", id: "install", "aria-labelledby": "install-title" },
    h("h2", { id: "install-title" }, "1. Install"),
    h("p", {}, "You need Node.js 20 or newer and ", h("a", { href: "https://github.com/near/near-cli-rs" }, "near-cli-rs"), " (for the mandate and key commands). The MCP server is on npm; your client starts it with ", h("code", {}, "npx -y horkos-mcp"), " (step 2), nothing to install first."),
    h("p", {}, h("strong", {}, "Advanced: run from source. "), "Clone the repository and install the server's dependencies:"),
    codeBlock(`git clone ${REPO}\ncd horkos/sdk && npm ci\ncd ../mcp && npm ci\nnpx tsx smoke.ts inject   # optional check, read-only except one rejected call`),
    h("p", { class: "muted" }, "The smoke check starts the server over stdio, lists listings and sends one create_order that the contract rejects; it needs the agent's key (step 3) to sign that call."),
  );
}
