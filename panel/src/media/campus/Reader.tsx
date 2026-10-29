// The reader: a document opened inside the page. Title, author, date and kind; section navigation (a sidebar on
// the desktop, a dropdown on the phone); reading typography; a font-size toggle; the section-anchored talkbacks of
// the document's own room (a talkback whose body starts with `§N: `), a composer that prefixes the current
// section, and «ציטוט»: a deep link `?doc=<id>&s=<n>` copied, or dropped into the live chat as `[כותרת · §N](link)`.
import { useEffect, useRef, useState } from "preact/hooks";
import { API_BASE, CampusDoc, Post, api, getToken } from "../../api";
import { ago, date } from "../../fmt";
import { ArrowNext, ArrowPrev, Chevron, Copy, Edit, External, FileI, MessageI, Quote, Shield, X } from "../../icons";
import { composerInsert, me, needAuth, say, sheet } from "../../state";
import { Avatar } from "../../ui/Bits";
import { KIND_HE, closeReader, ctab, docLink, editor, fetchBody, reader, readerSection, splitSections, takedownOpen, unslug } from "../state";
import { hostOf } from "./Docs";

const SEC = /^§(\d+):\s*/;

export function Reader() {
  const v = reader.value!;
  const d = v.doc;
  const [body, setBody] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [big, setBig] = useState(() => {
    try {
      return localStorage.getItem("am_reader_big") === "1";
    } catch {
      return false;
    }
  });
  const [talk, setTalk] = useState(false);
  const main = useRef<HTMLDivElement>(null);
  /** the observer follows the reader only after the reader scrolled (not the programmatic scroll to a deep link) */
  const quietUntil = useRef(0);
  const fromScroll = useRef(false);
  useEffect(() => {
    setBody(null);
    setErr(null);
    fetchBody(d.id)
      .then(setBody)
      .catch((e) => (d.file ? setBody("") : setErr(e?.code === "plan" || e?.status === 402 ? "הקריאה דורשת מנוי קמפוס או ניסיון חינם." : e?.message || "הטקסט לא נטען.")));
  }, [d.id]);
  useEffect(() => {
    document.body.classList.add("cp-reading");
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReader();
    };
    window.addEventListener("keydown", h);
    return () => {
      document.body.classList.remove("cp-reading");
      window.removeEventListener("keydown", h);
    };
  }, []);
  const sections = body !== null ? splitSections(body) : [];
  const total = Math.max(1, sections.length);
  const cur = Math.min(v.section, total);
  // scroll to the section when it changes (and after the body arrives)
  useEffect(() => {
    if (body === null) return;
    if (fromScroll.current) return void (fromScroll.current = false);
    if (cur === 1 && main.current && main.current.scrollTop === 0) return; // the top: nothing to scroll to (a file stays in view)
    const el = main.current?.querySelector<HTMLElement>(`[data-sec="${cur}"]`);
    if (el) {
      quietUntil.current = Date.now() + 900;
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [cur, body === null]);
  // the current section follows the scroll
  useEffect(() => {
    const root = main.current;
    if (!root || body === null) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-sec]"));
    if (els.length < 2) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (Date.now() < quietUntil.current) return;
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) {
          const n = Number((vis.target as HTMLElement).dataset.sec);
          if (n && n !== reader.value?.section) {
            fromScroll.current = true;
            readerSection(n);
          }
        }
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [body === null]);
  const toggleBig = () => {
    setBig(!big);
    try {
      localStorage.setItem("am_reader_big", big ? "0" : "1");
    } catch {}
  };
  const heading = sections[cur - 1]?.heading;
  const mine = me.value?.id === d.uid;
  const cite = async (toChat: boolean) => {
    const link = docLink(d, cur);
    const label = `${d.title} · §${cur}${heading ? " " + heading : ""}`;
    if (toChat) {
      composerInsert.value = `[${label}](${link})`;
      ctab.value = "chat";
      closeReader();
      say("הציטוט מחכה בשיחה החיה.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      say(`הקישור לסעיף ${cur} הועתק.`);
    } catch {
      prompt("העתיקו את הקישור:", link);
    }
  };
  return (
    <div class={`cp-reader ${big ? "big" : ""} ${talk ? "talk-open" : ""}`} role="dialog" aria-modal="true" aria-label={d.title}>
      <header class="cp-rd-head">
        <button class="icon-btn" onClick={closeReader} aria-label="סגירה">
          <X />
        </button>
        <div class="cp-rd-headtext">
          <span class={`doc-kind ${d.kind}`}>{KIND_HE[d.kind]}</span>
          <span class="cp-rd-title" dir="auto">
            {d.title}
          </span>
        </div>
        <span class="pane-sp" />
        <button class="icon-btn" onClick={toggleBig} aria-pressed={big} title="גודל האותיות">
          <span class="cp-aa">Aא</span>
        </button>
        {mine && (
          <button class="icon-btn" title="עריכה" onClick={() => ((editor.value = { kind: d.kind, doc: d }), closeReader())}>
            <Edit size={18} />
          </button>
        )}
        <button class="btn btn-secondary btn-sm cp-rd-cite" onClick={() => cite(false)} title="העתקת קישור לסעיף הנוכחי">
          <Quote size={14} /> ציטוט
        </button>
        <button class={`btn btn-secondary btn-sm cp-rd-talkbtn ${talk ? "on" : ""}`} onClick={() => setTalk(!talk)} aria-pressed={talk}>
          <MessageI size={14} /> דיון
        </button>
      </header>
      <div class="cp-rd-body">
        <nav class="cp-rd-nav" aria-label="סעיפים">
          <div class="cp-rd-navtitle">סעיפים</div>
          {body === null && !err && <div class="cp-ed-muted">טוען…</div>}
          <ol class="cp-rd-secs">
            {sections.map((s) => (
              <li key={s.i}>
                <button class={`cp-rd-sec ${s.i === cur ? "on" : ""}`} onClick={() => readerSection(s.i)} dir="auto">
                  <span class="num">§{s.i}</span> {s.heading || (s.i === 1 ? "פתיחה" : "המשך")}
                </button>
              </li>
            ))}
          </ol>
          <div class="cp-trust sm cp-rd-trust">
            <Shield size={15} />
            <span>
              <b>הסרה לפי דרישה</b> — בעלי זכויות, מרצים ומוסדות, או מי ששמו מופיע בטקסט: כל פריט מוסר תוך 24–48 שעות.
            </span>
            <button class="link" onClick={() => (takedownOpen.value = { item: { type: "doc", id: d.id, title: d.title, sections: d.sections } })}>
              בקשת הסרה
            </button>
          </div>
        </nav>
        <div class="cp-rd-main" ref={main}>
          <div class="cp-rd-paper">
            <div class="cp-rd-meta">
              <Avatar id={d.uid} name={d.name} size={28} />
              <span class="cp-rd-metatext">
                <bdi class="cp-rd-by">{d.name}</bdi>
                <span class="cp-rd-sub">
                  {d.lecturer && <>{d.lecturerName || unslug(d.lecturer)} · </>}
                  {d.lessonDate && <>שיעור {d.lessonNo ? `${d.lessonNo} · ` : ""}<span class="num">{d.lessonDate.split("-").reverse().join(".")}</span> · </>}
                  <span class="num">{date(d.updatedAt || d.ts)}</span>
                  {d.updatedAt && d.updatedAt !== d.ts && " · נערך"}
                </span>
              </span>
              {d.link && (
                <a class="btn btn-secondary btn-sm" href={d.link} target="_blank" rel="noopener nofollow">
                  <External size={13} /> למקור · <bdi dir="ltr">{hostOf(d.link)}</bdi>
                </a>
              )}
            </div>
            <h1 class="cp-rd-h1" dir="auto">
              {d.title}
            </h1>
            {err && (
              <div class="cp-state err">
                <span>{err}</span>
              </div>
            )}
            {body === null && !err && (
              <div class="cp-rd-skel" aria-busy="true">
                {[90, 100, 70, 95, 60, 85].map((w, i) => (
                  <span key={i} class="skel" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
            {d.file && <FileView d={d} />}
            {d.file && body !== null && body.trim() && <div class="cp-rd-filetext">הטקסט שחולץ מהקובץ (לחיפוש ולדיון לפי סעיף):</div>}
            {sections.map((s) => (
              <section key={s.i} class="cp-rd-section" data-sec={s.i} dir="auto">
                {s.heading && (
                  <h2 class="cp-rd-h2">
                    <span class="cp-rd-anchor num" aria-hidden="true">
                      §{s.i}
                    </span>
                    {s.heading}
                  </h2>
                )}
                {s.text.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </section>
            ))}
            {body !== null && !(d.file && !body.trim()) && <div class="cp-rd-end">סוף המסמך · {d.name}</div>}
          </div>
        </div>
        <aside class={`cp-rd-talk ${talk ? "open" : ""}`} aria-label="דיון לפי סעיף">
          <SectionTalk d={d} cur={cur} heading={heading} onClose={() => setTalk(false)} onCite={() => cite(true)} />
        </aside>
      </div>
      <div class="cp-rd-bar">
        <button class="icon-btn" disabled={cur <= 1} onClick={() => readerSection(cur - 1)} aria-label="הסעיף הקודם">
          <ArrowPrev size={20} />
        </button>
        <label class="cp-rd-pick">
          <select class="input" value={cur} onChange={(e) => readerSection(Number(e.currentTarget.value))} aria-label="סעיף">
            {sections.map((s) => (
              <option key={s.i} value={s.i}>
                §{s.i} {s.heading || (s.i === 1 ? "פתיחה" : "")}
              </option>
            ))}
            {!sections.length && <option value={1}>§1</option>}
          </select>
          <Chevron size={14} />
        </label>
        <span class="cp-rd-count num ltr">
          {cur} / {total}
        </span>
        <button class="icon-btn" disabled={cur >= total} onClick={() => readerSection(cur + 1)} aria-label="הסעיף הבא">
          <ArrowNext size={20} />
        </button>
        <button class={`icon-btn ${talk ? "on" : ""}`} onClick={() => setTalk(!talk)} aria-label="דיון">
          <MessageI size={20} />
        </button>
      </div>
    </div>
  );
}

/** an uploaded file: a PDF inline, a Word file rendered to HTML (with its images) by mammoth inside a sandboxed frame */
function FileView({ d }: { d: CampusDoc }) {
  // the frame cannot carry a bearer header, so the token travels as `t` (the server accepts it)
  const url = `${API_BASE}${d.file!.url}${getToken() ? `?t=${encodeURIComponent(getToken()!)}` : ""}`;
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (d.file?.type !== "docx") return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error("file");
        const buf = await r.arrayBuffer();
        const mammoth = await import("mammoth/mammoth.browser.js");
        const out = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (alive) setHtml(out.value);
      } catch {
        if (alive) setErr("הקובץ לא נטען לתצוגה. אפשר להוריד אותו.");
      }
    })();
    return () => void (alive = false);
  }, [d.id]);
  const kb = Math.max(1, Math.round((d.file!.size || 0) / 1024));
  return (
    <div class="cp-rd-file">
      <div class="cp-rd-filebar">
        <FileI size={14} /> {d.file!.type === "pdf" ? "PDF" : "Word"} · <span class="num">{kb}KB</span>
        <span class="pane-sp" />
        <a class="btn btn-secondary btn-sm" href={url} download target="_blank" rel="noopener">
          הורדה
        </a>
      </div>
      {d.file!.type === "pdf" ? (
        <iframe class="cp-rd-pdf" src={url + "#view=FitH"} title={d.title} />
      ) : err ? (
        <div class="cp-state err">{err}</div>
      ) : html === null ? (
        <div class="cp-rd-skel" aria-busy="true">
          {[90, 100, 70].map((w, i) => (
            <span key={i} class="skel" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <iframe class="cp-rd-docx" sandbox="" title={d.title} srcdoc={`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>body{font-family:"IBM Plex Sans Hebrew",system-ui,sans-serif;font-size:17px;line-height:1.7;padding:8px 4px;color:#1c1a22;margin:0;max-width:70ch}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}h1,h2,h3{font-weight:600}</style></head><body>${html}</body></html>`} />
      )}
    </div>
  );
}

/** the talkbacks of the document's room, anchored to sections */
function SectionTalk({ d, cur, heading, onClose, onCite }: { d: CampusDoc; cur: number; heading?: string; onClose: () => void; onCite: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const ctx = { url: d.url, title: d.title };
  const load = () => {
    setErr(null);
    api
      .panel(ctx, "page", "new")
      .then((b) => setPosts((b.room?.posts || []).filter((p) => p.kind === "text")))
      .catch((e) => setErr(e?.message || "הדיון לא נטען."));
  };
  useEffect(load, [d.id]);
  const list = (posts || []).filter((p) => !p.parentId);
  const here = list.filter((p) => Number(p.body.match(SEC)?.[1]) === cur);
  const shown = all ? list : here;
  const submit = () =>
    needAuth(async () => {
      const t = text.trim();
      if (t.length < 2 || busy) return;
      setBusy(true);
      try {
        const r = await api.post(ctx, "page", `§${cur}: ${t}`);
        setPosts((ps) => [r.post, ...(ps || [])]);
        setText("");
      } catch (e: any) {
        if (e?.code === "student") sheet.value = { type: "student", then: submit };
        else say(e.message, "err");
      }
      setBusy(false);
    });
  return (
    <>
      <div class="cp-tk-head">
        <span class="cp-tk-title">
          דיון · <span class="num">§{cur}</span>
          {heading && (
            <span class="cp-tk-heading" dir="auto">
              {" "}
              {heading}
            </span>
          )}
        </span>
        <span class="pane-sp" />
        <button class={`link ${all ? "" : "muted"}`} onClick={() => setAll(!all)}>
          {all ? "רק הסעיף הזה" : `כל הסעיפים${list.length ? ` (${list.length})` : ""}`}
        </button>
        <button class="icon-btn sm" onClick={onClose} aria-label="סגירת הדיון">
          <X size={16} />
        </button>
      </div>
      <div class="cp-tk-list">
        {err && <div class="pane-empty">{err}</div>}
        {posts === null && !err && <div class="pane-empty">טוען…</div>}
        {posts !== null && !shown.length && <div class="pane-empty">{all ? "עוד אין דיון על המסמך." : `עוד אין תגובות על סעיף ${cur}. שאלה, תיקון או הסבר — כאן.`}</div>}
        {shown.map((p) => {
          const m = p.body.match(SEC);
          const n = m ? Number(m[1]) : null;
          return (
            <article key={p.id} class={`cp-tk ${n === cur ? "here" : ""}`}>
              <Avatar id={p.uid} name={p.name} size={24} />
              <div class="cp-tk-main">
                <div class="cp-tk-meta">
                  <bdi class="cp-tk-name">{p.name}</bdi>
                  <span class="cp-tk-time">{ago(p.ts)}</span>
                  {n && (
                    <button class="cp-tk-sec num" onClick={() => readerSection(n)}>
                      סעיף {n}
                    </button>
                  )}
                  <span class="pane-sp" />
                  <button class="icon-btn sm" title="הסרה לפי דרישה" onClick={() => (takedownOpen.value = { item: { type: "post", id: p.id, title: p.body.slice(0, 80) } })}>
                    <Shield size={13} />
                  </button>
                </div>
                <div class="cp-tk-body" dir="auto">
                  {p.body.replace(SEC, "")}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div class="cp-tk-composer">
        <div class="composer-to">
          על <strong>סעיף {cur}</strong>
          {heading ? ` · ${heading}` : ""} · על הטקסט, לא על אנשים
        </div>
        <div class="composer-row">
          <textarea class="input" rows={1} dir="auto" maxLength={2000} value={text} placeholder={me.value ? "שאלה, תיקון או הסבר…" : "התחברו כדי להגיב…"} aria-label="תגובה על הסעיף" onFocus={(e) => !me.value?.termsAccepted && (e.currentTarget.blur(), needAuth(() => {}))} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submit()} />
          <button class="btn btn-primary btn-sm composer-post" disabled={text.trim().length < 2 || busy} onClick={submit}>
            {busy ? "…" : "פרסום"}
          </button>
        </div>
        <button class="link cp-tk-cite" onClick={onCite}>
          <Copy size={13} /> ציטוט הסעיף לשיחה החיה
        </button>
      </div>
    </>
  );
}
