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
});

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

export async function verifyAuth(env: Env, body: any): Promise<Response> {
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
  // the login email is kept so the student profile can show it (read-only); older accounts get it on their next sign-in
  if (user.email !== email) await env.DB.prepare("UPDATE users SET email=? WHERE id=?").bind(email, user.id).run();

  const token = randomId(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)")
    .bind(await sha256(token), user.id, now(), now() + 60 * DAY)
    .run();
  return json({ token, user: publicUser(user) });
}

export function tokenFrom(req: Request, url: URL): string | null {
  const h = req.headers.get("Authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  return url.searchParams.get("t");
}

export async function getUser(env: Env, token: string | null): Promise<User | null> {
  if (!token || token.length < 20 || token.length > 64) return null;
  return await env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(await sha256(token), now())
    .first<User>();
}

export async function logout(env: Env, token: string | null) {
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return json({ ok: true });
}
