import { resolve } from "node:path";
import { defineConfig } from "vite";

// Static multi-page build. `base` is relative so the output works on GitHub Pages
// under /<repo>/ as well as at a domain root.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        connect: resolve(import.meta.dirname, "connect.html"),
        explorer: resolve(import.meta.dirname, "explorer.html"),
      },
    },
  },
});
