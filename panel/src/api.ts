import type { PageCtx } from "./host";

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string) || (location.protocol.startsWith("http") ? location.origin : "https://addmedia.noaplate.com");

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: any = {}) {
    super(message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => (token = t);
export const getToken = () => token;

/** this browser's id, kept in localStorage and sent as `X-Device` on every call (the server counts active devices) */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("am_device");
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("am_device", id);
    }
    return id;
  } catch {
    return "";
  }
}

async function call<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: Blob; type?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const dev = deviceId();
  if (dev) headers["X-Device"] = dev;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.raw) headers["Content-Type"] = opts.type || opts.raw.type;
  let r: Response;
  try {
    r = await fetch(API_BASE + path, { method: opts.method || "GET", headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  } catch {
    throw new ApiError(0, "network", "אין חיבור לשרת. בדקו את החיבור לאינטרנט.");
  }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j?.error?.code || "error", j?.error?.message || "משהו השתבש. נסו שוב.", j?.error);
  return j as T;
}

export const pageQuery = (p: PageCtx, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ url: p.url, ...extra });
  if (p.canonical) q.set("canonical", p.canonical);
  if (p.title) q.set("title", p.title.slice(0, 200));
  if (p.optout) q.set("optout", p.optout);
  return q.toString();
};

export interface Post {
  id: string;
  ts: number;
  uid: string;
  name: string;
  kind: "text" | "image" | "ref";
  body: string;
  /** a `ref` post: one of the author's own materials attached to this room */
  ref?: { type: "doc" | "media"; id: string; title: string; kind?: string; author?: string; link?: string } | null;
  media: string | null;
  parentId: string | null;
  likes: number;
  liked: boolean;
  expiresAt: number;
  pinned: boolean;
  status: string;
  link?: string | null;
}
export interface ChatMsg {
  id: string;
  ts: number;
  uid: string;
  name: string;
  body: string;
  pending?: boolean;
  failed?: string;
  cid?: string;
}
export interface Ad {
  id: string;
  advertiser: string;
  title: string;
  body: string | null;
  image: string | null;
  href: string;
}
export interface Me {
  id: string;
  name: string;
  createdAt: number;
  termsAccepted: boolean;
  credits: { media: number; pin: number };
  isNew: boolean;
  role: string;
  /** the login email, when the server sends it */
  email?: string;
  strikes?: number;
  /** the campus plan's end (ISO date), when there is one */
  campusUntil?: string | null;
  /** items of mine on hold after a takedown request */
  holds?: number;
  /** AddStudent: whether a password is set (code-only accounts are asked to set one) */
  hasPassword?: boolean;
}
/** the student's identification, shown to the cohort as «שם · פקולטה · שנה» */
export interface Student { fullName: string; email?: string; inst: string; faculty: string; faculty2?: string | null; year: number; track: string; createdAt?: number; updatedAt?: number }
export interface Bundle {
  page: { id: string; url: string; display: string; host: string; site: string };
  siteId: string;
  roomId: string;
  scope: "page" | "site";
  disabled?: string;
  rules: { comments: boolean; ads: boolean };
  room: { exists: boolean; presence: number; slow: boolean; posts: Post[]; media: Post[]; chat: ChatMsg[]; postCount: number; mediaCount: number };
  other: { scope: "page" | "site"; presence: number; postCount: number; chat: ChatMsg[] };
  ads: { top: Ad | null; feed: Ad[] };
  me: Me | null;
  settings?: PublicSettings;
}
export interface PageCard { summary: string[]; questions: string[]; lang: string; ts: number }
export interface CenterAd {
  title: string;
  body: string;
  image: string | null;
  url: string | null;
  label: string;
  modes: ("center" | "campus")[];
}
export interface PublicSettings {
  pageThreshold: number;
  freeMedia: number;
  retentionDays: number;
  linkMedia: boolean;
  centerAd: CenterAd | null;
  /** the opening card (summary, questions, ask the page) is on */
  aiCards?: boolean;
  /** agorot per semester, when the campus plan is priced */
  campusPrice?: number;
  campusDocsPerMonth?: number;
  campusCharsPerDoc?: number;
  campusCharsTotal?: number;
}
export interface DirectoryRoom { roomId: string; kind: string; url?: string; title?: string; n: number }
export interface Directory { total: number; sites: { site: string; n: number; rooms: DirectoryRoom[] }[] }
export interface CampusPlace { inst: string; faculty: string; year: number; course?: string }
export type DocKind = "summary" | "exercise" | "article";
export interface DocSection { i: number; heading: string }
/** a text document the student wrote (a summary, an exercise) or an article as a link with the student's words */
export interface CampusDoc {
  id: string;
  uid: string;
  name: string;
  place: CampusPlace;
  kind: DocKind;
  title: string;
  /** an article's public address */
  link?: string | null;
  sections: DocSection[];
  chars: number;
  ts: number;
  updatedAt?: number | null;
  /** the room of this document */
  url: string;
  /** the lecturer (display) and the lesson, for summaries and exercises */
  lecturer?: string | null;
  lecturerName?: string | null;
  lessonDate?: string | null;
  lessonNo?: number | null;
  /** `hold` after a takedown request: only the author sees it, with a label */
  status?: string;
  /** where it comes from: the student's own words, or a lesson presentation the students received */
  source?: "own" | "received";
  /** AddStudent: the summary's topic and its publication date */
  topic?: string | null;
  published?: string | null;
  /** an uploaded Word / PDF file, when the summary is a file */
  file?: { url: string; type: "pdf" | "docx"; size: number } | null;
  track?: string | null;
}
/** the viewer, as the server names them on a document read (printed as the watermark) */
export interface ShownTo { name: string; email: string }
export interface Device { id: string; name: string; lastSeen: number | string | null; current: boolean }
export interface SearchFilters { q?: string; year?: number; course?: string; lecturer?: string; from?: string; to?: string }
export interface DocMeta { course?: string; lecturer?: string; lessonDate?: string; lessonNo?: number; topic?: string; published?: string; source?: "own" | "received" }
export interface DirectoryTree { courses?: { course: string | null; n?: number; lecturers: { lecturer: string | null; name?: string | null; n: number; lessons: { date: string | null; n: number; topics?: string[] }[] }[] }[] }
export interface TakedownItem { type: "doc" | "post" | "chat"; id: string; sections?: number[] }
export interface Material { type: "doc" | "media"; id: string; title: string; kind?: string; ts: number; link?: string; media?: string }
export interface Coverage { docs: number; summaries: number; exercises?: number; articles: number }
export interface CourseMeta { chatUrl?: string | null; examUntil?: string | null; updatedBy?: string; updatedAt?: number | string }
export type EventKind = "exam" | "deadline" | "other";
export interface CampusEvent { id: string; title: string; date: string; kind: EventKind; course?: string | null; uid: string; name: string }
export interface SearchHit { doc: CampusDoc; section?: number | null; snippet: string }
export interface Takedown { name: string; email: string; code?: string; phone: string; role: "lecturer" | "institution" | "author" | "other"; inst: string; faculty: string; year?: number; course?: string; items?: TakedownItem[]; docIds?: string[]; reason: string }
export interface Follow { path: string; title: string; ts: number }
export interface Product {
  id: string;
  kind: "media" | "pin";
  qty?: number;
  days?: number;
  price: number;
  title: string;
  note?: string;
  best?: boolean;
}

const placeQ = (pl: CampusPlace, extra: Record<string, string> = {}) => new URLSearchParams({ inst: pl.inst, faculty: pl.faculty, year: String(pl.year), ...(pl.course ? { course: pl.course } : {}), ...extra }).toString();

export const api = {
  getCard: (p: PageCtx) => call<{ card: PageCard | null; on: boolean }>(`/v1/card?${new URLSearchParams({ url: p.url, ...(p.canonical ? { canonical: p.canonical } : {}) })}`),
  makeCard: (p: PageCtx, text: string) => call<{ card: PageCard }>("/v1/card", { method: "POST", body: { url: p.url, canonical: p.canonical, title: p.title, text } }),
  askPage: (p: PageCtx, question: string, text: string) => call<{ answer: string }>("/v1/card/ask", { method: "POST", body: { url: p.url, canonical: p.canonical, title: p.title, question, text } }),
  panel: (p: PageCtx, scope: string, sort: string) => call<Bundle>(`/v1/panel?${pageQuery(p, { scope, sort })}`),
  morePosts: (roomId: string, before: number, kind = "text") => call<{ posts: Post[]; next: number | null }>(`/v1/room/${roomId}/posts?before=${before}&kind=${kind}`),
  post: (p: PageCtx, scope: string, body: string, parentId?: string | null) =>
    call<{ post: Post }>("/v1/posts", { method: "POST", body: { url: p.url, canonical: p.canonical, title: p.title, optout: p.optout, scope, body, parentId } }),
  upload: (p: PageCtx, scope: string, file: Blob, caption: string, link?: string) =>
    call<{ post: Post; review: boolean; credits: number; free?: boolean }>(`/v1/media?${pageQuery(p, { scope, caption, ...(link ? { link } : {}) })}`, { method: "POST", raw: file }),
  directory: (campus?: boolean) => call<Directory>(`/v1/directory${campus === undefined ? "" : `?campus=${campus ? 1 : 0}`}`),
  campusTree: (pl?: CampusPlace) => call<{ institutions: { id: string; name: string; faculties: string[] }[]; years: number[] } & DirectoryTree>(`/v1/campus/tree${pl ? "?" + placeQ({ inst: pl.inst, faculty: pl.faculty, year: pl.year }) : ""}`),
  lecturerDocs: (inst: string, faculty: string, lecturer: string) => call<{ docs: CampusDoc[] }>(`/v1/campus/lecturer?${new URLSearchParams({ inst, faculty, lecturer })}`),
  campusDocs: (pl: CampusPlace, kind?: DocKind) => call<{ docs: CampusDoc[]; title: string; url: string; coverage?: Coverage }>(`/v1/campus/docs?${placeQ(pl, kind ? { kind } : {})}`),
  /** a text document: the student's own words (`author: true` is the declaration); an article carries a link too */
  createDoc: (pl: CampusPlace, b: { kind: DocKind; title: string; body: string; link?: string; lecturer?: string; lessonDate?: string; lessonNo?: number; topic?: string; published?: string; author: true; source?: "own" | "received" }) => call<{ doc: CampusDoc }>(`/v1/campus/docs?${placeQ(pl)}`, { method: "POST", body: b }),
  updateDoc: (id: string, b: { title?: string; body?: string; link?: string; lecturer?: string; lessonDate?: string; lessonNo?: number | null; topic?: string; published?: string }) => call<{ doc: CampusDoc }>(`/v1/campus/docs/${id}`, { method: "PUT", body: b }),
  /** AddStudent: a Word / PDF summary — the raw file, then the text extracted on the device */
  createDocFile: (pl: CampusPlace, m: DocMeta & { title: string }, file: Blob, type: "pdf" | "docx") =>
    call<{ doc: CampusDoc }>(`/v1/campus/docs/file?${placeQ({ ...pl, course: m.course || pl.course }, { title: m.title, author: "1", ...(m.lecturer ? { lecturer: m.lecturer } : {}), ...(m.lessonDate ? { lessonDate: m.lessonDate } : {}), ...(m.lessonNo ? { lessonNo: String(m.lessonNo) } : {}), ...(m.topic ? { topic: m.topic } : {}), ...(m.published ? { published: m.published } : {}), ...(m.source ? { source: m.source } : {}) })}`, { method: "POST", raw: file, type: type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
  putDocText: (id: string, text: string) => call<{ ok: boolean; sections?: DocSection[] }>(`/v1/campus/docs/${id}/text`, { method: "POST", raw: new Blob([text], { type: "text/plain" }), type: "text/plain; charset=utf-8" }),
  docFileUrl: (id: string) => `${API_BASE}/v1/campus/docs/${id}/file`,
  getDoc: (id: string) => call<{ doc: CampusDoc; body: string; shownTo?: ShownTo }>(`/v1/campus/docs/${id}`),
  deleteDoc: (id: string) => call(`/v1/campus/docs/${id}`, { method: "DELETE" }),
  campusSearch: (pl: CampusPlace, q: string) => call<{ hits: SearchHit[] }>(`/v1/campus/search?${placeQ(pl, { q })}`),
  /** AddStudent: free text and/or directory filters over a faculty (year optional) */
  searchDocs: (inst: string, faculty: string, f: SearchFilters) =>
    call<{ hits: SearchHit[]; total?: number }>(`/v1/campus/search?${new URLSearchParams({ inst, faculty, ...(f.year ? { year: String(f.year) } : {}), ...(f.course ? { course: f.course } : {}), ...(f.lecturer ? { lecturer: f.lecturer } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.q ? { q: f.q } : {}) })}`),
  facultyTree: (inst: string, faculty: string, year?: number) => call<DirectoryTree>(`/v1/campus/tree?${new URLSearchParams({ inst, faculty, ...(year ? { year: String(year) } : {}) })}`),
  course: (pl: CampusPlace) => call<CourseMeta>(`/v1/campus/course?${placeQ(pl)}`),
  setCourse: (pl: CampusPlace, b: { chatUrl?: string | null; examUntil?: string | null }) => call<CourseMeta>(`/v1/campus/course?${placeQ(pl)}`, { method: "PUT", body: b }),
  events: (pl: CampusPlace) => call<{ events: CampusEvent[] }>(`/v1/campus/events?${placeQ(pl)}`),
  addEvent: (pl: CampusPlace, b: { title: string; date: string; kind: EventKind; course?: string }) => call<{ event: CampusEvent }>(`/v1/campus/events?${placeQ(pl)}`, { method: "POST", body: b }),
  deleteEvent: (id: string) => call(`/v1/campus/events/${id}`, { method: "DELETE" }),
  student: () => call<{ student: Student | null }>("/v1/me/student"),
  saveStudent: (b: { fullName: string; inst: string; faculty: string; faculty2?: string | null; year: number; track: string }) => call<{ student: Student }>("/v1/me/student", { method: "PUT", body: b }),
  takedownStart: (email: string) => call<{ sent: boolean; devCode?: string }>("/v1/campus/takedown/start", { method: "POST", body: { email } }),
  takedown: (b: Takedown) => call<{ ok: boolean; id: string; held?: number }>("/v1/campus/takedown", { method: "POST", body: b }),
  materials: () => call<{ docs: Material[]; media: Material[] }>("/v1/me/materials"),
  attach: (p: PageCtx, scope: string, items: { type: "doc" | "media"; id: string }[]) => call<{ posts: Post[] }>("/v1/room/attach", { method: "POST", body: { url: p.url, canonical: p.canonical, title: p.title, scope, items } }),
  follows: () => call<{ follows: Follow[] }>("/v1/me/follows"),
  follow: (path: string, title: string, unfollow = false) => call<{ follows: Follow[] }>("/v1/me/follows", { method: "POST", body: { path, title, unfollow } }),
  deletePost: (roomId: string, postId: string) => call(`/v1/room/${roomId}/posts/${postId}`, { method: "DELETE" }),
  like: (roomId: string, postId: string) => call<{ liked: boolean; likes: number }>(`/v1/room/${roomId}/posts/${postId}/like`, { method: "POST" }),
  report: (roomId: string, itemType: "post" | "chat", itemId: string, reason: string, details?: string) =>
    call<{ ok: boolean; hidden: boolean; sla: string }>("/v1/report", { method: "POST", body: { roomId, itemType, itemId, reason, details } }),
  authStart: (email: string) => call<{ sent: boolean; devCode?: string }>("/v1/auth/start", { method: "POST", body: { email } }),
  authVerify: (email: string, code: string, password?: string) => call<{ token: string; user: Me }>("/v1/auth/verify", { method: "POST", body: { email, code, ...(password ? { password } : {}) } }),
  logout: () => call("/v1/auth/logout", { method: "POST" }),
  // ---- AddStudent: password sign-in and devices (contract 2026-10-29 18:44) ----
  /** sign-up: the email code follows; `authVerify(email, code, password)` completes it */
  register: (email: string, password: string, name: string) => call<{ pending: boolean; devCode?: string }>("/v1/auth/register", { method: "POST", body: { email, password, name } }),
  /** a known device signs in at once; a new one gets `needCode` and verifies the email code */
  login: (email: string, password: string) => call<{ token?: string; user?: Me; needCode?: boolean; devCode?: string }>("/v1/auth/login", { method: "POST", body: { email, password } }),
  forgotPassword: (email: string) => call<{ sent?: boolean; ok?: boolean; devCode?: string }>("/v1/auth/password/forgot", { method: "POST", body: { email } }),
  /** by the emailed link's token, or by the email code */
  resetPassword: (b: { token: string; password: string } | { email: string; code: string; password: string }) => call<{ ok?: boolean; token?: string; user?: Me }>("/v1/auth/password/reset", { method: "POST", body: b }),
  /** set (first time) or change the password of the signed-in account; other devices are signed out */
  setPassword: (password: string, current?: string) => call<{ ok: boolean; hasPassword?: boolean }>("/v1/auth/password", { method: "POST", body: { password, ...(current ? { old: current } : {}) } }),
  devices: () => call<{ devices: Device[] }>("/v1/me/devices"),
  removeDevice: (id: string) => call("/v1/me/devices/" + encodeURIComponent(id), { method: "DELETE" }),
  me: () => call<{ user: Me; items: any[]; blocks: string[] }>("/v1/me"),
  updateMe: (b: { name?: string; acceptTerms?: boolean }) => call<{ user: Me }>("/v1/me", { method: "POST", body: b }),
  deleteMe: () => call("/v1/me", { method: "DELETE" }),
  block: (userId: string, unblock = false) => call("/v1/me/blocks", { method: "POST", body: { userId, unblock } }),
  products: () => call<{ products: Product[]; testMode: boolean }>("/v1/store/products"),
  checkout: (product: string, target?: { roomId: string; postId: string }) => call<any>("/v1/store/checkout", { method: "POST", body: { product, ...target } }),
  impressions: (ids: string[]) => call("/v1/ads/impressions", { method: "POST", body: { ids } }).catch(() => {}),
};
