import { render } from "preact";
import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/secular-one/400.css";
import "./styles.css";
import { App } from "./App";
import { host } from "./host";
import { boot } from "./state";

if (host.layout === "side") document.documentElement.dataset.density = "compact";
if (((navigator as any).deviceMemory ?? 8) <= 4) document.documentElement.classList.add("perf-lite");

if (host.kind === "web") {
  const add = (tag: string, attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  };
  add("link", { rel: "manifest", href: "/manifest.webmanifest" });
  add("link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" });
  add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
  add("meta", { name: "apple-mobile-web-app-title", content: "AddMedia" });
  add("meta", { name: "theme-color", content: "#f4f3f6", media: "(prefers-color-scheme: light)" });
  add("meta", { name: "theme-color", content: "#16131a", media: "(prefers-color-scheme: dark)" });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

render(<App />, document.getElementById("app")!);
boot();
