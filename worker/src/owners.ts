// Site owners. The owner of a site (eTLD+1) proves control of the domain, the operator approves, and from then on the
// owner manages the site's rooms: a pinned message, closing talkbacks or image uploads, hiding items in the site's rooms
// (shown openly as «החדר בניהול בעל האתר»), the site's numbers, and a referral badge that brings readers to the rooms.
// Everything an owner does is in the moderation log; the platform's own rules and takedowns still apply above them.
import { siteOf } from "./canon";
import { checkPost } from "./moderation";
import { getSettings } from "./settings";
import { DAY, Env, clampStr, fail, isTrue, json, now, randomId, readJson } from "./util";

export interface Owner {
  domain: string;
  user_id: string;
  claim_id: string | null;
  since: number;
  welcome: string | null;
  no_comments: number;
  no_media: number;
  ref_code: string | null;
  share_pct: number;
  updated_at: number;
}

const TOKEN_PREFIX = "inthepage-verify=";
const UA = "InThePage-Verify/1.0 (+https://inthepage.com/publishers/)";

// ---------- lookups (cached per isolate) ----------
let ownersCache: { at: number; map: Map<string, Owner> } | null = null;
export function invalidateOwners() {
  ownersCache = null;
}
async function allOwners(env: Env): Promise<Map<string, Owner>> {
  if (!ownersCache || now() - ownersCache.at > 60_000) {
    const r = await env.DB.prepare("SELECT * FROM site_owners").all<Owner>().catch(() => ({ results: [] as Owner[] }));
    ownersCache = { at: now(), map: new Map((r.results || []).map((o) => [o.domain, o])) };
  }
  return ownersCache.map;
}
export async function ownerOf(env: Env, site: string): Promise<Owner | null> {
  return (await allOwners(env)).get(site) ?? null;
}

/** what every reader of the room sees about its owner */
export const ownerPublic = (o: Owner | null, viewerId?: string | null) =>
  o ? { uid: o.user_id, welcome: o.welcome || null, since: o.since, isMe: !!viewerId && viewerId === o.user_id } : null;

/** "https://www.Example.co.il/path" → "example.co.il" (the site whose rooms the owner manages) */
export function normalizeDomain(raw: unknown): string | null {
  let s = clampStr(raw, 300).trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z]+:\/\//.test(s)) s = "https://" + s;
  let host: string;
  try {
    host = new URL(s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host.length > 120) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  return siteOf(host);
}

const newRefCode = () => randomId(10).toLowerCase().replace(/[^a-z0-9]/g, "x");

// ---------- verification ----------
async function readText(url: string, max = 300_000): Promise<string | null> {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,text/plain,*/*" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok || !r.body) return null;
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let out = "";
    while (out.length < max) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    return out;
  } catch {
    return null;
  }
}

function metaHas(html: string, token: string): boolean {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return tags.some((t) => /name\s*=\s*["']?inthepage-verify["']?/i.test(t) && new RegExp(`content\\s*=\\s*["']?${token}["']?`, "i").test(t));
}

/** checks the three ways, in order: a meta tag on the home page, a file, a DNS TXT record */
async function verifyDomain(env: Env, domain: string, token: string, devBase?: string | null): Promise<string | null> {
  const bases = devBase && isTrue(env.DEV_MODE) ? [devBase.replace(/\/+$/, "")] : [`https://${domain}`, `https://www.${domain}`];
  for (const base of bases) {
    const html = await readText(base + "/");
    if (html && metaHas(html, token)) return "meta";
    const file = await readText(base + "/.well-known/inthepage-verify.txt", 2000);
    if (file && file.includes(token)) return "file";
  }
  if (!devBase) {
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=TXT`, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(6000) });
      const j: any = await r.json();
      if ((j.Answer || []).some((a: any) => String(a.data || "").replace(/"\s*"/g, "").replace(/"/g, "").includes(TOKEN_PREFIX + token))) return "dns";
    } catch {}
  }
  return null;
}

// ---------- grants ----------
async function grant(env: Env, domain: string, userId: string, claimId: string | null) {
  const prev = await env.DB.prepare("SELECT ref_code FROM site_owners WHERE domain=?").bind(domain).first<{ ref_code: string | null }>();
  await env.DB.prepare(
    `INSERT INTO site_owners (domain, user_id, claim_id, since, ref_code, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(domain) DO UPDATE SET user_id=excluded.user_id, claim_id=excluded.claim_id, since=excluded.since, updated_at=excluded.updated_at`,
  )
    .bind(domain, userId, claimId, now(), prev?.ref_code || newRefCode(), now())
    .run();
  // any other open claim on the domain is settled by this grant
  await env.DB.prepare("UPDATE site_claims SET status='rejected', note=COALESCE(note,'הבעלות הוענקה לטוען אחר'), decided_at=? WHERE domain=? AND id<>? AND status IN ('pending','verified')")
    .bind(now(), domain, claimId ?? "")
    .run();
  invalidateOwners();
}

async function logOwner(env: Env, actor: string, action: string, targetType: string, targetId: string, roomId: string | null, reason: string | null) {
  await env.DB.prepare("INSERT INTO moderation_log (id, at, actor, action, target_type, target_id, room_id, report_id, reason) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind("l_" + randomId(10), now(), actor, action, targetType, targetId, roomId, null, reason)
    .run();
}

// ---------- the owner's API (/v1/owner…) ----------
type Room = (id: string) => { getItem(type: "post" | "chat", id: string): Promise<any>; setStatus(type: "post" | "chat", id: string, status: any): Promise<any>; bundle(o: any): Promise<any> };
type SiteRoom = (domain: string) => Promise<string>;

export async function handleOwner(req: Request, env: Env, url: URL, user: { id: string; display_name: string }, deps: { room: Room; siteRoomId: SiteRoom }): Promise<Response> {
  const parts = url.pathname.replace(/^\/v1\/owner\/?/, "").split("/").filter(Boolean);
  const m = req.method;

  // everything of mine: sites I own (with numbers) and my claims
  if (parts.length === 0 && m === "GET") {
    const sites = ((await env.DB.prepare("SELECT * FROM site_owners WHERE user_id=? ORDER BY since").bind(user.id).all<Owner>()).results || []) as Owner[];
    const claims = (await env.DB.prepare("SELECT id, domain, token, status, method, note, created_at, verified_at, decided_at FROM site_claims WHERE user_id=? ORDER BY created_at DESC LIMIT 20").bind(user.id).all()).results;
    const out = await Promise.all(
      sites.map(async (o) => {
        const siteRoom = await deps.siteRoomId(o.domain);
        const b = await deps.room(siteRoom).bundle({ limit: 1 }).catch(() => null);
        const since = now() - 30 * DAY;
        const posts30 = await env.DB.prepare("SELECT SUM(kind IN ('text','ref')) AS posts, SUM(kind='image') AS media FROM content_index WHERE site=? AND created_at>?")
          .bind(o.domain, now() - 30 * DAY)
          .first<any>()
          .catch(() => null);
        const refs = o.ref_code
          ? await env.DB.prepare("SELECT SUM(kind='click') AS clicks, SUM(kind='signup') AS signups FROM referrals WHERE ref_code=? AND at>?").bind(o.ref_code, since).first<any>()
          : null;
        return {
          domain: o.domain, since: o.since, welcome: o.welcome, noComments: !!o.no_comments, noMedia: !!o.no_media, sharePct: o.share_pct,
          refCode: o.ref_code, stats: { presence: b?.presence ?? 0, posts30: posts30?.posts ?? 0, media30: posts30?.media ?? 0, clicks30: refs?.clicks ?? 0, signups30: refs?.signups ?? 0 },
        };
      }),
    );
    return json({ sites: out, claims, autoApprove: (await getSettings(env)).ownerAutoApprove });
  }

  // a new claim: the domain, and the token to place on it
  if (parts[0] === "claims" && parts.length === 1 && m === "POST") {
    const b = await readJson(req);
    const domain = normalizeDomain(b.domain);
    if (!domain) return fail(400, "bad_domain", "כתובת האתר לא תקינה. כתבו למשל example.co.il");
    const open = await env.DB.prepare("SELECT COUNT(*) n FROM site_claims WHERE user_id=? AND status IN ('pending','verified')").bind(user.id).first<{ n: number }>();
    if ((open?.n ?? 0) >= 5) return fail(429, "too_many", "יש לכם כבר 5 בקשות פתוחות. השלימו אותן קודם.");
    const mineAlready = await env.DB.prepare("SELECT * FROM site_claims WHERE user_id=? AND domain=? AND status IN ('pending','verified') ORDER BY created_at DESC").bind(user.id, domain).first<any>();
    const owner = await ownerOf(env, domain);
    if (owner?.user_id === user.id) return fail(409, "yours", "האתר כבר בבעלותכם.");
    if (mineAlready) return json({ claim: mineAlready, owned: !!owner });
    const claim = { id: "c_" + randomId(10), domain, token: randomId(20), status: "pending", contact: clampStr(b.contact, 300) || null, created_at: now() };
    await env.DB.prepare("INSERT INTO site_claims (id, domain, user_id, token, status, contact, created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(claim.id, domain, user.id, claim.token, claim.status, claim.contact, claim.created_at)
      .run();
    return json({ claim, owned: !!owner });
  }

  // check the claim's token on the domain
  if (parts[0] === "claims" && parts[1] && parts[2] === "verify" && m === "POST") {
    const c = await env.DB.prepare("SELECT * FROM site_claims WHERE id=? AND user_id=?").bind(parts[1], user.id).first<any>();
    if (!c) return fail(404, "not_found", "הבקשה לא נמצאה.");
    if (!["pending", "verified"].includes(c.status)) return fail(409, "closed", "הבקשה כבר נסגרה.");
    const method = await verifyDomain(env, c.domain, c.token, url.searchParams.get("devBase"));
    if (!method) return fail(422, "not_found_on_site", "לא מצאנו את קוד האימות באתר. בדקו שהוא במקום ונסו שוב (שינוי DNS יכול לקחת עד שעה).");
    await env.DB.prepare("UPDATE site_claims SET status='verified', method=?, verified_at=? WHERE id=?").bind(method, now(), c.id).run();
    const owner = await ownerOf(env, c.domain);
    if ((await getSettings(env)).ownerAutoApprove && !owner) {
      await env.DB.prepare("UPDATE site_claims SET status='approved', decided_at=? WHERE id=?").bind(now(), c.id).run();
      await grant(env, c.domain, user.id, c.id);
      await logOwner(env, "auto", "owner_grant", "site", c.domain, null, `verified by ${method}`);
      return json({ status: "approved", method });
    }
    return json({ status: "verified", method });
  }

  // the owner's settings for a site
  const site = parts[0] === "sites" && parts[1] ? normalizeDomain(decodeURIComponent(parts[1])) : null;
  if (site) {
    const o = await ownerOf(env, site);
    if (!o || o.user_id !== user.id) return fail(403, "not_owner", "רק בעל האתר יכול לנהל את החדר.");
    if (parts.length === 2 && (m === "PUT" || m === "POST")) {
      const b = await readJson(req);
      let welcome = b.welcome === undefined ? o.welcome : clampStr(b.welcome, 400).trim() || null;
      if (welcome && welcome !== o.welcome) {
        const v = await checkPost(env, welcome, { isNew: false });
        if (!v.ok) return fail(422, v.code, v.message);
      }
      await env.DB.prepare("UPDATE site_owners SET welcome=?, no_comments=?, no_media=?, updated_at=? WHERE domain=?")
        .bind(welcome, b.noComments === undefined ? o.no_comments : b.noComments ? 1 : 0, b.noMedia === undefined ? o.no_media : b.noMedia ? 1 : 0, now(), site)
        .run();
      invalidateOwners();
      await logOwner(env, "owner:" + user.id, "owner_settings", "site", site, null, null);
      return json({ ok: true });
    }
    // hide or restore an item in one of the site's rooms
    if (parts[2] === "items" && m === "POST") {
      const b = await readJson(req);
      const roomId = clampStr(b.roomId, 40);
      const itemType = b.itemType === "chat" ? "chat" : "post";
      const itemId = clampStr(b.itemId, 40);
      if (!roomId || !itemId) return fail(400, "bad_item", "חסר פריט.");
      const it = await deps.room(roomId).getItem(itemType, itemId).catch(() => null);
      if (!it) return fail(404, "not_found", "הפריט לא נמצא.");
      const roomDomain = String(it.meta?.domain || "");
      if (roomDomain !== site) return fail(403, "not_owner", "הפריט לא נמצא בחדרים של האתר שלכם.");
      if ((it.user_id ?? it.uid) === user.id) return fail(400, "own", "את מה שכתבתם אפשר פשוט למחוק.");
      const restore = !!b.restore;
      if (restore && it.status !== "owner_hidden") return fail(409, "not_hidden", "הפריט לא הוסתר על ידי בעל האתר.");
      if (!restore && it.status !== "visible") return fail(409, "not_visible", "הפריט כבר לא גלוי.");
      await deps.room(roomId).setStatus(itemType, itemId, restore ? "visible" : "owner_hidden");
      await logOwner(env, "owner:" + user.id, restore ? "owner_restore" : "owner_hide", itemType, itemId, roomId, clampStr(b.reason, 300) || null);
      return json({ ok: true });
    }
  }
  return fail(404, "not_found", "נתיב לא קיים.");
}

// ---------- the operator (/v1/admin/owners…, called from admin.ts) ----------
export async function handleAdminOwners(req: Request, env: Env, parts: string[], log: (e: { action: string; target_type: string; target_id: string; reason?: string | null }) => Promise<void>): Promise<Response> {
  const m = req.method;
  const [res, id, verb] = parts;
  if (res === "owners" && !id && m === "GET") {
    const owners = (await env.DB.prepare(
      "SELECT o.*, u.display_name, u.email FROM site_owners o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.since DESC",
    ).all()).results;
    const claims = (await env.DB.prepare(
      `SELECT c.*, u.display_name, u.email FROM site_claims c LEFT JOIN users u ON u.id=c.user_id
       ORDER BY CASE c.status WHEN 'verified' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, c.created_at DESC LIMIT 100`,
    ).all()).results;
    return json({ owners, claims });
  }
  // grant by hand: a partner who cannot place a tag (the operator checked the ownership another way)
  if (res === "owners" && !id && m === "POST") {
    const b = await readJson(req);
    const domain = normalizeDomain(b.domain);
    if (!domain) return fail(400, "bad_domain", "דומיין לא תקין.");
    const uid = clampStr(b.userId, 40);
    const user = uid ? await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(uid).first<{ id: string }>() : null;
    if (!user) return fail(404, "no_user", "המשתמש לא נמצא (העתיקו את המזהה מלשונית המשתמשים).");
    const cid = "c_" + randomId(10);
    await env.DB.prepare("INSERT INTO site_claims (id, domain, user_id, token, status, method, note, created_at, decided_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(cid, domain, user.id, randomId(20), "approved", "admin", clampStr(b.note, 300) || null, now(), now())
      .run();
    await grant(env, domain, user.id, cid);
    if (b.sharePct !== undefined) await env.DB.prepare("UPDATE site_owners SET share_pct=? WHERE domain=?").bind(Math.max(0, Math.min(90, Math.round(Number(b.sharePct) || 0))), domain).run();
    await log({ action: "owner_grant", target_type: "site", target_id: domain, reason: clampStr(b.note, 300) || "by hand" });
    return json({ ok: true, domain });
  }
  if (res === "owners" && id && (m === "PUT" || m === "POST")) {
    const domain = normalizeDomain(decodeURIComponent(id));
    const b = await readJson(req);
    if (!domain) return fail(400, "bad_domain", "דומיין לא תקין.");
    await env.DB.prepare("UPDATE site_owners SET share_pct=?, updated_at=? WHERE domain=?").bind(Math.max(0, Math.min(90, Math.round(Number(b.sharePct) || 0))), now(), domain).run();
    invalidateOwners();
    await log({ action: "owner_share", target_type: "site", target_id: domain, reason: `${b.sharePct}%` });
    return json({ ok: true });
  }
  if (res === "owners" && id && m === "DELETE") {
    const domain = normalizeDomain(decodeURIComponent(id));
    if (!domain) return fail(400, "bad_domain", "דומיין לא תקין.");
    const o = await env.DB.prepare("SELECT claim_id FROM site_owners WHERE domain=?").bind(domain).first<{ claim_id: string | null }>();
    await env.DB.prepare("DELETE FROM site_owners WHERE domain=?").bind(domain).run();
    if (o?.claim_id) await env.DB.prepare("UPDATE site_claims SET status='revoked', decided_at=? WHERE id=?").bind(now(), o.claim_id).run();
    invalidateOwners();
    await log({ action: "owner_revoke", target_type: "site", target_id: domain, reason: null });
    return json({ ok: true });
  }
  if (res === "claims" && id && (verb === "approve" || verb === "reject") && m === "POST") {
    const b = await readJson(req);
    const c = await env.DB.prepare("SELECT * FROM site_claims WHERE id=?").bind(id).first<any>();
    if (!c) return fail(404, "not_found", "הבקשה לא נמצאה.");
    if (!["pending", "verified"].includes(c.status)) return fail(409, "closed", "הבקשה כבר נסגרה.");
    const note = clampStr(b.note, 300) || null;
    if (verb === "approve") {
      if (c.status !== "verified" && !b.force) return fail(409, "unverified", "הבעלות עוד לא אומתה באתר. לאישור בכל זאת סמנו «אישור בלי אימות».");
      await env.DB.prepare("UPDATE site_claims SET status='approved', note=?, decided_at=? WHERE id=?").bind(note, now(), id).run();
      await grant(env, c.domain, c.user_id, id);
      await log({ action: "owner_grant", target_type: "site", target_id: c.domain, reason: note || (c.method ? `verified by ${c.method}` : "unverified, by hand") });
    } else {
      await env.DB.prepare("UPDATE site_claims SET status='rejected', note=?, decided_at=? WHERE id=?").bind(note, now(), id).run();
      await log({ action: "owner_reject", target_type: "site", target_id: c.domain, reason: note });
    }
    return json({ ok: true });
  }
  return fail(404, "not_found", "נתיב ניהול לא קיים.");
}

// ---------- referrals and the badge ----------
/** /r/<code>: counts the click and leads to the install page, which remembers the code for the sign-up */
export async function referralRedirect(env: Env, code: string, ctx: ExecutionContext): Promise<Response> {
  const c = code.toLowerCase();
  const o = /^[a-z0-9]{6,16}$/.test(c) ? await env.DB.prepare("SELECT domain FROM site_owners WHERE ref_code=?").bind(c).first<{ domain: string }>() : null;
  if (o) ctx.waitUntil(env.DB.prepare("INSERT INTO referrals (id, ref_code, kind, at) VALUES (?,?,?,?)").bind("r_" + randomId(10), c, "click", now()).run());
  return new Response(null, { status: 302, headers: { Location: o ? `/get/?ref=${c}&site=${encodeURIComponent(o.domain)}` : "/get/", "Cache-Control": "no-store" } });
}

/** a sign-up that came through an owner's link: remembered on the new account */
export async function recordSignup(env: Env, userId: string, ref: unknown) {
  const c = clampStr(ref, 16).toLowerCase();
  if (!/^[a-z0-9]{6,16}$/.test(c)) return;
  const o = await env.DB.prepare("SELECT domain FROM site_owners WHERE ref_code=?").bind(c).first();
  if (!o) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET referred_by=? WHERE id=? AND referred_by IS NULL").bind(c, userId),
    env.DB.prepare("INSERT INTO referrals (id, ref_code, kind, user_id, at) VALUES (?,?,?,?,?)").bind("r_" + randomId(10), c, "signup", userId, now()),
  ]);
}

const escXml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);

/** /v1/badge/<code>.svg: the owner's badge for the site, with the number of readers in the site's room now */
export async function badgeSvg(env: Env, code: string, deps: { room: Room; siteRoomId: SiteRoom }): Promise<Response> {
  const c = code.toLowerCase();
  const o = /^[a-z0-9]{6,16}$/.test(c) ? await env.DB.prepare("SELECT domain FROM site_owners WHERE ref_code=?").bind(c).first<{ domain: string }>() : null;
  let n = 0;
  if (o) {
    const b = await deps.room(await deps.siteRoomId(o.domain)).bundle({ limit: 1 }).catch(() => null);
    n = Number(b?.presence || 0);
  }
  const label = n > 0 ? `${n} קוראים מדברים עכשיו` : "הצטרפו לשיחה על הדף";
  // width: about 8 px a character at 13 px semibold, plus the dot (left) and the mark (right)
  const W = Math.round(30 + label.length * 8 + 40);
  const tx = Math.round((28 + (W - 36)) / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="32" viewBox="0 0 ${W} 32" role="img" aria-label="InThePage: ${escXml(label)}">
<rect width="${W}" height="32" rx="16" fill="#5B2EF0"/>
<circle cx="16" cy="16" r="4" fill="${n > 0 ? "#3DDC97" : "#D9CFFF"}"/>
<text x="${tx}" y="21" text-anchor="middle" font-family="Rubik, Arial, sans-serif" font-size="13" font-weight="600" fill="#fff">${escXml(label)}</text>
<g transform="translate(${W - 30} 6) scale(0.625)"><path d="M9 5h10l5 5v15a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="#fff"/><circle cx="22.5" cy="22.5" r="6.2" fill="#FF7A2F" stroke="#5B2EF0" stroke-width="2"/></g>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=30, s-maxage=30", "Access-Control-Allow-Origin": "*" } });
}
