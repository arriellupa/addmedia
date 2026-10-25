const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto", style: "short" });
const compact = new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 });
const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2 });
const hm = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
const dmy = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

export const count = (n: number) => (n < 1000 ? String(n) : compact.format(n));
export const price = (agorot: number) => ils.format(agorot / 100);
export const clock = (ts: number) => hm.format(ts);
export const date = (ts: number) => dmy.format(ts).replace(/\//g, ".");

export function ago(ts: number): string {
  const s = Math.round((ts - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 45) return "עכשיו";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export function left(ts: number): string {
  const ms = ts - Date.now();
  if (ms <= 0) return "פג תוקף";
  const h = Math.round(ms / 3600_000);
  if (h < 24) return `נותרו ${Math.max(1, h)} שע׳`;
  return `עוד ${Math.round(h / 24)} ימים`;
}

/** short initials for an avatar */
export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  return (parts[0]?.[0] || "?") + (parts[1]?.[0] || "");
}

/** stable hue per user id for avatar tint */
export function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
