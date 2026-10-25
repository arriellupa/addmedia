// AddMedia background: tracks the page the user is reading and drives the two layouts
// (Chrome side panel, or split screen: browser on top, AddMedia window below).

const ports = new Map(); // port -> { mode, windowId }
let lastNormalWindow = null;
let splitWindowId = null;
let splitMainWindow = null;
const lastMeta = new Map(); // tabId -> { url, canonical, stale }
chrome.tabs.onRemoved.addListener((id) => lastMeta.delete(id));

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.storage.session.get(["splitWindowId", "splitMainWindow", "lastNormalWindow"]).then((s) => {
  splitWindowId = s.splitWindowId ?? null;
  splitMainWindow = s.splitMainWindow ?? null;
  lastNormalWindow = s.lastNormalWindow ?? null;
});
const persist = () => chrome.storage.session.set({ splitWindowId, splitMainWindow, lastNormalWindow });

async function activeTab(windowId) {
  if (windowId == null) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  return tab || null;
}

async function pageFor(tab) {
  if (!tab?.url || !/^https?:/.test(tab.url)) return null;
  let m = null;
  try {
    m = await chrome.tabs.sendMessage(tab.id, { t: "meta" });
  } catch {}
  if (m && m.url !== tab.url) m = { ...m, url: tab.url, canonical: null, ogTitle: "" }; // read raced an SPA navigation
  // SPA sites often keep the previous article's canonical/og tags after pushState: treat them as stale
  const raw = m?.canonical || null;
  const prev = lastMeta.get(tab.id);
  let stale = false;
  if (prev && raw) stale = prev.url !== tab.url ? raw === prev.canonical : prev.stale && raw === prev.canonical;
  lastMeta.set(tab.id, { url: tab.url, canonical: raw, stale });
  return {
    url: tab.url,
    canonical: stale ? null : raw,
    title: (stale ? m?.docTitle : m?.ogTitle || m?.docTitle) || tab.title || "",
    favicon: tab.favIconUrl || m?.favicon || null,
    optout: m?.optout || "",
    sensitive: !!m?.sensitive || tab.incognito,
  };
}

function targetWindow(info) {
  return info.mode === "split" ? (splitMainWindow ?? lastNormalWindow) : info.windowId;
}

async function resolveWindow(info) {
  let win = targetWindow(info);
  if (win == null) {
    const lf = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
    win = lf?.id ?? null;
  }
  return win;
}

async function pushTo(port, info) {
  const win = await resolveWindow(info);
  const page = await pageFor(await activeTab(win));
  try {
    port.postMessage({ t: "page", page });
  } catch {}
}

let pushTimer = null;
function pushAll(delay = 350) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    for (const [port, info] of ports) pushTo(port, info);
  }, delay);
}

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("panel:")) return;
  const info = { mode: port.name.slice(6), windowId: null };
  ports.set(port, info);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(async (m) => {
    if (m.t === "hello") {
      info.windowId = m.windowId ?? null;
      pushTo(port, info);
    } else if (m.t === "open" && /^https?:\/\//.test(m.url)) {
      const win = await resolveWindow(info);
      chrome.tabs.create({ url: m.url, windowId: win ?? undefined });
    } else if (m.t === "layout") {
      if (m.mode === "split") await enterSplit(m.screen, info.windowId ?? lastNormalWindow);
      else await exitSplit();
    } else if (m.t === "badge") {
      const tab = await activeTab(await resolveWindow(info));
      if (tab) {
        chrome.action.setBadgeBackgroundColor({ color: "#A3195B" });
        chrome.action.setBadgeText({ tabId: tab.id, text: m.n > 0 ? compact(m.n) : "" });
      }
    }
  });
});

function compact(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  if (n < 1e6) return Math.round(n / 1000) + "K";
  return (n / 1e6).toFixed(1) + "M";
}

chrome.tabs.onActivated.addListener(() => pushAll(50));
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (!tab.active) return;
  if (change.url || change.status === "complete" || change.title) pushAll(change.url ? 450 : 150);
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE || windowId === splitWindowId) return;
  const w = await chrome.windows.get(windowId).catch(() => null);
  if (w?.type === "normal") {
    lastNormalWindow = windowId;
    if (splitWindowId != null) splitMainWindow = windowId;
    persist();
    pushAll(50);
  }
});
chrome.windows.onRemoved.addListener(async (windowId) => {
  if (windowId === splitWindowId) {
    splitWindowId = null;
    if (splitMainWindow != null) chrome.windows.update(splitMainWindow, { state: "maximized" }).catch(() => {});
    splitMainWindow = null;
    persist();
  }
});

// ---------- split screen ----------
async function enterSplit(screen, fromWindow) {
  const main = fromWindow ?? (await chrome.windows.getLastFocused({ windowTypes: ["normal"] }))?.id;
  if (main == null) return;
  splitMainWindow = main;
  const s = screen || { left: 0, top: 0, width: 1440, height: 900 };
  const topH = Math.round(s.height * 0.56);
  await chrome.windows.update(main, { state: "normal" }).catch(() => {});
  await chrome.windows.update(main, { left: s.left, top: s.top, width: s.width, height: topH }).catch(() => {});
  if (splitWindowId != null) {
    const w = await chrome.windows.get(splitWindowId).catch(() => null);
    if (w) {
      await chrome.windows.update(splitWindowId, { left: s.left, top: s.top + topH, width: s.width, height: s.height - topH, focused: true });
      persist();
      return;
    }
  }
  const w = await chrome.windows.create({
    url: chrome.runtime.getURL("panel/index.html?mode=split"),
    type: "popup",
    left: s.left,
    top: s.top + topH,
    width: s.width,
    height: s.height - topH,
    focused: true,
  });
  splitWindowId = w.id;
  persist();
}

async function exitSplit() {
  const id = splitWindowId;
  splitWindowId = null;
  if (splitMainWindow != null) await chrome.windows.update(splitMainWindow, { state: "maximized" }).catch(() => {});
  splitMainWindow = null;
  persist();
  if (id != null) await chrome.windows.remove(id).catch(() => {});
}

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-split") return;
  if (splitWindowId != null) return exitSplit();
  const w = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  // use the main window's own screen bounds as an approximation of the work area
  await enterSplit({ left: w.left ?? 0, top: w.top ?? 0, width: w.width ?? 1440, height: w.height ?? 900 }, w.id);
});
