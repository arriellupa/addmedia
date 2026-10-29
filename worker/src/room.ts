// PageRoom — one Durable Object per page (or per site). Holds live chat, talkback, likes, pins and their expiry.
import { DurableObject } from "cloudflare:workers";
import { checkText } from "./moderation";
import { DAY, Env, now, sortableId } from "./util";

const CHAT_TTL = 48 * 3600_000;
const BUCKET = 6 * 3600_000; // chat lives in 6-hour tables that are dropped whole
const POST_TTL = 7 * DAY;
const HISTORY = 40;
const MAX_CHAT = 500;
const SLOW_AT = 150; // sockets
const SLOW_GAP = 10_000;
const BURST = 5; // messages
const BURST_WINDOW = 10_000;
const AUTO_HIDE = 3; // reports

interface Att {
  uid: string | null;
  name: string | null;
  isNew: boolean;
  canPost: boolean;
  needStudent?: boolean; // campus room and the person has no student profile
  needPassword?: boolean; // campus room and the account has no password yet
  sent: number[];
}

export interface PostRow {
  id: string;
  created_at: number;
  user_id: string;
  user_name: string;
  kind: string;
  body: string;
  media_key: string | null;
  parent_id: string | null;
  like_count: number;
  expires_at: number;
  pin_days: number;
  status: string;
  link_url?: string | null;
  ref?: string | null; // JSON of a reference to a material stored elsewhere (kind "ref")
}

export interface RoomMeta {
  roomId: string;
  kind: "page" | "site";
  url?: string;
  domain?: string;
  title?: string;
}

const postOut = (p: PostRow, liked = false) => ({
  id: p.id,
  ts: p.created_at,
  uid: p.user_id,
  name: p.user_name,
  kind: p.kind,
  body: p.body,
  media: p.media_key ? `/m/${p.media_key}` : null,
  parentId: p.parent_id,
  likes: p.like_count,
  liked,
  expiresAt: p.expires_at,
  pinned: p.pin_days > 0,
  status: p.status,
  link: p.link_url || null,
  ref: refOf(p.ref),
});

/** a "ref" post points at a document or an image stored once elsewhere: {type, id, title, kind, author, link} */
function refOf(raw: string | null | undefined) {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export class PageRoom extends DurableObject<Env> {
  private sql: SqlStorage;
  private outbox: unknown[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---------- schema (created lazily on first write; reads never create storage) ----------
  private tableExists(name: string): boolean {
    return this.sql.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", name).toArray().length > 0;
  }
  private ensurePosts() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL,
      kind TEXT NOT NULL, body TEXT NOT NULL, media_key TEXT, parent_id TEXT,
      like_count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, pin_days INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'visible', reports INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS posts_time ON posts(created_at)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS posts_exp ON posts(expires_at)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS likes (post_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (post_id, user_id))`);
    // an image may be a live link (added later; older rooms get the column on first write)
    const cols = this.sql.exec("PRAGMA table_info(posts)").toArray().map((c: any) => c.name as string);
    if (!cols.includes("link_url")) this.sql.exec("ALTER TABLE posts ADD COLUMN link_url TEXT");
    if (!cols.includes("ref")) this.sql.exec("ALTER TABLE posts ADD COLUMN ref TEXT");
  }
  private chatTables(): string[] {
    return this.sql
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chat_%' ORDER BY name DESC")
      .toArray()
      .map((r: any) => r.name as string);
  }
  private chatTableFor(ts: number): string {
    const name = `chat_${Math.floor(ts / BUCKET)}`;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ${name} (
      id TEXT PRIMARY KEY, ts INTEGER NOT NULL, uid TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'visible', reports INTEGER NOT NULL DEFAULT 0)`);
    return name;
  }
  private setMeta(meta: RoomMeta) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== null) this.sql.exec("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, String(v).slice(0, 500));
    }
  }

  // ---------- reads ----------
  private recentChat(limit: number, after = 0) {
    const cutoff = Math.max(after, now() - CHAT_TTL);
    const out: any[] = [];
    for (const t of this.chatTables()) {
      const rows = this.sql.exec(`SELECT id, ts, uid, name, body FROM ${t} WHERE status='visible' AND ts>? ORDER BY ts DESC LIMIT ?`, cutoff, limit - out.length).toArray();
      out.push(...rows);
      if (out.length >= limit) break;
    }
    return out.reverse();
  }

  private presence() {
    return this.ctx.getWebSockets().length;
  }

  async bundle(opts: { viewer?: string | null; sort?: "new" | "top"; limit?: number }) {
    const presence = this.presence();
    const hasPosts = this.tableExists("posts");
    const chat = this.recentChat(30);
    if (!hasPosts) return { exists: chat.length > 0, presence, slow: presence >= SLOW_AT, posts: [], media: [], chat, postCount: 0, mediaCount: 0 };
    const t = now();
    const limit = Math.min(opts.limit ?? 20, 50);
    const order = opts.sort === "top" ? "pin_days>0 DESC, like_count DESC, created_at DESC" : "pin_days>0 DESC, created_at DESC";
    const posts = this.sql.exec(`SELECT * FROM posts WHERE status='visible' AND expires_at>? AND kind IN ('text','ref') ORDER BY ${order} LIMIT ?`, t, limit).toArray() as unknown as PostRow[];
    const media = this.sql.exec(`SELECT * FROM posts WHERE status='visible' AND expires_at>? AND kind='image' ORDER BY pin_days>0 DESC, created_at DESC LIMIT 30`, t).toArray() as unknown as PostRow[];
    const counts = this.sql.exec(`SELECT SUM(kind IN ('text','ref')) AS p, SUM(kind='image') AS m FROM posts WHERE status='visible' AND expires_at>?`, t).one() as any;
    const liked = this.likedSet(opts.viewer, [...posts, ...media].map((p) => p.id));
    return {
      exists: true,
      presence,
      slow: presence >= SLOW_AT,
      posts: posts.map((p) => postOut(p, liked.has(p.id))),
      media: media.map((p) => postOut(p, liked.has(p.id))),
      chat,
      postCount: Number(counts?.p ?? 0),
      mediaCount: Number(counts?.m ?? 0),
    };
  }

  async listPosts(opts: { before?: number; kind?: string; viewer?: string | null; sort?: "new" | "top" }) {
    if (!this.tableExists("posts")) return { posts: [], next: null };
    const kinds = opts.kind === "image" ? ["image", "image"] : ["text", "ref"];
    const before = opts.before ?? Number.MAX_SAFE_INTEGER;
    const rows = this.sql
      .exec(`SELECT * FROM posts WHERE status='visible' AND expires_at>? AND kind IN (?,?) AND created_at<? ORDER BY created_at DESC LIMIT 21`, now(), kinds[0], kinds[1], before)
      .toArray() as unknown as PostRow[];
    const page = rows.slice(0, 20);
    const liked = this.likedSet(opts.viewer, page.map((p) => p.id));
    return { posts: page.map((p) => postOut(p, liked.has(p.id))), next: rows.length > 20 ? page[page.length - 1].created_at : null };
  }

  private likedSet(viewer: string | null | undefined, ids: string[]): Set<string> {
    if (!viewer || !ids.length) return new Set();
    const qs = ids.map(() => "?").join(",");
    return new Set(this.sql.exec(`SELECT post_id FROM likes WHERE user_id=? AND post_id IN (${qs})`, viewer, ...ids).toArray().map((r: any) => r.post_id));
  }

  // ---------- writes ----------
  async addPost(p: { uid: string; name: string; kind: "text" | "image" | "ref"; body: string; mediaKey?: string | null; parentId?: string | null; meta: RoomMeta; status?: string; link?: string | null; ttlDays?: number; ref?: unknown }) {
    this.ensurePosts();
    this.setMeta(p.meta);
    const id = sortableId();
    const t = now();
    const status = p.status || "visible";
    this.sql.exec(
      "INSERT INTO posts (id, created_at, user_id, user_name, kind, body, media_key, parent_id, expires_at, status, link_url, ref) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      id, t, p.uid, p.name, p.kind, p.body, p.mediaKey ?? null, p.parentId ?? null, t + (p.ttlDays ? p.ttlDays * DAY : POST_TTL), status, p.link ?? null, p.ref ? JSON.stringify(p.ref) : null,
    );
    await this.scheduleAlarm();
    const row = this.sql.exec("SELECT * FROM posts WHERE id=?", id).one() as unknown as PostRow;
    const out = postOut(row);
    if (status === "visible") this.queue({ t: "post", post: out });
    return out;
  }

  async toggleLike(postId: string, uid: string) {
    if (!this.tableExists("posts")) return { liked: false, likes: 0 };
    const had = this.sql.exec("SELECT 1 FROM likes WHERE post_id=? AND user_id=?", postId, uid).toArray().length > 0;
    if (had) {
      this.sql.exec("DELETE FROM likes WHERE post_id=? AND user_id=?", postId, uid);
      this.sql.exec("UPDATE posts SET like_count=MAX(0, like_count-1) WHERE id=?", postId);
    } else {
      this.sql.exec("INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)", postId, uid);
      this.sql.exec("UPDATE posts SET like_count=like_count+1 WHERE id=?", postId);
    }
    const r = this.sql.exec("SELECT like_count FROM posts WHERE id=?", postId).toArray()[0] as any;
    const likes = Number(r?.like_count ?? 0);
    this.queue({ t: "like", id: postId, likes });
    return { liked: !had, likes };
  }

  async pin(postId: string, uid: string, days: number) {
    if (!this.tableExists("posts")) return { ok: false };
    const row = this.sql.exec("SELECT * FROM posts WHERE id=?", postId).toArray()[0] as unknown as PostRow | undefined;
    if (!row || row.user_id !== uid || row.status !== "visible") return { ok: false };
    const until = Math.max(row.expires_at, now() + days * DAY);
    this.sql.exec("UPDATE posts SET expires_at=?, pin_days=? WHERE id=?", until, days, postId);
    await this.scheduleAlarm();
    const out = postOut({ ...row, expires_at: until, pin_days: days });
    this.queue({ t: "post_update", post: out });
    return { ok: true, post: out };
  }

  private findItem(type: "post" | "chat", id: string): { table: string; row: any } | null {
    if (type === "post") {
      if (!this.tableExists("posts")) return null;
      const row = this.sql.exec("SELECT * FROM posts WHERE id=?", id).toArray()[0];
      return row ? { table: "posts", row } : null;
    }
    for (const t of this.chatTables()) {
      const row = this.sql.exec(`SELECT * FROM ${t} WHERE id=?`, id).toArray()[0];
      if (row) return { table: t, row };
    }
    return null;
  }

  async getItem(type: "post" | "chat", id: string) {
    const f = this.findItem(type, id);
    if (!f) return null;
    const meta = this.tableExists("meta") ? Object.fromEntries(this.sql.exec("SELECT k, v FROM meta").toArray().map((r: any) => [r.k, r.v])) : {};
    return { ...f.row, meta };
  }

  async report(type: "post" | "chat", id: string) {
    const f = this.findItem(type, id);
    if (!f) return { found: false, hidden: false };
    this.sql.exec(`UPDATE ${f.table} SET reports=reports+1 WHERE id=?`, id);
    const n = Number(f.row.reports) + 1;
    if (n >= AUTO_HIDE && f.row.status === "visible") {
      this.sql.exec(`UPDATE ${f.table} SET status='hidden_reports' WHERE id=?`, id);
      this.queue({ t: "hide", id, itemType: type });
      return { found: true, hidden: true, uid: f.row.user_id ?? f.row.uid };
    }
    return { found: true, hidden: false, uid: f.row.user_id ?? f.row.uid };
  }

  /** visible | removed | hold ("hold": hidden while a takedown notice is reviewed; the media stays until a final removal) */
  async setStatus(type: "post" | "chat", id: string, status: "visible" | "removed" | "hold") {
    const f = this.findItem(type, id);
    if (!f) return { ok: false };
    this.sql.exec(`UPDATE ${f.table} SET status=? WHERE id=?`, status, id);
    if (status === "visible") {
      if (type === "post") this.queue({ t: "post", post: postOut({ ...f.row, status }) });
    } else {
      this.queue({ t: "hide", id, itemType: type });
      if (status === "removed" && type === "post" && f.row.media_key) await this.env.MEDIA.delete(f.row.media_key);
    }
    return { ok: true, uid: f.row.uid ?? f.row.user_id ?? null, prev: f.row.status };
  }

  async deleteOwn(postId: string, uid: string) {
    if (!this.tableExists("posts")) return { ok: false };
    const row = this.sql.exec("SELECT user_id, media_key FROM posts WHERE id=?", postId).toArray()[0] as any;
    if (!row || row.user_id !== uid) return { ok: false };
    if (row.media_key) await this.env.MEDIA.delete(row.media_key);
    this.sql.exec("DELETE FROM likes WHERE post_id=?", postId);
    this.sql.exec("DELETE FROM posts WHERE id=?", postId);
    this.queue({ t: "hide", id: postId, itemType: "post" });
    return { ok: true };
  }

  async deleteUserContent(uid: string) {
    let n = 0;
    if (this.tableExists("posts")) {
      const media = this.sql.exec("SELECT id, media_key FROM posts WHERE user_id=?", uid).toArray() as any[];
      const keys = media.map((m) => m.media_key).filter(Boolean);
      if (keys.length) await this.env.MEDIA.delete(keys);
      for (const m of media) this.queue({ t: "hide", id: m.id, itemType: "post" });
      n += media.length;
      this.sql.exec("DELETE FROM posts WHERE user_id=?", uid);
      this.sql.exec("DELETE FROM likes WHERE user_id=?", uid);
    }
    for (const t of this.chatTables()) this.sql.exec(`DELETE FROM ${t} WHERE uid=?`, uid);
    return { deleted: n };
  }

  // ---------- realtime ----------
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const att: Att = {
      uid: req.headers.get("X-Uid") || null,
      name: req.headers.get("X-Name") ? decodeURIComponent(req.headers.get("X-Name")!) : null,
      isNew: req.headers.get("X-New") === "1",
      canPost: req.headers.get("X-Can-Post") === "1",
      needStudent: req.headers.get("X-Need-Student") === "1",
      needPassword: req.headers.get("X-Need-Student") === "password",
      sent: [],
    };
    const metaHeader = req.headers.get("X-Meta");
    if (metaHeader) {
      try {
        (att as any).meta = JSON.parse(decodeURIComponent(metaHeader));
        this.setMeta((att as any).meta); // so the Directory can name this room while people are only chatting
      } catch {}
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(att);
    const after = Number(new URL(req.url).searchParams.get("after") || 0);
    const presence = this.presence();
    server.send(JSON.stringify({ t: "hello", presence, slow: presence >= SLOW_AT, slowGap: SLOW_GAP, history: this.recentChat(HISTORY, after) }));
    this.schedulePresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 4000) return;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t !== "chat") return;
    const att = ws.deserializeAttachment() as Att & { meta?: RoomMeta };
    const reply = (o: unknown) => ws.send(JSON.stringify(o));
    const cid = String(msg.cid ?? "").slice(0, 40);
    if (!att.uid || !att.canPost) return reply({ t: "nack", cid, code: "auth", message: "צריך להתחבר כדי לכתוב." });
    if (att.needPassword) return reply({ t: "nack", cid, code: "password", message: "קבעו סיסמה לחשבון כדי להמשיך" });
    if (att.needStudent) return reply({ t: "nack", cid, code: "student", message: "כדי להשתתף בקמפוס צריך להזדהות: שם, פקולטה, שנה ומגמה" });
    const body = String(msg.body ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHAT);
    if (!body) return;

    const t = now();
    const slow = this.presence() >= SLOW_AT;
    att.sent = att.sent.filter((x) => t - x < Math.max(BURST_WINDOW, SLOW_GAP));
    if (slow && att.sent.length && t - att.sent[att.sent.length - 1] < SLOW_GAP) {
      return reply({ t: "nack", cid, code: "slow", retryIn: SLOW_GAP - (t - att.sent[att.sent.length - 1]), message: "מצב איטי — אפשר לשלוח הודעה כל 10 שניות." });
    }
    if (att.sent.filter((x) => t - x < BURST_WINDOW).length >= BURST) {
      return reply({ t: "nack", cid, code: "rate", message: "רגע, לאט יותר." });
    }
    const v = await checkText(this.env, body, { isNew: att.isNew });
    if (!v.ok) return reply({ t: "nack", cid, code: v.code, message: v.message });

    att.sent.push(t);
    ws.serializeAttachment(att);
    if (att.meta) this.setMeta(att.meta);
    const table = this.chatTableFor(t);
    const id = sortableId();
    this.sql.exec(`INSERT INTO ${table} (id, ts, uid, name, body) VALUES (?,?,?,?,?)`, id, t, att.uid, att.name || "", body);
    await this.scheduleAlarm();
    const m = { id, ts: t, uid: att.uid, name: att.name, body };
    reply({ t: "ack", cid, m });
    this.queue({ t: "chat", m }, ws);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1006 ? 1000 : code, "bye");
    } catch {}
    this.schedulePresence();
  }
  async webSocketError() {
    this.schedulePresence();
  }

  private queue(ev: unknown, except?: WebSocket) {
    this.outbox.push(except ? { ev, except } : { ev });
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 120);
  }
  private flush() {
    this.flushTimer = null;
    const items = this.outbox as { ev: unknown; except?: WebSocket }[];
    this.outbox = [];
    if (!items.length) return;
    for (const ws of this.ctx.getWebSockets()) {
      const evs = items.filter((i) => i.except !== ws).map((i) => i.ev);
      if (!evs.length) continue;
      try {
        ws.send(JSON.stringify({ t: "batch", evs }));
      } catch {}
    }
  }
  private schedulePresence() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      const n = this.presence();
      this.queue({ t: "presence", n, slow: n >= SLOW_AT });
      this.reportPresence(n);
    }, 1500);
  }
  /** tell the Directory who is here, so the media page can list this room; never blocks the room */
  private reportPresence(n: number) {
    try {
      const meta = this.readMeta();
      if (!meta) return;
      this.ctx.waitUntil(this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName("global")).report(meta, n).catch(() => {}));
    } catch {}
  }
  private readMeta(): RoomMeta | null {
    if (!this.tableExists("meta")) return null;
    const rows = this.sql.exec("SELECT k, v FROM meta").toArray() as any[];
    const m: any = {};
    for (const r of rows) m[r.k] = r.v;
    return m.roomId && m.kind ? (m as RoomMeta) : null;
  }

  /** test hook (DEV_MODE only): make everything expire now and run the expiry alarm */
  async devExpireNow() {
    if (this.env.DEV_MODE !== "true") return { ok: false };
    if (this.tableExists("posts")) this.sql.exec("UPDATE posts SET expires_at=?", now() - 1);
    for (const t of this.chatTables()) this.sql.exec(`UPDATE ${t} SET ts=0`);
    // chat buckets are dropped by age; rename them to an ancient bucket so the alarm drops them
    this.chatTables().forEach((t, i) => this.sql.exec(`ALTER TABLE ${t} RENAME TO chat_${i + 1}`));
    await this.alarm();
    return { ok: true, empty: !this.tableExists("posts") && !this.chatTables().length };
  }

  // ---------- expiry ----------
  private async scheduleAlarm() {
    const next = this.nextExpiry();
    if (next === null) return;
    const cur = await this.ctx.storage.getAlarm();
    if (cur === null || next < cur) await this.ctx.storage.setAlarm(next);
  }
  private nextExpiry(): number | null {
    const c: number[] = [];
    if (this.tableExists("posts")) {
      const r = this.sql.exec("SELECT MIN(expires_at) AS e FROM posts").one() as any;
      if (r?.e) c.push(Number(r.e));
    }
    const tables = this.chatTables();
    if (tables.length) {
      const oldest = Number(tables[tables.length - 1].slice(5));
      c.push((oldest + 1) * BUCKET + CHAT_TTL);
    }
    return c.length ? Math.max(Math.min(...c), now() + 1000) : null;
  }

  async alarm() {
    const t = now();
    if (this.tableExists("posts")) {
      for (;;) {
        const rows = this.sql.exec("SELECT id, media_key FROM posts WHERE expires_at<=? LIMIT 500", t).toArray() as any[];
        if (!rows.length) break;
        const keys = rows.map((r) => r.media_key).filter(Boolean);
        if (keys.length) await this.env.MEDIA.delete(keys);
        const ids = rows.map((r) => r.id);
        const qs = ids.map(() => "?").join(",");
        this.sql.exec(`DELETE FROM likes WHERE post_id IN (${qs})`, ...ids);
        this.sql.exec(`DELETE FROM posts WHERE id IN (${qs})`, ...ids);
        if (rows.length < 500) break;
      }
    }
    for (const name of this.chatTables()) {
      const bucket = Number(name.slice(5));
      if ((bucket + 1) * BUCKET + CHAT_TTL <= t) this.sql.exec(`DROP TABLE ${name}`);
    }
    const postsLeft = this.tableExists("posts") ? Number((this.sql.exec("SELECT COUNT(*) AS n FROM posts").one() as any).n) : 0;
    if (!postsLeft && !this.chatTables().length) {
      await this.ctx.storage.deleteAll(); // room ceases to exist; storage billing stops
      return;
    }
    const next = this.nextExpiry();
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
}
