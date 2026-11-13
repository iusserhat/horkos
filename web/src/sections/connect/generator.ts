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

function output(client: Client, os: Os, repo: string, owner: string, agent: string) {
  const win = client === "Claude Desktop" && os === "Windows";
  const sep = win ? "\\" : "/";
  const root = repo.replace(/[\\/]+$/, "");
  const tsx = [root, "mcp", "node_modules", ".bin", win ? "tsx.cmd" : "tsx"].join(sep);
  const server = [root, "mcp", "server.ts"].join(sep);
  const env = { HORKOS_AGENT: agent, HORKOS_OWNER: owner };
  if (client === "Claude Code") {
    return {
      where: "Run in a terminal (any directory). Check with claude mcp list: horkos should show ✔ Connected.",
      code: `claude mcp add horkos -e HORKOS_AGENT=${agent} -e HORKOS_OWNER=${owner} -- "${tsx}" "${server}"`,
    };
  }
  if (client === "Claude Desktop") {
    return {
      where: `Add to ${DESKTOP_PATH[os]} (Settings → Developer → Edit Config), then quit and restart Claude Desktop.`,
      code: JSON.stringify({ mcpServers: { horkos: { command: tsx, args: [server], env } } }, null, 2),
    };
  }
  if (client === "Cursor") {
    return {
      where: "Add to .cursor/mcp.json in your project, or ~/.cursor/mcp.json for all projects.",
      code: JSON.stringify({ mcpServers: { horkos: { type: "stdio", command: tsx, args: [server], env } } }, null, 2),
    };
  }
  return {
    where: "Any client that launches stdio MCP servers: use this command, arguments and environment.",
    code: `command: ${tsx}\nargs:    ${server}\nenv:     HORKOS_AGENT=${agent}\n          HORKOS_OWNER=${owner}`,
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
    if (eo || ea) {
      where.textContent = "Fix the account names above to get a config.";
      out.replaceChildren();
      return;
    }
    setAccounts({ owner: o, agent: a });
    const r = output(client, os, repo.input.value.trim() || "/home/you/horkos", o, a);
    where.textContent = r.where;
    mount(out, codeBlock(r.code));
  };
  for (const f of [owner, agent, repo]) f.input.addEventListener("input", render);
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
    h("p", {}, "Pick your client and accounts. The output contains account names and paths only."),
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
        repo.el,
        osField,
      ),
      h("div", {}, where, out),
    ),
  );
}
