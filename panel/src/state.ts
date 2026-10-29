import { batch, computed, signal } from "@preact/signals";
import { Ad, ApiError, Bundle, ChatMsg, Me, Post, api, setToken } from "./api";
import { host, type PageCtx } from "./host";
import { Live, type LiveStatus } from "./live";

export type Tab = "chat" | "comments" | "media";
export type Sheet =
  | null
  | { type: "signin"; then?: () => void }
  | { type: "mymedia"; section?: "create" | "items" | "store" | "safety"; pinFor?: Post }
  | { type: "report"; itemType: "post" | "chat"; item: Post | ChatMsg }
  | { type: "menu"; itemType: "post" | "chat"; item: Post | ChatMsg }
  | { type: "viewer"; post: Post }
  | { type: "student"; then?: () => void }
  | { type: "attach" };

const CHAT_CAP = 300;

export const page = signal<PageCtx | null>(null);
export const scope = signal<"page" | "site">("page");
export const tab = signal<Tab>("chat");
export const sort = signal<"new" | "top">("new");
export const bundle = signal<Bundle | null>(null);
export const loading = signal(true);
export const loadError = signal<string | null>(null);
export const chat = signal<ChatMsg[]>([]);
export const posts = signal<Post[]>([]);
export const postsNext = signal<number | null>(null);
export const media = signal<Post[]>([]);
export const presence = signal(0);
export const slow = signal(false);
export const slowUntil = signal(0);
export const status = signal<LiveStatus>("idle");
export const me = signal<Me | null>(null);
export const blocked = signal<Set<string>>(new Set());
export const sheet = signal<Sheet>(null);
export const toast = signal<{ text: string; kind?: "ok" | "err"; action?: { label: string; run: () => void } } | null>(null);
export const replyTo = signal<Post | null>(null);
/** text to drop into the live chat's composer (the campus's page citation); the composer empties it */
export const composerInsert = signal<string | null>(null);
export const sideHint = computed(() => bundle.value?.other ?? null);
const isCampus = () => !!page.value?.url.startsWith("https://campus.addmedia.noaplate.com/");
/** the names of the two scopes, as the composers say them */
export const scopeNames = computed(() => (isCampus() ? { page: "השיעור", site: "כל השנה" } : { page: "הדף הזה", site: "כל האתר" }));
export const retentionDays = computed(() => bundle.value?.settings?.retentionDays ?? 7);

export const roomId = computed(() => bundle.value?.roomId ?? "");
export const canPost = computed(() => !!bundle.value?.rules.comments);
export const visibleChat = computed(() => chat.value.filter((m) => !blocked.value.has(m.uid)));
export const visiblePosts = computed(() => posts.value.filter((p) => !blocked.value.has(p.uid)));
export const visibleMedia = computed(() => media.value.filter((p) => !blocked.value.has(p.uid)));

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function say(text: string, kind: "ok" | "err" = "ok", action?: { label: string; run: () => void }) {
  toast.value = { text, kind, action };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), action ? 5000 : 3200);
}

const live = new Live({
  onStatus: (s) => (status.value = s),
  onEvent(ev) {
    switch (ev.t) {
      case "hello":
        batch(() => {
          presence.value = ev.presence;
          slow.value = ev.slow;
          if (ev.history?.length) mergeChat(ev.history);
        });
        break;
      case "presence":
        presence.value = ev.n;
        slow.value = ev.slow;
        break;
      case "chat":
        mergeChat([ev.m]);
        break;
      case "ack":
        chat.value = chat.value.map((m) => (m.cid === ev.cid ? { ...ev.m } : m));
        break;
      case "nack": {
        chat.value = chat.value.map((m) => (m.cid === ev.cid ? { ...m, pending: false, failed: ev.message } : m));
        if (ev.code === "slow" && ev.retryIn) slowUntil.value = Date.now() + ev.retryIn;
        if (ev.code === "auth") sheet.value = { type: "signin" };
        if (ev.code === "student") {
          const m = chat.value.find((x) => x.cid === ev.cid);
          sheet.value = { type: "student", then: m ? () => retryChat(m) : undefined };
        }
        host.haptic("error");
        break;
      }
      case "post":
        if (ev.post.kind === "image" || ev.post.ref?.type === "media") media.value = upsert(media.value, ev.post);
        else posts.value = upsert(posts.value, ev.post);
        break;
      case "post_update":
        posts.value = posts.value.map((p) => (p.id === ev.post.id ? { ...p, ...ev.post, liked: p.liked } : p));
        media.value = media.value.map((p) => (p.id === ev.post.id ? { ...p, ...ev.post, liked: p.liked } : p));
        break;
      case "like":
        posts.value = posts.value.map((p) => (p.id === ev.id ? { ...p, likes: ev.likes } : p));
        media.value = media.value.map((p) => (p.id === ev.id ? { ...p, likes: ev.likes } : p));
        break;
      case "hide":
        if (ev.itemType === "chat") chat.value = chat.value.filter((m) => m.id !== ev.id);
        else {
          posts.value = posts.value.filter((p) => p.id !== ev.id);
          media.value = media.value.filter((p) => p.id !== ev.id);
        }
        break;
    }
  },
});

function upsert(list: Post[], p: Post): Post[] {
  if (list.some((x) => x.id === p.id)) return list.map((x) => (x.id === p.id ? { ...x, ...p } : x));
  const pinned = list.filter((x) => x.pinned);
  const rest = list.filter((x) => !x.pinned);
  return p.pinned ? [p, ...pinned, ...rest] : [...pinned, p, ...rest];
}

function mergeChat(msgs: ChatMsg[]) {
  const ids = new Set(chat.value.map((m) => m.id));
  const add = msgs.filter((m) => !ids.has(m.id));
  if (!add.length) return;
  const next = [...chat.value, ...add].sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.ts - b.ts);
  chat.value = next.length > CHAT_CAP ? next.slice(next.length - CHAT_CAP) : next;
}

// ---------- loading a page ----------
let loadSeq = 0;
const quiet = (r: any) => !r || ((r.presence ?? 0) <= 1 && (r.postCount ?? r.posts?.length ?? 0) === 0 && !(r.chat?.length));

export async function load(opts: { keepChat?: boolean; autoScope?: boolean } = {}): Promise<void> {
  const p = page.value;
  if (!p) {
    loading.value = false;
    return;
  }
  const seq = ++loadSeq;
  loading.value = true;
  loadError.value = null;
  if (!opts.keepChat) chat.value = [];
  try {
    const b = await api.panel(p, scope.value, sort.value);
    if (seq !== loadSeq) return;
    // A quiet page opens on the whole site, where the people are; the page's own room stays one tap away.
    // Only on the first load of a page, never after the reader chose a scope.
    const threshold = b.settings?.pageThreshold ?? 5;
    const few = !b.room || (b.room.presence < threshold && !(b.room.chat?.length) && (b.room.postCount ?? 0) === 0) || (b.room.presence < threshold && quiet(b.room));
    if (opts.autoScope && scope.value === "page" && !b.disabled && few) {
      scope.value = "site";
      return load({ keepChat: opts.keepChat });
    }
    batch(() => {
      bundle.value = b;
      posts.value = b.room?.posts ?? [];
      postsNext.value = (b.room?.posts?.length ?? 0) >= 20 ? b.room.posts[b.room.posts.length - 1].ts : null;
      media.value = b.room?.media ?? [];
      if (b.room?.chat?.length) mergeChat(b.room.chat);
      presence.value = b.room?.presence ?? 0;
      slow.value = !!b.room?.slow;
      if (b.me) me.value = b.me;
      loading.value = false;
    });
    if (b.disabled) live.close();
    else live.connect(p, scope.value, chat.value.at(-1)?.ts ?? 0);
    trackAds(b.ads);
  } catch (e: any) {
    if (seq !== loadSeq) return;
    loading.value = false;
    loadError.value = e?.message || "הטעינה נכשלה.";
  }
}

const roomCache = new Map<string, { chat: ChatMsg[]; tab: Tab }>();
export function setPage(p: PageCtx | null) {
  const prev = page.value;
  if (p && prev && p.url === prev.url && p.canonical === prev.canonical) {
    if (p.title !== prev.title) page.value = p;
    return;
  }
  if (prev && bundle.value) roomCache.set(bundle.value.roomId, { chat: chat.value, tab: tab.value });
  batch(() => {
    page.value = p;
    scope.value = "page";
    bundle.value = null;
    posts.value = [];
    media.value = [];
    replyTo.value = null;
    sheet.value = sheet.value?.type === "signin" || sheet.value?.type === "mymedia" ? sheet.value : null;
  });
  if (!p) {
    live.close();
    loading.value = false;
    return;
  }
  load({ autoScope: true });
}

export function setScope(s: "page" | "site") {
  if (scope.value === s) return;
  scope.value = s;
  host.haptic("select");
  load();
}

export function setSort(s: "new" | "top") {
  if (sort.value === s) return;
  sort.value = s;
  load({ keepChat: true });
}

export const reconnect = () => live.reconnectNow();

// ---------- auth ----------
export async function initAuth() {
  const t = await host.get("am_token");
  if (t) {
    setToken(t);
    try {
      const r = await api.me();
      me.value = r.user;
      blocked.value = new Set(r.blocks);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        await host.set("am_token", null);
      }
    }
  }
}

export async function signedIn(token: string, user: Me) {
  setToken(token);
  await host.set("am_token", token);
  me.value = user;
  try {
    const r = await api.me();
    blocked.value = new Set(r.blocks);
  } catch {}
  live.reconnectNow(); // reconnect so the room knows who we are
}

export async function signOut() {
  try {
    await api.logout();
  } catch {}
  setToken(null);
  await host.set("am_token", null);
  me.value = null;
  sheet.value = null;
  live.reconnectNow();
  say("התנתקת.");
}

/** a second gate after sign-in (the campus asks the student to identify); returns false when it took over */
let writeGate: ((fn: () => void) => boolean) | null = null;
export const setWriteGate = (g: typeof writeGate) => (writeGate = g);

/** run fn only if signed in with accepted rules; otherwise open the sign-in sheet and resume after */
export function needAuth(fn: () => void) {
  if (!me.value?.termsAccepted) return void (sheet.value = { type: "signin", then: fn });
  if (writeGate && isCampus() && !writeGate(fn)) return;
  fn();
}

// ---------- actions ----------
export function sendChat(body: string): boolean {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text || !me.value) return false;
  if (slow.value && Date.now() < slowUntil.value) return false;
  const cid = Math.random().toString(36).slice(2, 10);
  const optimistic: ChatMsg = { id: "tmp_" + cid, cid, ts: Date.now(), uid: me.value.id, name: me.value.name, body: text, pending: true };
  chat.value = [...chat.value, optimistic].slice(-CHAT_CAP);
  if (!live.send({ t: "chat", cid, body: text })) {
    chat.value = chat.value.map((m) => (m.cid === cid ? { ...m, pending: false, failed: "אין חיבור — ההודעה לא נשלחה." } : m));
    return true;
  }
  if (slow.value) slowUntil.value = Date.now() + 10_000;
  host.haptic("light");
  return true;
}

export function retryChat(m: ChatMsg) {
  chat.value = chat.value.filter((x) => x.cid !== m.cid);
  sendChat(m.body);
}

export async function submitPost(body: string): Promise<boolean> {
  const p = page.value;
  if (!p) return false;
  try {
    const r = await api.post(p, scope.value, body, replyTo.value?.id);
    posts.value = upsert(posts.value, r.post);
    replyTo.value = null;
    host.haptic("light");
    return true;
  } catch (e: any) {
    if (e?.code === "student") {
      sheet.value = { type: "student", then: () => submitPost(body) };
      return false;
    }
    say(e.message, "err");
    host.haptic("error");
    return false;
  }
}

export async function loadMorePosts() {
  const next = postsNext.value;
  if (!next || !roomId.value) return;
  const r = await api.morePosts(roomId.value, next);
  posts.value = [...posts.value, ...r.posts.filter((p) => !posts.value.some((x) => x.id === p.id))];
  postsNext.value = r.next;
}

export function toggleLike(p: Post) {
  needAuth(async () => {
    const flip = (list: Post[]) => list.map((x) => (x.id === p.id ? { ...x, liked: !x.liked, likes: Math.max(0, x.likes + (x.liked ? -1 : 1)) } : x));
    posts.value = flip(posts.value);
    media.value = flip(media.value);
    host.haptic("light");
    try {
      const r = await api.like(roomId.value, p.id);
      const set = (list: Post[]) => list.map((x) => (x.id === p.id ? { ...x, liked: r.liked, likes: r.likes } : x));
      posts.value = set(posts.value);
      media.value = set(media.value);
    } catch (e: any) {
      posts.value = flip(posts.value);
      media.value = flip(media.value);
      say(e.message, "err");
    }
  });
}

export async function report(itemType: "post" | "chat", item: Post | ChatMsg, reason: string, details?: string) {
  try {
    const r = await api.report(roomId.value, itemType, item.id, reason, details);
    if (itemType === "chat") chat.value = chat.value.filter((m) => m.id !== item.id);
    else {
      posts.value = posts.value.filter((p) => p.id !== item.id);
      media.value = media.value.filter((p) => p.id !== item.id);
    }
    sheet.value = null;
    say(r.sla === "48h" ? "הדיווח התקבל בעדיפות עליונה. נטפל בו תוך 48 שעות." : "תודה. נבדוק את הדיווח תוך 24 שעות.", "ok", me.value && item.uid !== me.value.id ? { label: "לחסום גם את המשתמש", run: () => blockUser(item.uid, item.name) } : undefined);
  } catch (e: any) {
    say(e.message, "err");
  }
}

export function blockUser(uid: string, name: string) {
  needAuth(async () => {
    const next = new Set(blocked.value);
    next.add(uid);
    blocked.value = next;
    sheet.value = null;
    say(`חסמת את ${name}. אפשר לבטל בהגדרות.`, "ok", { label: "ביטול", run: () => unblockUser(uid) });
    try {
      await api.block(uid);
    } catch {}
  });
}

export async function unblockUser(uid: string) {
  const next = new Set(blocked.value);
  next.delete(uid);
  blocked.value = next;
  try {
    await api.block(uid, true);
  } catch {}
}

// ---------- media ----------
export async function compressImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const max = 1600;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  for (const q of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", q));
    if (blob && blob.size <= 1_000_000) return blob.type === "image/webp" ? blob : blob;
  }
  const jpg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.6));
  if (!jpg) throw new Error("הדחיסה נכשלה");
  return jpg;
}

export async function uploadImage(file: File, caption: string, link?: string): Promise<boolean> {
  const p = page.value;
  if (!p) return false;
  try {
    const blob = await compressImage(file);
    const r = await api.upload(p, scope.value, blob, caption, link);
    if (!r.review) media.value = upsert(media.value, r.post);
    if (me.value) me.value = { ...me.value, credits: { ...me.value.credits, media: r.credits } };
    host.haptic("success");
    say(r.review ? "התמונה בבדיקה ותתפרסם בעוד רגע." : "התמונה שלך באוויר.");
    return true;
  } catch (e: any) {
    say(e.message, "err");
    host.haptic("error");
    return false;
  }
}

// ---------- ads ----------
const seenAds = new Set<string>();
let adQueue: string[] = [];
function trackAds(ads: { top: Ad | null; feed: Ad[] }) {
  for (const a of [ads.top, ...ads.feed]) if (a && !seenAds.has(a.id)) {
    seenAds.add(a.id);
    adQueue.push(a.id);
  }
}
setInterval(() => {
  if (adQueue.length) {
    api.impressions(adQueue.slice(0, 10));
    adQueue = adQueue.slice(10);
  }
}, 30_000);

export async function boot() {
  await initAuth();
  host.start((p) => setPage(p));
}
