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

render(<App />, document.getElementById("app")!);
boot();
