// AddMedia API — Cloudflare Worker entry
import { handleAdmin, modLog } from "./admin";
import { User, getUser, logout, publicUser, startAuth, tokenFrom, verifyAuth } from "./auth";
import { Canon, ROOM_RE, canonicalize, isSensitive, roomIds } from "./canon";
import { CAMPUS_HOST, campusTree, deleteDoc, docFile, follow, listDocs, listFollows, placeOf, placeTitle, placeUrl, uploadDoc } from "./campus";
import { debugPage, debugVia } from "./debug";
import { getSettings, publicSettings } from "./settings";
import { checkImage, checkPost, checkText } from "./moderation";
import type { RoomMeta } from "./room";
import { CORS, DAY, Env, clampStr, fail, idSecret, isTrue, json, now, randomId, readJson } from "./util";

export { PageRoom } from "./room";
export { Directory } from "./directory";

// bump on each release: /v1/health shows which version is live
const VERSION = "2026-10-28.2";

const room = (env: Env, id: string) => env.ROOMS.get(env.ROOMS.idFromName(id));

const PRODUCTS = [
  { id: "media5", kind: "media", qty: 5, price: 990, title: "5 העלאות תמונה", note: "כל תמונה מוצגת 7 ימים" },
  { id: "media20", kind: "media", qty: 20, price: 2990, title: "20 העלאות תמונה", note: "הכי משתלם למשתמשים פעילים", best: true },
  { id: "pin30", kind: "pin", days: 30, price: 1490, title: "הצמדה ל-30 יום" },
  { id: "pin90", kind: "pin", days: 90, price: 2990, title: "הצמדה ל-90 יום", best: true },
  { id: "pin365", kind: "pin", days: 365, price: 8990, title: "הצמדה לשנה" },
] as const;

// ---------- domain rules (cached per isolate) ----------
type Rule = { no_comments: number; no_ads: number; disabled: number };
let rulesCache: { at: number; map: Map<string, Rule> } | null = null;
async function rulesFor(env: Env, c: Canon): Promise<Rule> {
  if (!rulesCache || now() - rulesCache.at > 5 * 60_000) {
    const r = await env.DB.prepare("SELECT domain, no_comments, no_ads, disabled FROM domain_rules").all<any>();
    rulesCache = { at: now(), map: new Map((r.results || []).map((x: any) => [x.domain, x])) };
  }
  const out: Rule = { no_comments: 0, no_ads: 0, disabled: 0 };
  // match host, then each parent domain (so "gov.il" covers all government sites)
  const labels = c.host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const r = rulesCache.map.get(labels.slice(i).join("."));
    if (r) {
      out.no_comments ||= r.no_comments;
      out.no_ads ||= r.no_ads;
      out.disabled ||= r.disabled;
    }
  }
  return out;
}

interface Resolved {
  c: Canon;
  pageId: string;
  siteId: string;
  roomId: string;
  scope: "page" | "site";
  rule: Rule;
  optout: { comments: boolean; ads: boolean };
  sensitive: string | null;
  meta: RoomMeta;
}

async function resolve(env: Env, p: { url?: string | null; canonical?: string | null; title?: string | null; scope?: string | null; optout?: string | null }): Promise<Resolved | Response> {
  // the campus pages of the media page are campus rooms: the extension beside https://addmedia.noaplate.com/media/campus/…
  // shows the same chat and talkbacks as the page itself
  let raw = String(p.url || "");
  const mp = raw.match(/^https?:\/\/addmedia\.noaplate\.com\/media\/campus\/([^/?#]+)\/([^/?#]+)\/([1-6])(?:\/([^/?#]+))?\/?(?:[?#].*)?$/);
  if (mp) raw = `https://${CAMPUS_HOST}/${mp[1]}/${mp[2]}/${mp[3]}${mp[4] ? "/" + mp[4] : ""}`;
  const c = canonicalize(raw, mp ? null : p.canonical);
  if (!c) return fail(400, "bad_url", "כתובת לא נתמכת.");
  let { pageId, siteId } = await roomIds(idSecret(env), c);
  const scope = p.scope === "site" ? "site" : "page";
  const rule = await rulesFor(env, c);
  const oo = String(p.optout || "");
  // campus places: the "site" of a course or an article page is its faculty/year hub, and the Directory groups them by institution
  let campus: { domain: string; siteUrl: string; siteTitle: string; pageTitle?: string } | null = null;
  if (c.host === CAMPUS_HOST) {
    const seg = new URL(c.canonical).pathname.split("/").filter(Boolean).map((x) => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x;
      }
    });
    const place = seg[0] === "doc" ? null : placeOf({ inst: seg[0], faculty: seg[1], year: seg[2], course: seg[3] });
    if (place) {
      const hub = { inst: place.inst, faculty: place.faculty, year: place.year };
      const hubCanon = canonicalize(placeUrl(hub));
      if (hubCanon) siteId = (await roomIds(idSecret(env), hubCanon)).pageId;
      campus = { domain: "campus." + place.inst, siteUrl: placeUrl(hub), siteTitle: placeTitle(hub), pageTitle: placeTitle(place) };
    } else if (seg[0] === "doc") {
      campus = { domain: "campus.docs", siteUrl: "https://" + CAMPUS_HOST + "/doc", siteTitle: "מאמרים וסיכומים" };
    }
  }
  const roomId = scope === "site" ? siteId : pageId;
  return {
    c, pageId, siteId, roomId, scope, rule,
    optout: { comments: oo.includes("nocomments"), ads: oo.includes("noads") },
    sensitive: isSensitive(c),
    meta: scope === "site"
      ? { roomId, kind: "site", url: campus ? campus.siteUrl : "https://" + c.site, domain: campus ? campus.domain : c.site, title: campus ? campus.siteTitle : c.site }
      : { roomId, kind: "page", url: c.canonical.slice(0, 500), domain: campus ? campus.domain : c.site, title: clampStr(p.title, 200) || campus?.pageTitle || undefined },
  };
}

const commentsAllowed = (r: Resolved) => !r.rule.disabled && !r.rule.no_comments && !r.optout.comments && !r.sensitive;

async function adsFor(env: Env, r: Resolved) {
  if (r.rule.no_ads || r.optout.ads || r.rule.disabled || r.sensitive) return { top: null, feed: [] };
  const t = now();
  const rows = (await env.DB.prepare(
    `SELECT id, advertiser, title, body, url, image_url, placement FROM ads
     WHERE active=1 AND (target_domain IS NULL OR target_domain=?) AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?)
     ORDER BY target_domain IS NULL, RANDOM() LIMIT 6`,
  ).bind(r.c.site, t, t).all<any>()).results || [];
  const map = (a: any) => ({ id: a.id, advertiser: a.advertiser, title: a.title, body: a.body, image: a.image_url, href: `/v1/ads/${a.id}/click` });
  return { top: rows.find((a) => a.placement === "top") ? map(rows.find((a) => a.placement === "top")) : null, feed: rows.filter((a) => a.placement === "feed").slice(0, 2).map(map) };
}

async function requireUser(env: Env, req: Request, url: URL): Promise<User | Response> {
  const u = await getUser(env, tokenFrom(req, url));
  if (!u) return fail(401, "auth", "צריך להתחבר כדי להשתתף.");
  if (u.banned) return fail(403, "banned", "החשבון הושעה בשל הפרת כללי הקהילה.");
  return u;
}

const isNewUser = (u: User) => now() - u.created_at < DAY;

async function recentPosts(env: Env, uid: string, ms: number) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM content_index WHERE user_id=? AND created_at>?").bind(uid, now() - ms).first<{ n: number }>();
  return r?.n ?? 0;
}

// ---------- handlers ----------
async function panel(req: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const r = await resolve(env, {
    url: url.searchParams.get("url"), canonical: url.searchParams.get("canonical"), title: url.searchParams.get("title"),
    scope: url.searchParams.get("scope"), optout: url.searchParams.get("optout"),
  });
  if (r instanceof Response) return r;
  const base = { page: { id: r.pageId, url: r.c.canonical, display: r.c.display, host: r.c.host, site: r.c.site }, siteId: r.siteId, roomId: r.roomId, scope: r.scope };
  if (r.rule.disabled || r.sensitive) return json({ ...base, disabled: r.sensitive || "domain" });

  const token = tokenFrom(req, url);
  const viewer = token ? await getUser(env, token) : null;
  const sort = url.searchParams.get("sort") === "top" ? "top" : "new";

  // anonymous bundles are edge-cached for 10s per room
  const cacheKey = new Request(`https://cache.addmedia/panel/${r.roomId}/${r.scope}/${sort}/${r.c.site}`);
  if (!viewer) {
    const hit = await caches.default.match(cacheKey);
    if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...CORS } });
  }

  const other = r.scope === "page" ? r.siteId : r.pageId;
  const [main, side, ads] = await Promise.all([
    room(env, r.roomId).bundle({ viewer: viewer?.id, sort }),
    room(env, other).bundle({ limit: 1 }),
    adsFor(env, r),
  ]);
  const settings = publicSettings(await getSettings(env));
  const body = {
    ...base,
    settings,
    rules: { comments: commentsAllowed(r), ads: !!(ads.top || ads.feed.length) },
    room: main,
    other: { scope: r.scope === "page" ? "site" : "page", presence: side.presence, postCount: side.postCount, chat: side.chat.slice(-3) },
    ads,
    me: viewer ? publicUser(viewer) : null,
  };
  const res = json(body, 200, { "Cache-Control": "public, max-age=0, s-maxage=10" });
  if (!viewer) ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  return res;
}

async function websocket(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.headers.get("Upgrade") !== "websocket") return fail(426, "upgrade", "WebSocket נדרש.");
  const r = await resolve(env, { url: url.searchParams.get("url"), canonical: url.searchParams.get("canonical"), title: url.searchParams.get("title"), scope: url.searchParams.get("scope"), optout: url.searchParams.get("optout") });
  if (r instanceof Response) return r;
  if (r.rule.disabled || r.sensitive) return fail(403, "disabled", "הפאנל כבוי בדף הזה.");
  const u = await getUser(env, tokenFrom(req, url));
  const headers = new Headers(req.headers);
  if (u && !u.banned) {
    headers.set("X-Uid", u.id);
    headers.set("X-Name", encodeURIComponent(u.display_name));
    headers.set("X-New", isNewUser(u) ? "1" : "0");
    headers.set("X-Can-Post", u.terms_accepted_at && commentsAllowed(r) ? "1" : "0");
  }
  headers.set("X-Meta", encodeURIComponent(JSON.stringify(r.meta)));
  const fwd = new URL(req.url);
  fwd.search = `?after=${Number(url.searchParams.get("after") || 0)}`;
  return room(env, r.roomId).fetch(new Request(fwd.toString(), { headers }));
}

async function createPost(req: Request, env: Env, url: URL): Promise<Response> {
  const u = await requireUser(env, req, url);
  if (u instanceof Response) return u;
  if (!u.terms_accepted_at) return fail(403, "terms", "יש לאשר את כללי הקהילה לפני הפרסום הראשון.");
  const b = await readJson(req);
  const r = await resolve(env, b);
  if (r instanceof Response) return r;
  if (!commentsAllowed(r)) return fail(403, "disabled", "התגובות כבויות בדף הזה.");
  const text = clampStr(b.body, 2000);
  if (text.length < 2) return fail(400, "empty", "התגובה קצרה מדי.");
  if ((await recentPosts(env, u.id, 60_000)) >= 3) return fail(429, "rate", "רגע, לאט יותר. אפשר לפרסם עד 3 תגובות בדקה.");
  const v = await checkPost(env, text, { isNew: isNewUser(u) });
  if (!v.ok) {
    await modLog(env, { actor: "auto", action: "block_text", target_type: "user", target_id: u.id, room_id: r.roomId, reason: v.code });
    return fail(422, v.code, v.message);
  }
  const post = await room(env, r.roomId).addPost({ uid: u.id, name: u.display_name, kind: "text", body: text, parentId: clampStr(b.parentId, 40) || null, meta: r.meta, ttlDays: (await getSettings(env)).retentionDays });
  await env.DB.prepare("INSERT INTO content_index (item_id, user_id, room_id, kind, created_at, expires_at) VALUES (?,?,?,?,?,?)").bind(post.id, u.id, r.roomId, "text", now(), post.expiresAt).run();
  return json({ post });
}

const MAGIC: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]],
];

async function uploadMedia(req: Request, env: Env, url: URL): Promise<Response> {
  const u = await requireUser(env, req, url);
  if (u instanceof Response) return u;
  if (!u.terms_accepted_at) return fail(403, "terms", "יש לאשר את כללי הקהילה לפני הפרסום הראשון.");
  if (isNewUser(u) && !isTrue(env.TEST_PURCHASES)) return fail(403, "new_account_media", "חשבונות חדשים יכולים להעלות מדיה אחרי 24 שעות.");
  const r = await resolve(env, { url: url.searchParams.get("url"), canonical: url.searchParams.get("canonical"), title: url.searchParams.get("title"), scope: url.searchParams.get("scope") });
  if (r instanceof Response) return r;
  if (!commentsAllowed(r)) return fail(403, "disabled", "פרסום כבוי בדף הזה.");
  const settings = await getSettings(env);
  // the first N images are free (operator setting); after that, credits
  const used = await env.DB.prepare("SELECT COUNT(*) n FROM content_index WHERE user_id=? AND kind='image'").bind(u.id).first<{ n: number }>();
  const free = (used?.n ?? 0) < settings.freeMedia;
  let link: string | null = null;
  const rawLink = clampStr(url.searchParams.get("link"), 1000);
  if (rawLink) {
    if (!settings.linkMedia) return fail(400, "no_links", "תמונות-קישור כבויות כרגע.");
    try {
      const lu = new URL(rawLink);
      if (lu.protocol !== "https:" && lu.protocol !== "http:") throw 0;
      if (isSensitive(canonicalize(lu.href) || ({} as any))) throw 0;
      link = lu.href;
    } catch {
      return fail(400, "bad_link", "כתובת הקישור לא תקינה.");
    }
  }
  if (!free && u.credits_media < 1) return fail(402, "no_credits", "ניצלת את ההעלאות החינמיות. אפשר לרכוש חבילה בחלון המדיה שלי.");
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > 1_100_000) return fail(413, "too_big", "התמונה גדולה מדי (עד 1MB אחרי דחיסה).");
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > 1_100_000 || bytes.byteLength < 100) return fail(413, "too_big", "התמונה גדולה מדי (עד 1MB אחרי דחיסה).");
  const head = new Uint8Array(bytes.slice(0, 12));
  const type = MAGIC.find(([, sig]) => sig.every((b, i) => head[i] === b))?.[0];
  if (!type || (type === "image/webp" && String.fromCharCode(...head.slice(8, 12)) !== "WEBP")) return fail(415, "bad_type", "סוג קובץ לא נתמך. אפשר להעלות JPEG, PNG או WebP.");

  const caption = clampStr(url.searchParams.get("caption"), 300);
  if (caption) {
    const cv = await checkText(env, caption, { isNew: isNewUser(u) });
    if (!cv.ok) return fail(422, cv.code, cv.message);
  }
  const iv = await checkImage(env, bytes, type);
  if (!iv.ok) {
    await modLog(env, { actor: "auto", action: "block_image", target_type: "user", target_id: u.id, room_id: r.roomId, reason: iv.code });
    return fail(422, iv.code, iv.message);
  }
  const review = "review" in iv && iv.review;

  const ext = type.split("/")[1];
  const key = `${r.roomId}/${randomId(12)}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { uid: u.id } });
  if (!free) {
    const spent = await env.DB.prepare("UPDATE users SET credits_media=credits_media-1 WHERE id=? AND credits_media>=1").bind(u.id).run();
    if (!spent.meta.changes) {
      await env.MEDIA.delete(key);
      return fail(402, "no_credits", "אין לך יתרת העלאות.");
    }
  }
  const post = await room(env, r.roomId).addPost({ uid: u.id, name: u.display_name, kind: "image", body: caption, mediaKey: key, meta: r.meta, status: review ? "review" : "visible", link, ttlDays: settings.retentionDays });
  await env.DB.prepare("INSERT INTO content_index (item_id, user_id, room_id, kind, created_at, expires_at) VALUES (?,?,?,?,?,?)").bind(post.id, u.id, r.roomId, "image", now(), post.expiresAt).run();
  return json({ post, review, credits: free ? u.credits_media : u.credits_media - 1, free });
}

const REASONS = new Set(["spam", "harassment", "hate", "violence", "sexual", "intimate", "minor", "privacy", "copyright", "other"]);

async function report(req: Request, env: Env, url: URL): Promise<Response> {
  const viewer = await getUser(env, tokenFrom(req, url));
  const b = await readJson(req);
  const roomId = clampStr(b.roomId, 30);
  const itemType = b.itemType === "chat" ? "chat" : "post";
  const itemId = clampStr(b.itemId, 40);
  const reason = REASONS.has(b.reason) ? b.reason : "other";
  if (!ROOM_RE.test(roomId) || !itemId) return fail(400, "bad_report", "דיווח לא תקין.");
  if (viewer) {
    const dup = await env.DB.prepare("SELECT 1 FROM reports WHERE item_id=? AND reporter_id=?").bind(itemId, viewer.id).first();
    if (dup) return json({ ok: true, duplicate: true });
  }
  const res = await room(env, roomId).report(itemType, itemId);
  if (!res.found) return fail(404, "not_found", "התוכן כבר לא קיים.");
  const priority = reason === "intimate" || reason === "minor" ? 2 : reason === "violence" || reason === "hate" ? 1 : 0;
  const id = "r_" + randomId(10);
  await env.DB.prepare("INSERT INTO reports (id, room_id, item_type, item_id, reporter_id, reason, details, priority, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, roomId, itemType, itemId, viewer?.id ?? null, reason, clampStr(b.details, 500) || null, priority, now())
    .run();
  if (res.hidden) await modLog(env, { actor: "auto", action: "auto_hide", target_type: itemType, target_id: itemId, room_id: roomId, report_id: id, reason: "3 reports" });
  return json({ ok: true, hidden: res.hidden, sla: priority === 2 ? "48h" : "24h" });
}

async function checkout(req: Request, env: Env, url: URL): Promise<Response> {
  const u = await requireUser(env, req, url);
  if (u instanceof Response) return u;
  const b = await readJson(req);
  const p = PRODUCTS.find((x) => x.id === b.product);
  if (!p) return fail(400, "bad_product", "מוצר לא קיים.");
  if (!isTrue(env.TEST_PURCHASES)) return fail(501, "payments_soon", "התשלום יחובר בקרוב. בינתיים אפשר להשתמש בגרסה החינמית.");
  if (p.kind === "media") {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET credits_media=credits_media+? WHERE id=?").bind(p.qty, u.id),
      env.DB.prepare("INSERT INTO purchases (id, user_id, product, amount_agorot, provider, created_at) VALUES (?,?,?,?,?,?)").bind("pu_" + randomId(10), u.id, p.id, p.price, "test", now()),
    ]);
    return json({ ok: true, test: true, credits: u.credits_media + p.qty });
  }
  const roomId = clampStr(b.roomId, 30);
  const postId = clampStr(b.postId, 40);
  if (!ROOM_RE.test(roomId) || !postId) return fail(400, "bad_target", "יש לבחור פריט להצמדה.");
  const res = await room(env, roomId).pin(postId, u.id, p.days);
  if (!res.ok) return fail(403, "not_owner", "אפשר להצמיד רק פריט שלך שעדיין פעיל.");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO purchases (id, user_id, product, amount_agorot, provider, created_at) VALUES (?,?,?,?,?,?)").bind("pu_" + randomId(10), u.id, p.id, p.price, "test", now()),
    env.DB.prepare("UPDATE content_index SET expires_at=? WHERE item_id=?").bind(res.post!.expiresAt, postId),
  ]);
  return json({ ok: true, test: true, post: res.post });
}

async function me(req: Request, env: Env, url: URL): Promise<Response> {
  const u = await requireUser(env, req, url);
  if (u instanceof Response) return u;
  if (req.method === "GET") {
    const items = (await env.DB.prepare("SELECT item_id, room_id, kind, created_at, expires_at FROM content_index WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(u.id).all()).results;
    const blocks = (await env.DB.prepare("SELECT blocked_id FROM blocks WHERE user_id=?").bind(u.id).all<any>()).results.map((x) => x.blocked_id);
    return json({ user: publicUser(u), items, blocks });
  }
  if (req.method === "POST") {
    const b = await readJson(req);
    if (b.name !== undefined) {
      const name = clampStr(b.name, 24).replace(/\s+/g, " ");
      if (name.length < 2) return fail(400, "bad_name", "השם קצר מדי.");
      const v = await checkText(env, name, { isNew: true });
      if (!v.ok) return fail(422, v.code, "השם לא עומד בכללי הקהילה.");
      await env.DB.prepare("UPDATE users SET display_name=? WHERE id=?").bind(name, u.id).run();
    }
    if (b.acceptTerms) await env.DB.prepare("UPDATE users SET terms_accepted_at=? WHERE id=? AND terms_accepted_at IS NULL").bind(now(), u.id).run();
    const fresh = (await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(u.id).first<User>())!;
    return json({ user: publicUser(fresh) });
  }
  if (req.method === "DELETE") {
    // right to erasure: remove the user's content from every room, then the account
    const rooms = (await env.DB.prepare("SELECT DISTINCT room_id FROM content_index WHERE user_id=?").bind(u.id).all<any>()).results;
    await Promise.all(rooms.map((r) => room(env, r.room_id).deleteUserContent(u.id)));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM content_index WHERE user_id=?").bind(u.id),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(u.id),
      env.DB.prepare("DELETE FROM blocks WHERE user_id=? OR blocked_id=?").bind(u.id, u.id),
      env.DB.prepare("DELETE FROM users WHERE id=?").bind(u.id),
    ]);
    return json({ ok: true });
  }
  return fail(405, "method", "Method not allowed");
}

async function block(req: Request, env: Env, url: URL): Promise<Response> {
  const u = await requireUser(env, req, url);
  if (u instanceof Response) return u;
  const b = await readJson(req);
  const target = clampStr(b.userId, 40);
  if (!target || target === u.id) return fail(400, "bad_user", "משתמש לא תקין.");
  if (b.unblock) await env.DB.prepare("DELETE FROM blocks WHERE user_id=? AND blocked_id=?").bind(u.id, target).run();
  else await env.DB.prepare("INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?,?,?)").bind(u.id, target, now()).run();
  return json({ ok: true });
}

async function roomAction(req: Request, env: Env, url: URL, roomId: string, rest: string[]): Promise<Response> {
  if (!ROOM_RE.test(roomId)) return fail(400, "bad_room", "חדר לא תקין.");
  if (rest[0] === "posts" && req.method === "GET") {
    const viewer = await getUser(env, tokenFrom(req, url));
    return json(await room(env, roomId).listPosts({ before: Number(url.searchParams.get("before")) || undefined, kind: url.searchParams.get("kind") || "text", viewer: viewer?.id }));
  }
  if (rest[0] === "posts" && rest[1] && !rest[2] && req.method === "DELETE") {
    const u = await requireUser(env, req, url);
    if (u instanceof Response) return u;
    const r = await room(env, roomId).deleteOwn(rest[1], u.id);
    if (!r.ok) return fail(403, "not_owner", "אפשר למחוק רק פריט שלך.");
    await env.DB.prepare("DELETE FROM content_index WHERE item_id=? AND user_id=?").bind(rest[1], u.id).run();
    return json({ ok: true });
  }
  if (rest[0] === "posts" && rest[2] === "like" && req.method === "POST") {
    const u = await requireUser(env, req, url);
    if (u instanceof Response) return u;
    return json(await room(env, roomId).toggleLike(rest[1], u.id));
  }
  return fail(404, "not_found", "נתיב לא קיים.");
}

const CONTACT_KINDS = new Set(["takedown", "publisher", "privacy", "accessibility", "other"]);
async function contact(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const email = clampStr(b.email, 254);
  const message = clampStr(b.message, 4000);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail(400, "bad_email", "כתובת המייל לא תקינה.");
  if (message.length < 10) return fail(400, "short", "נא לפרט מעט יותר.");
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM contact_requests WHERE email=? AND created_at>?").bind(email, now() - 3600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return fail(429, "too_many", "נשלחו יותר מדי פניות. נסו שוב בעוד שעה.");
  const id = "c_" + randomId(10);
  await env.DB.prepare("INSERT INTO contact_requests (id, kind, name, email, url, message, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(id, CONTACT_KINDS.has(b.kind) ? b.kind : "other", clampStr(b.name, 80) || null, email, clampStr(b.url, 1000) || null, message, now())
    .run();
  console.log("contact", id, ip.slice(0, 3));
  return json({ ok: true, id });
}

async function serveMedia(env: Env, key: string): Promise<Response> {
  if (!/^[ps]_[A-Za-z0-9_-]{22}\/[A-Za-z0-9_-]{16}\.(jpeg|png|webp)$/.test(key)) return new Response("not found", { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("ETag", obj.httpEtag);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Content-Security-Policy", "default-src 'none'");
  h.set("Access-Control-Allow-Origin", "*");
  return new Response(obj.body, { headers: h });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (p === "/v1/health") return json({ ok: true, at: now(), v: VERSION });
      if (p === "/v1/debug") return await debugPage(req, env, url);
      if (p === "/v1/directory") {
        const campus = url.searchParams.get("campus");
        const d = env.DIRECTORY.get(env.DIRECTORY.idFromName("global"));
        return json(await d.list({ campus: campus === null ? undefined : campus === "1" }), 200, { "Cache-Control": "public, max-age=0, s-maxage=5" });
      }
      if (p === "/v1/campus/tree") return json(campusTree(), 200, { "Cache-Control": "public, max-age=3600" });
      if (p === "/v1/campus/docs" && req.method === "GET") {
        const place = placeOf({ inst: url.searchParams.get("inst"), faculty: url.searchParams.get("faculty"), year: url.searchParams.get("year"), course: url.searchParams.get("course") });
        if (!place) return fail(400, "bad_place", "יש לבחור מוסד, פקולטה ושנה.");
        return json({ docs: await listDocs(env, place, url.searchParams.get("kind")), place, title: placeTitle(place), url: placeUrl(place) });
      }
      if (p === "/v1/campus/docs" && req.method === "POST") {
        const u = await requireUser(env, req, url);
        if (u instanceof Response) return u;
        if (!u.terms_accepted_at) return fail(403, "terms", "יש לאשר את כללי הקהילה לפני הפרסום הראשון.");
        return await uploadDoc(req, env, url, u);
      }
      const dm = p.match(/^\/v1\/campus\/docs\/([A-Za-z0-9_-]{4,40})(\/file)?$/);
      if (dm && dm[2]) return await docFile(env, dm[1]);
      if (dm && req.method === "DELETE") return await deleteDoc(env, dm[1], await getUser(env, tokenFrom(req, url)));
      if (p === "/v1/me/follows" && req.method === "GET") {
        const u = await requireUser(env, req, url);
        if (u instanceof Response) return u;
        return json({ follows: await listFollows(env, u.id) });
      }
      if (p === "/v1/me/follows" && req.method === "POST") return await follow(req, env, url);
      if (p === "/v1/debug/via") return await debugVia(req, env, url);
      if (p === "/v1/panel" && req.method === "GET") return await panel(req, env, url, ctx);
      if (p === "/v1/ws") return await websocket(req, env, url);
      if (p === "/v1/posts" && req.method === "POST") return await createPost(req, env, url);
      if (p === "/v1/media" && req.method === "POST") return await uploadMedia(req, env, url);
      if (p === "/v1/report" && req.method === "POST") return await report(req, env, url);
      if (p === "/v1/auth/start" && req.method === "POST") return await startAuth(env, await readJson(req));
      if (p === "/v1/auth/verify" && req.method === "POST") return await verifyAuth(env, await readJson(req));
      if (p === "/v1/auth/logout" && req.method === "POST") return await logout(env, tokenFrom(req, url));
      if (p === "/v1/me") return await me(req, env, url);
      if (p === "/v1/me/blocks" && req.method === "POST") return await block(req, env, url);
      if (p === "/v1/contact" && req.method === "POST") return await contact(req, env);
      if (p === "/v1/store/products") return json({ products: PRODUCTS, testMode: isTrue(env.TEST_PURCHASES) });
      if (p === "/v1/store/checkout" && req.method === "POST") return await checkout(req, env, url);
      if (p.startsWith("/v1/admin")) return await handleAdmin(req, env, url);
      const ad = p.match(/^\/v1\/ads\/([A-Za-z0-9_-]{4,40})\/click$/);
      if (ad) {
        const row = await env.DB.prepare("SELECT url FROM ads WHERE id=? AND active=1").bind(ad[1]).first<{ url: string }>();
        if (!row) return fail(404, "not_found", "המודעה לא קיימת.");
        ctx.waitUntil(env.DB.prepare("UPDATE ads SET clicks=clicks+1 WHERE id=?").bind(ad[1]).run());
        return Response.redirect(row.url, 302);
      }
      if (p === "/v1/ads/impressions" && req.method === "POST") {
        const b = await readJson(req);
        const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 10).map((x: unknown) => clampStr(x, 40));
        if (ids.length) ctx.waitUntil(env.DB.batch(ids.map((id: string) => env.DB.prepare("UPDATE ads SET impressions=impressions+1 WHERE id=?").bind(id))));
        return json({ ok: true });
      }
      const rm = p.match(/^\/v1\/room\/([^/]+)\/(.+)$/);
      if (rm) return await roomAction(req, env, url, rm[1], rm[2].split("/"));
      if (p.startsWith("/m/")) return await serveMedia(env, decodeURIComponent(p.slice(3)));
      if (p.startsWith("/v1/")) return fail(404, "not_found", "נתיב לא קיים.");
      // the media page: one app at /media/, with stable addresses for campus pages and sites (/media/campus/…, /media/site/…)
      if (req.method === "GET" && (p === "/media" || p.startsWith("/media/"))) {
        if (p === "/media") return Response.redirect(url.origin + "/media/" + url.search, 302);
        const r = await env.ASSETS.fetch(new Request(url.origin + "/panel/media.html", { headers: req.headers }));
        return new Response(r.body, { status: r.status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
      }
      return env.ASSETS.fetch(req);
    } catch (e: any) {
      console.error("unhandled", e?.stack || e);
      return fail(500, "server", "שגיאה זמנית בשרת. נסו שוב.");
    }
  },
} satisfies ExportedHandler<Env>;
