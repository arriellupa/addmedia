// Campus — students meet around an article or a course, grouped by institution › faculty › year.
// A campus place is an ordinary room: its address is a synthetic URL under campus.addmedia.noaplate.com, so the
// same PageRoom (chat, talkback, media, moderation, expiry) serves it, and the Directory lists it like any room.
//   faculty/year page:  https://campus.addmedia.noaplate.com/<inst>/<faculty>/<year>            (kind "site"-like hub)
//   course page:        https://campus.addmedia.noaplate.com/<inst>/<faculty>/<year>/<course>
//   an article:         the article's own canonical URL (nevo, a journal) or, for an uploaded PDF, the doc's URL
import { checkText } from "./moderation";
import { modLog } from "./admin";
import { getUser, tokenFrom, User } from "./auth";
import { Env, clampStr, fail, json, now, randomId, readJson } from "./util";

export const CAMPUS_HOST = "campus.addmedia.noaplate.com";

// institutions and faculties the picker offers (anyone may still type another faculty; it is slugged)
export const INSTITUTIONS: { id: string; name: string; faculties: string[] }[] = [
  { id: "reichman", name: "אוניברסיטת רייכמן", faculties: ["משפטים", "מנהל עסקים", "פסיכולוגיה", "ממשל", "מדעי המחשב", "תקשורת", "כלכלה", "קיימות"] },
  { id: "tau", name: "אוניברסיטת תל אביב", faculties: ["משפטים", "ניהול", "רפואה", "הנדסה", "מדעי החברה", "מדעי הרוח", "מדעים מדויקים", "אמנויות"] },
  { id: "huji", name: "האוניברסיטה העברית", faculties: ["משפטים", "רפואה", "מדעי החברה", "מדעי הרוח", "מדעי הטבע", "חקלאות", "מנהל עסקים"] },
  { id: "technion", name: "הטכניון", faculties: ["הנדסת חשמל", "הנדסת מכונות", "מדעי המחשב", "הנדסה אזרחית", "רפואה", "ארכיטקטורה", "פיזיקה", "כימיה"] },
  { id: "bgu", name: "אוניברסיטת בן-גוריון", faculties: ["הנדסה", "מדעי הבריאות", "מדעי הרוח והחברה", "ניהול", "מדעי הטבע"] },
  { id: "biu", name: "אוניברסיטת בר-אילן", faculties: ["משפטים", "מדעי החברה", "מדעי הרוח", "מדעים מדויקים", "רפואה", "הנדסה"] },
  { id: "haifa", name: "אוניברסיטת חיפה", faculties: ["משפטים", "מדעי החברה", "מדעי הרוח", "חינוך", "ניהול", "רווחה ובריאות"] },
  { id: "openu", name: "האוניברסיטה הפתוחה", faculties: ["מדעי החברה", "מדעי הרוח", "מדעים", "הנדסה", "ניהול"] },
  { id: "colman", name: "המכללה למנהל", faculties: ["משפטים", "מנהל עסקים", "מדעי המחשב", "תקשורת", "פסיכולוגיה"] },
  { id: "ono", name: "הקריה האקדמית אונו", faculties: ["משפטים", "מנהל עסקים", "מקצועות הבריאות", "חינוך"] },
];
const YEARS = [1, 2, 3, 4, 5, 6];

export const slug = (s: string) =>
  clampStr(s, 60)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export interface Place {
  inst: string;
  faculty: string;
  year: number;
  course?: string;
}

export function placeOf(q: { inst?: string | null; faculty?: string | null; year?: string | number | null; course?: string | null }): Place | null {
  const inst = slug(q.inst || "");
  const faculty = slug(q.faculty || "");
  const year = Number(q.year);
  if (!inst || !faculty || !YEARS.includes(year)) return null;
  const course = slug(q.course || "");
  return course ? { inst, faculty, year, course } : { inst, faculty, year };
}

export const placeUrl = (p: Place) => `https://${CAMPUS_HOST}/${p.inst}/${p.faculty}/${p.year}${p.course ? "/" + p.course : ""}`;
export const placePath = (p: Place) => `/media/campus/${p.inst}/${p.faculty}/${p.year}${p.course ? "/" + p.course : ""}`;
export const docUrl = (origin: string, id: string) => `https://${CAMPUS_HOST}/doc/${id}`;

export function placeTitle(p: Place): string {
  const inst = INSTITUTIONS.find((i) => i.id === p.inst)?.name || p.inst;
  const yr = ["", "א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"][p.year] || String(p.year);
  return `${inst} · ${p.faculty.replace(/-/g, " ")} · שנה ${yr}${p.course ? " · " + p.course.replace(/-/g, " ") : ""}`;
}

export function campusTree() {
  return { institutions: INSTITUTIONS, years: YEARS };
}

// ---------- documents (articles, lecture summaries) ----------
const MAX_PDF = 15 * 1024 * 1024;

export async function listDocs(env: Env, p: Place, kind?: string | null) {
  const rows = (await env.DB.prepare(
    `SELECT id, user_id, user_name, inst, faculty, year, course, kind, title, size, created_at, status FROM campus_docs
     WHERE inst=? AND faculty=? AND year=? AND status='visible' ${p.course ? "AND course=?" : ""} ${kind ? "AND kind=?" : ""}
     ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(p.inst, p.faculty, p.year, ...(p.course ? [p.course] : []), ...(kind ? [kind] : []))
    .all<any>()).results || [];
  return rows.map(docOut);
}

export const docOut = (d: any) => ({
  id: d.id,
  uid: d.user_id,
  name: d.user_name,
  place: { inst: d.inst, faculty: d.faculty, year: d.year, course: d.course || undefined },
  kind: d.kind,
  title: d.title,
  size: d.size,
  ts: d.created_at,
  file: `/v1/campus/docs/${d.id}/file`,
  url: docUrl("", d.id), // the room of this document
});

export async function uploadDoc(req: Request, env: Env, url: URL, u: User): Promise<Response> {
  const p = placeOf({ inst: url.searchParams.get("inst"), faculty: url.searchParams.get("faculty"), year: url.searchParams.get("year"), course: url.searchParams.get("course") });
  if (!p) return fail(400, "bad_place", "יש לבחור מוסד, פקולטה ושנה.");
  const kind = url.searchParams.get("kind") === "summary" ? "summary" : "article";
  const title = clampStr(url.searchParams.get("title"), 160);
  if (title.length < 3) return fail(400, "bad_title", "כתבו כותרת למסמך.");
  const tv = await checkText(env, title, { isNew: now() - u.created_at < 86_400_000 });
  if (!tv.ok) return fail(422, tv.code, tv.message);
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > MAX_PDF) return fail(413, "too_big", "הקובץ גדול מדי (עד 15MB).");
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_PDF || bytes.byteLength < 100) return fail(413, "too_big", "הקובץ גדול מדי (עד 15MB).");
  const head = String.fromCharCode(...new Uint8Array(bytes.slice(0, 5)));
  if (head !== "%PDF-") return fail(415, "bad_type", "אפשר להעלות רק קובצי PDF.");
  const id = "d_" + randomId(10);
  const key = `campus/${p.inst}/${p.faculty}/${p.year}/${id}.pdf`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=86400" }, customMetadata: { uid: u.id } });
  await env.DB.prepare(
    "INSERT INTO campus_docs (id, user_id, user_name, inst, faculty, year, course, kind, title, r2_key, size, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(id, u.id, u.display_name, p.inst, p.faculty, p.year, p.course ?? null, kind, title, key, bytes.byteLength, now())
    .run();
  await modLog(env, { actor: u.id, action: "upload_doc", target_type: "doc", target_id: id, reason: kind });
  const row = await env.DB.prepare("SELECT * FROM campus_docs WHERE id=?").bind(id).first<any>();
  return json({ doc: docOut(row) });
}

export async function docFile(env: Env, id: string): Promise<Response> {
  const d = await env.DB.prepare("SELECT r2_key, title, status FROM campus_docs WHERE id=?").bind(clampStr(id, 40)).first<any>();
  if (!d || d.status !== "visible") return fail(404, "not_found", "המסמך לא נמצא.");
  const obj = await env.MEDIA.get(d.r2_key);
  if (!obj) return fail(404, "not_found", "המסמך לא נמצא.");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.title.replace(/[^\p{L}\p{N} .-]/gu, "") || "document")}.pdf`,
      "Cache-Control": "public, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function deleteDoc(env: Env, id: string, u: User | null, admin = false): Promise<Response> {
  const d = await env.DB.prepare("SELECT id, user_id, r2_key FROM campus_docs WHERE id=?").bind(clampStr(id, 40)).first<any>();
  if (!d) return fail(404, "not_found", "המסמך לא נמצא.");
  if (!admin && d.user_id !== u?.id) return fail(403, "forbidden", "אפשר למחוק רק מסמכים שהעלית.");
  await env.MEDIA.delete(d.r2_key);
  await env.DB.prepare("DELETE FROM campus_docs WHERE id=?").bind(d.id).run();
  return json({ ok: true });
}

// ---------- follows: a page the student keeps ----------
export async function listFollows(env: Env, uid: string) {
  const rows = (await env.DB.prepare("SELECT path, title, created_at FROM follows WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(uid).all<any>()).results || [];
  return rows.map((r) => ({ path: r.path, title: r.title, ts: r.created_at }));
}

export async function follow(req: Request, env: Env, url: URL): Promise<Response> {
  const u = await getUser(env, tokenFrom(req, url));
  if (!u) return fail(401, "auth", "צריך להתחבר כדי לעקוב.");
  const b = await readJson(req);
  const path = clampStr(b.path, 300);
  if (!/^\/media\/(campus\/[\p{L}\p{N}_-]+\/[\p{L}\p{N}_-]+\/[1-6](\/[\p{L}\p{N}_-]+)?|site\/[a-z0-9.-]+)$/u.test(path)) return fail(400, "bad_path", "כתובת לא נתמכת.");
  if (b.unfollow) {
    await env.DB.prepare("DELETE FROM follows WHERE user_id=? AND path=?").bind(u.id, path).run();
  } else {
    const title = clampStr(b.title, 160) || path;
    await env.DB.prepare("INSERT INTO follows (user_id, path, title, created_at) VALUES (?,?,?,?) ON CONFLICT(user_id, path) DO UPDATE SET title=excluded.title")
      .bind(u.id, path, title, now())
      .run();
  }
  return json({ follows: await listFollows(env, u.id) });
}
