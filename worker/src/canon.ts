// URL canonicalization (rules v1). Runs on the server so rules can change without an app update.
import { hmac } from "./util";

export const CANON_VERSION = 1;

const TRACKING = new Set([
  "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "mc_cid", "mc_eid", "igshid", "yclid",
  "_ga", "_gl", "ref", "ref_src", "ref_url", "si", "spm", "cmpid", "ocid", "s_cid", "mkt_tok",
  "utm_id", "twclid", "ttclid", "li_fat_id", "_hsenc", "_hsmi", "vero_id", "oly_anon_id", "oly_enc_id",
  "rb_clickid", "wickedid", "itm_source", "itm_medium", "itm_campaign", "share", "from",
]);

// query params that identify content, per domain (site = eTLD+1)
const KEEP_ONLY: Record<string, string[]> = {
  "youtube.com": ["v", "list"],
  "google.com": ["q"],
  "facebook.com": ["story_fbid", "id", "v"],
};

// domains where m./mobile./amp. serve the same content as the main host
const STRIP_MOBILE = new Set([
  "ynet.co.il", "haaretz.co.il", "walla.co.il", "mako.co.il", "maariv.co.il", "wikipedia.org",
  "facebook.com", "twitter.com", "x.com", "youtube.com", "calcalist.co.il", "globes.co.il",
  "themarker.com", "israelhayom.co.il", "n12.co.il", "kan.org.il", "sport5.co.il", "one.co.il",
]);

// hash-routed SPAs: keep "#/..." fragments
const KEEP_HASH = new Set<string>([]);

const MULTI_SUFFIX = new Set([
  "co.il", "org.il", "ac.il", "gov.il", "net.il", "muni.il", "k12.il", "idf.il",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.jp", "co.nz",
  "com.br", "com.tr", "co.za", "com.mx", "co.in", "com.cn", "com.ar", "com.sg", "com.hk",
]);

export function siteOf(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (MULTI_SUFFIX.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

function unwrap(u: URL): URL {
  try {
    // Google AMP viewer: google.com/amp/s/example.com/path
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith("/amp/")) {
      const rest = u.pathname.replace(/^\/amp\/(s\/)?/, "");
      return new URL((u.pathname.startsWith("/amp/s/") ? "https://" : "http://") + rest);
    }
    // AMP cache: example-com.cdn.ampproject.org/c/s/example.com/path
    if (u.hostname.endsWith(".cdn.ampproject.org")) {
      const m = u.pathname.match(/^\/[a-z]\/(s\/)?(.+)$/);
      if (m) return new URL((m[1] ? "https://" : "http://") + m[2]);
    }
    // redirect wrappers
    if (u.hostname === "l.facebook.com" || u.hostname === "lm.facebook.com") {
      const t = u.searchParams.get("u");
      if (t) return new URL(t);
    }
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") {
      const t = u.searchParams.get("q") || u.searchParams.get("url");
      if (t) return new URL(t);
    }
  } catch {}
  return u;
}

export interface Canon {
  canonical: string; // normalized URL used for identity
  host: string;
  site: string; // eTLD+1
  display: string; // short display (host + path)
}

export function canonicalize(raw: string, declared?: string | null): Canon | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u = unwrap(u);

  // accept the page's declared canonical only within the same site (prevents room hijacking)
  if (declared) {
    try {
      const d = new URL(declared, u);
      if ((d.protocol === "https:" || d.protocol === "http:") && siteOf(d.hostname.toLowerCase().replace(/^www\./, "")) === siteOf(u.hostname.toLowerCase().replace(/^www\./, ""))) {
        u = d;
      }
    } catch {}
  }

  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  host = host.replace(/^www\./, "");
  const site = siteOf(host);
  if (STRIP_MOBILE.has(site)) {
    host = host.replace(/^(m|mobile|amp)\./, "").replace(/\.m\.wikipedia\.org$/, ".wikipedia.org");
  }

  // path
  let path = u.pathname.replace(/\/{2,}/g, "/");
  try {
    path = encodeURI(decodeURI(path));
  } catch {}
  path = path.replace(/\/(index\.(html?|php|aspx?))$/i, "/").replace(/\/amp\/?$/i, "");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (!path) path = "/";

  // query
  const keepOnly = KEEP_ONLY[site];
  const params: [string, string][] = [];
  u.searchParams.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (lk.startsWith("utm_") || TRACKING.has(lk) || (lk === "amp" && (v === "1" || v === ""))) return;
    if (keepOnly && !keepOnly.includes(k)) return;
    params.push([k, v]);
  });
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  const qs = params.length ? "?" + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";

  // fragment: dropped unless hash-routed SPA
  let hash = "";
  if (KEEP_HASH.has(site) && /^#!?\//.test(u.hash)) hash = u.hash;

  const canonical = `https://${host}${path}${qs}${hash}`;
  const display = `${host}${path === "/" ? "" : decodeSafe(path)}`;
  return { canonical, host, site, display };
}

function decodeSafe(p: string) {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
}

/** pages where the panel must stay off (privacy) */
export function isSensitive(c: Canon): string | null {
  const h = c.host;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith(".local") || h.endsWith(".internal")) return "private";
  const p = c.canonical.toLowerCase();
  if (/\/(login|signin|sign-in|log-in|auth|oauth|sso|account|checkout|payment|password|register|signup)(\/|$|\?)/.test(p)) return "login";
  if (/[?&](token|code|session|sid|auth|key|access_token|id_token)=/.test(p)) return "token";
  return null;
}

export async function roomIds(secret: string, c: Canon) {
  const [pageId, siteId] = await Promise.all([hmac(secret, "p|" + c.canonical), hmac(secret, "d|" + c.site)]);
  return { pageId: "p_" + pageId.slice(0, 22), siteId: "s_" + siteId.slice(0, 22) };
}

export const ROOM_RE = /^[ps]_[A-Za-z0-9_-]{22}$/;
