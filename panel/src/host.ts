// Host adapter: the same panel runs inside the Chrome extension, the mobile app (WebView) and a plain web page.
declare const __HOST__: string;
declare const chrome: any;

export interface PageCtx {
  url: string;
  canonical?: string | null;
  title?: string | null;
  favicon?: string | null;
  optout?: string;
  sensitive?: boolean;
}

export type Haptic = "select" | "light" | "success" | "error";
export type LayoutMode = "side" | "split" | "bottom" | "web";

export interface Host {
  kind: "extension" | "mobile" | "web";
  start(onPage: (p: PageCtx | null) => void): void;
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
  open(url: string): void;
  haptic(k: Haptic): void;
  layout: LayoutMode;
  setLayout?(m: LayoutMode): void;
  expand?(on: boolean): void;
  badge?(n: number): void;
}

function extensionHost(): Host {
  let port: any = null;
  const h: Host = {
    kind: "extension",
    layout: new URLSearchParams(location.search).get("mode") === "split" ? "split" : "side",
    start(onPage) {
      const connect = async () => {
        const win = await chrome.windows.getCurrent().catch(() => null);
        port = chrome.runtime.connect({ name: "panel:" + h.layout });
        port.onMessage.addListener((m: any) => {
          if (m.t === "page") onPage(m.page);
        });
        port.onDisconnect.addListener(() => setTimeout(connect, 500));
        port.postMessage({ t: "hello", windowId: win?.id ?? null });
      };
      connect();
    },
    async get(k) {
      const r = await chrome.storage.local.get(k);
      return r[k] ?? null;
    },
    async set(k, v) {
      if (v === null) await chrome.storage.local.remove(k);
      else await chrome.storage.local.set({ [k]: v });
    },
    open(url) {
      port?.postMessage({ t: "open", url });
    },
    haptic() {},
    setLayout(m) {
      const s = window.screen as any;
      port?.postMessage({ t: "layout", mode: m, screen: { left: s.availLeft ?? 0, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight } });
    },
    badge(n) {
      port?.postMessage({ t: "badge", n });
    },
  };
  return h;
}

function mobileHost(): Host {
  const rn = (window as any).ReactNativeWebView;
  const send = (o: unknown) => rn.postMessage(JSON.stringify(o));
  return {
    kind: "mobile",
    layout: "bottom",
    start(onPage) {
      const handler = (e: MessageEvent) => {
        let m: any;
        try {
          m = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        } catch {
          return;
        }
        if (m?.t === "page") onPage(m.page);
        if (m?.t === "insets") {
          const s = document.documentElement.style;
          s.setProperty("--sab", `${m.bottom || 0}px`);
          s.setProperty("--kb", `${m.kb || 0}px`);
        }
        if (m?.t === "theme") document.documentElement.dataset.theme = m.theme;
      };
      window.addEventListener("message", handler);
      document.addEventListener("message", handler as any);
      send({ t: "ready" });
    },
    async get(k) {
      return localStorage.getItem(k);
    },
    async set(k, v) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    },
    open(url) {
      send({ t: "open", url });
    },
    haptic(k) {
      send({ t: "haptic", k });
    },
    expand(on) {
      send({ t: "expand", on });
    },
  };
}

function webHost(): Host {
  return {
    kind: "web",
    layout: "web",
    start(onPage) {
      // sources: ?url= (links, bookmarklet), or Android's share sheet, which often puts the link inside ?text=
      const q = new URLSearchParams(location.search);
      const url = q.get("url") || findUrl(q.get("text")) || findUrl(q.get("title"));
      if (url) {
        let favicon: string | null = null;
        try {
          favicon = new URL("/favicon.ico", url).href;
        } catch {}
        onPage({ url, canonical: q.get("canonical") || null, title: cleanTitle(q.get("title"), url) || null, favicon });
        // keep a clean, shareable address bar
        if (q.has("text")) history.replaceState(null, "", `${location.pathname}?url=${encodeURIComponent(url)}`);
      } else onPage(null);
      window.addEventListener("message", (e) => {
        if (e.data?.t === "page") onPage(e.data.page);
      });
    },
    async get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    async set(k, v) {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {}
    },
    open(url) {
      window.open(url, "_blank", "noopener");
    },
    haptic() {},
  };
}

export function findUrl(text: string | null | undefined): string | null {
  const m = String(text || "").match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,;!?'"״׳]+$/, "") : null;
}

function cleanTitle(title: string | null, url: string): string {
  const t = String(title || "").replace(url, "").trim();
  return /^https?:\/\//.test(t) ? "" : t.slice(0, 200);
}

export const host: Host =
  __HOST__ === "extension" || (typeof chrome !== "undefined" && chrome?.runtime?.id)
    ? extensionHost()
    : (window as any).ReactNativeWebView
      ? mobileHost()
      : webHost();
