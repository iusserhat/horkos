/** `npm run seller -- a|b|c` runs one seller service until Ctrl-C. */
import { startSeller } from "./service.js";

const key = process.argv[2];
if (key !== "a" && key !== "b" && key !== "c") {
  console.error("usage: npm run seller -- a|b|c");
  process.exit(2);
}
startSeller(key);
