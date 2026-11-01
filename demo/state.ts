/** Listing ids and condition URLs written by setup.ts (demo/.state.json, not committed). */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SellerState {
  listingId: string;
  conditionUrl: string;
  conditionHash: string;
}
export type DemoState = Partial<Record<"a" | "b" | "c", SellerState>>;

const FILE = join(import.meta.dirname, ".state.json");

export const loadState = (): DemoState => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {});
export const saveState = (s: DemoState) => writeFileSync(FILE, JSON.stringify(s, null, 2) + "\n");
