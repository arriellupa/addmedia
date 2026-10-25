// Live connection to the page room: reconnect with jittered backoff, resume from the last message, close in background.
import { API_BASE, getToken, pageQuery } from "./api";
import type { PageCtx } from "./host";

export type LiveStatus = "idle" | "connecting" | "open" | "reconnecting" | "offline";

export interface LiveHandlers {
  onEvent(ev: any): void;
  onStatus(s: LiveStatus): void;
}

export class Live {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private target: { page: PageCtx; scope: string } | null = null;
  private lastTs = 0;
  private wanted = false;
  private gen = 0;

  constructor(private h: LiveHandlers) {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.hideTimer = setTimeout(() => this.drop(), 10_000);
      } else {
        if (this.hideTimer) clearTimeout(this.hideTimer);
        if (this.wanted && !this.ws) this.open();
      }
    });
    window.addEventListener("online", () => this.wanted && !this.ws && this.open());
  }

  connect(page: PageCtx, scope: string, lastTs = 0) {
    this.target = { page, scope };
    this.lastTs = lastTs;
    this.wanted = true;
    this.attempt = 0;
    this.drop();
    this.open();
  }

  reconnectNow() {
    if (!this.target) return;
    this.drop();
    this.open();
  }

  close() {
    this.wanted = false;
    this.drop();
    this.h.onStatus("idle");
  }

  send(o: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(o));
    return true;
  }

  private drop() {
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    this.timer = null;
    this.ping = null;
    const ws = this.ws;
    this.ws = null;
    this.gen++;
    if (ws) {
      ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null;
      try {
        ws.close(1000);
      } catch {}
    }
  }

  private open() {
    if (!this.target || document.hidden) return;
    const gen = this.gen;
    const q = pageQuery(this.target.page, { scope: this.target.scope, after: String(this.lastTs) });
    const t = getToken();
    const url = API_BASE.replace(/^http/, "ws") + `/v1/ws?${q}${t ? `&t=${encodeURIComponent(t)}` : ""}`;
    this.h.onStatus(this.attempt ? "reconnecting" : "connecting");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (gen !== this.gen) return;
      this.attempt = 0;
      this.h.onStatus("open");
      this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 30_000);
    };
    ws.onmessage = (e) => {
      if (gen !== this.gen || e.data === "pong") return;
      let m: any;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      const evs = m.t === "batch" ? m.evs : [m];
      for (const ev of evs) {
        if (ev.t === "chat" && ev.m?.ts) this.lastTs = Math.max(this.lastTs, ev.m.ts);
        if (ev.t === "ack" && ev.m?.ts) this.lastTs = Math.max(this.lastTs, ev.m.ts);
        if (ev.t === "hello" && ev.history?.length) this.lastTs = Math.max(this.lastTs, ev.history[ev.history.length - 1].ts);
        this.h.onEvent(ev);
      }
    };
    ws.onclose = () => {
      if (gen !== this.gen) return;
      if (this.ping) clearInterval(this.ping);
      this.ws = null;
      if (!this.wanted) return;
      this.attempt++;
      this.h.onStatus(navigator.onLine === false ? "offline" : "reconnecting");
      const cap = Math.min(30_000, 1000 * 2 ** Math.min(this.attempt, 5));
      this.timer = setTimeout(() => this.open(), Math.random() * cap);
    };
    ws.onerror = () => {};
  }
}
