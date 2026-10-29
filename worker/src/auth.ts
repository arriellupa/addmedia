import { DAY, Env, clampStr, fail, hmac, idSecret, isTrue, json, now, randomId, sha256 } from "./util";

export interface User {
  id: string;
  display_name: string;
  created_at: number;
  terms_accepted_at: number | null;
  credits_media: number;
  credits_pin: number;
  banned: number;
  role: string;
  strikes?: number;
  email?: string | null;
  campus_until?: string | null;
  pass_hash?: string | null;
  pass_set_at?: number | null;
  pw_fails?: number;
  locked_until?: number | null;
  must_reset?: number;
  /** the session this request came with (set by getUser) */
  session?: { tokenHash: string; deviceId: string | null };
}

const EMAIL_OK = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

export const publicUser = (u: User) => ({
  id: u.id,
  name: u.display_name,
  createdAt: u.created_at,
  termsAccepted: !!u.terms_accepted_at,
  credits: { media: u.credits_media, pin: u.credits_pin },
  isNew: now() - u.created_at < DAY,
  role: u.role,
  strikes: u.strikes ?? 0,
  campusUntil: u.campus_until ?? null,
  email: u.email ?? null,
  hasPassword: !!u.pass_hash,
  mustReset: !!u.must_reset,
  lockedUntil: u.locked_until && u.locked_until > now() ? u.locked_until : null,
});

// ---------- mail ----------
/** sends through Resend; without the key (local), logs the mail instead */
export async function sendMail(env: Env, to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log("mail (not sent)", to, subject, text.slice(0, 200));
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html, text }),
  });
  if (!r.ok) console.error("resend failed", r.status, (await r.text().catch(() => "")).slice(0, 300));
  return r.ok;
}

// ---------- password (PBKDF2-SHA256, as in kupa) ----------
const PW_ITER = 10000; // modest for the Workers CPU budget; wrong tries are capped
const PW_MAX_FAILS = 8;
const PW_LOCK_MS = 15 * 60_000;
export const PW_MIN = 8;
const te = new TextEncoder();
const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function pwHash(password: string, saltBytes?: Uint8Array): Promise<string> {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PW_ITER }, key, 256));
  return `pbkdf2$${PW_ITER}$${b64(salt)}$${b64(bits)}`;
}

export async function pwCheck(password: string, stored: string | null | undefined): Promise<boolean> {
  const [kind, , salt, hash] = String(stored || "").split("$");
  if (kind !== "pbkdf2" || !salt || !hash) return false;
  const again = (await pwHash(password, unb64(salt))).split("$")[3];
  let diff = again.length ^ hash.length;
  for (let i = 0; i < Math.min(again.length, hash.length); i++) diff |= again.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

/** a wrong password counts toward a 15-minute lock; returns a refusal, or null when the password is right */
async function checkPassword(env: Env, u: User, password: string): Promise<Response | null> {
  const t = now();
  if (u.locked_until && u.locked_until > t) return fail(429, "locked", "החשבון נעול ל-15 דקות אחרי כמה ניסיונות שגויים.", { until: u.locked_until });
  if (await pwCheck(password, u.pass_hash)) {
    if (u.pw_fails) await env.DB.prepare("UPDATE users SET pw_fails=0, locked_until=NULL WHERE id=?").bind(u.id).run();
    return null;
  }
  const fails = (u.pw_fails || 0) + 1;
  if (fails >= PW_MAX_FAILS) {
    await env.DB.prepare("UPDATE users SET pw_fails=0, locked_until=? WHERE id=?").bind(t + PW_LOCK_MS, u.id).run();
    return fail(429, "locked", "החשבון נעול ל-15 דקות אחרי כמה ניסיונות שגויים.", { until: t + PW_LOCK_MS });
  }
  await env.DB.prepare("UPDATE users SET pw_fails=? WHERE id=?").bind(fails, u.id).run();
  return fail(401, "wrong_password", "הסיסמה שגויה.", { left: PW_MAX_FAILS - fails });
}

// ---------- devices ----------
export const MAX_DEVICES = 2;
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** the client's device id (X-Device) and a short name from the user agent */
export function deviceOf(req: Request): { id: string | null; name: string } {
  const raw = clampStr(req.headers.get("X-Device"), 64);
  const ua = req.headers.get("User-Agent") || "";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /node/i.test(ua) ? "node" : "";
  return { id: DEVICE_RE.test(raw) ? raw : null, name: clampStr([br, os].filter(Boolean).join(" · ") || ua.slice(0, 40) || "מכשיר", 80) };
}

export async function ipHashOf(env: Env, req: Request): Promise<string> {
  return (await hmac(idSecret(env), "ip|" + (req.headers.get("CF-Connecting-IP") || "local"))).slice(0, 24);
}

/** does this device hold a live session of the user? (an evicted device is new again and needs the email code) */
export async function knownDevice(env: Env, uid: string, deviceId: string | null): Promise<boolean> {
  if (!deviceId) return false;
  return !!(await env.DB.prepare("SELECT 1 FROM sessions WHERE user_id=? AND device_id=? AND expires_at>?").bind(uid, deviceId, now()).first());
}

/** opens a session for this device; a third device evicts the oldest and the owner is told by mail */
export async function createSession(env: Env, user: User, req: Request): Promise<{ token: string; evicted: string | null }> {
  const dev = deviceOf(req);
  const t = now();
  let evicted: string | null = null;
  if (dev.id) {
    // this device's older sessions are replaced
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND device_id=?").bind(user.id, dev.id).run();
    const others = (await env.DB.prepare("SELECT device_id, device_name, MAX(COALESCE(last_seen, created_at)) seen FROM sessions WHERE user_id=? AND device_id IS NOT NULL AND expires_at>? GROUP BY device_id ORDER BY seen ASC")
      .bind(user.id, t)
      .all<any>()).results || [];
    if (others.length >= MAX_DEVICES) {
      const old = others[0];
      await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND device_id=?").bind(user.id, old.device_id).run();
      evicted = old.device_name || old.device_id;
      if (user.email) {
        await sendMail(env, user.email, "כניסה ממכשיר חדש ל-AddMedia",
          `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;color:#14161a"><p>נכנסו לחשבון שלך ממכשיר חדש (${dev.name}).</p><p>החשבון מוגבל לשני מכשירים, ולכן המכשיר הישן יותר (${evicted}) נותק.</p><p style="color:#6b7280">אם זה לא היית את/ה, החליפו סיסמה עכשיו. החשבון אישי: שיתוף סיסמה או מכשיר עם אחר מבטל את המנוי ללא החזר.</p></div>`,
          `נכנסו לחשבון שלך ממכשיר חדש (${dev.name}). המכשיר הישן יותר (${evicted}) נותק. אם זה לא היית את/ה, החליפו סיסמה.`);
      }
    }
  }
  const token = randomId(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, device_id, device_name, last_seen, last_ip_hash) VALUES (?,?,?,?,?,?,?,?)")
    .bind(await sha256(token), user.id, t, t + 60 * DAY, dev.id, dev.name, t, await ipHashOf(env, req))
    .run();
  return { token, evicted };
}

export async function listDevices(env: Env, u: User) {
  const rows = (await env.DB.prepare("SELECT device_id, MAX(device_name) name, MAX(COALESCE(last_seen, created_at)) seen FROM sessions WHERE user_id=? AND device_id IS NOT NULL AND expires_at>? GROUP BY device_id ORDER BY seen DESC")
    .bind(u.id, now())
    .all<any>()).results || [];
  return rows.map((r) => ({ id: r.device_id, name: r.name, lastSeen: r.seen, current: r.device_id === u.session?.deviceId }));
}

export async function dropDevice(env: Env, u: User, deviceId: string): Promise<Response> {
  const r = await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND device_id=?").bind(u.id, clampStr(deviceId, 64)).run();
  if (!r.meta.changes) return fail(404, "not_found", "המכשיר לא נמצא.");
  return json({ ok: true, devices: await listDevices(env, u) });
}

// ---------- register / login / password ----------
const pwOk = (p: unknown) => typeof p === "string" && p.length >= PW_MIN && p.length <= 200;

/** register: validates, then sends the email code; the client sends the password again with the code to /verify */
export async function registerAuth(env: Env, body: any): Promise<Response> {
  const email = clampStr(body.email, 254).toLowerCase();
  if (!EMAIL_OK.test(email)) return fail(400, "bad_email", "כתובת המייל לא תקינה.");
  if (!pwOk(body.password)) return fail(400, "weak_password", `הסיסמה צריכה לפחות ${PW_MIN} תווים.`);
  const r = await issueCode(env, email);
  if (!r.ok) return r;
  const j: any = await r.json();
  return json({ pending: true, ...j });
}

async function userByEmail(env: Env, email: string): Promise<User | null> {
  const emailHash = await hmac(idSecret(env), "e|" + email);
  return await env.DB.prepare("SELECT * FROM users WHERE email_hash=?").bind(emailHash).first<User>();
}

const RESET_MSG = "זוהתה פעילות חריגה בחשבון. לצורך ההמשך יש לקבוע סיסמה חדשה דרך «שכחתי סיסמה».";

/** password sign-in: a known device gets a session at once; a new device gets the email code first */
export async function loginAuth(env: Env, req: Request, body: any): Promise<Response> {
  const email = clampStr(body.email, 254).toLowerCase();
  const user = await userByEmail(env, email);
  if (!user || !user.pass_hash) return fail(user ? 400 : 401, user ? "no_password" : "wrong_password", user ? "לחשבון הזה אין עדיין סיסמה: היכנסו עם קוד במייל וקבעו סיסמה." : "המייל או הסיסמה שגויים.");
  if (user.banned) return fail(403, "banned", "החשבון הושעה בשל הפרת כללי הקהילה.");
  const bad = await checkPassword(env, user, String(body.password || ""));
  if (bad) return bad;
  if (user.must_reset) return fail(423, "reset", RESET_MSG);
  const dev = deviceOf(req);
  if (dev.id && !(await knownDevice(env, user.id, dev.id))) {
    const r = await issueCode(env, email);
    if (!r.ok) return r;
    const j: any = await r.json();
    return json({ needCode: true, ...j });
  }
  const { token, evicted } = await createSession(env, user, req);
  return json({ token, user: publicUser(user), evicted });
}

/** forgot: a code to the mail (the reset code lives 10 minutes); the answer never says whether the account exists */
export async function forgotPassword(env: Env, body: any): Promise<Response> {
  const email = clampStr(body.email, 254).toLowerCase();
  if (!EMAIL_OK.test(email)) return fail(400, "bad_email", "כתובת המייל לא תקינה.");
  const user = await userByEmail(env, email);
  if (!user) return json({ sent: true });
  return await issueCode(env, email, "r|", "קוד לאיפוס הסיסמה");
}

/** reset: the code and a new password; every other device is signed out and this one gets a fresh session */
export async function resetPassword(env: Env, req: Request, body: any): Promise<Response> {
  const email = clampStr(body.email, 254).toLowerCase();
  if (!pwOk(body.password)) return fail(400, "weak_password", `הסיסמה צריכה לפחות ${PW_MIN} תווים.`);
  const bad = await consumeCode(env, email, clampStr(body.code, 6), "r|");
  if (bad) return bad;
  const user = await userByEmail(env, email);
  if (!user) return fail(400, "bad_code", "הקוד שגוי.");
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET pass_hash=?, pass_set_at=?, pw_fails=0, locked_until=NULL, must_reset=0 WHERE id=?").bind(await pwHash(body.password), now(), user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
  ]);
  const fresh = (await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first<User>())!;
  const { token } = await createSession(env, fresh, req);
  return json({ token, user: publicUser(fresh) });
}

/** change the password while signed in (the current one, or none yet); other devices are signed out */
export async function changePassword(env: Env, u: User, body: any): Promise<Response> {
  if (!pwOk(body.password)) return fail(400, "weak_password", `הסיסמה צריכה לפחות ${PW_MIN} תווים.`);
  if (u.pass_hash) {
    const bad = await checkPassword(env, u, String(body.old || ""));
    if (bad) return bad;
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET pass_hash=?, pass_set_at=?, pw_fails=0, locked_until=NULL WHERE id=?").bind(await pwHash(body.password), now(), u.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash!=?").bind(u.id, u.session?.tokenHash ?? ""),
  ]);
  return json({ ok: true, hasPassword: true });
}

/** sends a 6-digit code to an email (login, or another purpose keyed by `prefix`); locally returns it as devCode */
export async function issueCode(env: Env, email: string, prefix = "e|", purpose = "קוד הכניסה שלך"): Promise<Response> {
  if (!EMAIL_OK.test(email)) return fail(400, "bad_email", "כתובת המייל לא תקינה.");
  const emailHash = await hmac(idSecret(env), prefix + email);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM otp_codes WHERE email_hash=? AND created_at>?")
    .bind(emailHash, now() - 3600_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return fail(429, "too_many", "נשלחו יותר מדי קודים. נסו שוב בעוד שעה.");

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await env.DB.prepare("INSERT INTO otp_codes (email_hash, code_hash, created_at, expires_at) VALUES (?,?,?,?)")
    .bind(emailHash, await sha256(emailHash + code), now(), now() + 10 * 60_000)
    .run();

  if (env.RESEND_API_KEY) {
    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;color:#14161a">
      <p>${purpose} ל-AddMedia:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
      <p style="color:#6b7280">הקוד בתוקף ל-10 דקות. אם לא ביקשת אותו, אפשר להתעלם מההודעה.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [email], subject: `${purpose}: ${code}`, html, text: `${purpose} ל-AddMedia: ${code}` }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("resend failed", r.status, detail.slice(0, 500));
      let reason = "";
      try {
        reason = String(JSON.parse(detail).message || "").slice(0, 160);
      } catch {}
      return fail(502, "email_failed", `שליחת המייל נכשלה (${r.status}${reason ? ": " + reason : ""}).`);
    }
    return json({ sent: true });
  }
  if (isTrue(env.DEV_MODE)) return json({ sent: true, devCode: code });
  return fail(503, "email_not_configured", "שליחת מיילים עדיין לא הוגדרה בשרת.");
}

/** checks a code issued by issueCode; a wrong code counts an attempt, a right one is consumed. Returns a refusal or null. */
export async function consumeCode(env: Env, email: string, code: string, prefix = "e|"): Promise<Response | null> {
  if (!EMAIL_OK.test(email) || !/^\d{6}$/.test(code)) return fail(400, "bad_code", "הקוד שגוי.");
  const emailHash = await hmac(idSecret(env), prefix + email);
  const row = await env.DB.prepare("SELECT rowid, code_hash, attempts FROM otp_codes WHERE email_hash=? AND expires_at>? ORDER BY created_at DESC LIMIT 1")
    .bind(emailHash, now())
    .first<{ rowid: number; code_hash: string; attempts: number }>();
  if (!row || row.attempts >= 5) return fail(400, "bad_code", "הקוד שגוי או שפג תוקפו. בקשו קוד חדש.");
  if (row.code_hash !== (await sha256(emailHash + code))) {
    await env.DB.prepare("UPDATE otp_codes SET attempts=attempts+1 WHERE rowid=?").bind(row.rowid).run();
    return fail(400, "bad_code", "הקוד שגוי. נסו שוב.");
  }
  await env.DB.prepare("DELETE FROM otp_codes WHERE email_hash=?").bind(emailHash).run();
  return null;
}

export async function startAuth(env: Env, body: any): Promise<Response> {
  const email = clampStr(body.email, 254).toLowerCase();
  return await issueCode(env, email);
}

export async function verifyAuth(env: Env, req: Request, body: any): Promise<Response> {
  const email = clampStr(body.email, 254).toLowerCase();
  const code = clampStr(body.code, 6);
  const bad = await consumeCode(env, email, code);
  if (bad) return bad;
  const emailHash = await hmac(idSecret(env), "e|" + email);

  let user = await env.DB.prepare("SELECT * FROM users WHERE email_hash=?").bind(emailHash).first<User>();
  if (!user) {
    const id = "u_" + randomId(12);
    const name = "גולש/ת " + String(1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000));
    await env.DB.prepare("INSERT INTO users (id, email_hash, display_name, created_at) VALUES (?,?,?,?)").bind(id, emailHash, name, now()).run();
    user = (await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first<User>())!;
  }
  if (user.banned) return fail(403, "banned", "החשבון הושעה בשל הפרת כללי הקהילה.");
  if (user.must_reset && !body.password) return fail(423, "reset", RESET_MSG);
  // the login email is kept so the student profile can show it (read-only); older accounts get it on their next sign-in
  if (user.email !== email) await env.DB.prepare("UPDATE users SET email=? WHERE id=?").bind(email, user.id).run();
  // registration: the password (and a name) come with the code
  if (body.password !== undefined) {
    if (!pwOk(body.password)) return fail(400, "weak_password", `הסיסמה צריכה לפחות ${PW_MIN} תווים.`);
    await env.DB.prepare("UPDATE users SET pass_hash=?, pass_set_at=?, pw_fails=0, locked_until=NULL, must_reset=0 WHERE id=?").bind(await pwHash(body.password), now(), user.id).run();
  }
  const name = clampStr(body.name, 24).replace(/\s+/g, " ");
  if (name.length >= 2) await env.DB.prepare("UPDATE users SET display_name=? WHERE id=?").bind(name, user.id).run();
  user = (await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first<User>())!;
  const { token, evicted } = await createSession(env, user, req);
  return json({ token, user: publicUser(user), evicted });
}

export function tokenFrom(req: Request, url: URL): string | null {
  const h = req.headers.get("Authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  return url.searchParams.get("t");
}

export async function getUser(env: Env, token: string | null, req?: Request): Promise<User | null> {
  if (!token || token.length < 20 || token.length > 64) return null;
  const th = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT u.*, s.device_id AS s_device, s.last_seen AS s_seen FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(th, now())
    .first<any>();
  if (!row) return null;
  const { s_device, s_seen, ...u } = row;
  u.session = { tokenHash: th, deviceId: s_device || null };
  // the session's last activity, at most once a minute
  if (!s_seen || now() - s_seen > 60_000) await env.DB.prepare("UPDATE sessions SET last_seen=?, last_ip_hash=? WHERE token_hash=?").bind(now(), req ? await ipHashOf(env, req) : null, th).run();
  return u as User;
}

export async function logout(env: Env, token: string | null) {
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return json({ ok: true });
}
