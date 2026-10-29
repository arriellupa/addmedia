// Operator settings (D1 `settings`, cached per isolate for a minute). The admin changes them from the console;
// the panel and the media page read the public part of them in every bundle.
import { Env, clampStr, now } from "./util";

export interface CenterAd {
  on: boolean;
  title: string;
  body: string;
  image: string | null;
  url: string | null;
  label: string; // "ממומן" or anything the operator writes
  modes: ("center" | "campus")[];
}

export interface Settings {
  pageThreshold: number; // readers on a page before the panel opens on the page's own room instead of the site's
  freeMedia: number; // free image uploads per user, before credits are needed
  retentionDays: number; // how long a post or image stays
  linkMedia: boolean; // whether an image may be a live link
  centerAd: CenterAd;
  campusDocsPerMonth: number; // documents a student may write per month
  campusCharsPerDoc: number; // characters per document
  campusCharsTotal: number; // characters across all of a student's documents
  campusPrice: number; // agorot per semester
}

export const DEFAULTS: Settings = {
  pageThreshold: 5,
  freeMedia: 1,
  retentionDays: 7,
  linkMedia: true,
  centerAd: { on: false, title: "", body: "", image: null, url: null, label: "ממומן", modes: ["center", "campus"] },
  campusDocsPerMonth: 20,
  campusCharsPerDoc: 60_000,
  campusCharsTotal: 1_000_000,
  campusPrice: 2990,
};

let cache: { at: number; s: Settings } | null = null;

function clean(raw: Partial<Settings>): Settings {
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const ad = (raw.centerAd || {}) as Partial<CenterAd>;
  const url = clampStr(ad.url, 1000);
  return {
    pageThreshold: n(raw.pageThreshold, DEFAULTS.pageThreshold, 1, 500),
    freeMedia: n(raw.freeMedia, DEFAULTS.freeMedia, 0, 100),
    retentionDays: n(raw.retentionDays, DEFAULTS.retentionDays, 1, 365),
    linkMedia: raw.linkMedia === undefined ? DEFAULTS.linkMedia : !!raw.linkMedia,
    campusDocsPerMonth: n(raw.campusDocsPerMonth, DEFAULTS.campusDocsPerMonth, 1, 10_000),
    campusCharsPerDoc: n(raw.campusCharsPerDoc, DEFAULTS.campusCharsPerDoc, 100, 1_000_000),
    campusCharsTotal: n(raw.campusCharsTotal, DEFAULTS.campusCharsTotal, 100, 100_000_000),
    campusPrice: n(raw.campusPrice, DEFAULTS.campusPrice, 0, 1_000_000),
    centerAd: {
      on: !!ad.on,
      title: clampStr(ad.title, 120),
      body: clampStr(ad.body, 300),
      image: /^https?:\/\//.test(clampStr(ad.image, 1000)) ? clampStr(ad.image, 1000) : null,
      url: /^https?:\/\//.test(url) ? url : null,
      label: clampStr(ad.label, 30) || "ממומן",
      modes: (Array.isArray(ad.modes) ? ad.modes : DEFAULTS.centerAd.modes).filter((m): m is "center" | "campus" => m === "center" || m === "campus"),
    },
  };
}

export async function getSettings(env: Env): Promise<Settings> {
  if (cache && now() - cache.at < 60_000) return cache.s;
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k='main'").first<{ v: string }>().catch(() => null);
  let s = DEFAULTS;
  if (row) {
    try {
      s = clean(JSON.parse(row.v));
    } catch {}
  }
  cache = { at: now(), s };
  return s;
}

export async function putSettings(env: Env, raw: Partial<Settings>): Promise<Settings> {
  const s = clean({ ...(await getSettings(env)), ...raw, centerAd: { ...(await getSettings(env)).centerAd, ...(raw.centerAd || {}) } });
  await env.DB.prepare("INSERT INTO settings (k, v, updated_at) VALUES ('main', ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at")
    .bind(JSON.stringify(s), now())
    .run();
  cache = { at: now(), s };
  return s;
}

/** the part of the settings every client may see */
export const publicSettings = (s: Settings) => ({
  pageThreshold: s.pageThreshold,
  freeMedia: s.freeMedia,
  retentionDays: s.retentionDays,
  linkMedia: s.linkMedia,
  campus: { docsPerMonth: s.campusDocsPerMonth, charsPerDoc: s.campusCharsPerDoc, charsTotal: s.campusCharsTotal, price: s.campusPrice },
  centerAd: s.centerAd.on && s.centerAd.title ? s.centerAd : null,
});
