// Full-page screenshots of the built site: 1440 px and 390 px, light and dark.
// Usage: npm run build && npm run preview (another terminal) && npm run shots -- [page ...]
// Pages: index, connect, explorer (default: all). Output: ../docs/screenshots/<page>-<width>-<theme>.png
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:4173";
const OUT = resolve(import.meta.dirname, "../../docs/screenshots");
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ["index", "connect", "explorer"];
const widths = [1440, 390];
const themes = ["light", "dark"];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chromium" });
const problems = [];
for (const page of pages) {
  for (const width of widths) {
    for (const theme of themes) {
      const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await ctx.addInitScript((t) => {
        try { localStorage.setItem("horkos-theme", t); } catch {}
      }, theme);
      const p = await ctx.newPage();
      p.on("pageerror", (e) => problems.push(`${page} ${width} ${theme}: ${e.message}`));
      await p.goto(`${BASE}/${page === "index" ? "" : page + ".html"}`, { waitUntil: "networkidle" });
      await p.waitForTimeout(1500);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${page} ${width} ${theme}: horizontal overflow ${overflow}px`);
      const file = resolve(OUT, `${page}-${width}-${theme}.png`);
      await p.screenshot({ path: file, fullPage: true });
      console.log(file);
      await ctx.close();
    }
  }
}
await browser.close();
if (problems.length) {
  console.log("PROBLEMS:\n" + problems.join("\n"));
  process.exitCode = 1;
}
