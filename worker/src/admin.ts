// Moderation & operations API for the operator. Protected by ADMIN_TOKEN (Bearer).
import { applyTakedown, deleteDoc, deleteEvent, grantPlan, listTakedowns, restoreTakedown } from "./campus";
import { invalidateTerms } from "./moderation";
import { getSettings, putSettings } from "./settings";
import { Env, clampStr, fail, json, now, randomId, readJson } from "./util";

const room = (env: Env, id: string) => env.ROOMS.get(env.ROOMS.idFromName(id));
const USER_COLS = "SELECT u.id, u.display_name, u.created_at, u.banned, u.credits_media, u.strikes, u.email, u.campus_until, s.full_name, s.inst, s.faculty, s.faculty2, s.year, s.track FROM users u LEFT JOIN student_profiles s ON s.user_id=u.id";

async function log(env: Env, e: { action: string; target_type: string; target_id: string; room_id?: string | null; report_id?: string | null; reason?: string | null; actor?: string }) {
  await env.DB.prepare(
    "INSERT INTO moderation_log (id, at, actor, action, target_type, target_id, room_id, report_id, reason) VALUES (?,?,?,?,?,?,?,?,?)",
  )
    .bind("l_" + randomId(10), now(), e.actor || "admin", e.action, e.target_type, e.target_id, e.room_id ?? null, e.report_id ?? null, e.reason ?? null)
    .run();
}
export { log as modLog };

export async function handleAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  const auth = req.headers.get("Authorization") || "";
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return fail(401, "unauthorized", "נדרש טוקן ניהול.");
  const parts = url.pathname.replace(/^\/v1\/admin\/?/, "").split("/").filter(Boolean);
  const [res, id] = parts;
  const m = req.method;

  if (res === "settings" && m === "GET") return json({ settings: await getSettings(env) });
  if (res === "settings" && m === "POST") {
    const b = await readJson(req);
    const s = await putSettings(env, b);
    await log(env, { action: "settings", target_type: "settings", target_id: "main", reason: Object.keys(b).join(",") });
    return json({ settings: s });
  }
  if (res === "docs" && m === "GET") {
    const rows = (await env.DB.prepare(
      `SELECT d.id, d.user_id, d.user_name, d.inst, d.faculty, d.year, d.course, d.kind, d.title, d.chars, d.created_at, d.updated_at, d.status, d.link_url,
              u.strikes AS strikes, u.email AS email, u.campus_until AS campus_until, s.full_name AS full_name, s.inst AS s_inst, s.faculty AS s_faculty, s.year AS s_year, s.track AS track, d.lecturer_name, d.lesson_date, d.lesson_no
       FROM campus_docs d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN student_profiles s ON s.user_id=d.user_id ORDER BY d.created_at DESC LIMIT 100`,
    ).all<any>()).results || [];
    return json({ docs: rows });
  }
  if (res === "campus") {
    const [, sub, cid, verb] = parts;
    if (sub === "takedowns" && m === "GET") return json({ takedowns: await listTakedowns(env) });
    if (sub === "grant" && m === "POST") {
      // the campus plan by hand, until a payment provider is wired
      const b = await readJson(req);
      const uid = clampStr(b.userId, 40);
      const days = Math.max(1, Math.min(3650, Number(b.days) || 182));
      if (!uid) return fail(400, "bad_user", "חסר משתמש.");
      const until = await grantPlan(env, uid, days);
      await log(env, { action: "grant_campus", target_type: "user", target_id: uid, reason: `${days} days` });
      return json({ ok: true, campusUntil: until });
    }
    if (sub === "takedown" && cid && verb === "apply" && m === "POST") return await applyTakedown(env, cid, await readJson(req));
    if (sub === "takedown" && cid && verb === "restore" && m === "POST") return await restoreTakedown(env, cid);
    if (sub === "events" && cid && m === "DELETE") {
      await log(env, { action: "remove_event", target_type: "event", target_id: cid });
      return await deleteEvent(env, cid, null, true);
    }
  }
  if (res === "docs" && m === "DELETE" && id) {
    await log(env, { action: "remove_doc", target_type: "doc", target_id: id });
    return await deleteDoc(env, id, null, true);
  }

  if (res === "stats") {
    const [u, r, a, l] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) n FROM users").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM reports WHERE status='open'").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM ads WHERE active=1").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) n FROM reports WHERE status='open' AND priority>=2").first<{ n: number }>(),
    ]);
    return json({ users: u?.n ?? 0, openReports: r?.n ?? 0, urgentReports: l?.n ?? 0, activeAds: a?.n ?? 0 });
  }

  if (res === "reports" && m === "GET") {
    const status = url.searchParams.get("status") === "resolved" ? "resolved" : "open";
    const rows = (await env.DB.prepare(
      `SELECT room_id, item_type, item_id, MAX(priority) AS priority, COUNT(*) AS n, MIN(created_at) AS first_at,
              GROUP_CONCAT(reason) AS reasons, GROUP_CONCAT(id) AS ids, MAX(details) AS details
       FROM reports WHERE status=? GROUP BY room_id, item_type, item_id ORDER BY priority DESC, first_at ASC LIMIT 50`,
    ).bind(status).all()).results as any[];
    const items = await Promise.all(
      rows.map(async (r) => ({ ...r, item: await room(env, r.room_id).getItem(r.item_type, r.item_id).catch(() => null) })),
    );
    return json({ reports: items });
  }

  if (res === "reports" && m === "POST") {
    // id = comma-joined report ids for one item
    const b = await readJson(req);
    const action = b.action as "hide" | "restore" | "dismiss";
    const note = clampStr(b.note, 500) || null;
    const first = await env.DB.prepare("SELECT * FROM reports WHERE id=?").bind(id).first<any>();
    if (!first) return fail(404, "not_found", "הדיווח לא נמצא.");
    if (action === "hide") await room(env, first.room_id).setStatus(first.item_type, first.item_id, "removed");
    if (action === "restore") await room(env, first.room_id).setStatus(first.item_type, first.item_id, "visible");
    await env.DB.prepare("UPDATE reports SET status='resolved', resolved_at=? WHERE room_id=? AND item_type=? AND item_id=? AND status='open'")
      .bind(now(), first.room_id, first.item_type, first.item_id)
      .run();
    await log(env, { action, target_type: first.item_type, target_id: first.item_id, room_id: first.room_id, report_id: id, reason: note });
    return json({ ok: true });
  }

  if (res === "users" && m === "POST" && id) {
    const b = await readJson(req);
    const ban = !!b.ban;
    await env.DB.prepare("UPDATE users SET banned=? WHERE id=?").bind(ban ? 1 : 0, id).run();
    if (ban) await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
    if (ban && b.purge) {
      const rooms = (await env.DB.prepare("SELECT DISTINCT room_id FROM content_index WHERE user_id=?").bind(id).all()).results as any[];
      await Promise.all(rooms.map((r) => room(env, r.room_id).deleteUserContent(id)));
      await env.DB.prepare("DELETE FROM content_index WHERE user_id=?").bind(id).run();
    }
    await log(env, { action: ban ? "ban" : "unban", target_type: "user", target_id: id, reason: clampStr(b.note, 500) || null });
    return json({ ok: true });
  }

  if (res === "credits" && m === "POST") {
    const b = await readJson(req);
    await env.DB.prepare("UPDATE users SET credits_media=credits_media+? WHERE id=?").bind(Math.max(0, Math.min(1000, Number(b.media) || 0)), clampStr(b.userId, 40)).run();
    return json({ ok: true });
  }

  if (res === "contacts") {
    if (m === "GET") return json({ contacts: (await env.DB.prepare("SELECT * FROM contact_requests ORDER BY status='open' DESC, created_at DESC LIMIT 100").all()).results });
    if (m === "POST" && id) {
      await env.DB.prepare("UPDATE contact_requests SET status='handled', handled_at=? WHERE id=?").bind(now(), id).run();
      return json({ ok: true });
    }
  }

  if (res === "users" && m === "GET") {
    const q = clampStr(url.searchParams.get("q"), 60);
    const rows = q
      ? (await env.DB.prepare(`${USER_COLS} WHERE u.id=? OR u.display_name LIKE ? OR s.full_name LIKE ? ORDER BY u.created_at DESC LIMIT 50`).bind(q, `%${q}%`, `%${q}%`).all()).results
      : (await env.DB.prepare(`${USER_COLS} ORDER BY u.created_at DESC LIMIT 50`).all()).results;
    return json({ users: rows });
  }

  if (res === "dev-expire" && m === "POST" && env.DEV_MODE === "true") {
    const b = await readJson(req);
    return json(await room(env, clampStr(b.roomId, 30)).devExpireNow());
  }

  if (res === "log") {
    const rows = (await env.DB.prepare("SELECT * FROM moderation_log ORDER BY at DESC LIMIT 200").all()).results;
    return json({ log: rows });
  }

  if (res === "ads") {
    if (m === "GET") return json({ ads: (await env.DB.prepare("SELECT * FROM ads ORDER BY created_at DESC").all()).results });
    if (m === "POST") {
      const b = await readJson(req);
      const adId = id || "ad_" + randomId(8);
      const url2 = clampStr(b.url, 500);
      if (!/^https:\/\//.test(url2)) return fail(400, "bad_url", "כתובת המודעה חייבת להתחיל ב-https://");
      await env.DB.prepare(
        `INSERT INTO ads (id, advertiser, title, body, url, image_url, target_domain, placement, active, starts_at, ends_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET advertiser=excluded.advertiser, title=excluded.title, body=excluded.body, url=excluded.url,
           image_url=excluded.image_url, target_domain=excluded.target_domain, placement=excluded.placement, active=excluded.active,
           starts_at=excluded.starts_at, ends_at=excluded.ends_at`,
      )
        .bind(
          adId, clampStr(b.advertiser, 80), clampStr(b.title, 140), clampStr(b.body, 280) || null, url2,
          clampStr(b.image_url, 500) || null, clampStr(b.target_domain, 120).toLowerCase() || null,
          b.placement === "feed" ? "feed" : "top", b.active === false ? 0 : 1, Number(b.starts_at) || null, Number(b.ends_at) || null, now(),
        )
        .run();
      return json({ ok: true, id: adId });
    }
    if (m === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM ads WHERE id=?").bind(id).run();
      return json({ ok: true });
    }
  }

  if (res === "domains") {
    if (m === "GET") return json({ domains: (await env.DB.prepare("SELECT * FROM domain_rules ORDER BY updated_at DESC").all()).results });
    if (m === "POST") {
      const b = await readJson(req);
      const domain = clampStr(b.domain, 120).toLowerCase().replace(/^www\./, "");
      if (!domain) return fail(400, "bad_domain", "חסר דומיין.");
      await env.DB.prepare(
        `INSERT INTO domain_rules (domain, no_comments, no_ads, disabled, note, updated_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(domain) DO UPDATE SET no_comments=excluded.no_comments, no_ads=excluded.no_ads, disabled=excluded.disabled, note=excluded.note, updated_at=excluded.updated_at`,
      )
        .bind(domain, b.no_comments ? 1 : 0, b.no_ads ? 1 : 0, b.disabled ? 1 : 0, clampStr(b.note, 200) || null, now())
        .run();
      return json({ ok: true });
    }
    if (m === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM domain_rules WHERE domain=?").bind(decodeURIComponent(id)).run();
      return json({ ok: true });
    }
  }

  if (res === "terms") {
    if (m === "GET") return json({ terms: (await env.DB.prepare("SELECT * FROM blocked_terms ORDER BY created_at DESC").all()).results });
    if (m === "POST") {
      const b = await readJson(req);
      const terms = String(b.terms || "").split(/[\n,]/).map((t) => clampStr(t, 60)).filter(Boolean);
      for (const t of terms) await env.DB.prepare("INSERT OR IGNORE INTO blocked_terms (term, created_at) VALUES (?,?)").bind(t, now()).run();
      invalidateTerms();
      return json({ ok: true, added: terms.length });
    }
    if (m === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM blocked_terms WHERE term=?").bind(decodeURIComponent(id)).run();
      invalidateTerms();
      return json({ ok: true });
    }
  }

  return fail(404, "not_found", "נתיב ניהול לא קיים.");
}
