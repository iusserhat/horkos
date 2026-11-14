import { codeBlock, h, mount, tabs } from "../../lib/dom";
import { accountError, getAccounts, setAccounts } from "../../lib/accounts";

type Client = "Claude Code" | "Claude Desktop" | "Cursor" | "Other MCP clients";
type Os = "macOS" | "Windows" | "Linux";
const CLIENTS: Client[] = ["Claude Code", "Claude Desktop", "Cursor", "Other MCP clients"];

// Config locations from the clients' docs (checked 13 Nov 2026):
// Claude Desktop: modelcontextprotocol.io/docs/develop/connect-local-servers; Cursor: cursor.com/docs/context/mcp
const DESKTOP_PATH: Record<Os, string> = {
  macOS: "~/Library/Application Support/Claude/claude_desktop_config.json",
  Windows: "%APPDATA%\\Claude\\claude_desktop_config.json",
  Linux: "~/.config/Claude/claude_desktop_config.json",
};

/** `fromSource`: run mcp/server.ts from a clone (advanced); otherwise the npm package via npx. */
function output(client: Client, os: Os, repo: string, owner: string, agent: string, fromSource: boolean) {
  const win = client === "Claude Desktop" && os === "Windows";
  const sep = win ? "\\" : "/";
  const root = repo.replace(/[\\/]+$/, "");
  const command = fromSource ? [root, "mcp", "node_modules", ".bin", win ? "tsx.cmd" : "tsx"].join(sep) : win ? "cmd" : "npx";
  const args = fromSource ? [[root, "mcp", "server.ts"].join(sep)] : win ? ["/c", "npx", "-y", "horkos-mcp"] : ["-y", "horkos-mcp"];
  const shellArgs = fromSource ? `"${command}" "${args[0]}"` : "npx -y horkos-mcp";
  const env = { HORKOS_AGENT: agent, HORKOS_OWNER: owner };
  if (client === "Claude Code") {
    return {
      where: "Run in a terminal (any directory). Check with claude mcp list: horkos should show ✔ Connected.",
      code: `claude mcp add horkos -e HORKOS_AGENT=${agent} -e HORKOS_OWNER=${owner} -- ${shellArgs}`,
    };
  }
  if (client === "Claude Desktop") {
    return {
      where: `Add to ${DESKTOP_PATH[os]} (Settings → Developer → Edit Config), then quit and restart Claude Desktop.${win && !fromSource ? " On Windows npx is started through cmd /c (not tested by us on Windows)." : ""}`,
      code: JSON.stringify({ mcpServers: { horkos: { command, args, env } } }, null, 2),
    };
  }
  if (client === "Cursor") {
    return {
      where: "Add to .cursor/mcp.json in your project, or ~/.cursor/mcp.json for all projects.",
      code: JSON.stringify({ mcpServers: { horkos: { type: "stdio", command, args, env } } }, null, 2),
    };
  }
  return {
    where: "Any client that launches stdio MCP servers: use this command, arguments and environment.",
    code: `command: ${command}\nargs:    ${args.join(" ")}\nenv:     HORKOS_AGENT=${agent}\n          HORKOS_OWNER=${owner}`,
  };
}

export function generator() {
  let client: Client = "Claude Code";
  let os: Os = "macOS";
  const field = (id: string, label: string, value: string, hint: string) => {
    const input = h("input", { id, name: id, type: "text", value, spellcheck: "false", autocomplete: "off", "aria-describedby": `${id}-hint ${id}-err` });
    const err = h("p", { id: `${id}-err`, class: "field-err", "aria-live": "polite" });
    return { input, err, el: h("div", { class: "field" }, h("label", { for: id }, label), input, h("p", { id: `${id}-hint`, class: "field-hint" }, hint), err) };
  };
  const owner = field("gen-owner", "Owner account", getAccounts().owner, "Sets the mandate and pays the budget.");
  const agent = field("gen-agent", "Agent account", getAccounts().agent, "Separate account; signs with its function-call key.");
  const repo = field("gen-repo", "Path to your clone of the repo", "/home/you/horkos", "Absolute path; the server runs from mcp/ inside it.");
  const source = h("input", { id: "gen-source", name: "gen-source", type: "checkbox" });
  const sourceField = h("div", { class: "field" }, h("label", { for: "gen-source" }, source, " Advanced: run from source (a clone of the repo) instead of npx"));
  const network = h(
    "select",
    { id: "gen-net", name: "gen-net" },
    h("option", { value: "testnet", selected: true }, "testnet"),
    h("option", { value: "mainnet", disabled: true }, "mainnet (not deployed)"),
  );
  const osSel = h("select", { id: "gen-os", name: "gen-os" }, ...(["macOS", "Windows", "Linux"] as Os[]).map((o) => h("option", { value: o }, o)));
  const osField = h("div", { class: "field", hidden: true }, h("label", { for: "gen-os" }, "Your OS"), osSel);
  const where = h("p", { class: "gen-where" });
  const out = h("div", { class: "gen-out" });

  const render = () => {
    const o = owner.input.value.trim();
    const a = agent.input.value.trim();
    const eo = accountError(o);
    const ea = accountError(a) ?? (a === o ? "Must differ from the owner (the contract rejects it)." : null);
    for (const [f, e] of [[owner, eo], [agent, ea]] as const) {
      f.err.textContent = e ?? "";
      f.input.setAttribute("aria-invalid", e ? "true" : "false");
    }
    osField.hidden = client !== "Claude Desktop";
    repo.el.hidden = !source.checked;
    if (eo || ea) {
      where.textContent = "Fix the account names above to get a config.";
      out.replaceChildren();
      return;
    }
    setAccounts({ owner: o, agent: a });
    const r = output(client, os, repo.input.value.trim() || "/home/you/horkos", o, a, source.checked);
    where.textContent = r.where;
    mount(out, codeBlock(r.code));
  };
  for (const f of [owner, agent, repo]) f.input.addEventListener("input", render);
  source.addEventListener("change", render);
  osSel.addEventListener("change", () => {
    os = osSel.value as Os;
    render();
  });
  const clientTabs = tabs(CLIENTS, (i) => {
    client = CLIENTS[i];
    render();
  }, "client");
  render();

  return h(
    "section",
    { class: "guide-section", id: "config", "aria-labelledby": "config-title" },
    h("h2", { id: "config-title" }, "2. Generate your config"),
    h("p", {}, "Pick your client and accounts. By default the config starts the server from npm (", h("a", { href: "https://www.npmjs.com/package/horkos-mcp" }, "horkos-mcp"), ") with npx; no clone needed. The output contains account names and paths only."),
    h(
      "div",
      { class: "callout" },
      h("strong", {}, "No key ever goes into this page or the config. "),
      "The server reads the agent's function-call key on your machine: from ",
      h("code", {}, "~/.near-credentials/testnet/<agent>/"),
      " (the near-cli legacy keychain, written when you create the key with ",
      h("code", {}, "save-to-legacy-keychain"),
      "), picking the file whose public key matches the agent's on-chain function-call key; or from ",
      h("code", {}, "HORKOS_AGENT_KEY"),
      " if you export it in your own shell. This site is static and sends nothing anywhere except read-only RPC calls.",
    ),
    clientTabs,
    h(
      "div",
      { id: "client-panel", role: "tabpanel", class: "gen-grid" },
      h(
        "form",
        { class: "gen-form", onsubmit: (e: Event) => e.preventDefault() },
        h("div", { class: "field" }, h("label", { for: "gen-net" }, "Network"), network),
        owner.el,
        agent.el,
        sourceField,
        repo.el,
        osField,
      ),
      h("div", {}, where, out),
    ),
  );
}
