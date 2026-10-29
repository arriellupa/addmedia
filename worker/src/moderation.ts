// Content filtering: Hebrew-aware blocklist + PII + link rules, then OpenAI omni-moderation (when a key is set).
import type { Env } from "./util";

export type Verdict = { ok: true; flags?: string[] } | { ok: false; code: string; message: string };

const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "") // niqqud & cantillation
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/([א-תa-z])[.\-_*·•~|]+(?=[א-תa-z])/g, "$1") // "ז.ו.נ.ה" -> "זונה"
    .replace(/(.)\1{2,}/g, "$1$1") // collapse long repeats
    .replace(/[׳']/g, "'")
    .replace(/\s+/g, " ");
}

// Built-in starter list (severe insults, slurs, incitement). Extend from the admin page (D1: blocked_terms).
const BUILTIN_TERMS = [
  "זונה", "זונות", "בן זונה", "בת זונה", "שרמוטה", "שרמוטות", "כוס אמק", "כוסאמק", "כוס אמא שלך", "כוס אמא שלכ",
  "ערבוש", "ערבושים", "כושי", "כושים", "כושית", "פרענק", "פרענקים", "קוקסינל", "קוקסינלים", "מתרומם", "מתרוממים",
  "יהודון", "יהודונים", "מוות לערבים", "מוות ליהודים", "מוות לשמאלנים", "מוות למתנחלים",
  "nigger", "niggers", "faggot", "faggots", "kike", "kikes", "tranny",
];

const THREAT_RE = new RegExp(
  "(ארצח|נרצח|אהרוג|נהרוג|אשחט|נשחט|אדקור|נדקור|אפוצצ|נפוצצ|אשרופ|נשרופ|אירה ב|נירה ב)\\s*(אותכ|אותכמ|אותו|אותה|אותמ|אותנ|בכ|בו|בה)?",
  "u",
);
const KILL_YOU_EN = /\b(i('| a)?m going to|i will|gonna)\s+(kill|shoot|stab|rape)\s+(you|u)\b/i;

const PHONE_RE = /(?:\+?972[-\s]?|\b0)(?:5\d|[2-489]|7\d)(?:[-\s]?\d){7}\b/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|co\.il|org\.il|net|org|io|ly|me|app|xyz|info|biz|link|site|online|tv|gg)\b/i;

function israeliIdValid(d: string): boolean {
  if (!/^\d{9}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}
function luhn(d: string): boolean {
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

const HEB_PREFIX = "[ובכלמשה]{0,3}";

function termRegex(term: string): RegExp {
  const t = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s*");
  const isHeb = /[א-ת]/.test(term);
  return isHeb
    ? new RegExp(`(^|[^א-תa-z0-9])${HEB_PREFIX}${t}(?=$|[^א-תa-z0-9])`, "u")
    : new RegExp(`\\b${t}\\b`, "i");
}

let compiled: { at: number; res: RegExp[] } | null = null;

async function termRegexes(env: Env): Promise<RegExp[]> {
  if (compiled && Date.now() - compiled.at < 5 * 60 * 1000) return compiled.res;
  let extra: string[] = [];
  try {
    const r = await env.DB.prepare("SELECT term FROM blocked_terms").all<{ term: string }>();
    extra = (r.results || []).map((x) => x.term);
  } catch {}
  const res = [...BUILTIN_TERMS, ...extra].filter(Boolean).map(termRegex);
  compiled = { at: Date.now(), res };
  return res;
}

export function invalidateTerms() {
  compiled = null;
}

/** Only the blocked-terms pass: cheap enough for a long document body. */
export async function checkTerms(env: Env, text: string): Promise<Verdict> {
  const n = normalize(text);
  for (const re of await termRegexes(env)) {
    if (re.test(n)) return { ok: false, code: "blocked_language", message: "הטקסט כולל ביטוי פוגעני ולא נשמר." };
  }
  return { ok: true };
}

/** Fast synchronous-ish layer, used for every chat message and post. */
export async function checkText(env: Env, text: string, opts: { isNew: boolean }): Promise<Verdict> {
  const n = normalize(text);
  for (const re of await termRegexes(env)) {
    if (re.test(n)) return { ok: false, code: "blocked_language", message: "ההודעה כוללת ביטוי פוגעני ולא פורסמה." };
  }
  if (THREAT_RE.test(n) || KILL_YOU_EN.test(text)) return { ok: false, code: "threat", message: "איומים אסורים בפרסום." };
  if (PHONE_RE.test(text) || EMAIL_RE.test(text)) return { ok: false, code: "pii", message: "לא מפרסמים כאן פרטי קשר — לא שלך ולא של אחרים." };
  for (const m of text.matchAll(/\d[\d\s-]{7,22}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (israeliIdValid(digits.padStart(9, "0")) && digits.length >= 8 && digits.length <= 9) return { ok: false, code: "pii", message: "נראה שההודעה כוללת מספר זהות. היא לא פורסמה." };
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return { ok: false, code: "pii", message: "נראה שההודעה כוללת מספר כרטיס אשראי. היא לא פורסמה." };
  }
  if (opts.isNew && LINK_RE.test(text)) return { ok: false, code: "new_account_link", message: "חשבונות חדשים יכולים לפרסם קישורים רק אחרי 24 שעות." };
  return { ok: true };
}

const BLOCK_CATS_TEXT = [
  "sexual/minors", "hate/threatening", "harassment/threatening", "self-harm/instructions", "illicit/violent", "violence/graphic",
];

async function openai(env: Env, input: unknown): Promise<any | null> {
  if (!env.OPENAI_API_KEY) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    return j.results?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Full check for persistent posts: blocklist first, then the model. */
export async function checkPost(env: Env, text: string, opts: { isNew: boolean }): Promise<Verdict> {
  const v = await checkText(env, text, opts);
  if (!v.ok || !text) return v;
  const r = await openai(env, text);
  if (!r) return { ok: true, flags: env.OPENAI_API_KEY ? ["model_unavailable"] : ["model_off"] };
  const hit = BLOCK_CATS_TEXT.find((c) => r.categories?.[c]);
  if (hit || (r.flagged && (r.categories?.hate || r.categories?.["harassment"] && r.category_scores?.harassment > 0.8))) {
    return { ok: false, code: "model_flag", message: "התוכן סומן כפוגעני ולא פורסם. אם זו טעות, אפשר לנסח מחדש." };
  }
  return { ok: true };
}

/** Image check. Fails closed (returns review) when the model is configured but unavailable. */
export async function checkImage(env: Env, bytes: ArrayBuffer, type: string): Promise<Verdict | { ok: true; review: true }> {
  if (!env.OPENAI_API_KEY) return { ok: true, flags: ["model_off"] };
  let bin = "";
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  const r = await openai(env, [{ type: "image_url", image_url: { url: `data:${type};base64,${btoa(bin)}` } }]);
  if (!r) return { ok: true, review: true };
  if (r.flagged) return { ok: false, code: "image_flag", message: "התמונה לא עומדת בכללי הקהילה ולא פורסמה." };
  return { ok: true };
}
