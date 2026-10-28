// End-to-end test against a running worker: `npm run dev` then `node test/e2e.mjs [baseUrl]`
const BASE = process.argv[2] || "http://127.0.0.1:8787";
const ADMIN = process.env.ADMIN_TOKEN || "local-admin";
const RUN = Date.now().toString(36);
const PAGE = `https://www.ynet.co.il/news/article/Hk${RUN}?utm_source=fb&fbclid=xyz#comments`;
let pass = 0, failN = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { failN++; console.log("  ✗", name, extra); } };

async function api(path, { method = "GET", token, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: raw ?? (body ? JSON.stringify(body) : undefined), redirect: "manual" });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j, r };
}

async function login(email) {
  const s = await api("/v1/auth/start", { method: "POST", body: { email } });
  const v = await api("/v1/auth/verify", { method: "POST", body: { email, code: s.j.devCode } });
  return v.j;
}

function ws(token, url = PAGE) {
  const u = new URL(BASE.replace(/^http/, "ws") + "/v1/ws");
  u.searchParams.set("url", url);
  if (token) u.searchParams.set("t", token);
  const sock = new WebSocket(u);
  const events = [];
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === "batch") events.push(...m.evs); else events.push(m); };
  return new Promise((res, rej) => { sock.onopen = () => res({ sock, events }); sock.onerror = rej; });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (o) => new URLSearchParams(o).toString();

console.log("canonicalization & empty page");
let p = await api(`/v1/panel?${q({ url: PAGE })}`);
ok(p.status === 200 && p.j.page.url === `https://ynet.co.il/news/article/Hk${RUN}`, "canonical url strips www, tracking, fragment", p.j?.page?.url);
ok(p.j.room.exists === false && p.j.rules.comments === true, "empty room, comments allowed");
const roomId = p.j.roomId;
const p2 = await api(`/v1/panel?${q({ url: `https://m.ynet.co.il/news/article/Hk${RUN}/` })}`);
ok(p2.j.roomId === roomId, "mobile host + trailing slash map to the same room");
const sens = await api(`/v1/panel?${q({ url: "https://www.bankhapoalim.co.il/he/login" })}`);
ok(sens.j.disabled, "panel disabled on bank/login pages", JSON.stringify(sens.j));

console.log("auth");
const A = await login("alice@example.com");
const B = await login("bob@example.com");
ok(A.token && B.token && A.user.id !== B.user.id, "two users signed in with email codes");
let r = await api("/v1/posts", { method: "POST", token: A.token, body: { url: PAGE, body: "שלום לכולם" } });
ok(r.status === 403 && r.j.error.code === "terms", "posting blocked until community rules accepted");
await api("/v1/me", { method: "POST", token: A.token, body: { acceptTerms: true, name: "אליס" } });
await api("/v1/me", { method: "POST", token: B.token, body: { acceptTerms: true, name: "בוב" } });

console.log("content filtering");
for (const [txt, code, label] of [
  ["אתה בן זונה", "blocked_language", "Hebrew profanity"],
  ["ז.ו.נ.ה אחת", "blocked_language", "obfuscated with dots"],
  ["אני ארצח אותך", "threat", "threat"],
  ["תתקשרו אליו 052-1234567", "pii", "phone number"],
  ["כנסו לאתר שלי www.spam-site.com", "new_account_link", "link from a new account"],
]) {
  r = await api("/v1/posts", { method: "POST", token: A.token, body: { url: PAGE, body: txt } });
  ok(r.status === 422 && r.j.error.code === code, `blocks ${label}`, `${r.status} ${JSON.stringify(r.j)}`);
}

console.log("talkback");
r = await api("/v1/posts", { method: "POST", token: A.token, body: { url: PAGE, body: "כתבה מעניינת, מישהו יודע מה המקור?" } });
ok(r.status === 200 && r.j.post.id, "post created", JSON.stringify(r.j));
const postId = r.j.post.id;
r = await api(`/v1/room/${roomId}/posts/${postId}/like`, { method: "POST", token: B.token });
ok(r.j.liked === true && r.j.likes === 1, "like toggles on");

console.log("live chat");
const a = await ws(A.token);
const b = await ws(B.token);
const anon = await ws(null);
await wait(300);
ok(a.events[0]?.t === "hello", "hello frame with history");
a.sock.send(JSON.stringify({ t: "chat", cid: "c1", body: "היי, מישהו פה?" }));
await wait(600);
ok(a.events.some((e) => e.t === "ack" && e.cid === "c1"), "sender gets ack");
ok(b.events.some((e) => e.t === "chat" && e.m.body === "היי, מישהו פה?"), "other client receives the message");
ok(anon.events.some((e) => e.t === "chat"), "signed-out reader receives too");
anon.sock.send(JSON.stringify({ t: "chat", cid: "x", body: "hi" }));
await wait(300);
ok(anon.events.some((e) => e.t === "nack" && e.code === "auth"), "signed-out reader can't write");
b.sock.send(JSON.stringify({ t: "chat", cid: "c2", body: "שרמוטה" }));
await wait(300);
ok(b.events.some((e) => e.t === "nack" && e.cid === "c2" && e.code === "blocked_language"), "chat is filtered too");
await wait(1700);
ok([...a.events].reverse().find((e) => e.t === "presence")?.n === 3, "presence counts 3 sockets");
const chatId = a.events.find((e) => e.t === "ack").m.id;

console.log("reports & moderation");
const C = await login("carol@example.com");
for (const t of [A.token, B.token, C.token]) await api("/v1/report", { method: "POST", token: t, body: { roomId, itemType: "chat", itemId: chatId, reason: "harassment" } });
await wait(400);
ok(b.events.some((e) => e.t === "hide" && e.id === chatId), "3 reports auto-hide the chat message live");
r = await api("/v1/report", { method: "POST", token: C.token, body: { roomId, itemType: "post", itemId: postId, reason: "intimate" } });
ok(r.j.sla === "48h", "intimate-imagery report gets 48h priority");
r = await api("/v1/admin/reports", { token: ADMIN });
ok(r.j.reports.length >= 2 && r.j.reports[0].priority === 2, "admin queue sorted by priority");
const rep = r.j.reports.find((x) => x.item_id === postId);
r = await api(`/v1/admin/reports/${rep.ids.split(",")[0]}`, { method: "POST", token: ADMIN, body: { action: "dismiss", note: "לא תמונה, תגובה רגילה" } });
ok(r.j.ok, "admin dismisses with a reason");
r = await api("/v1/admin/log", { token: ADMIN });
ok(r.j.log.some((l) => l.action === "dismiss" && l.reason) && r.j.log.some((l) => l.action === "auto_hide"), "decision log records auto and manual actions");
ok((await api("/v1/admin/stats")).status === 401, "admin API rejects missing token");

console.log("paid media & pins (test mode)");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const big = Buffer.concat([png, Buffer.alloc(400)]);
// the first image is free (operator setting freeMedia, default 1); it may be a live link
r = await api(`/v1/media?${q({ url: PAGE, caption: "גרף מהאוצר", link: "https://www.mof.gov.il/budget" })}`, { method: "POST", token: A.token, raw: big, headers: { "Content-Type": "image/png" } });
ok(r.status === 200 && r.j.free && r.j.post.link === "https://www.mof.gov.il/budget", "first image is free and carries its link", JSON.stringify(r.j));
r = await api(`/v1/media?${q({ url: PAGE, caption: "x", link: "javascript:alert(1)" })}`, { method: "POST", token: A.token, raw: big, headers: { "Content-Type": "image/png" } });
ok(r.status === 400 && r.j.error.code === "bad_link", "a bad link is refused");
r = await api(`/v1/media?${q({ url: PAGE, caption: "מהשטח" })}`, { method: "POST", token: A.token, raw: big, headers: { "Content-Type": "image/png" } });
ok(r.status === 402, "second upload refused without credits");
r = await api("/v1/store/checkout", { method: "POST", token: A.token, body: { product: "media5" } });
ok(r.j.ok && r.j.credits === 5, "test purchase adds 5 credits");
r = await api(`/v1/media?${q({ url: PAGE, caption: "מהשטח" })}`, { method: "POST", token: A.token, raw: big, headers: { "Content-Type": "image/png" } });
ok(r.status === 200 && r.j.post.media, "image uploaded and posted", JSON.stringify(r.j));
const mediaUrl = r.j.post.media;
const img = await fetch(BASE + mediaUrl);
ok(img.status === 200 && img.headers.get("content-type") === "image/png", "media served from storage");
r = await api(`/v1/media?${q({ url: PAGE })}`, { method: "POST", token: A.token, raw: Buffer.from("<script>alert(1)</script>".repeat(10)), headers: { "Content-Type": "image/png" } });
ok(r.status === 415, "non-image bytes rejected");
r = await api("/v1/store/checkout", { method: "POST", token: A.token, body: { product: "pin90", roomId, postId } });
ok(r.j.ok && r.j.post.pinned && r.j.post.expiresAt > Date.now() + 89 * 864e5, "post pinned for 90 days");
r = await api("/v1/store/checkout", { method: "POST", token: B.token, body: { product: "pin30", roomId, postId } });
ok(r.status === 403, "can't pin someone else's post");

console.log("bundle");
p = await api(`/v1/panel?${q({ url: PAGE })}`, { token: B.token });
ok(p.j.room.posts.length === 1 && p.j.room.posts[0].liked && p.j.room.posts[0].pinned, "bundle has the pinned post with viewer's like");
ok(p.j.room.media.length === 2 && p.j.room.chat.length === 0, "media listed; hidden chat excluded");
ok(p.j.settings && p.j.settings.pageThreshold === 5 && p.j.settings.centerAd === null, "bundle carries the public settings");

console.log("settings, directory, campus, follows");
r = await api("/v1/admin/settings", { method: "POST", token: ADMIN, body: { pageThreshold: 7, centerAd: { on: true, title: "משכנתא לזוגות צעירים", body: "בדיקת זכאות", url: "https://example.com/x", modes: ["center"] } } });
ok(r.j.settings.pageThreshold === 7 && r.j.settings.centerAd.on, "admin saves settings");
r = await api("/v1/admin/settings", { method: "POST", token: ADMIN, body: { pageThreshold: 5, centerAd: { on: false } } });
ok(r.j.settings.pageThreshold === 5, "and restores them");
const dir = await api("/v1/directory");
ok(dir.status === 200 && Array.isArray(dir.j.sites), "directory lists rooms with people", JSON.stringify(dir.j).slice(0, 200));
const tree = await api("/v1/campus/tree");
ok(tree.j.institutions.some((i) => i.id === "reichman") && tree.j.years.length === 6, "campus tree");
const place = { inst: "reichman", faculty: "משפטים", year: 1, course: "דיני חוזים" };
const CAMPUS = "https://campus.addmedia.noaplate.com/reichman/משפטים/1/דיני-חוזים";
p = await api(`/v1/panel?${q({ url: CAMPUS, scope: "site" })}`);
ok(p.status === 200 && p.j.roomId === p.j.siteId, "a course page has the faculty/year hub as its site room", JSON.stringify(p.j.page));
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(300, 32)]);
r = await api(`/v1/campus/docs?${q({ ...place, kind: "summary", title: "סיכום שיעור 3: חוזה אחיד" })}`, { method: "POST", token: A.token, raw: pdf, headers: { "Content-Type": "application/pdf" } });
ok(r.status === 200 && r.j.doc.kind === "summary", "a lecture summary (PDF) is uploaded", JSON.stringify(r.j));
const docId = r.j?.doc?.id;
r = await api(`/v1/campus/docs?${q({ ...place, kind: "article", title: "x" })}`, { method: "POST", token: A.token, raw: Buffer.from("not a pdf at all, really not"), headers: { "Content-Type": "application/pdf" } });
ok(r.status === 400 || r.status === 415, "a bad title or a non-PDF is refused");
r = await api(`/v1/campus/docs?${q(place)}`);
ok(r.j.docs.some((d) => d.id === docId) && r.j.title.includes("רייכמן"), "documents are listed by place", JSON.stringify(r.j));
const file = await fetch(`${BASE}/v1/campus/docs/${docId}/file`);
ok(file.status === 200 && file.headers.get("content-type") === "application/pdf", "the PDF is served");
r = await api("/v1/me/follows", { method: "POST", token: A.token, body: { path: "/media/campus/reichman/משפטים/1", title: "רייכמן · משפטים · שנה א׳" } });
ok(r.j.follows.length === 1, "a student follows the faculty page");
r = await api("/v1/me/follows", { token: A.token });
ok(r.j.follows[0].path === "/media/campus/reichman/משפטים/1", "follows are listed");
r = await api("/v1/me/follows", { method: "POST", token: A.token, body: { path: "/etc/passwd" } });
ok(r.status === 400, "a strange path is refused");
r = await api(`/v1/campus/docs/${docId}`, { method: "DELETE", token: B.token });
ok(r.status === 403, "only the uploader may delete a document");
r = await api(`/v1/campus/docs/${docId}`, { method: "DELETE", token: A.token });
ok(r.j.ok, "the uploader deletes it");
p = await api(`/v1/panel?${q({ url: PAGE })}`, { token: B.token });
ok(p.j.other.scope === "site", "site room summary included for fallback");

console.log("own content & contact");
r = await api("/v1/posts", { method: "POST", token: B.token, body: { url: PAGE, body: "תגובה שאני אמחק" } });
const mineId = r.j.post.id;
ok((await api(`/v1/room/${roomId}/posts/${mineId}`, { method: "DELETE", token: C.token })).status === 403, "can't delete someone else's post");
ok((await api(`/v1/room/${roomId}/posts/${mineId}`, { method: "DELETE", token: B.token })).j.ok, "owner deletes own post");
r = await api("/v1/contact", { method: "POST", body: { kind: "takedown", email: "owner@example.com", url: PAGE, message: "נא להסיר את התגובה הפוגענית על אחי" } });
ok(r.j.ok && r.j.id, "takedown request accepted");
r = await api("/v1/admin/contacts", { token: ADMIN });
ok(r.j.contacts.some((c) => c.kind === "takedown" && c.status === "open"), "takedown request visible to admin");

console.log("expiry (dev hook)");
{
  const EXP = `https://www.ynet.co.il/news/article/expire-${RUN}`;
  const ep = await api(`/v1/panel?${q({ url: EXP })}`);
  await api("/v1/store/checkout", { method: "POST", token: B.token, body: { product: "media5" } });
  const up = await api(`/v1/media?${q({ url: EXP })}`, { method: "POST", token: B.token, raw: big, headers: { "Content-Type": "image/png" } });
  await api("/v1/posts", { method: "POST", token: B.token, body: { url: EXP, body: "תגובה שתפוג" } });
  const e1 = await api("/v1/admin/dev-expire", { method: "POST", token: ADMIN, body: { roomId: ep.j.roomId } });
  ok(e1.j.ok && e1.j.empty, "expiry alarm empties the room completely", JSON.stringify(e1.j));
  const after = await api(`/v1/panel?${q({ url: EXP })}`);
  ok(after.j.room.exists === false, "expired room reads as empty");
  ok((await fetch(BASE + up.j.post.media)).status === 404, "expired media deleted from storage");
}

console.log("erasure");
r = await api("/v1/me", { method: "DELETE", token: A.token });
ok(r.j.ok, "account deleted");
p = await api(`/v1/panel?${q({ url: PAGE })}`, { token: B.token });
ok(p.j.room.posts.length === 0 && p.j.room.media.length === 0, "user's posts and media removed from the room");
ok((await fetch(BASE + mediaUrl)).status === 404, "media file deleted from storage");
ok((await api("/v1/me", { token: A.token })).status === 401, "old session no longer works");

for (const s of [a, b, anon]) s.sock.close();
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
