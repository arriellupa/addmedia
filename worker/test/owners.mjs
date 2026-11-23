// Site owners, end to end against a running worker in DEV_MODE (`npm run dev`), with a small site for the verification:
//   node test/owners.mjs [baseUrl] [siteDir] [siteBase]
// siteDir is a folder served at siteBase (e.g. `python3 -m http.server 8099` in it); the test writes the verification file there.
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const SITE_DIR = process.argv[3] || "./site";
const SITE_BASE = process.argv[4] || "http://127.0.0.1:8099";
const ADMIN = process.env.ADMIN_TOKEN || "local-admin";
const RUN = Date.now().toString(36);
const DOMAIN = `owners${RUN}.co.il`;
const PAGE = `https://www.${DOMAIN}/news/a${RUN}`;
const OTHER = `https://www.other${RUN}.com/x`;
let pass = 0, failN = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { failN++; console.log("  ✗", name, extra); } };

async function api(path, { method = "GET", token, body, redirect = "manual" } = {}) {
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (body) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect });
  let j = null;
  const text = await r.text();
  try { j = JSON.parse(text); } catch {}
  return { status: r.status, j, r, text };
}
async function login(email, extra = {}) {
  const s = await api("/v1/auth/start", { method: "POST", body: { email } });
  return (await api("/v1/auth/verify", { method: "POST", body: { email, code: s.j.devCode, ...extra } })).j;
}
const panel = (token, url = PAGE) => api(`/v1/panel?url=${encodeURIComponent(url)}`, { token });

const A = await login(`owner+${RUN}@example.com`);
const B = await login(`reader+${RUN}@example.com`);
await api("/v1/me", { method: "POST", token: A.token, body: { acceptTerms: true, name: "בעלת האתר" } });
await api("/v1/me", { method: "POST", token: B.token, body: { acceptTerms: true, name: "קורא" } });

console.log("claim and verification");
let r = await api("/v1/owner/claims", { method: "POST", token: A.token, body: { domain: `https://www.${DOMAIN}/some/page?x=1`, contact: "עורכת ראשית" } });
ok(r.status === 200 && r.j.claim.domain === DOMAIN && r.j.claim.token, "a claim normalizes the address to the site", JSON.stringify(r.j));
const claim = r.j.claim;
r = await api("/v1/owner/claims", { method: "POST", token: A.token, body: { domain: "not a domain" } });
ok(r.status === 400, "a bad address is refused");
r = await api(`/v1/owner/claims/${claim.id}/verify?devBase=${encodeURIComponent(SITE_BASE)}`, { method: "POST", token: A.token });
ok(r.status === 422 && r.j.error.code === "not_found_on_site", "no token on the site: not verified");
mkdirSync(`${SITE_DIR}/.well-known`, { recursive: true });
writeFileSync(`${SITE_DIR}/.well-known/inthepage-verify.txt`, claim.token + "\n");
r = await api(`/v1/owner/claims/${claim.id}/verify?devBase=${encodeURIComponent(SITE_BASE)}`, { method: "POST", token: A.token });
ok(r.status === 200 && r.j.status === "verified" && r.j.method === "file", "the file on the site verifies the claim (waits for the operator)", JSON.stringify(r.j));
r = await api(`/v1/owner/claims/${claim.id}/verify`, { method: "POST", token: B.token });
ok(r.status === 404, "someone else cannot touch the claim");

console.log("the operator approves");
r = await api("/v1/admin/owners", { token: ADMIN });
const listed = r.j.claims.find((c) => c.id === claim.id);
ok(listed && listed.status === "verified" && listed.contact === "עורכת ראשית", "the verified claim is in the admin queue");
r = await api(`/v1/admin/claims/${claim.id}/approve`, { method: "POST", token: ADMIN, body: { note: "אומת בקובץ" } });
ok(r.status === 200, "approved");
await new Promise((res) => setTimeout(res, 300));

console.log("the room shows its owner");
r = await panel(A.token);
ok(r.j.owner && r.j.owner.uid === A.user.id && r.j.owner.isMe === true, "the owner sees the room as theirs", JSON.stringify(r.j.owner));
r = await panel(B.token);
ok(r.j.owner && r.j.owner.isMe === false, "a reader sees the room's owner");
r = await api("/v1/owner", { token: A.token });
const site = r.j.sites?.[0];
ok(site && site.domain === DOMAIN && /^[a-z0-9]{6,16}$/.test(site.refCode), "the owner's page lists the site with a referral code", JSON.stringify(r.j));

console.log("the owner's settings");
r = await api(`/v1/owner/sites/${DOMAIN}`, { method: "PUT", token: A.token, body: { welcome: "ברוכים הבאים לחדר של האתר. דברו בכבוד." } });
ok(r.status === 200, "a pinned message is saved");
r = await panel(B.token);
ok(r.j.owner?.welcome?.startsWith("ברוכים הבאים"), "the pinned message is in the room");
r = await api(`/v1/owner/sites/${DOMAIN}`, { method: "PUT", token: A.token, body: { welcome: "אתה בן זונה" } });
ok(r.status === 422, "an offensive pinned message is refused");
r = await api(`/v1/owner/sites/${DOMAIN}`, { method: "PUT", token: B.token, body: { welcome: "השתלטות" } });
ok(r.status === 403, "only the owner changes the settings");

console.log("hiding an item in the site's rooms");
r = await api("/v1/posts", { method: "POST", token: B.token, body: { url: PAGE, body: "תגובה של קורא באתר" } });
const post = r.j.post;
const roomId = (await panel(B.token)).j.roomId;
ok(post?.id, "a reader posts");
r = await api(`/v1/owner/sites/${DOMAIN}/items`, { method: "POST", token: A.token, body: { roomId, itemType: "post", itemId: post.id, reason: "לא לעניין" } });
ok(r.status === 200, "the owner hides it");
r = await panel(B.token);
ok(!r.j.room.posts.some((p) => p.id === post.id), "the item is gone from the room");
r = await api("/v1/admin/log", { token: ADMIN });
ok(r.j.log.some((l) => l.action === "owner_hide" && l.target_id === post.id && l.actor === "owner:" + A.user.id), "the hiding is in the moderation log, with the owner as actor");
r = await api(`/v1/owner/sites/${DOMAIN}/items`, { method: "POST", token: A.token, body: { roomId, itemType: "post", itemId: post.id, restore: true } });
ok(r.status === 200 && (await panel(B.token)).j.room.posts.some((p) => p.id === post.id), "the owner can bring it back");
r = await api("/v1/posts", { method: "POST", token: B.token, body: { url: OTHER, body: "תגובה באתר אחר" } });
const otherRoom = (await panel(B.token, OTHER)).j.roomId;
r = await api(`/v1/owner/sites/${DOMAIN}/items`, { method: "POST", token: A.token, body: { roomId: otherRoom, itemType: "post", itemId: r.j.post.id } });
ok(r.status === 403, "an owner cannot touch another site's rooms");

console.log("closing talkbacks");
await api(`/v1/owner/sites/${DOMAIN}`, { method: "PUT", token: A.token, body: { noComments: true } });
await new Promise((res) => setTimeout(res, 300));
r = await api("/v1/posts", { method: "POST", token: B.token, body: { url: PAGE, body: "עוד תגובה" } });
ok(r.status === 403 && r.j.error.code === "disabled", "with talkbacks closed by the owner, posting is refused");
await api(`/v1/owner/sites/${DOMAIN}`, { method: "PUT", token: A.token, body: { noComments: false } });

console.log("referral link and badge");
r = await api(`/r/${site.refCode}`);
ok(r.status === 302 && r.r.headers.get("location").startsWith(`/get/?ref=${site.refCode}`), "the owner's link counts and leads to the install page", r.r.headers.get("location"));
const C = await login(`newbie+${RUN}@example.com`, { ref: site.refCode });
ok(C.token, "a reader signs up after the link");
r = await api("/v1/owner", { token: A.token });
ok(r.j.sites[0].stats.clicks30 >= 1 && r.j.sites[0].stats.signups30 === 1, "the owner sees the click and the sign-up", JSON.stringify(r.j.sites[0].stats));
ok(r.j.sites[0].stats.posts30 >= 1, "the owner sees the talkbacks across the site's pages", JSON.stringify(r.j.sites[0].stats));
r = await api(`/v1/badge/${site.refCode}.svg`);
ok(r.status === 200 && r.r.headers.get("content-type").includes("image/svg+xml") && r.text.includes("<svg"), "the badge is an SVG");

console.log("revoke");
r = await api(`/v1/admin/owners/${DOMAIN}`, { method: "DELETE", token: ADMIN });
ok(r.status === 200, "the operator revokes the ownership");
await new Promise((res) => setTimeout(res, 300));
r = await panel(B.token);
ok(!r.j.owner, "the room has no owner any more");
r = await api(`/v1/owner/sites/${DOMAIN}`, { method: "PUT", token: A.token, body: { welcome: "עדיין שלי?" } });
ok(r.status === 403, "the former owner can no longer manage it");

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
