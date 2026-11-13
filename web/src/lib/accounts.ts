import { DEMO_AGENT, DEMO_OWNER } from "./config";

/** Shared, in-page state for the Connect guide: the generator edits it, the command blocks read it. */
export interface Accounts {
  owner: string;
  agent: string;
}
let state: Accounts = { owner: DEMO_OWNER, agent: DEMO_AGENT };
const listeners = new Set<(a: Accounts) => void>();

export const getAccounts = () => state;
export function setAccounts(next: Accounts) {
  state = next;
  listeners.forEach((l) => l(state));
}
export function onAccounts(l: (a: Accounts) => void) {
  listeners.add(l);
  l(state);
}

/** NEAR account id rule (same regex the hackathon API uses), plus the network suffix. */
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export function accountError(id: string, network = "testnet"): string | null {
  if (id.length < 2 || id.length > 64) return "2–64 characters.";
  if (!ACCOUNT_RE.test(id)) return "Lowercase letters, digits, - and _, separated by dots.";
  if (!id.endsWith(`.${network}`)) return `Must be a .${network} account.`;
  return null;
}
