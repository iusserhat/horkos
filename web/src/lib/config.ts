export const NETWORK = "testnet";
export const CONTRACT_V1 = "escrow.horkos.testnet";
export const CONTRACT_V2 = "escrow-v2.horkos.testnet";
/** The explorer reads v2 when opened with `?contract=v2`; every other page uses v1. */
export const IS_V2 =
  typeof location !== "undefined" && /explorer(\.html)?$/.test(location.pathname) && new URLSearchParams(location.search).get("contract") === "v2";
export const CONTRACT = IS_V2 ? CONTRACT_V2 : CONTRACT_V1;
export const TOKEN = "tusdc.horkos.testnet";
export const RPC_URL = "https://test.rpc.fastnear.com";
/** Tried in order: when FastNEAR rate-limits a visitor (its 429 has no CORS header and shows as a console error), the second FastNEAR endpoint answers instead (rpc.testnet.near.org is deprecated). */
export const RPC_URLS = [RPC_URL, "https://rpc.testnet.fastnear.com"];
export const REPO = "https://github.com/iusserhat/horkos";
export const DEMO_OWNER = "horkos-owner.testnet";
export const DEMO_AGENT = "horkos-agent.testnet";
export const txUrl = (hash: string) => `https://explorer.testnet.near.org/transactions/${hash}`;
export const accountUrl = (id: string) => `https://explorer.testnet.near.org/accounts/${id}`;
export const repoFile = (path: string) => `${REPO}/blob/main/${path}`;
/** tUSDC has 6 decimals. */
export const fmtUsdc = (units: string | number | bigint) => `${(Number(BigInt(units)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} tUSDC`;
