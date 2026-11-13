export const NETWORK = "testnet";
export const CONTRACT = "escrow.horkos.testnet";
export const TOKEN = "tusdc.horkos.testnet";
export const RPC_URL = "https://test.rpc.fastnear.com";
export const REPO = "https://github.com/iusserhat/horkos";
export const DEMO_OWNER = "horkos-owner.testnet";
export const DEMO_AGENT = "horkos-agent.testnet";
export const txUrl = (hash: string) => `https://explorer.testnet.near.org/transactions/${hash}`;
export const accountUrl = (id: string) => `https://explorer.testnet.near.org/accounts/${id}`;
export const repoFile = (path: string) => `${REPO}/blob/main/${path}`;
/** tUSDC has 6 decimals. */
export const fmtUsdc = (units: string | number | bigint) => `${(Number(BigInt(units)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} tUSDC`;
