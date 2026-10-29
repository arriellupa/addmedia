export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ROOMS: DurableObjectNamespace<import("./room").PageRoom>;
  DIRECTORY: DurableObjectNamespace<import("./directory").Directory>;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  FROM_EMAIL: string;
  TEST_PURCHASES: string;
  DEV_MODE: string;
  ID_SECRET?: string;
  ADMIN_TOKEN?: string;
  RESEND_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

export const now = () => Date.now();

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Image-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...headers },
  });
}

export function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: { code, message, ...extra } }, status);
}

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomId(bytes = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** time-sortable id: 8 bytes of ms timestamp (base36, fixed width) + random */
export function sortableId(): string {
  return now().toString(36).padStart(9, "0") + randomId(6);
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return b64url(d);
}

const keyCache = new Map<string, CryptoKey>();
export async function hmac(secret: string, text: string): Promise<string> {
  let key = keyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keyCache.set(secret, key);
  }
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return b64url(sig);
}

export function idSecret(env: Env): string {
  return env.ID_SECRET || "dev-only-secret-change-me";
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function clampStr(v: unknown, max: number): string {
  return String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

export const isTrue = (v?: string) => v === "true" || v === "1";

export const DAY = 24 * 3600 * 1000;
