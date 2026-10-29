// «הוסף מידע»: attach my own materials (documents I wrote in the campus, images I uploaded) to the room of any
// page. A checkbox list from /v1/me/materials; the chosen ones become `ref` posts in the room (POST /v1/room/attach),
// which the talkbacks and the media strip show as cards that open the original.
import { useEffect, useState } from "preact/hooks";
import { API_BASE, Material, Post, api } from "../api";
import { date } from "../fmt";
import { Book, External, FileI, ImageI, Plus } from "../icons";
import { media, needAuth, page, posts, say, scope, scopeNames, sheet } from "../state";
import { SheetFrame } from "./Bits";

export function AttachButton({ compact }: { compact?: boolean }) {
  if (!page.value) return null;
  return (
    <button class={compact ? "icon-btn" : "btn btn-secondary btn-sm"} title="הוסף מידע: לצרף לדף הזה סיכומים ותמונות שלי" aria-label="הוסף מידע" onClick={() => needAuth(() => (sheet.value = { type: "attach" }))}>
      <Plus size={compact ? 18 : 14} />
      {!compact && "הוסף מידע"}
    </button>
  );
}

export function AttachSheet() {
  const [m, setM] = useState<{ docs: Material[]; media: Material[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .materials()
      .then(setM)
      .catch((e) => setErr(e?.message || "החומרים לא נטענו."));
  }, []);
  const key = (x: Material) => `${x.type}:${x.id}`;
  const toggle = (x: Material) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(key(x)) ? n.delete(key(x)) : n.add(key(x));
      return n;
    });
  const all = m ? [...m.docs, ...m.media] : [];
  const submit = async () => {
    const p = page.value;
    if (!p || !sel.size) return;
    setBusy(true);
    try {
      const items = all.filter((x) => sel.has(key(x))).map((x) => ({ type: x.type, id: x.id }));
      const r = await api.attach(p, scope.value, items);
      for (const post of r.posts) {
        if (post.ref?.type === "media") media.value = [post, ...media.value.filter((q) => q.id !== post.id)];
        else posts.value = [post, ...posts.value.filter((q) => q.id !== post.id)];
      }
      say(items.length === 1 ? "צורף לדף." : `${items.length} פריטים צורפו לדף.`);
      sheet.value = null;
    } catch (e: any) {
      say(e?.message || "הצירוף נכשל.", "err");
    }
    setBusy(false);
  };
  return (
    <SheetFrame title="הוסף מידע">
      <p class="lead">
        בחרו מהחומרים שלכם מה לצרף אל <strong>{scopeNames.value[scope.value]}</strong>. הפריט נשאר במקומו; כאן מופיע כרטיס שפותח אותו.
      </p>
      {err && <div class="form-err">{err}</div>}
      {!m && !err && <div class="muted pad">טוען…</div>}
      {m && !all.length && <div class="muted pad">עוד אין לכם חומרים: סיכום שכתבתם בקמפוס או תמונה שהעליתם יופיעו כאן.</div>}
      {m && m.docs.length > 0 && (
        <div class="att-group">
          <div class="att-title">
            <Book size={13} /> מסמכים שכתבתי
          </div>
          {m.docs.map((x) => (
            <label key={x.id} class={`att-item ${sel.has(key(x)) ? "on" : ""}`}>
              <input type="checkbox" checked={sel.has(key(x))} onChange={() => toggle(x)} />
              <FileI size={16} />
              <span class="att-main">
                <span class="att-name" dir="auto">
                  {x.title}
                </span>
                <span class="att-sub">
                  {x.kind === "article" ? "מאמר" : x.kind === "exercise" ? "תרגול" : "סיכום"} · {date(x.ts)}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      {m && m.media.length > 0 && (
        <div class="att-group">
          <div class="att-title">
            <ImageI size={13} /> תמונות שהעליתי
          </div>
          {m.media.map((x) => (
            <label key={x.id} class={`att-item ${sel.has(key(x)) ? "on" : ""}`}>
              <input type="checkbox" checked={sel.has(key(x))} onChange={() => toggle(x)} />
              {x.media ? <img class="att-thumb" src={API_BASE + x.media} alt="" /> : <ImageI size={16} />}
              <span class="att-main">
                <span class="att-name" dir="auto">
                  {x.title || "תמונה"}
                </span>
                <span class="att-sub">{date(x.ts)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <button class="btn btn-primary btn-block" disabled={!sel.size || busy} onClick={submit}>
        {busy ? "מצרף…" : sel.size ? `צירוף ${sel.size === 1 ? "פריט אחד" : `${sel.size} פריטים`}` : "בחרו פריטים"}
      </button>
      <p class="fine">כל פריט אפשר לצרף לעד 50 דפים. מחיקה או השהיה של המקור מסתירה את כל הכרטיסים שלו.</p>
    </SheetFrame>
  );
}

/** a `ref` post: a card that opens the original material */
export function RefCard({ p }: { p: Post }) {
  const r = p.ref;
  if (!r) return null;
  const href = r.type === "doc" ? r.link || "#" : r.link || "#";
  return (
    <a class={`ref-card ${r.type}`} href={href} target="_blank" rel="noopener">
      <span class="ref-ic">{r.type === "doc" ? <FileI size={18} /> : <ImageI size={18} />}</span>
      <span class="ref-main">
        <span class="ref-label">{r.type === "doc" ? (r.kind === "article" ? "מאמר מהקמפוס" : r.kind === "exercise" ? "תרגול מהקמפוס" : "סיכום מהקמפוס") : "תמונה"}</span>
        <span class="ref-title" dir="auto">
          {r.title}
        </span>
        {r.author && <span class="ref-by">מאת {r.author} · צירף/ה {p.name}</span>}
      </span>
      <External size={14} class="ref-ext" />
    </a>
  );
}
