// InThePage shell: the extension's only page. It shows the panel from the server in a frame and relays a closed set
// of messages between the frame and the background (page identity, open a link, layout, badge, page text).
// Nothing the server sends is run here: every message is checked against the list below and dropped otherwise.

const ORIGIN = "https://inthepage.com";
const PROTO = 1;
const VERSION = chrome.runtime.getManifest().version;
const mode = new URLSearchParams(location.search).get("mode") === "split" ? "split" : "side";

const frame = document.getElementById("app");
const loading = document.getElementById("loading");
const offline = document.getElementById("offline");

let port = null;
let ready = false;
let lastPage; // the latest page identity from the background, held until the frame is ready
let readyTimer = null;

const toFrame = (msg) => {
  if (ready && frame.contentWindow) frame.contentWindow.postMessage(msg, ORIGIN);
};

// ---------- the background ----------
async function connect() {
  const win = await chrome.windows.getCurrent().catch(() => null);
  port = chrome.runtime.connect({ name: "panel:" + mode });
  port.onMessage.addListener((m) => {
    if (m?.t === "page") {
      lastPage = m.page ?? null;
      toFrame({ t: "page", page: lastPage });
    } else if (m?.t === "pageText") {
      toFrame({ t: "pageText", id: m.id, text: String(m.text || "") });
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 500);
  });
  port.postMessage({ t: "hello", windowId: win?.id ?? null });
}

const toBackground = (msg) => {
  try {
    port?.postMessage(msg);
  } catch {}
};

// ---------- the frame ----------
// v1.0 kept the sign-in in the extension's own storage: hand it to the frame once, then forget it here
async function legacy() {
  const out = {};
  try {
    const r = await chrome.storage.local.get(["am_token", "am_intro"]);
    if (r.am_token) out.am_token = String(r.am_token);
    if (r.am_intro) out.am_intro = String(r.am_intro);
  } catch {}
  try {
    const d = localStorage.getItem("am_device");
    if (d) out.am_device = d;
  } catch {}
  return out;
}

async function onReady() {
  ready = true;
  clearTimeout(readyTimer);
  loading.hidden = true;
  offline.hidden = true;
  frame.hidden = false;
  toFrame({ t: "init", proto: PROTO, mode, version: VERSION, migrate: await legacy() });
  if (lastPage !== undefined) toFrame({ t: "page", page: lastPage });
}

const isHttp = (u) => typeof u === "string" && u.length < 4000 && /^https?:\/\//i.test(u);

window.addEventListener("message", (e) => {
  if (e.origin !== ORIGIN || e.source !== frame.contentWindow) return;
  const m = e.data;
  if (!m || typeof m !== "object" || typeof m.t !== "string") return;
  switch (m.t) {
    case "ready":
      onReady();
      break;
    case "migrated":
      chrome.storage.local.remove(["am_token", "am_intro"]).catch(() => {});
      break;
    case "open":
      if (isHttp(m.url)) toBackground({ t: "open", url: m.url });
      break;
    case "layout":
      if (m.mode === "side" || m.mode === "split") {
        const s = window.screen;
        toBackground({ t: "layout", mode: m.mode, screen: { left: s.availLeft ?? 0, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight } });
      }
      break;
    case "badge":
      if (Number.isFinite(m.n)) toBackground({ t: "badge", n: Math.max(0, Math.floor(m.n)) });
      break;
    case "pageText":
      if (Number.isInteger(m.id)) toBackground({ t: "pageText", id: m.id });
      break;
  }
});

function load() {
  ready = false;
  frame.hidden = true;
  offline.hidden = true;
  loading.hidden = false;
  frame.src = `${ORIGIN}/panel/?shell=${PROTO}&mode=${mode}&v=${encodeURIComponent(VERSION)}`;
  clearTimeout(readyTimer);
  readyTimer = setTimeout(() => {
    if (ready) return;
    loading.hidden = true;
    offline.hidden = false;
    document.getElementById("offline-sub").textContent = navigator.onLine
      ? "השרת לא ענה בזמן. נסו שוב בעוד רגע."
      : "אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.";
  }, 12000);
}

document.getElementById("retry").addEventListener("click", load);
window.addEventListener("online", () => {
  if (!ready) load();
});

connect();
load();
