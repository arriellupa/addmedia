import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [preact()],
  base: "./",
  define: {
    __HOST__: JSON.stringify(mode === "extension" ? "extension" : "auto"),
  },
  build: {
    target: "es2022",
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      // the web build has a second page: the media page (/media/), the extension only the panel
      input: mode === "extension" ? { panel: here("index.html") } : { panel: here("index.html"), media: here("media.html") },
      output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" },
    },
  },
  server: { port: 5173, host: "127.0.0.1" },
}));
