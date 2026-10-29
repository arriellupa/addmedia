// Campus — students meet around an article or a course, grouped by institution › faculty › year.
// A campus place is an ordinary room: its address is a synthetic URL under campus.addmedia.noaplate.com, so the
// same PageRoom (chat, talkback, media, moderation, expiry) serves it, and the Directory lists it like any room.
//   faculty/year page:  https://campus.addmedia.noaplate.com/<inst>/<faculty>/<year>            (kind "site"-like hub)
//   course page:        https://campus.addmedia.noaplate.com/<inst>/<faculty>/<year>/<course>
//   an article:         the article's own canonical URL (nevo, a journal) or, for an uploaded PDF, the doc's URL
import { checkTerms, checkText } from "./moderation";
import { modLog } from "./admin";
import { consumeCode, getUser, issueCode, sendMail, tokenFrom, User } from "./auth";
import { ROOM_RE } from "./canon";
import { Env, clampStr, fail, json, now, randomId, readJson } from "./util";
import { getSettings } from "./settings";

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

// ---------- documents: text the student wrote (summary / exercise), or an article as a link with abstract + summary ----------
// The campus hosts no files. A student may import a file into the editor on his own device; only the edited text is saved.
const MIN_BODY = 20;
const MAX_BODY = 60_000;
const DOCS_PER_DAY = 50;
export const DOC_KINDS = new Set(["summary", "exercise", "article"]);
// court rulings and articles that sit behind a paywall or a licence: link to the public source instead
const BANNED_HOSTS = ["nevo.co.il", "takdin.co.il", "psakdin.co.il"];
const CHAT_RE = /^https:\/\/(chat\.whatsapp\.com|t\.me)\/[^\s]+$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const EVENT_KINDS = new Set(["exam", "deadline", "other"]);
const AUTHOR_MSG = "יש לאשר: כתבתי או ערכתי את הטקסט במילותיי; לא העתקתי מצגת, הקלטה או מבחן.";

const isNew = (u: User) => now() - u.created_at < 86_400_000;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const hostBanned = (h: string) => BANNED_HOSTS.some((b) => h === b || h.endsWith("." + b));

/** today in Israel as YYYY-MM-DD (the calendar is local) */
export function todayIL(offsetDays = 0): string {
  const d = new Date(now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => parts.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** section headings: lines that start with "# ", numbered 1..n in order */
export function sectionsOf(body: string): { i: number; heading: string }[] {
  const out: { i: number; heading: string }[] = [];
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) out.push({ i: out.length + 1, heading: clampStr(line.slice(2), 120) });
  }
  return out;
}

const cleanBody = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

// the columns docOut needs (never the body)
const DOC_COLS = "d.id, d.user_id, d.user_name, d.inst, d.faculty, d.year, d.course, d.kind, d.title, d.sections, d.chars, d.created_at, d.updated_at, d.status, d.link_url, d.lecturer, d.lecturer_name, d.lesson_date, d.lesson_no, d.topic, d.published, d.file_type, d.size, d.track, d.source";

export async function getDoc(env: Env, id: string) {
  return await env.DB.prepare(`SELECT ${DOC_COLS}, d.body FROM campus_docs d WHERE d.id=?`).bind(clampStr(id, 40)).first<any>();
}

function placeWhere(p: Place, alias = "d") {
  return { sql: `${alias}.inst=? AND ${alias}.faculty=? AND ${alias}.year=?${p.course ? ` AND ${alias}.course=?` : ""}`, args: [p.inst, p.faculty, p.year, ...(p.course ? [p.course] : [])] as (string | number)[] };
}

export async function listDocs(env: Env, p: Place, kind?: string | null, viewer?: string | null) {
  const w = placeWhere(p);
  const k = kind && DOC_KINDS.has(kind) ? kind : null;
  // the author also sees his own documents that are on hold (labelled), nobody else does
  const vis = viewer ? "(d.status='visible' OR (d.status='hold' AND d.user_id=?))" : "d.status='visible'";
  const rows = (await env.DB.prepare(`SELECT ${DOC_COLS} FROM campus_docs d WHERE ${w.sql} AND ${vis} AND d.body IS NOT NULL ${k ? "AND d.kind=?" : ""} ORDER BY d.created_at DESC LIMIT 100`)
    .bind(...w.args, ...(viewer ? [viewer] : []), ...(k ? [k] : []))
    .all<any>()).results || [];
  return rows.map(docOut);
}

export async function coverage(env: Env, p: Place) {
  const w = placeWhere(p);
  const rows = (await env.DB.prepare(`SELECT d.kind, COUNT(*) n FROM campus_docs d WHERE ${w.sql} AND d.status='visible' AND d.body IS NOT NULL GROUP BY d.kind`).bind(...w.args).all<any>()).results || [];
  const n = (k: string) => Number(rows.find((r) => r.kind === k)?.n || 0);
  return { docs: rows.reduce((a, r) => a + Number(r.n), 0), summaries: n("summary"), exercises: n("exercise"), articles: n("article") };
}

export const docOut = (d: any) => {
  let sections: { i: number; heading: string }[] = [];
  try {
    sections = JSON.parse(d.sections || "[]");
  } catch {}
  return {
    id: d.id,
    uid: d.user_id,
    name: d.user_name,
    place: { inst: d.inst, faculty: d.faculty, year: d.year, course: d.course || undefined },
    kind: d.kind,
    title: d.title,
    link: d.link_url || undefined,
    lecturer: d.lecturer || undefined,
    lecturerName: d.lecturer_name || undefined,
    lessonDate: d.lesson_date || undefined,
    lessonNo: d.lesson_no ?? undefined,
    source: d.source === "received" ? "received" : "own",
    topic: d.topic || undefined,
    published: d.published || undefined,
    track: d.track || undefined,
    file: d.file_type ? { url: `/v1/campus/docs/${d.id}/file`, type: d.file_type, size: d.size ?? 0 } : null,
    sections,
    chars: d.chars ?? 0,
    ts: d.created_at,
    updatedAt: d.updated_at ?? d.created_at,
    url: docUrl("", d.id), // the room of this document
    status: d.status === "visible" ? undefined : d.status, // "hold": בבדיקה לאחר בקשת הסרה (the author sees it)
  };
};

/** turns a DOI or a URL into an https address, or null */
export function articleUrl(raw: string): string | null {
  let s = clampStr(raw, 1000).replace(/^doi:\s*/i, "");
  if (/^10\.\d{4,9}\/\S+$/i.test(s)) s = "https://doi.org/" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

/** validates an article link: {link} or a refusal */
function checkLink(raw: unknown): { link: string } | Response {
  const link = articleUrl(String(raw || ""));
  if (!link) return fail(400, "bad_url", "כתובת המאמר לא תקינה. אפשר גם DOI.");
  if (hostBanned(hostOf(link))) return fail(400, "source", "קשרו למקור הציבורי: court.gov.il או כתב העת");
  return { link };
}

/** the directory fields of a lesson summary: lecturer, lesson date, lesson number */
function lessonFields(b: any): { lecturer: string | null; lecturerName: string | null; lessonDate: string | null; lessonNo: number | null } | Response {
  const lecturerName = clampStr(b.lecturer, 80).replace(/\s+/g, " ") || null;
  const lecturer = lecturerName ? slug(lecturerName) : null;
  const lessonDate = clampStr(b.lessonDate, 10) || null;
  if (lessonDate && !DATE_RE.test(lessonDate)) return fail(400, "bad_date", "תאריך השיעור בפורמט YYYY-MM-DD.");
  const lessonNo = b.lessonNo === undefined || b.lessonNo === null || b.lessonNo === "" ? null : Number(b.lessonNo);
  if (lessonNo !== null && !(Number.isInteger(lessonNo) && lessonNo > 0 && lessonNo < 1000)) return fail(400, "bad_lesson", "מספר השיעור לא תקין.");
  return { lecturer, lecturerName, lessonDate, lessonNo };
}

/** validates a body: {body, sections} or a refusal */
async function checkBody(env: Env, raw: unknown): Promise<{ body: string; sections: { i: number; heading: string }[] } | Response> {
  const body = cleanBody(raw);
  const max = Math.min(MAX_BODY, (await getSettings(env)).campusCharsPerDoc);
  if (body.length < MIN_BODY) return fail(400, "short_body", `הטקסט קצר מדי (לפחות ${MIN_BODY} תווים).`);
  if (body.length > max) return fail(413, "long_body", `הטקסט ארוך מדי (עד ${max.toLocaleString("en-US")} תווים).`);
  const v = await checkTerms(env, body);
  if (!v.ok) return fail(422, v.code, v.message);
  return { body, sections: sectionsOf(body) };
}

/** what every new document shares: the place (faculty, year and track from the student's profile), kind, title/topic,
 *  the author declaration, lesson fields, strikes and quotas. `b` is the JSON body or the query, merged. */
async function docHead(env: Env, url: URL, u: User, b: any) {
  const qp = (k: string) => b[k] ?? url.searchParams.get(k);
  // faculty, year and track come from the profile; a second faculty (dual major) may be chosen by the query
  const prof = await env.DB.prepare("SELECT inst, faculty, faculty2, year, track FROM student_profiles WHERE user_id=?").bind(u.id).first<any>();
  if (!prof) return fail(403, "student", STUDENT_MSG);
  const askedFaculty = slug(String(qp("faculty") || ""));
  const faculty = askedFaculty && askedFaculty === prof.faculty2 ? prof.faculty2 : prof.faculty;
  const p = placeOf({ inst: qp("inst") || prof.inst, faculty, year: prof.year, course: qp("course") });
  if (!p) return fail(400, "bad_place", "יש לבחור מוסד, פקולטה ושנה.");
  const kind = String(qp("kind") || "summary");
  if (!DOC_KINDS.has(kind)) return fail(400, "bad_kind", "סוג המסמך לא מוכר.");
  const topic = clampStr(qp("topic"), 120).replace(/\s+/g, " ");
  if (qp("topic") != null && String(qp("topic")).trim() && topic.length < 2) return fail(400, "bad_topic", "נושא הסיכום קצר מדי.");
  const title = clampStr(qp("title"), 160) || topic;
  if (title.length < 3) return fail(400, "bad_title", "כתבו כותרת (או נושא) למסמך.");
  const author = qp("author");
  if (author !== true && author !== 1 && author !== "1") return fail(400, "author", AUTHOR_MSG);
  // the declaration's kind: own words (default), or a lesson presentation the students received from the lecturer
  const source = qp("source") === "received" ? "received" : "own";
  for (const t of [title, topic]) {
    if (!t) continue;
    const tv = await checkText(env, t, { isNew: isNew(u) });
    if (!tv.ok) return fail(422, tv.code, tv.message);
  }
  if ((u.strikes ?? 0) >= 3) return fail(403, "strikes", "אחרי שלוש הסרות לבקשת בעלי זכויות אי אפשר לפרסם עוד.");
  if (kind !== "article" && !p.course) return fail(400, "bad_course", "סיכום או תרגול שייכים לקורס: בחרו קורס.");
  const lf = lessonFields({ lecturer: qp("lecturer"), lessonDate: qp("lessonDate"), lessonNo: qp("lessonNo") });
  if (lf instanceof Response) return lf;
  const published = clampStr(qp("published"), 10) || todayIL();
  if (!DATE_RE.test(published)) return fail(400, "bad_date", "תאריך הפרסום בפורמט YYYY-MM-DD.");
  const today = await env.DB.prepare("SELECT COUNT(*) n FROM campus_docs WHERE user_id=? AND created_at>?").bind(u.id, now() - 86_400_000).first<{ n: number }>();
  if ((today?.n ?? 0) >= DOCS_PER_DAY) return fail(429, "rate", "אפשר לפרסם עד 50 מסמכים ביום.");
  const qu = await quotaOf(env, u.id);
  if (qu.docsThisMonth >= qu.docsPerMonth) return fail(403, "quota", `הגעתם למכסה החודשית (${qu.docsPerMonth} מסמכים בחודש).`);
  return { p, kind, title, topic: topic || null, lf, published, qu, track: prof.track as string, source };
}

export async function createDoc(req: Request, env: Env, url: URL, u: User): Promise<Response> {
  const b = await readJson(req);
  const h = await docHead(env, url, u, b);
  if (h instanceof Response) return h;
  const { p, kind, title, topic, lf, published, qu, track, source } = h;
  let link: string | null = null;
  if (kind === "article") {
    const l = checkLink(b.link ?? b.url);
    if (l instanceof Response) return l;
    link = l.link;
  }
  const bd = await checkBody(env, b.body);
  if (bd instanceof Response) return bd;
  if (qu.charsUsed + bd.body.length > qu.charsTotal) return fail(403, "quota", `הגעתם למכסת התווים הכוללת (${qu.charsTotal.toLocaleString("en-US")} תווים).`);
  const id = "d_" + randomId(10);
  const t = now();
  await env.DB.prepare(
    "INSERT INTO campus_docs (id, user_id, user_name, inst, faculty, year, course, kind, title, r2_key, size, created_at, body, link_url, sections, chars, updated_at, lecturer, lecturer_name, lesson_date, lesson_no, topic, published, track, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(id, u.id, u.display_name, p.inst, p.faculty, p.year, p.course ?? null, kind, title, "", bd.body.length, t, bd.body, link, JSON.stringify(bd.sections), bd.body.length, t, lf.lecturer, lf.lecturerName, lf.lessonDate, lf.lessonNo, topic, published, track, source)
    .run();
  await modLog(env, { actor: u.id, action: "create_doc", target_type: "doc", target_id: id, reason: kind });
  return json({ doc: docOut(await getDoc(env, id)) });
}

// ---------- a summary as a file: PDF or Word, the text extracted on the client and posted afterwards ----------
const MAX_FILE = 15 * 1024 * 1024;
const FILE_TYPES: Record<string, { mime: string; magic: number[] }> = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [0x50, 0x4b, 0x03, 0x04] }, // PK\x03\x04
};

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createDocFile(req: Request, env: Env, url: URL, u: User): Promise<Response> {
  const h = await docHead(env, url, u, {});
  if (h instanceof Response) return h;
  const { p, kind, title, topic, lf, published, track, source } = h;
  if (kind === "article") return fail(400, "bad_kind", "מאמר הוא קישור, לא קובץ.");
  const len = Number(req.headers.get("Content-Length") || 0);
  if (len > MAX_FILE) return fail(413, "too_big", "הקובץ גדול מדי (עד 15MB).");
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_FILE) return fail(413, "too_big", "הקובץ גדול מדי (עד 15MB).");
  if (bytes.byteLength < 20) return fail(415, "bad_type", "אפשר להעלות רק PDF או Word (.docx).");
  const head = new Uint8Array(bytes.slice(0, 8));
  const type = Object.keys(FILE_TYPES).find((k) => FILE_TYPES[k].magic.every((b, i) => head[i] === b));
  if (!type) return fail(415, "bad_type", "אפשר להעלות רק PDF או Word (.docx).");
  const hash = await sha256Hex(bytes);
  if (await env.DB.prepare("SELECT 1 FROM blocked_hashes WHERE sha256=?").bind(hash).first()) return fail(403, "blocked", "הקובץ הוסר בעבר לבקשת בעל הזכויות");
  const id = "d_" + randomId(10);
  const key = `campus/${p.inst}/${p.faculty}/${p.year}/${id}.${type}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: FILE_TYPES[type].mime, cacheControl: "private, max-age=3600" }, customMetadata: { uid: u.id } });
  const t = now();
  await env.DB.prepare(
    "INSERT INTO campus_docs (id, user_id, user_name, inst, faculty, year, course, kind, title, r2_key, size, created_at, body, sections, chars, updated_at, lecturer, lecturer_name, lesson_date, lesson_no, topic, published, track, file_type, sha256, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(id, u.id, u.display_name, p.inst, p.faculty, p.year, p.course ?? null, kind, title, key, bytes.byteLength, t, "", "[]", 0, t, lf.lecturer, lf.lecturerName, lf.lessonDate, lf.lessonNo, topic, published, track, type, hash, source)
    .run();
  await modLog(env, { actor: u.id, action: "create_doc", target_type: "doc", target_id: id, reason: `${kind}:${type}` });
  return json({ doc: docOut(await getDoc(env, id)) });
}

/** the text the client extracted from the file (mammoth / pdf.js), as the document's body */
export async function putDocText(req: Request, env: Env, id: string, u: User): Promise<Response> {
  const d = await getDoc(env, id);
  if (!d || d.status === "removed") return fail(404, "not_found", "המסמך לא נמצא.");
  if (d.user_id !== u.id) return fail(403, "forbidden", "רק מי שהעלה את המסמך יכול לצרף את הטקסט שלו.");
  const max = Math.min(MAX_BODY, (await getSettings(env)).campusCharsPerDoc);
  if (Number(req.headers.get("Content-Length") || 0) > max * 4 + 1000) return fail(413, "long_body", `הטקסט ארוך מדי (עד ${max.toLocaleString("en-US")} תווים).`);
  let body = cleanBody(await req.text());
  if (!body) return fail(400, "empty", "אין טקסט.");
  if (body.length > max) body = body.slice(0, max); // extracted text is cut at the quota rather than refused
  const v = await checkTerms(env, body);
  if (!v.ok) return fail(422, v.code, v.message);
  const qu = await quotaOf(env, u.id);
  if (qu.charsUsed - (d.chars || 0) + body.length > qu.charsTotal) return fail(403, "quota", `הגעתם למכסת התווים הכוללת (${qu.charsTotal.toLocaleString("en-US")} תווים).`);
  const sections = sectionsOf(body);
  await env.DB.prepare("UPDATE campus_docs SET body=?, sections=?, chars=?, updated_at=? WHERE id=?").bind(body, JSON.stringify(sections), body.length, now(), d.id).run();
  return json({ ok: true, sections, chars: body.length });
}

export async function docFile(env: Env, id: string, viewer?: string | null, shownTo: ShownTo = null): Promise<Response> {
  const d = await env.DB.prepare("SELECT r2_key, title, status, file_type, user_id FROM campus_docs WHERE id=?").bind(clampStr(id, 40)).first<any>();
  const mine = !!viewer && d?.user_id === viewer;
  if (!d || !d.file_type || !d.r2_key || !(d.status === "visible" || (d.status === "hold" && mine))) return fail(404, "not_found", "הקובץ לא נמצא.");
  const obj = await env.MEDIA.get(d.r2_key);
  if (!obj) return fail(404, "not_found", "הקובץ לא נמצא.");
  const name = encodeURIComponent((d.title || "document").replace(/[^\p{L}\p{N} .-]/gu, "").trim() || "document") + "." + d.file_type;
  const ft = FILE_TYPES[d.file_type] || FILE_TYPES.pdf;
  return new Response(obj.body, {
    headers: {
      "Content-Type": ft.mime,
      "Content-Disposition": `${d.file_type === "pdf" ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-Shown-To, Content-Disposition",
      ...(shownTo ? { "X-Shown-To": encodeURIComponent(JSON.stringify(shownTo)) } : {}),
    },
  });
}

// ---------- anti-sharing: one reader at a time, and no bulk harvesting ----------
const BUSY_MS = 90_000;
const VELOCITY_READS = 40; // in 10 minutes
const VELOCITY_IPS = 3; // distinct IP hashes in an hour
const LOCK_MS = 15 * 60_000;

/** records a document/file read and applies the checks: 409 busy, or a velocity lock (423) */
export async function docReadCheck(env: Env, u: User, deviceId: string | null, ipHash: string): Promise<Response | null> {
  const t = now();
  const dev = deviceId || "";
  const other = await env.DB.prepare("SELECT 1 FROM doc_reads WHERE user_id=? AND at>? AND COALESCE(device_id,'')!=? AND ip_hash!=? LIMIT 1").bind(u.id, t - BUSY_MS, dev, ipHash).first();
  if (other) return fail(409, "busy", "החשבון בשימוש במכשיר אחר כרגע");
  await env.DB.prepare("INSERT INTO doc_reads (user_id, device_id, ip_hash, at) VALUES (?,?,?,?)").bind(u.id, deviceId, ipHash, t).run();
  const [m, h] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM doc_reads WHERE user_id=? AND at>?").bind(u.id, t - 10 * 60_000).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(DISTINCT ip_hash) n FROM doc_reads WHERE user_id=? AND at>?").bind(u.id, t - 3600_000).first<{ n: number }>(),
  ]);
  if ((m?.n ?? 0) > VELOCITY_READS || (h?.n ?? 0) >= VELOCITY_IPS) {
    const r = await env.DB.prepare("UPDATE users SET locked_until=?, must_reset=1 WHERE id=? AND must_reset=0").bind(t + LOCK_MS, u.id).run();
    if (r.meta.changes) {
      await modLog(env, { actor: "auto", action: "velocity_lock", target_type: "user", target_id: u.id, reason: `${m?.n ?? 0} reads/10m, ${h?.n ?? 0} ips/1h` });
      if (u.email) {
        await sendMail(env, u.email, "החשבון שלך ב-AddStudent ננעל זמנית",
          `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;color:#14161a"><p>זיהינו פעילות חריגה בחשבון: קריאה של מסמכים רבים בזמן קצר, או מכמה מקומות.</p><p>החשבון נעול ל-15 דקות, ולצורך ההמשך יש לקבוע סיסמה חדשה דרך «שכחתי סיסמה».</p><p style="color:#6b7280">החשבון אישי. שיתוף סיסמה או מכשיר עם אחר = ביטול המנוי ללא החזר.</p></div>`,
          "זיהינו פעילות חריגה בחשבון. החשבון נעול ל-15 דקות; לצורך ההמשך יש לקבוע סיסמה חדשה דרך «שכחתי סיסמה».");
      }
    }
    return fail(423, "reset", "זוהתה פעילות חריגה בחשבון. החשבון נעול ל-15 דקות, ולצורך ההמשך יש לקבוע סיסמה חדשה דרך «שכחתי סיסמה».");
  }
  return null;
}

/** hourly: reads older than two hours, dead sessions, dead codes */
export async function pruneReads(env: Env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM doc_reads WHERE at<?").bind(t - 2 * 3600_000),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(t),
    env.DB.prepare("DELETE FROM otp_codes WHERE expires_at<?").bind(t - 3600_000),
  ]);
}

export async function updateDoc(req: Request, env: Env, id: string, u: User): Promise<Response> {
  const d = await getDoc(env, id);
  if (!d || d.status === "removed") return fail(404, "not_found", "המסמך לא נמצא.");
  if (d.user_id !== u.id) return fail(403, "forbidden", "אפשר לערוך רק מסמכים שכתבת.");
  if ((u.strikes ?? 0) >= 3) return fail(403, "strikes", "אחרי שלוש הסרות לבקשת בעלי זכויות אי אפשר לפרסם עוד.");
  const b = await readJson(req);
  const sets: string[] = [];
  const args: unknown[] = [];
  if (b.title !== undefined) {
    const title = clampStr(b.title, 160);
    if (title.length < 3) return fail(400, "bad_title", "כתבו כותרת למסמך.");
    const tv = await checkText(env, title, { isNew: isNew(u) });
    if (!tv.ok) return fail(422, tv.code, tv.message);
    sets.push("title=?");
    args.push(title);
  }
  if (b.link !== undefined && d.kind === "article") {
    const l = checkLink(b.link);
    if (l instanceof Response) return l;
    sets.push("link_url=?");
    args.push(l.link);
  }
  if (b.body !== undefined) {
    const bd = await checkBody(env, b.body);
    if (bd instanceof Response) return bd;
    const qu = await quotaOf(env, u.id);
    if (qu.charsUsed - (d.chars || 0) + bd.body.length > qu.charsTotal) return fail(403, "quota", `הגעתם למכסת התווים הכוללת (${qu.charsTotal.toLocaleString("en-US")} תווים).`);
    sets.push("body=?", "sections=?", "chars=?", "size=?");
    args.push(bd.body, JSON.stringify(bd.sections), bd.body.length, bd.body.length);
  }
  if (b.topic !== undefined) {
    const topic = clampStr(b.topic, 120).replace(/\s+/g, " ");
    if (topic.length < 2) return fail(400, "bad_topic", "נושא הסיכום קצר מדי.");
    const tv = await checkText(env, topic, { isNew: isNew(u) });
    if (!tv.ok) return fail(422, tv.code, tv.message);
    sets.push("topic=?");
    args.push(topic);
  }
  if (b.published !== undefined) {
    const published = clampStr(b.published, 10);
    if (!DATE_RE.test(published)) return fail(400, "bad_date", "תאריך הפרסום בפורמט YYYY-MM-DD.");
    sets.push("published=?");
    args.push(published);
  }
  if (b.lecturer !== undefined || b.lessonDate !== undefined || b.lessonNo !== undefined) {
    const lf = lessonFields({ lecturer: b.lecturer ?? d.lecturer_name, lessonDate: b.lessonDate ?? d.lesson_date, lessonNo: b.lessonNo ?? d.lesson_no });
    if (lf instanceof Response) return lf;
    sets.push("lecturer=?", "lecturer_name=?", "lesson_date=?", "lesson_no=?");
    args.push(lf.lecturer, lf.lecturerName, lf.lessonDate, lf.lessonNo);
  }
  if (!sets.length) return fail(400, "empty", "אין מה לעדכן.");
  sets.push("updated_at=?");
  args.push(now(), d.id);
  await env.DB.prepare(`UPDATE campus_docs SET ${sets.join(", ")} WHERE id=?`).bind(...args).run();
  await modLog(env, { actor: u.id, action: "edit_doc", target_type: "doc", target_id: d.id, reason: sets.map((x) => x.split("=")[0]).join(",") });
  return json({ doc: docOut(await getDoc(env, d.id)) });
}

export type ShownTo = { name: string; email: string | null } | null;

/** the watermark: who this copy is shown to (the student's full name and login email) */
export async function shownToOf(env: Env, u: User | null): Promise<ShownTo> {
  if (!u) return null;
  const sp = await env.DB.prepare("SELECT full_name FROM student_profiles WHERE user_id=?").bind(u.id).first<{ full_name: string }>();
  return { name: sp?.full_name || u.display_name, email: u.email ?? null };
}

export async function readDoc(env: Env, id: string, viewer?: string | null, shownTo: ShownTo = null): Promise<Response> {
  const d = await getDoc(env, id);
  const mine = !!viewer && d?.user_id === viewer;
  if (!d || d.body == null || !(d.status === "visible" || (d.status === "hold" && mine))) return fail(404, "not_found", "המסמך לא נמצא.");
  return json({ doc: docOut(d), body: d.body, shownTo });
}

export async function deleteDoc(env: Env, id: string, u: User | null, admin = false): Promise<Response> {
  const d = await env.DB.prepare("SELECT id, user_id, r2_key FROM campus_docs WHERE id=?").bind(clampStr(id, 40)).first<any>();
  if (!d) return fail(404, "not_found", "המסמך לא נמצא.");
  if (!admin && d.user_id !== u?.id) return fail(403, "forbidden", "אפשר למחוק רק מסמכים שכתבת.");
  if (d.r2_key) await env.MEDIA.delete(d.r2_key).catch(() => {}); // the uploaded file, if any
  await env.DB.prepare("DELETE FROM campus_docs WHERE id=?").bind(d.id).run();
  await setRefsStatus(env, "doc", d.id, "removed");
  return json({ ok: true });
}

// ---------- search: directory filters (lesson, lecturer, dates) and/or free text over topic, title and body ----------
const likeEsc = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export interface SearchQuery {
  inst: string;
  faculty: string;
  year?: number | null;
  course?: string | null;
  lecturer?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
}

export async function searchDocs(env: Env, sq: SearchQuery) {
  const q = clampStr(sq.q, 80).replace(/\s+/g, " ");
  const where: string[] = ["d.inst=?", "d.faculty=?", "d.status='visible'", "d.body IS NOT NULL"];
  const args: unknown[] = [sq.inst, sq.faculty];
  if (sq.year) {
    where.push("d.year=?");
    args.push(sq.year);
  }
  if (sq.course) {
    where.push("d.course=?");
    args.push(sq.course);
  }
  if (sq.lecturer) {
    where.push("d.lecturer=?");
    args.push(sq.lecturer);
  }
  // the date of a summary: its lesson date, or the day it was published
  const dateExpr = "COALESCE(d.lesson_date, d.published)";
  if (sq.from) {
    where.push(`${dateExpr}>=?`);
    args.push(sq.from);
  }
  if (sq.to) {
    where.push(`${dateExpr}<=?`);
    args.push(sq.to);
  }
  const filtered = !!(sq.course || sq.lecturer || sq.from || sq.to);
  if (q.length >= 2) {
    const like = `%${likeEsc(q)}%`;
    where.push("(d.title LIKE ? ESCAPE '\\' OR d.topic LIKE ? ESCAPE '\\' OR d.body LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  } else if (!filtered) {
    return { hits: [], total: 0 };
  }
  const w = where.join(" AND ");
  const total = (await env.DB.prepare(`SELECT COUNT(*) n FROM campus_docs d WHERE ${w}`).bind(...args).first<{ n: number }>())?.n ?? 0;
  const rows = (await env.DB.prepare(`SELECT ${DOC_COLS}, d.body FROM campus_docs d WHERE ${w} ORDER BY ${dateExpr} DESC, d.created_at DESC LIMIT 30`).bind(...args).all<any>()).results || [];
  const lq = q.toLowerCase();
  const hits = rows.map((d) => {
    const { body, ...row } = d;
    const doc = docOut(row);
    if (q.length < 2) return { doc, snippet: d.topic || d.title };
    const inTitle = (d.title || "").toLowerCase().includes(lq) || (d.topic || "").toLowerCase().includes(lq);
    const i = inTitle ? -1 : String(body || "").toLowerCase().indexOf(lq);
    if (i < 0) return { doc, snippet: d.topic && d.topic !== d.title ? `${d.title} · ${d.topic}` : d.title };
    const text: string = body;
    const section = (text.slice(0, i).match(/(^|\n)# /g) || []).length; // 0 = before the first heading
    const from = Math.max(0, i - 80);
    const to = Math.min(text.length, i + q.length + 80);
    const snippet = (from > 0 ? "…" : "") + text.slice(from, to).replace(/\s+/g, " ").trim() + (to < text.length ? "…" : "");
    return { doc, section: section || undefined, snippet };
  });
  return { hits, total };
}

// ---------- course meta: group chat link, exam period ----------
export async function getCourseMeta(env: Env, p: Place) {
  const r = await env.DB.prepare("SELECT * FROM campus_courses WHERE inst=? AND faculty=? AND year=? AND course=?").bind(p.inst, p.faculty, p.year, p.course || "").first<any>();
  if (!r) return {};
  return { chatUrl: r.chat_url || null, examUntil: r.exam_until || null, updatedBy: r.updated_by_name || null, updatedUid: r.updated_by || null, updatedAt: r.updated_at || null };
}

export async function putCourseMeta(req: Request, env: Env, p: Place, u: User): Promise<Response> {
  const b = await readJson(req);
  let chatUrl: string | null | undefined;
  if (b.chatUrl !== undefined) {
    chatUrl = b.chatUrl === null || b.chatUrl === "" ? null : clampStr(b.chatUrl, 300);
    if (chatUrl && !CHAT_RE.test(chatUrl)) return fail(400, "chat_url", "קישור לקבוצה חייב להיות של WhatsApp (chat.whatsapp.com) או Telegram (t.me).");
  }
  let examUntil: string | null | undefined;
  if (b.examUntil !== undefined) {
    examUntil = b.examUntil === null || b.examUntil === "" ? null : clampStr(b.examUntil, 10);
    if (examUntil && !DATE_RE.test(examUntil)) return fail(400, "bad_date", "תאריך בפורמט YYYY-MM-DD.");
  }
  if (chatUrl === undefined && examUntil === undefined) return fail(400, "empty", "אין מה לעדכן.");
  const cur = await env.DB.prepare("SELECT chat_url, exam_until FROM campus_courses WHERE inst=? AND faculty=? AND year=? AND course=?").bind(p.inst, p.faculty, p.year, p.course || "").first<any>();
  const nextChat = chatUrl === undefined ? cur?.chat_url ?? null : chatUrl;
  const nextExam = examUntil === undefined ? cur?.exam_until ?? null : examUntil;
  await env.DB.prepare(
    `INSERT INTO campus_courses (inst, faculty, year, course, chat_url, exam_until, updated_by, updated_by_name, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(inst, faculty, year, course) DO UPDATE SET chat_url=excluded.chat_url, exam_until=excluded.exam_until, updated_by=excluded.updated_by, updated_by_name=excluded.updated_by_name, updated_at=excluded.updated_at`,
  )
    .bind(p.inst, p.faculty, p.year, p.course || "", nextChat, nextExam, u.id, u.display_name, now())
    .run();
  await modLog(env, { actor: u.id, action: "course_meta", target_type: "course", target_id: placeUrl(p), reason: [chatUrl !== undefined ? "chat" : "", examUntil !== undefined ? "exam" : ""].filter(Boolean).join(",") });
  return json(await getCourseMeta(env, p));
}

// ---------- semester calendar ----------
const eventOut = (e: any) => ({ id: e.id, title: e.title, date: e.date, kind: e.kind, course: e.course || undefined, uid: e.user_id, name: e.user_name, ts: e.created_at });

export async function listEvents(env: Env, p: Place) {
  const w = placeWhere(p, "e");
  const rows = (await env.DB.prepare(`SELECT * FROM campus_events e WHERE ${w.sql} AND e.date>=? ORDER BY e.date ASC, e.created_at ASC LIMIT 200`)
    .bind(...w.args, todayIL(-7))
    .all<any>()).results || [];
  return rows.map(eventOut);
}

export async function createEvent(req: Request, env: Env, p: Place, u: User): Promise<Response> {
  const b = await readJson(req);
  const title = clampStr(b.title, 120);
  if (title.length < 2) return fail(400, "bad_title", "כתבו כותרת לאירוע.");
  const tv = await checkText(env, title, { isNew: isNew(u) });
  if (!tv.ok) return fail(422, tv.code, tv.message);
  const date = clampStr(b.date, 10);
  if (!DATE_RE.test(date)) return fail(400, "bad_date", "תאריך בפורמט YYYY-MM-DD.");
  const kind = EVENT_KINDS.has(b.kind) ? b.kind : "other";
  const course = p.course || slug(String(b.course || ""));
  const id = "e_" + randomId(10);
  await env.DB.prepare("INSERT INTO campus_events (id, inst, faculty, year, course, title, date, kind, user_id, user_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, p.inst, p.faculty, p.year, course, title, date, kind, u.id, u.display_name, now())
    .run();
  const row = await env.DB.prepare("SELECT * FROM campus_events WHERE id=?").bind(id).first<any>();
  return json({ event: eventOut(row) });
}

export async function deleteEvent(env: Env, id: string, u: User | null, admin = false): Promise<Response> {
  const e = await env.DB.prepare("SELECT id, user_id FROM campus_events WHERE id=?").bind(clampStr(id, 40)).first<any>();
  if (!e) return fail(404, "not_found", "האירוע לא נמצא.");
  if (!admin && e.user_id !== u?.id) return fail(403, "forbidden", "אפשר למחוק רק אירועים שהוספת.");
  await env.DB.prepare("DELETE FROM campus_events WHERE id=?").bind(e.id).run();
  return json({ ok: true });
}

// ---------- takedown: a notice from a lecturer, an institution, an author or a person named in a text ----------
// The requester identifies (name, email verified by a code, mobile phone); the items go on hold at once and the
// admin decides: final removal (with a strike for the author) or restoring them.
const ROLES = new Set(["lecturer", "institution", "author", "other"]);
const ITEM_TYPES = new Set(["doc", "post", "chat"]);
const TD_PREFIX = "t|";
type TdItem = { type: "doc" | "post" | "chat"; id: string; roomId?: string; sections?: number[]; held?: boolean; uid?: string };

/** Israeli mobile number → 05X-XXXXXXX, or null */
export function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (!/^05\d{8}$/.test(d)) return null;
  return d.slice(0, 3) + "-" + d.slice(3);
}

export async function takedownStart(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  return await issueCode(env, clampStr(b.email, 254).toLowerCase(), TD_PREFIX, "קוד אימות לבקשת הסרה");
}

// typed as any: the RPC stub type of the room is too deep for tsc (same as in admin.ts)
const roomOf = (env: Env, id: string): any => env.ROOMS.get(env.ROOMS.idFromName(id));

export async function takedownNotice(req: Request, env: Env, viewer: User | null): Promise<Response> {
  const b = await readJson(req);
  const name = clampStr(b.name, 80);
  const reason = clampStr(b.reason, 4000);
  if (name.length < 2) return fail(400, "bad_name", "כתבו את שמכם המלא.");
  if (reason.length < 10) return fail(400, "short", "נא לפרט מעט יותר.");
  const phone = normalizePhone(b.phone);
  if (!phone) return fail(400, "bad_phone", "נדרש מספר נייד ישראלי (05X-XXXXXXX).");
  // the email: a signed-in person's login email, otherwise one verified by a code
  let email = viewer?.email ? viewer.email.toLowerCase() : "";
  if (!email) {
    email = clampStr(b.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail(400, "bad_email", "כתובת המייל לא תקינה.");
    const bad = await consumeCode(env, email, clampStr(b.code, 6), TD_PREFIX);
    if (bad) return bad;
  }
  // items: {type, id, sections?} (docIds kept for older clients)
  const items: TdItem[] = [];
  for (const raw of Array.isArray(b.items) ? b.items.slice(0, 50) : []) {
    const type = String(raw?.type || "doc");
    const id = clampStr(raw?.id, 40);
    if (!ITEM_TYPES.has(type) || !id) continue;
    const sections = Array.isArray(raw.sections) ? raw.sections.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 50) : undefined;
    const roomId = clampStr(raw.roomId, 30) || undefined;
    items.push({ type: type as TdItem["type"], id, roomId, sections: sections?.length ? sections : undefined });
  }
  for (const x of Array.isArray(b.docIds) ? b.docIds.slice(0, 50) : []) {
    const id = clampStr(x, 40);
    if (id && !items.some((i) => i.id === id)) items.push({ type: "doc", id });
  }
  // the place (for «all» later): given, or taken from the first document named
  let inst = slug(String(b.inst || ""));
  let faculty = slug(String(b.faculty || ""));
  let year = YEARS.includes(Number(b.year)) ? Number(b.year) : null;
  let course = slug(String(b.course || "")) || null;
  if (!inst || !faculty) {
    const first = items.find((i) => i.type === "doc");
    const d = first ? await env.DB.prepare("SELECT inst, faculty, year, course FROM campus_docs WHERE id=?").bind(first.id).first<any>() : null;
    if (d) ({ inst, faculty, year, course } = d);
  }
  if ((!inst || !faculty) && !items.length) return fail(400, "bad_place", "יש לציין מוסד ופקולטה, או לפחות פריט אחד.");
  // abuse guard: three reverted notices from the same email or phone, and no more
  const reverted = await env.DB.prepare("SELECT COUNT(*) n FROM contact_requests WHERE kind='takedown' AND status='reverted' AND (email=? OR phone=?)").bind(email, phone).first<{ n: number }>();
  if ((reverted?.n ?? 0) >= 3) return fail(429, "abuse", "שלוש בקשות קודמות מהכתובת או מהמספר הזה נדחו. פנו אלינו במייל.");
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM contact_requests WHERE email=? AND created_at>?").bind(email, now() - 3600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return fail(429, "too_many", "נשלחו יותר מדי פניות. נסו שוב בעוד שעה.");

  const id = "c_" + randomId(10);
  // hold at once
  let held = 0;
  for (const it of items) {
    if (it.type === "doc") {
      const d = await env.DB.prepare("SELECT user_id, status FROM campus_docs WHERE id=?").bind(it.id).first<any>();
      if (!d) continue;
      it.uid = d.user_id;
      if (d.status === "visible") {
        await env.DB.prepare("UPDATE campus_docs SET status='hold' WHERE id=? AND status='visible'").bind(it.id).run();
        await setRefsStatus(env, "doc", it.id, "hold");
        it.held = true;
      }
    } else {
      if (!it.roomId) {
        const ci = await env.DB.prepare("SELECT room_id FROM content_index WHERE item_id=?").bind(it.id).first<{ room_id: string }>();
        it.roomId = ci?.room_id;
      }
      if (!it.roomId || !ROOM_RE.test(it.roomId)) continue;
      const r = await roomOf(env, it.roomId).setStatus(it.type, it.id, "hold").catch(() => ({ ok: false } as any));
      if (r?.ok) {
        it.uid = r.uid || undefined;
        if (r.prev === "visible") it.held = true;
        if (it.type === "post") await setRefsStatus(env, "media", it.id, "hold");
      }
    }
    if (it.held) {
      held++;
      await modLog(env, { actor: "auto", action: "hold", target_type: it.type, target_id: it.id, room_id: it.roomId ?? null, report_id: id, reason: "takedown" });
    }
  }
  const meta = { role: ROLES.has(b.role) ? b.role : "other", inst: inst || null, faculty: faculty || null, year, course, docIds: items.filter((i) => i.type === "doc").map((i) => i.id), items, viewer: viewer?.id ?? null };
  const place = year ? placeOf({ inst, faculty, year, course }) : null;
  const url = place ? placeUrl(place) : inst && faculty ? `https://${CAMPUS_HOST}/${inst}/${faculty}` : items[0].roomId ? `room:${items[0].roomId}` : null;
  await env.DB.prepare("INSERT INTO contact_requests (id, kind, name, email, url, message, created_at, meta, phone) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id, "takedown", name, email, url, reason, now(), JSON.stringify(meta), phone)
    .run();
  return json({ ok: true, id, held });
}

async function takedownRow(env: Env, contactId: string) {
  const c = await env.DB.prepare("SELECT * FROM contact_requests WHERE id=? AND kind='takedown'").bind(clampStr(contactId, 40)).first<any>();
  if (!c) return null;
  let meta: any = {};
  try {
    meta = JSON.parse(c.meta || "{}");
  } catch {}
  return { c, meta, items: (Array.isArray(meta.items) ? meta.items : []) as TdItem[] };
}

/** admin: final removal of the items a takedown names (or every visible doc of its place), a strike per author, the notice closed */
export async function applyTakedown(env: Env, contactId: string, body: { docIds?: unknown; all?: unknown; items?: unknown }): Promise<Response> {
  const t = await takedownRow(env, contactId);
  if (!t) return fail(404, "not_found", "הפנייה לא נמצאה.");
  const { c, meta } = t;
  const targets: TdItem[] = [];
  const addDoc = (id: string) => {
    if (id && !targets.some((x) => x.type === "doc" && x.id === id)) targets.push({ type: "doc", id });
  };
  for (const x of Array.isArray(body.docIds) ? body.docIds : []) addDoc(clampStr(x, 40));
  for (const raw of Array.isArray(body.items) ? body.items : []) {
    const id = clampStr(raw?.id, 40);
    const type = String(raw?.type || "doc");
    if (!id || !ITEM_TYPES.has(type)) continue;
    if (type === "doc") addDoc(id);
    else if (!targets.some((x) => x.id === id)) targets.push({ type: type as TdItem["type"], id, roomId: clampStr(raw?.roomId, 30) || t.items.find((i) => i.id === id)?.roomId });
  }
  if (body.all) {
    if (!meta.inst || !meta.faculty) return fail(400, "bad_place", "לפנייה אין מקום מוגדר.");
    const sql = `SELECT id FROM campus_docs WHERE inst=? AND faculty=? AND status IN ('visible','hold')${meta.year ? " AND year=?" : ""}${meta.course ? " AND course=?" : ""}`;
    const args = [meta.inst, meta.faculty, ...(meta.year ? [meta.year] : []), ...(meta.course ? [meta.course] : [])];
    for (const r of (await env.DB.prepare(sql).bind(...args).all<any>()).results || []) addDoc(r.id);
  }
  if (!targets.length) for (const it of t.items) targets.push(it);
  const removed: string[] = [];
  const authors = new Set<string>();
  for (const it of targets) {
    if (it.type === "doc") {
      const d = await env.DB.prepare("SELECT id, user_id, r2_key, sha256, status FROM campus_docs WHERE id=?").bind(it.id).first<any>();
      if (!d || d.status === "removed") continue;
      if (d.r2_key) await env.MEDIA.delete(d.r2_key).catch(() => {}); // the uploaded file
      if (d.sha256) await env.DB.prepare("INSERT OR IGNORE INTO blocked_hashes (sha256, created_at, contact_id) VALUES (?,?,?)").bind(d.sha256, now(), c.id).run();
      await env.DB.prepare("UPDATE campus_docs SET status='removed' WHERE id=?").bind(d.id).run();
      await setRefsStatus(env, "doc", d.id, "removed");
      authors.add(d.user_id);
    } else {
      if (!it.roomId || !ROOM_RE.test(it.roomId)) continue;
      const r = await roomOf(env, it.roomId).setStatus(it.type, it.id, "removed").catch(() => ({ ok: false } as any));
      if (!r?.ok || r.prev === "removed") continue;
      if (r.uid) authors.add(r.uid);
      if (it.type === "post") await setRefsStatus(env, "media", it.id, "removed");
    }
    await modLog(env, { action: "takedown", target_type: it.type, target_id: it.id, room_id: it.roomId ?? null, report_id: c.id, reason: meta.role ? `takedown:${meta.role}` : "takedown" });
    removed.push(it.id);
  }
  for (const uid of authors) await env.DB.prepare("UPDATE users SET strikes=strikes+1 WHERE id=?").bind(uid).run();
  await env.DB.prepare("UPDATE contact_requests SET status='handled', handled_at=? WHERE id=?").bind(now(), c.id).run();
  return json({ ok: true, removed, struck: [...authors] });
}

/** admin: the notice was not justified — every item it put on hold goes back, and the notice counts against the requester */
export async function restoreTakedown(env: Env, contactId: string): Promise<Response> {
  const t = await takedownRow(env, contactId);
  if (!t) return fail(404, "not_found", "הפנייה לא נמצאה.");
  const restored: string[] = [];
  for (const it of t.items) {
    if (!it.held) continue;
    if (it.type === "doc") {
      const r = await env.DB.prepare("UPDATE campus_docs SET status='visible' WHERE id=? AND status='hold'").bind(it.id).run();
      if (!r.meta.changes) continue;
      await setRefsStatus(env, "doc", it.id, "visible");
    } else {
      if (!it.roomId || !ROOM_RE.test(it.roomId)) continue;
      const r = await roomOf(env, it.roomId).setStatus(it.type, it.id, "visible").catch(() => ({ ok: false } as any));
      if (!r?.ok) continue;
      if (it.type === "post") await setRefsStatus(env, "media", it.id, "visible");
    }
    await modLog(env, { action: "restore", target_type: it.type, target_id: it.id, room_id: it.roomId ?? null, report_id: t.c.id, reason: "takedown reverted" });
    restored.push(it.id);
  }
  await env.DB.prepare("UPDATE contact_requests SET status='reverted', handled_at=? WHERE id=?").bind(now(), t.c.id).run();
  return json({ ok: true, restored });
}

export async function listTakedowns(env: Env) {
  const rows = (await env.DB.prepare("SELECT * FROM contact_requests WHERE kind='takedown' ORDER BY status='open' DESC, created_at DESC LIMIT 100").all<any>()).results || [];
  return await Promise.all(
    rows.map(async (c) => {
      let meta: any = {};
      try {
        meta = JSON.parse(c.meta || "{}");
      } catch {}
      const ids: string[] = Array.isArray(meta.docIds) ? meta.docIds.slice(0, 50) : [];
      const docs = ids.length
        ? (await env.DB.prepare(`SELECT ${DOC_COLS} FROM campus_docs d WHERE d.id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<any>()).results.map((d) => ({ ...docOut(d), status: d.status }))
        : [];
      return { ...c, meta, docs };
    }),
  );
}

/** how many of a person's documents are on hold after a takedown notice (shown as a notice in the app) */
export async function holdsOf(env: Env, uid: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM campus_docs WHERE user_id=? AND status='hold'").bind(uid).first<{ n: number }>();
  return r?.n ?? 0;
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

// ---------- student identification: name · faculty · year shown beside what a student writes ----------
export interface Student {
  fullName: string;
  email: string | null;
  inst: string;
  faculty: string;
  faculty2: string | null;
  year: number;
  track: string;
  updatedAt: number;
  createdAt: number;
}

export async function getStudent(env: Env, u: User): Promise<Student | null> {
  const r = await env.DB.prepare("SELECT * FROM student_profiles WHERE user_id=?").bind(u.id).first<any>();
  if (!r) return null;
  return { fullName: r.full_name, email: u.email ?? null, inst: r.inst, faculty: r.faculty, faculty2: r.faculty2 || null, year: r.year, track: r.track, updatedAt: r.updated_at, createdAt: r.created_at };
}

export const hasStudent = async (env: Env, uid: string) => !!(await env.DB.prepare("SELECT 1 FROM student_profiles WHERE user_id=?").bind(uid).first());

export const STUDENT_MSG = "כדי להשתתף בקמפוס צריך להזדהות: שם, פקולטה, שנה ומגמה";

export async function putStudent(req: Request, env: Env, u: User): Promise<Response> {
  const b = await readJson(req);
  const fullName = clampStr(b.fullName, 80).replace(/\s+/g, " ");
  if (fullName.length < 2) return fail(400, "bad_name", "כתבו שם מלא.");
  const track = clampStr(b.track, 60).replace(/\s+/g, " ");
  if (track.length < 2) return fail(400, "bad_track", "כתבו את המגמה.");
  for (const t of [fullName, track]) {
    const v = await checkText(env, t, { isNew: true });
    if (!v.ok) return fail(422, v.code, "הפרטים לא עומדים בכללי הקהילה.");
  }
  const inst = slug(String(b.inst || ""));
  const faculty = slug(String(b.faculty || ""));
  const year = Number(b.year);
  if (!inst || faculty.length < 2 || !YEARS.includes(year)) return fail(400, "bad_place", "יש לבחור מוסד, פקולטה ושנה.");
  const faculty2 = slug(String(b.faculty2 || "")) || null;
  if (faculty2 && faculty2.length < 2) return fail(400, "bad_place", "הפקולטה השנייה קצרה מדי.");
  const t = now();
  await env.DB.prepare(
    `INSERT INTO student_profiles (user_id, full_name, inst, faculty, faculty2, year, track, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name, inst=excluded.inst, faculty=excluded.faculty, faculty2=excluded.faculty2, year=excluded.year, track=excluded.track, updated_at=excluded.updated_at`,
  )
    .bind(u.id, fullName, inst, faculty, faculty2, year, track, t, t)
    .run();
  await modLog(env, { actor: u.id, action: "student_profile", target_type: "user", target_id: u.id, reason: `${inst}/${faculty}/${year}` });
  return json({ student: await getStudent(env, u) });
}

// ---------- quotas and the plan ----------
export async function quotaOf(env: Env, uid: string) {
  const st = await getSettings(env);
  const monthStart = new Date(now());
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [m, c] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM campus_docs WHERE user_id=? AND created_at>=?").bind(uid, monthStart.getTime()).first<{ n: number }>(),
    env.DB.prepare("SELECT COALESCE(SUM(chars),0) n FROM campus_docs WHERE user_id=? AND status!='removed'").bind(uid).first<{ n: number }>(),
  ]);
  return { docsPerMonth: st.campusDocsPerMonth, docsThisMonth: m?.n ?? 0, charsPerDoc: Math.min(MAX_BODY, st.campusCharsPerDoc), charsTotal: st.campusCharsTotal, charsUsed: Number(c?.n ?? 0) };
}

export const TRIAL_DAYS = 14;
export const PLAN_MSG = "הקמפוס הוא חלק בתשלום. 14 הימים הראשונים חינם, ואחריהם מנוי לסמסטר.";

/** the plan of a person: paid until, trial until (14 days from the student profile), and whether reading is open */
export async function planOf(env: Env, u: User | null) {
  if (!u) return { active: false, until: null, trialUntil: null, price: (await getSettings(env)).campusPrice };
  const sp = await env.DB.prepare("SELECT created_at FROM student_profiles WHERE user_id=?").bind(u.id).first<{ created_at: number }>();
  const trialUntil = sp ? new Date(sp.created_at + TRIAL_DAYS * 86_400_000).toISOString().slice(0, 10) : null;
  const until = u.campus_until || null;
  const today = todayIL();
  const active = (!!until && until >= today) || (!!trialUntil && trialUntil >= today);
  return { active, until, trialUntil, price: (await getSettings(env)).campusPrice };
}

export async function grantPlan(env: Env, uid: string, days: number) {
  const until = new Date(now() + days * 86_400_000).toISOString().slice(0, 10);
  await env.DB.prepare("UPDATE users SET campus_until=CASE WHEN campus_until IS NULL OR campus_until<? THEN ? ELSE campus_until END WHERE id=?").bind(until, until, uid).run();
  return (await env.DB.prepare("SELECT campus_until FROM users WHERE id=?").bind(uid).first<{ campus_until: string }>())?.campus_until ?? until;
}

// ---------- the directory: course › lecturer › lesson, and the archive of a lecturer ----------
export async function directory(env: Env, inst: string, faculty: string, year?: number | null) {
  const rows = (await env.DB.prepare(
    `SELECT course, lecturer, MAX(lecturer_name) AS lecturer_name, lesson_date, COUNT(*) n, GROUP_CONCAT(topic, '\u001f') AS topics FROM campus_docs
     WHERE inst=? AND faculty=? ${year ? "AND year=?" : ""} AND status='visible' AND body IS NOT NULL AND course IS NOT NULL
     GROUP BY course, lecturer, lesson_date ORDER BY course, lecturer, lesson_date`,
  ).bind(inst, faculty, ...(year ? [year] : [])).all<any>()).results || [];
  const courses: { course: string; n: number; lecturers: { lecturer: string | null; name: string | null; n: number; lessons: { date: string; n: number; topics: string[] }[] }[] }[] = [];
  for (const r of rows) {
    let c = courses.find((x) => x.course === r.course);
    if (!c) courses.push((c = { course: r.course, n: 0, lecturers: [] }));
    let l = c.lecturers.find((x) => x.lecturer === (r.lecturer || null));
    if (!l) c.lecturers.push((l = { lecturer: r.lecturer || null, name: r.lecturer_name || null, n: 0, lessons: [] }));
    const n = Number(r.n);
    c.n += n;
    l.n += n;
    if (r.lesson_date) l.lessons.push({ date: r.lesson_date, n, topics: [...new Set(String(r.topics || "").split("\u001f").filter(Boolean))].slice(0, 5) });
  }
  return courses;
}

export async function lecturerArchive(env: Env, inst: string, faculty: string, lecturer: string) {
  const rows = (await env.DB.prepare(`SELECT ${DOC_COLS} FROM campus_docs d WHERE d.inst=? AND d.faculty=? AND d.lecturer=? AND d.status='visible' AND d.body IS NOT NULL ORDER BY d.year, d.course, d.lesson_date, d.created_at LIMIT 300`)
    .bind(inst, faculty, lecturer)
    .all<any>()).results || [];
  return rows.map(docOut);
}

// ---------- «הוסף מידע»: a person's own materials, attached to any room as references stored once ----------
const REF_ROOMS_MAX = 50;

export async function myMaterials(env: Env, u: User) {
  const docs = (await env.DB.prepare(`SELECT ${DOC_COLS} FROM campus_docs d WHERE d.user_id=? AND d.status='visible' AND d.body IS NOT NULL ORDER BY d.created_at DESC LIMIT 50`).bind(u.id).all<any>()).results.map(docOut);
  const rows = (await env.DB.prepare("SELECT item_id, room_id, created_at FROM content_index WHERE user_id=? AND kind='image' AND expires_at>? ORDER BY created_at DESC LIMIT 50").bind(u.id, now()).all<any>()).results || [];
  const media: { id: string; roomId: string; media: string | null; caption: string; ts: number; url?: string }[] = [];
  for (const r of rows) {
    const it = await roomOf(env, r.room_id).getItem("post", r.item_id).catch(() => null);
    if (!it || it.status !== "visible") continue;
    media.push({ id: it.id, roomId: r.room_id, media: it.media_key ? `/m/${it.media_key}` : null, caption: it.body || "", ts: it.created_at, url: it.meta?.url });
  }
  return { docs, media };
}

/** the reference card of a material: what a ref post carries */
export async function refOfMaterial(env: Env, u: User, type: string, id: string): Promise<{ ref: any; srcRoom: string | null } | Response> {
  if (type === "doc") {
    const d = await getDoc(env, id);
    if (!d || d.user_id !== u.id || d.status !== "visible") return fail(404, "not_found", "המסמך לא נמצא או אינו שלך.");
    return { ref: { type: "doc", id: d.id, title: d.title, kind: d.kind, author: d.user_name, link: docUrl("", d.id), place: { inst: d.inst, faculty: d.faculty, year: d.year, course: d.course || undefined }, chars: d.chars }, srcRoom: null };
  }
  if (type === "media") {
    const ci = await env.DB.prepare("SELECT room_id FROM content_index WHERE item_id=? AND user_id=? AND kind='image'").bind(clampStr(id, 40), u.id).first<{ room_id: string }>();
    const it = ci ? await roomOf(env, ci.room_id).getItem("post", id).catch(() => null) : null;
    if (!it || it.status !== "visible") return fail(404, "not_found", "התמונה לא נמצאה או אינה שלך.");
    return { ref: { type: "media", id: it.id, title: it.body || "", kind: "image", author: it.user_name, link: it.meta?.url || null, media: it.media_key ? `/m/${it.media_key}` : null }, srcRoom: ci!.room_id };
  }
  return fail(400, "bad_type", "סוג פריט לא מוכר.");
}

export async function roomsOfMaterial(env: Env, type: string, id: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM material_refs WHERE type=? AND item_id=?").bind(type, id).first<{ n: number }>();
  return r?.n ?? 0;
}
export const refRoomsMax = () => REF_ROOMS_MAX;

export async function recordRef(env: Env, p: { type: string; itemId: string; srcRoom: string | null; roomId: string; postId: string; uid: string }) {
  await env.DB.prepare("INSERT OR IGNORE INTO material_refs (type, item_id, src_room, room_id, post_id, user_id, created_at) VALUES (?,?,?,?,?,?,?)")
    .bind(p.type, p.itemId, p.srcRoom, p.roomId, p.postId, p.uid, now())
    .run();
}

export async function existingRef(env: Env, type: string, itemId: string, roomId: string) {
  return await env.DB.prepare("SELECT post_id FROM material_refs WHERE type=? AND item_id=? AND room_id=?").bind(type, itemId, roomId).first<{ post_id: string }>();
}

/** the original was held, restored or deleted: every reference follows it */
export async function setRefsStatus(env: Env, type: string, itemId: string, status: "visible" | "hold" | "removed") {
  const rows = (await env.DB.prepare("SELECT room_id, post_id FROM material_refs WHERE type=? AND item_id=?").bind(type, itemId).all<any>()).results || [];
  for (const r of rows) await roomOf(env, r.room_id).setStatus("post", r.post_id, status).catch(() => null);
  if (status === "removed") {
    await env.DB.prepare("DELETE FROM material_refs WHERE type=? AND item_id=?").bind(type, itemId).run();
    if (rows.length) await env.DB.prepare(`DELETE FROM content_index WHERE kind='ref' AND item_id IN (${rows.map(() => "?").join(",")})`).bind(...rows.map((r: any) => r.post_id)).run();
  }
}
