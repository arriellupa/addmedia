// The media page's own state: which mode (command center / campus), which campus place, the follows and the
// directory of who is online. Rooms, chat, talkbacks and media come from the shared panel state (../state).
import { batch, computed, signal } from "@preact/signals";
import { CampusDoc, CampusPlace, Directory, Follow, api } from "../api";
import { me, say, scope, setPage, setScope, page, load } from "../state";

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

export const YEAR_HE = ["", "א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"];
export const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
export const unslug = (s: string) => s.replace(/-/g, " ");

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
  if (m) return { mode: "campus", place: { inst: decodeURIComponent(m[1]), faculty: decodeURIComponent(m[2]), year: Number(m[3]), course: m[4] ? decodeURIComponent(m[4]) : undefined } };
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
  batch(() => {
    mode.value = "campus";
    place.value = pl;
    picker.value = false;
    docs.value = [];
  });
  push(placePath(pl), replace);
  setPage({ url: placeUrl(pl), title: placeTitle(pl) });
  // the room of a course is its own; the faculty/year hub is the "site". No auto-scope here: the student chose.
  if (pl.course && scope.value !== "page") setScope("page");
  loadDocs();
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
  try {
    const r = await api.campusDocs(pl);
    if (place.value === pl) docs.value = r.docs;
  } catch {
  } finally {
    docsBusy.value = false;
  }
}

export async function uploadDoc(kind: "article" | "summary", title: string, file: File): Promise<boolean> {
  const pl = place.value;
  if (!pl) return false;
  try {
    const r = await api.uploadDoc(pl, kind, title, file);
    docs.value = [r.doc, ...docs.value];
    say(kind === "article" ? "המאמר עלה." : "הסיכום עלה.");
    return true;
  } catch (e: any) {
    say(e.message, "err");
    return false;
  }
}

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
