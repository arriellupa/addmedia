// Delivery diagnostics: why a browser gets a blank page for the static files.
// /v1/debug      — a page (made by the worker, not a static file) comparing how the static files arrive
// /v1/debug/via  — one static file re-served by the worker itself, uncompressed at origin
import type { Env } from "./util";

const PATHS = ["/", "/check/", "/site.css", "/panel/", "/panel/assets/panel.js"];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function debugVia(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.searchParams.get("p") || "/check/";
  if (!p.startsWith("/") || p.startsWith("//") || p.startsWith("/v1/")) return new Response("bad path", { status: 400 });
  const a = await env.ASSETS.fetch(new Request(new URL(p, url.origin), { headers: { "Accept-Encoding": "identity" } }));
  const body = await a.arrayBuffer();
  return new Response(body, {
    status: a.status,
    headers: { "Content-Type": a.headers.get("Content-Type") || "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function debugPage(req: Request, env: Env, url: URL): Promise<Response> {
  const cf: any = (req as any).cf || {};
  const ae = cf.clientAcceptEncoding || req.headers.get("Accept-Encoding") || "";
  const server: string[] = [];
  for (const p of PATHS) {
    try {
      const r = await env.ASSETS.fetch(new Request(new URL(p, url.origin), { headers: { "Accept-Encoding": ae, "User-Agent": req.headers.get("User-Agent") || "" } }));
      const n = (await r.arrayBuffer()).byteLength;
      server.push(
        `<tr><td dir="ltr">${esc(p)}</td><td dir="ltr">${r.status} · ${esc(r.headers.get("Content-Type"))} · enc=${esc(r.headers.get("Content-Encoding") || "none")} · ${n} B</td></tr>`,
      );
    } catch (e: any) {
      server.push(`<tr><td dir="ltr">${esc(p)}</td><td dir="ltr" class="bad">${esc(e?.message || e)}</td></tr>`);
    }
  }
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="light"><title>אבחון מסירה · AddMedia</title>
<style>
body{margin:0;padding:14px;background:#f6f5f8;color:#14161a;font:13px/1.4 -apple-system,BlinkMacSystemFont,Arial,sans-serif}
h1{font-size:17px;margin:0 0 8px} h2{font-size:14px;margin:12px 0 4px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e7e5ea;border-radius:10px;overflow:hidden}
td{padding:5px 8px;border-top:1px solid #eee;vertical-align:top;font:11px/1.35 ui-monospace,Menlo,monospace;word-break:break-all}
td:first-child{white-space:nowrap;font-weight:600;width:1%}
.bad{color:#b4232c;font-weight:700}.ok{color:#0f7b4b}
.frames{display:flex;gap:8px;margin-top:6px}.frames div{flex:1;min-width:0}
.frames b{display:block;font-size:12px;margin-bottom:3px}
iframe{width:100%;height:190px;border:1px solid #d9d6de;border-radius:8px;background:#fff}
</style></head><body>
<h1>אבחון מסירה</h1>
<h2>הבקשה</h2>
<table>
<tr><td>UA</td><td dir="ltr">${esc(req.headers.get("User-Agent"))}</td></tr>
<tr><td>Accept-Enc</td><td dir="ltr">${esc(ae)}</td></tr>
<tr><td>Net</td><td dir="ltr">${esc(cf.httpProtocol)} · ${esc(cf.tlsVersion)} · ${esc(cf.colo)} · ${esc(cf.country)}</td></tr>
</table>
<h2>השרת קורא את הקבצים</h2>
<table>${server.join("")}</table>
<h2>הדפדפן קורא את הקבצים</h2>
<table id="cl">${PATHS.map((p) => `<tr><td dir="ltr">${esc(p)}</td><td dir="ltr">…</td></tr>`).join("")}</table>
<h2>אותו דף בשתי דרכים</h2>
<div class="frames">
<div><b>קובץ סטטי</b><iframe src="/check/?f=1"></iframe></div>
<div><b>דרך השרת</b><iframe src="/v1/debug/via?p=/check/"></iframe></div>
</div>
<script>
(function(){
  var rows = document.querySelectorAll("#cl tr");
  ${JSON.stringify(PATHS)}.forEach(function(p, i){
    var td = rows[i].children[1];
    fetch(p + (p.indexOf("?") < 0 ? "?nc=" : "&nc=") + Date.now(), { cache: "no-store" }).then(function(r){
      var h = r.status + " · " + (r.headers.get("content-type") || "?") + " · enc=" + (r.headers.get("content-encoding") || "none");
      return r.text().then(function(t){
        var bad = t.indexOf("\\uFFFD") >= 0;
        td.textContent = h + " · " + t.length + " chars" + (bad ? " · GARBLED" : "") + " · " + JSON.stringify(t.slice(0, 40));
        td.className = bad || !r.ok ? "bad" : "ok";
      });
    }).catch(function(e){ td.textContent = "ERROR: " + (e && (e.name + ": " + e.message)); td.className = "bad"; });
  });
})();
</script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
