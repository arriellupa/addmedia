// The media page's own state: which mode (command center / campus), which campus place, the follows and the
// directory of who is online. Rooms, chat, talkbacks and media come from the shared panel state (../state).
import { batch, computed, signal } from "@preact/signals";
import { CampusDoc, CampusEvent, CampusPlace, CourseMeta, Coverage, Directory, DirectoryTree, DocKind, EventKind, Follow, Student, api } from "../api";
import { me, say, scope, setPage, setScope, page, load, chat, sheet, setWriteGate } from "../state";

export type Mode = "center" | "campus";
export const CAMPUS_HOST = "campus.addmedia.noaplate.com";

export const mode = signal<Mode>("center");
export const place = signal<CampusPlace | null>(null);
export const tree = signal<{ institutions: { id: string; name: string; faculties: string[] }[]; years: number[] } | null>(null);
export const docs = signal<CampusDoc[]>([]);
export const docsBusy = signal(false);
export const follows = signal<Follow[]>([]);
export const directory = signal<Directory | null>(null);
export const picker = signal(false);

// ---------- campus v2 ----------
export type CampusTab = "docs" | "chat" | "talk" | "media" | "people";
export const ctab = signal<CampusTab>("docs");
export const coverage = signal<Coverage | null>(null);
export const docsError = signal<string | null>(null);
export const courseMeta = signal<CourseMeta | null>(null);
export const events = signal<CampusEvent[]>([]);
export const eventsError = signal<string | null>(null);
/** the document open in the in-page reader, and its section (1..n) */
export const reader = signal<{ doc: CampusDoc; section: number } | null>(null);
/** a deep link (`?doc=&s=`) waiting for the documents to load */
export const pendingDoc = signal<{ id: string; section: number } | null>(null);
/** the editor: a new document of a kind, or an existing one of mine */
export const editor = signal<{ kind: DocKind; doc?: CampusDoc; body?: string } | null>(null);
/** after the picker: an invitation to follow the year */
export const followPrompt = signal(false);
/** the phone's search sheet */
export const searchOpen = signal(false);
export const takedownOpen = signal<false | { item?: { type: "doc" | "post" | "chat"; id: string; title: string; sections?: { i: number; heading: string }[] } }>(false);
/** the paywall: reading needs a plan or the trial (402 `plan`) */
export const paywall = signal<{ msg: string; price?: number; signedIn?: boolean } | null>(null);
export const showPaywall = (e: any) => (paywall.value = { msg: e?.message || "הקמפוס הוא חלק בתשלום.", price: e?.extra?.plan?.price, signedIn: e?.extra?.signedIn });
/** the directory of the faculty/year: course › lecturer › lesson, counted from the documents */
export const dirTree = signal<DirectoryTree | null>(null);
/** the node chosen in the directory: a lecturer (and a lesson date) inside the open course, or a lecturer's archive */
export const dirNode = signal<{ lecturer?: string; date?: string } | null>(null);
export const archive = signal<{ lecturer: string; docs: CampusDoc[] | null; error?: string } | null>(null);
/** the phone's directory sheet */
export const dirOpen = signal(false);

export async function loadDirTree() {
  const pl = place.value;
  if (!pl) return;
  try {
    const r = await api.campusTree(pl);
    if (place.value?.inst === pl.inst && place.value.faculty === pl.faculty && place.value.year === pl.year) dirTree.value = { courses: (r.courses || []).filter((c) => !!c.course) };
  } catch {
    dirTree.value = { courses: [] };
  }
}
export async function openArchive(lecturer: string) {
  const pl = place.value;
  if (!pl) return;
  archive.value = { lecturer, docs: null };
  dirOpen.value = false;
  try {
    const r = await api.lecturerDocs(pl.inst, pl.faculty, lecturer);
    if (archive.value?.lecturer === lecturer) archive.value = { lecturer, docs: r.docs };
  } catch (e: any) {
    if (e?.status === 402) showPaywall(e);
    if (archive.value?.lecturer === lecturer) archive.value = { lecturer, docs: [], error: e?.message || "הארכיון לא נטען." };
  }
}
/** a lecturer's display name, from the directory */
export const lecturerName = (slug: string) => {
  for (const c of dirTree.value?.courses || []) for (const l of c.lecturers) if (l.lecturer === slug && l.name) return l.name;
  return unslug(slug);
};
/** the documents of the node chosen in the directory */
export const nodeDocs = computed(() => {
  const n = dirNode.value;
  let list = docs.value;
  if (n?.lecturer) list = list.filter((d) => (d.lecturer || "") === n.lecturer);
  if (n?.date) list = list.filter((d) => d.lessonDate === n.date);
  return list;
});

// ---------- the student's identification (required for every write in the campus) ----------
/** undefined = not fetched yet; null = none */
export const student = signal<Student | null | undefined>(undefined);
let studentReq: Promise<Student | null> | null = null;
export function loadStudent(force = false): Promise<Student | null> {
  if (!me.value) return Promise.resolve((student.value = null));
  if (!force && student.value !== undefined) return Promise.resolve(student.value);
  if (!studentReq)
    studentReq = api
      .student()
      .then((r) => (student.value = r.student))
      .catch(() => (student.value === undefined ? null : student.value))
      .finally(() => (studentReq = null));
  return studentReq;
}
export async function saveStudent(b: { fullName: string; inst: string; faculty: string; faculty2?: string | null; year: number; track: string }): Promise<boolean> {
  try {
    const r = await api.saveStudent(b);
    student.value = r.student;
    return true;
  } catch (e: any) {
    say(e.message, "err");
    return false;
  }
}
/** a 403 `student` from the server: forget the cached profile, ask, and retry */
function studentRetry(e: any, retry: () => void): boolean {
  if (e?.code !== "student") return false;
  student.value = null;
  sheet.value = { type: "student", then: retry };
  return true;
}
/** the campus's write gate: signed in → identified → fn. Opens «פרטי סטודנט» when needed and resumes after. */
setWriteGate((fn) => {
  if (student.value) return true;
  if (student.value === null) {
    sheet.value = { type: "student", then: fn };
    return false;
  }
  loadStudent().then((s) => (s ? fn() : (sheet.value = { type: "student", then: fn })));
  return false;
});

export const KIND_HE: Record<DocKind, string> = { summary: "סיכום", exercise: "תרגול", article: "מאמר" };
export const EVENT_HE: Record<EventKind, string> = { exam: "מבחן", deadline: "הגשה", other: "אירוע" };

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** whole days from today to an ISO date (negative = past) */
export const daysUntil = (iso: string) => Math.round((new Date(iso + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400_000);

/** the nearest event from today on */
export const nextEvent = computed(() => events.value.filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null);
/** exam mode: an exam within 10 days, or the course's examUntil still ahead */
export const examMode = computed(() => {
  const ex = courseMeta.value?.examUntil;
  if (ex && ex >= today()) return true;
  return events.value.some((e) => e.kind === "exam" && daysUntil(e.date) >= 0 && daysUntil(e.date) <= 10);
});
export const nextExam = computed(() => events.value.filter((e) => e.kind === "exam" && daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null);
/** the live chat had a message in the last hour */
export const chatActive = computed(() => {
  const last = chat.value.at(-1);
  return !!last && Date.now() - last.ts < 3600_000;
});

export const YEAR_HE = ["", "א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"];
export const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
export const unslug = (s: string | null | undefined) => (s || "").replace(/-/g, " ");

export const placeUrl = (p: CampusPlace) => `https://${CAMPUS_HOST}/${p.inst}/${p.faculty}/${p.year}${p.course ? "/" + p.course : ""}`;
export const placePath = (p: CampusPlace) => `/media/campus/${p.inst}/${p.faculty}/${p.year}${p.course ? "/" + p.course : ""}`;
export function placeTitle(p: CampusPlace, withCourse = true): string {
  const inst = tree.value?.institutions.find((i) => i.id === p.inst)?.name || p.inst;
  return `${inst} · ${unslug(p.faculty)} · שנה ${YEAR_HE[p.year] || p.year}${withCourse && p.course ? " · " + unslug(p.course) : ""}`;
}
export const instName = (id: string) => tree.value?.institutions.find((i) => i.id === id)?.name || id;

/** the stable address of what is open now (a campus page or a site), or null for an ordinary page */
export const currentPath = computed<{ path: string; title: string } | null>(() => {
  if (mode.value === "campus") {
    const pl = place.value;
    return pl ? { path: placePath(pl), title: placeTitle(pl) } : null;
  }
  const p = page.value;
  if (!p) return null;
  try {
    const host = new URL(p.url).host.replace(/^www\./, "");
    if (scope.value === "site") return { path: `/media/site/${host}`, title: host };
  } catch {}
  return null;
});
export const followed = computed(() => {
  const c = currentPath.value;
  return !!c && follows.value.some((f) => f.path === c.path);
});

// ---------- navigation: the address bar is the state ----------
export function parseLocation(): { mode: Mode; place?: CampusPlace; url?: string; title?: string } {
  const path = location.pathname.replace(/\/+$/, "");
  const q = new URLSearchParams(location.search);
  const m = path.match(/^\/media\/campus\/([^/]+)\/([^/]+)\/([1-6])(?:\/([^/]+))?$/);
  if (m) {
    const doc = q.get("doc");
    if (doc) pendingDoc.value = { id: doc, section: Math.max(1, Number(q.get("s")) || 1) };
    return { mode: "campus", place: { inst: decodeURIComponent(m[1]), faculty: decodeURIComponent(m[2]), year: Number(m[3]), course: m[4] ? decodeURIComponent(m[4]) : undefined } };
  }
  if (path === "/media/campus") return { mode: "campus" };
  const s = path.match(/^\/media\/site\/([a-z0-9.-]+)$/i);
  if (s) return { mode: "center", url: `https://${s[1].toLowerCase()}/`, title: s[1].toLowerCase() };
  const u = q.get("url");
  return { mode: "center", url: u || undefined, title: q.get("title") || undefined };
}

function push(path: string, replace = false) {
  if (location.pathname + location.search === path) return;
  history[replace ? "replaceState" : "pushState"](null, "", path);
}

export function openPlace(pl: CampusPlace, replace = false) {
  const same = place.value && placePath(place.value) === placePath(pl);
  batch(() => {
    mode.value = "campus";
    place.value = pl;
    picker.value = false;
    searchOpen.value = false;
    if (!same) {
      docs.value = [];
      coverage.value = null;
      courseMeta.value = null;
      events.value = [];
      reader.value = null;
      editor.value = null;
      ctab.value = "docs";
      dirNode.value = null;
      archive.value = null;
      if (!place.value || place.value.inst !== pl.inst || place.value.faculty !== pl.faculty || place.value.year !== pl.year) dirTree.value = null;
    }
  });
  push(placePath(pl) + (pendingDoc.value ? `?doc=${pendingDoc.value.id}&s=${pendingDoc.value.section}` : ""), replace);
  setPage({ url: placeUrl(pl), title: placeTitle(pl) });
  // the room of a course is its own; the faculty/year hub is the "site". No auto-scope here: the student chose.
  if (pl.course && scope.value !== "page") setScope("page");
  loadDocs();
  loadCourse();
  loadEvents();
  loadDirTree();
}

/** leave the place: the home (follows) or the picker */
export function goHome() {
  batch(() => {
    mode.value = "campus";
    place.value = null;
    reader.value = null;
    editor.value = null;
    picker.value = false;
    searchOpen.value = false;
  });
  push("/media/campus");
  setPage(null);
}

export function openUrl(url: string, title?: string, replace = false) {
  batch(() => {
    mode.value = "center";
    picker.value = false;
  });
  let path = `/media/?url=${encodeURIComponent(url)}`;
  try {
    const u = new URL(url);
    if ((u.pathname === "/" || u.pathname === "") && !u.search) path = `/media/site/${u.host.replace(/^www\./, "")}`;
  } catch {}
  push(path, replace);
  setPage({ url, title: title || null });
}

export function openSite(host: string) {
  openUrl(`https://${host}/`, host);
  setScope("site");
}

/** join a room from the directory: a campus room by its synthetic URL, any other by its address */
export function joinRoom(r: { url?: string; kind: string; title?: string }) {
  if (!r.url) return;
  const m = r.url.match(new RegExp(`^https://${CAMPUS_HOST.replace(/\./g, "\\.")}/([^/]+)/([^/]+)/([1-6])(?:/([^/]+))?$`));
  if (m) return openPlace({ inst: m[1], faculty: m[2], year: Number(m[3]), course: m[4] || undefined });
  openUrl(r.url, r.title || undefined);
  if (r.kind === "site") setScope("site");
}

export function toggleMode() {
  if (mode.value === "campus") {
    const last = localStorage.getItem("am_last_url");
    mode.value = "center";
    if (last) openUrl(last, undefined, false);
    else {
      push("/media/");
      setPage(null);
    }
  } else {
    if (page.value?.url) localStorage.setItem("am_last_url", page.value.url);
    const saved = localStorage.getItem("am_last_place");
    if (saved) {
      try {
        return openPlace(JSON.parse(saved));
      } catch {}
    }
    batch(() => {
      mode.value = "campus";
      place.value = null;
      picker.value = true;
    });
    push("/media/campus");
    setPage(null);
  }
}

// ---------- data ----------
export async function loadTree() {
  if (tree.value) return;
  try {
    tree.value = await api.campusTree();
  } catch {}
}

export async function loadDirectory() {
  try {
    directory.value = await api.directory(mode.value === "campus");
  } catch {}
}

export async function loadFollows() {
  if (!me.value) return (follows.value = []);
  try {
    follows.value = (await api.follows()).follows;
  } catch {}
}

export async function toggleFollow() {
  const c = currentPath.value;
  if (!c) return;
  const was = followed.value;
  try {
    follows.value = (await api.follow(c.path, c.title, was)).follows;
    say(was ? "הסרת מהמעקב." : "נוסף למעקב: הדף הזה תמיד יחכה לך למעלה.");
  } catch (e: any) {
    say(e.message, "err");
  }
}

export async function loadDocs() {
  const pl = place.value;
  if (!pl) return;
  docsBusy.value = true;
  docsError.value = null;
  try {
    const r = await api.campusDocs(pl);
    if (place.value !== pl) return;
    batch(() => {
      docs.value = r.docs;
      coverage.value = r.coverage ?? { docs: r.docs.length, summaries: r.docs.filter((d) => d.kind === "summary").length, exercises: r.docs.filter((d) => d.kind === "exercise").length, articles: r.docs.filter((d) => d.kind === "article").length };
    });
    // a deep link waits for the list
    const pd = pendingDoc.value;
    if (pd) {
      const d = r.docs.find((x) => x.id === pd.id);
      pendingDoc.value = null;
      if (d) openDoc(d, pd.section, true);
      else say("המסמך מהקישור כבר לא כאן.", "err");
    }
  } catch (e: any) {
    if (e?.status === 402 || e?.code === "plan") {
      showPaywall(e);
      if (place.value === pl) docsError.value = null;
      return;
    }
    if (place.value === pl) docsError.value = e?.message || "הטעינה נכשלה.";
  } finally {
    docsBusy.value = false;
  }
}

export async function loadCourse() {
  const pl = place.value;
  if (!pl) return;
  try {
    const r = await api.course(pl);
    if (place.value === pl) courseMeta.value = r || {};
  } catch {
    if (place.value === pl) courseMeta.value = {};
  }
}

export async function saveCourse(b: { chatUrl?: string | null; examUntil?: string | null }): Promise<boolean> {
  const pl = place.value;
  if (!pl) return false;
  try {
    const r = await api.setCourse(pl, b);
    courseMeta.value = { ...(courseMeta.value || {}), ...b, ...(r || {}) };
    say("נשמר. תודה שעדכנתם את הקורס.");
    return true;
  } catch (e: any) {
    if (studentRetry(e, () => saveCourse(b))) return false;
    say(e.message, "err");
    return false;
  }
}

export async function loadEvents() {
  const pl = place.value;
  if (!pl) return;
  eventsError.value = null;
  try {
    const r = await api.events(pl);
    if (place.value === pl) events.value = r.events;
  } catch (e: any) {
    if (place.value === pl) eventsError.value = e?.message || "לוח הסמסטר לא נטען.";
  }
}

export async function addEvent(b: { title: string; date: string; kind: EventKind }): Promise<boolean> {
  const pl = place.value;
  if (!pl) return false;
  try {
    const r = await api.addEvent(pl, { ...b, ...(pl.course ? { course: pl.course } : {}) });
    events.value = [...events.value, r.event].sort((a, c) => a.date.localeCompare(c.date));
    say("נוסף ללוח הסמסטר.");
    return true;
  } catch (e: any) {
    if (studentRetry(e, () => addEvent(b))) return false;
    say(e.message, "err");
    return false;
  }
}

export async function removeEvent(id: string) {
  const was = events.value;
  events.value = was.filter((e) => e.id !== id);
  try {
    await api.deleteEvent(id);
  } catch (e: any) {
    events.value = was;
    say(e.message, "err");
  }
}

/** friendly words for the server's refusals when a document is saved */
export function docError(e: any): string {
  switch (e?.code) {
    case "student":
      return "כדי להשתתף בקמפוס צריך להזדהות: שם, פקולטה, שנה ומגמה.";
    case "author":
      return "צריך לאשר שכתבתם או ערכתם את הטקסט במילים שלכם.";
    case "strikes":
      return "החשבון שלכם לא יכול לפרסם כרגע, אחרי כמה הסרות לבקשת מרצים או בעלי זכויות.";
    case "source":
      return "קשרו למקור הציבורי: court.gov.il או כתב העת. אתרים כמו nevo ו-takdin אינם מתקבלים.";
    case "bad_url":
      return "הקישור לא תקין: צריך כתובת https:// או DOI.";
    case "terms":
      return "יש לאשר את כללי הקהילה לפני הפרסום הראשון.";
    case "short":
    case "too_short":
      return "הטקסט קצר מדי (לפחות 20 תווים).";
    case "too_long":
    case "too_big":
      return "הטקסט ארוך מדי (עד 60,000 תווים).";
    case "quota":
      return e?.message || "הגעתם למכסה החודשית של סיכומים.";
    case "course":
    case "bad_course":
      return "סיכום ותרגול צריכים קורס. בחרו או כתבו את שם הקורס.";
  }
  return e?.message || "השמירה נכשלה. נסו שוב.";
}

export async function saveDoc(b: { kind: DocKind; title: string; body: string; link?: string; lecturer?: string; lessonDate?: string; lessonNo?: number; course?: string }, existing?: CampusDoc): Promise<CampusDoc | null> {
  const base = place.value;
  if (!base) return null;
  const pl: CampusPlace = b.course ? { ...base, course: b.course } : base;
  try {
    if (existing) {
      const r = await api.updateDoc(existing.id, { title: b.title, body: b.body, ...(b.link !== undefined ? { link: b.link } : {}), ...(b.lecturer !== undefined ? { lecturer: b.lecturer } : {}), ...(b.lessonDate !== undefined ? { lessonDate: b.lessonDate } : {}), ...(b.lessonNo !== undefined ? { lessonNo: b.lessonNo } : {}) });
      docs.value = docs.value.map((d) => (d.id === existing.id ? r.doc : d));
      bodyCache.set(existing.id, b.body);
      say("השינויים נשמרו.");
      return r.doc;
    }
    const { course: _c, ...rest } = b;
    const r = await api.createDoc(pl, { ...rest, author: true });
    docs.value = [r.doc, ...docs.value];
    loadDirTree();
    bodyCache.set(r.doc.id, b.body);
    const c = coverage.value || { docs: 0, summaries: 0, exercises: 0, articles: 0 };
    coverage.value = { docs: c.docs + 1, summaries: c.summaries + (b.kind === "summary" ? 1 : 0), exercises: (c.exercises || 0) + (b.kind === "exercise" ? 1 : 0), articles: c.articles + (b.kind === "article" ? 1 : 0) };
    say(b.kind === "article" ? "המאמר נוסף לקורס." : b.kind === "exercise" ? "התרגול פורסם." : "הסיכום פורסם.");
    return r.doc;
  } catch (e: any) {
    if (studentRetry(e, () => saveDoc(b, existing))) return null;
    say(docError(e), "err");
    return null;
  }
}

/** the bodies already fetched (the list carries only sections and counts) */
export const bodyCache = new Map<string, string>();
export async function fetchBody(id: string): Promise<string> {
  const c = bodyCache.get(id);
  if (c !== undefined) return c;
  try {
    const r = await api.getDoc(id);
    bodyCache.set(id, r.body);
    return r.body;
  } catch (e: any) {
    if (e?.status === 402 || e?.code === "plan") showPaywall(e);
    throw e;
  }
}

/** the sections of a body, as the server counts them: section 1 is the text before the first heading (if any) */
export function splitSections(body: string): { i: number; heading: string; text: string }[] {
  const out: { i: number; heading: string; text: string }[] = [];
  let cur: { i: number; heading: string; text: string } | null = null;
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      cur = { i: out.length + 1, heading: m[1], text: "" };
      out.push(cur);
    } else {
      if (!cur) {
        cur = { i: 1, heading: "", text: "" };
        out.push(cur);
      }
      cur.text += (cur.text ? "\n" : "") + line;
    }
  }
  return out.filter((s, idx) => s.heading || s.text.trim() || idx === 0);
}

// ---------- the in-page reader ----------
export function openDoc(d: CampusDoc, section = 1, replace = false) {
  reader.value = { doc: d, section: Math.max(1, section) };
  syncReaderUrl(replace);
}

export function readerSection(n: number) {
  const v = reader.value;
  if (!v) return;
  reader.value = { ...v, section: Math.max(1, n) };
  syncReaderUrl(true);
}

export function closeReader() {
  reader.value = null;
  syncReaderUrl(true);
}

function syncReaderUrl(replace: boolean) {
  const pl = place.value;
  if (!pl) return;
  const v = reader.value;
  push(placePath(pl) + (v ? `?doc=${encodeURIComponent(v.doc.id)}&s=${v.section}` : ""), replace);
}

/** the shareable address of a section of a document */
export const docLink = (d: CampusDoc, section: number) => `${location.origin}${placePath(d.place)}?doc=${encodeURIComponent(d.id)}&s=${section}`;

export async function removeDoc(id: string) {
  try {
    await api.deleteDoc(id);
    docs.value = docs.value.filter((d) => d.id !== id);
  } catch (e: any) {
    say(e.message, "err");
  }
}

/** open the room of a document (an article's own discussion) */
export function openDocRoom(d: CampusDoc) {
  setPage({ url: d.url, title: d.title });
  if (scope.value !== "page") setScope("page");
  else load();
}

export function remember() {
  if (mode.value === "campus" && place.value) localStorage.setItem("am_last_place", JSON.stringify(place.value));
}
