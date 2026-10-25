import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

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
    rollupOptions: { output: { entryFileNames: "assets/panel.js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } },
  },
  server: { port: 5173, host: "127.0.0.1" },
}));
