// The documents of a course: text the students wrote. Newest first, filtered by kind, a card per document;
// the editor («סיכום שכתבתי» / «תרגול» / «מאמר או פסק דין») with the author's declaration, a local import from
// Word / PDF (the file never leaves the device), autosaved drafts, and a reader that opens inside the page.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { CampusDoc, DocKind } from "../../api";
import { date } from "../../fmt";
import { Book, Check, Chevron, Edit, External, FileI, LinkI, Plus, Refresh, Shield, Trash, Upload, X } from "../../icons";
import { me, needAuth, say } from "../../state";
import { Avatar } from "../../ui/Bits";
import { Dialog } from "../Dialog";
import { KIND_HE, coverage, dirTree, lecturerName, docs, docsBusy, docsError, editor, fetchBody, loadDocs, nodeDocs, dirNode, openDoc, place, placeTitle, removeDoc, saveDoc, slug, splitSections, takedownOpen, unslug } from "../state";

type Filter = "all" | DocKind;

export function DocsTab() {
  const [filter, setFilter] = useState<Filter>("all");
  const all = nodeDocs.value;
  const list = all.filter((d) => filter === "all" || d.kind === filter).sort((a, b) => b.ts - a.ts);
  const cov = coverage.value;
  const counts: Record<Filter, number> = { all: all.length, summary: 0, exercise: 0, article: 0 };
  for (const d of all) counts[d.kind]++;
  const pl = place.value!;
  const write = (kind: DocKind) => needAuth(() => (editor.value = { kind }));
  return (
    <div class="cp-docs">
      <div class="cp-docs-head">
        <div class="cp-filters" role="tablist" aria-label="סוג מסמך">
          {(["all", "summary", "exercise", "article"] as Filter[]).map((k) => (
            <button key={k} role="tab" aria-selected={filter === k} class={`cp-filter ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
              {k === "all" ? "הכול" : k === "summary" ? "סיכומים" : k === "exercise" ? "תרגול" : "מאמרים"}
              {counts[k] > 0 && <span class="num">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <div class="cp-upload-btns">
          <button class="btn btn-primary btn-sm" onClick={() => write("summary")}>
            <Edit size={14} /> סיכום שכתבתי
          </button>
          <button class="btn btn-secondary btn-sm" onClick={() => write("exercise")}>
            <Plus size={14} /> תרגול
          </button>
          <button class="btn btn-secondary btn-sm" onClick={() => write("article")}>
            <LinkI size={14} /> מאמר / פסק דין
          </button>
        </div>
      </div>

      {dirNode.value && (
        <div class="cp-node">
          <span>
            מציג: {dirNode.value.lecturer ? <b dir="auto">{lecturerName(dirNode.value.lecturer)}</b> : "כל המרצים"}
            {dirNode.value.date && <> · שיעור מ-<span class="num">{dirNode.value.date.split("-").reverse().join(".")}</span></>}
          </span>
          <button class="link" onClick={() => (dirNode.value = null)}>
            <X size={12} /> כל הקורס
          </button>
        </div>
      )}
      {cov && all.length > 0 && !dirNode.value && (cov.summaries === 0 || cov.articles === 0) && (
        <div class="cp-gap">
          <Book size={14} />
          <span>
            חסר בקורס: {cov.summaries === 0 && "עוד אין סיכומים — תהיו הראשונים. "}
            {cov.articles === 0 && "עוד אין מאמרים — קישור למאמר או לפסק דין מהקורס יעזור לכולם."}
          </span>
        </div>
      )}

      {docsError.value && (
        <div class="cp-state err">
          <span>{docsError.value}</span>
          <button class="btn btn-secondary btn-sm" onClick={() => loadDocs()}>
            <Refresh size={14} /> נסו שוב
          </button>
        </div>
      )}
      {docsBusy.value && !all.length && !docsError.value && (
        <div class="cp-cards" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} class="cp-card skel-card">
              <span class="skel" style={{ width: "30%" }} />
              <span class="skel" style={{ width: "80%", height: 14 }} />
              <span class="skel" style={{ width: "50%" }} />
            </div>
          ))}
        </div>
      )}
      {!docsBusy.value && !docsError.value && !list.length && (
        <div class="cp-state">
          <div class="cp-state-art">
            <FileI size={28} />
          </div>
          <div class="cp-state-title">{filter === "all" ? `עוד אין מסמכים ב${pl.course ? unslug(pl.course) : "שנה הזאת"}` : filter === "summary" ? "עוד אין סיכומים — תהיו הראשונים" : filter === "exercise" ? "עוד אין תרגולים" : "עוד אין מאמרים"}</div>
          <div class="cp-state-sub">{filter === "article" ? "מאמר או פסק דין נכנסים כקישור למקור, עם תקציר וסיכום במילים שלכם." : "סיכום שכתבתם, תרגול שבניתם, או קישור למאמר — טקסט במילים שלכם, שמופיע כאן עם שמכם, גלוי לכולם, בלי מנעולים."}</div>
          <button class="btn btn-primary" onClick={() => write(filter === "article" ? "article" : filter === "exercise" ? "exercise" : "summary")}>
            <Edit size={15} /> {filter === "article" ? "הוספת מאמר" : "כתיבת הראשון"}
          </button>
        </div>
      )}
      {list.length > 0 && (
        <div class="cp-cards">
          {list.map((d, i) => (
            <DocCard key={d.id} d={d} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export const hostOf = (u?: string | null) => {
  try {
    return u ? new URL(u).host.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

const readMinutes = (chars: number) => Math.max(1, Math.round(chars / 1100));

export function DocCard({ d, i = 0, compact }: { d: CampusDoc; i?: number; compact?: boolean }) {
  const mine = me.value?.id === d.uid;
  const article = d.kind === "article";
  const heads = (d.sections || []).filter((s) => s.heading).slice(0, 3);
  return (
    <article class={`cp-card k-${d.kind} ${compact ? "compact" : ""}`} style={{ "--i": String(Math.min(i, 12)) }}>
      <div class="cp-card-top">
        <span class={`doc-kind ${d.kind}`}>{KIND_HE[d.kind]}</span>
        {d.status === "hold" && (
          <span class="cp-hold" title="בקשת הסרה התקבלה; הפריט מוסתר עד לבדיקה">
            <Shield size={11} /> בבדיקה לאחר בקשת הסרה
          </span>
        )}
        {!place.value?.course && d.place.course && <span class="cp-card-course">{unslug(d.place.course)}</span>}
        <span class="pane-sp" />
        {mine && (
          <>
            <button class="icon-btn sm" title="עריכה" onClick={() => (editor.value = { kind: d.kind, doc: d })}>
              <Edit size={14} />
            </button>
            <button class="icon-btn sm" title="מחיקה" onClick={() => confirm("למחוק את המסמך?") && removeDoc(d.id)}>
              <Trash size={14} />
            </button>
          </>
        )}
      </div>
      <button class="cp-card-title" dir="auto" onClick={() => openDoc(d)} title="קריאה בתוך הדף">
        {d.title}
      </button>
      {article && d.link && (
        <a class="cp-card-link" href={d.link} target="_blank" rel="noopener nofollow">
          <External size={12} /> <bdi dir="ltr">{hostOf(d.link)}</bdi>
        </a>
      )}
      {heads.length > 0 && !compact && (
        <div class="cp-card-secs">
          {heads.map((s) => (
            <button key={s.i} class="cp-card-sec" dir="auto" onClick={() => openDoc(d, s.i)}>
              {s.heading}
            </button>
          ))}
          {d.sections.length > heads.length && <span class="cp-card-sec more">+{d.sections.length - heads.length}</span>}
        </div>
      )}
      <div class="cp-card-meta">
        <Avatar id={d.uid} name={d.name} size={20} />
        <bdi class="cp-card-by">{d.name}</bdi>
        {d.lecturer && (
          <>
            <span class="cp-card-dot">·</span>
            <bdi class="cp-card-lect">{d.lecturerName || unslug(d.lecturer)}</bdi>
          </>
        )}
        {d.lessonDate && (
          <>
            <span class="cp-card-dot">·</span>
            <span class="num">{d.lessonNo ? `שיעור ${d.lessonNo} · ` : "שיעור "}{d.lessonDate.split("-").reverse().slice(0, 2).join(".")}</span>
          </>
        )}
        <span class="cp-card-dot">·</span>
        <span class="num">{readMinutes(d.chars)}</span> דק׳ קריאה
        <span class="cp-card-dot">·</span>
        <span class="num">{date(d.updatedAt || d.ts)}</span>
      </div>
    </article>
  );
}

// ---------- the editor ----------
const MIN = 20;
const MAX = 60_000;
const draftKey = (kind: DocKind, id?: string) => `am_draft_${id || `${kind}_${place.value ? `${place.value.inst}/${place.value.faculty}/${place.value.year}/${place.value.course || ""}` : ""}`}`;

export function Editor() {
  const e = editor.value!;
  const existing = e.doc;
  const kind = e.kind;
  const pl = place.value!;
  const key = draftKey(kind, existing?.id);
  const [title, setTitle] = useState(existing?.title || "");
  const [body, setBody] = useState("");
  const [link, setLink] = useState(existing?.link || "");
  const [course, setCourse] = useState(unslug(existing?.place.course || pl.course || ""));
  const [lecturer, setLecturer] = useState(existing?.lecturer || "");
  const [lessonDate, setLessonDate] = useState(existing?.lessonDate || "");
  const [lessonNo, setLessonNo] = useState(existing?.lessonNo ? String(existing.lessonNo) : "");
  const [author, setAuthor] = useState(false);
  const lesson = kind !== "article";
  const knownCourses = useMemo(() => {
    const set = new Set<string>();
    for (const c of dirTree.value?.courses || []) if (c.course) set.add(c.course);
    for (const d of docs.value) if (d.place.course) set.add(d.place.course);
    return [...set];
  }, [dirTree.value, docs.value]);
  const knownLecturers = useMemo(() => {
    const set = new Set<string>();
    for (const c of dirTree.value?.courses || []) for (const l of c.lecturers) if (l.lecturer) set.add(l.name || l.lecturer);
    for (const d of docs.value) if (d.lecturer) set.add(d.lecturerName || d.lecturer);
    return [...set];
  }, [dirTree.value, docs.value]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!existing);
  const [why, setWhy] = useState(false);
  const [imp, setImp] = useState<null | { done: number; total: number }>(null);
  const [restored, setRestored] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // the body of an existing document, then (or first) the draft
  useEffect(() => {
    let alive = true;
    (async () => {
      let draft: { title?: string; body?: string; link?: string; ts?: number } | null = null;
      try {
        draft = JSON.parse(localStorage.getItem(key) || "null");
      } catch {}
      if (existing) {
        try {
          const b = await fetchBody(existing.id);
          if (!alive) return;
          setBody(b);
        } catch {
          say("הטקסט לא נטען.", "err");
        }
        setLoading(false);
      }
      if (draft?.body && alive) {
        setBody(draft.body);
        if (draft.title) setTitle(draft.title);
        if (draft.link) setLink(draft.link);
        setRestored(true);
      }
    })();
    return () => void (alive = false);
  }, [key]);
  // autosave the draft
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      try {
        if (body.trim() || title.trim()) localStorage.setItem(key, JSON.stringify({ title, body, link, ts: Date.now() }));
        else localStorage.removeItem(key);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [title, body, link, loading]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const close = () => (editor.value = null);
  const n = body.length;
  const sections = useMemo(() => splitSections(body).filter((s) => s.heading), [body]);
  const u = link.trim();
  const doi = /^10\.\d{4,9}\/\S+$/i.test(u);
  const http = /^https?:\/\/\S+\.\S+/.test(u);
  const refused = /(^|\.)(nevo|takdin|psakdin)\.co\.il$/i.test(hostOf(http ? u : undefined));
  const linkOk = kind !== "article" || ((doi || http) && !refused);
  const linkHint = kind !== "article" ? "" : !u ? "כתובת המאמר, או DOI (למשל 10.1000/xyz123). פסק דין — מהאתר הציבורי court.gov.il." : refused ? "nevo ו-takdin אינם מתקבלים. קשרו למקור הציבורי: court.gov.il או כתב העת." : doi ? "DOI תקין — יהפוך לקישור doi.org." : http ? `קישור ל-${hostOf(u)}` : "כתובת לא תקינה: צריך https:// או DOI.";
  const courseOk = !lesson || slug(course).length >= 2;
  const dateOk = !lessonDate || /^\d{4}-\d{2}-\d{2}$/.test(lessonDate);
  const ok = title.trim().length >= 3 && n >= MIN && n <= MAX && linkOk && courseOk && dateOk && (author || !!existing);
  // what still keeps the button off — said next to it, so nobody hunts for the reason
  const missing = [
    title.trim().length < 3 ? "כותרת" : null,
    !courseOk ? "קורס" : null,
    n < MIN ? `עוד ${MIN - n} תווים` : n > MAX ? "קיצור הטקסט" : null,
    !linkOk ? "קישור תקין" : null,
    !dateOk ? "תאריך תקין" : null,
    !(author || !!existing) ? "הצהרת המחבר" : null,
  ].filter(Boolean) as string[];
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const d = await saveDoc(
      {
        kind,
        title: title.trim(),
        body: body.replace(/\r\n/g, "\n").trim(),
        ...(kind === "article" ? { link: u } : {}),
        ...(lesson ? { course: slug(course), lecturer: lecturer.trim() || undefined, lessonDate: lessonDate || undefined, lessonNo: lessonNo ? Number(lessonNo) : undefined } : {}),
      },
      existing,
    );
    setBusy(false);
    if (!d) return;
    try {
      localStorage.removeItem(key);
    } catch {}
    editor.value = null;
    openDoc(d);
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 40 * 1024 * 1024) return say("הקובץ גדול מדי לייבוא (עד 40MB).", "err");
    setImp({ done: 0, total: 1 });
    try {
      const m = await import("../importText");
      const text = await m.importFile(f, (done, total) => setImp({ done, total }));
      if (!text.trim()) say("לא נמצא טקסט בקובץ (אולי סריקה).", "err");
      else {
        setBody((b) => (b.trim() ? b.replace(/\s*$/, "\n\n") + text : text));
        if (!title.trim()) setTitle(f.name.replace(/\.(docx|pdf|txt|md)$/i, "").replace(/[_-]+/g, " ").slice(0, 160));
        say("הטקסט יובא לעריכה. הקובץ עצמו נשאר אצלכם.");
      }
    } catch (err: any) {
      say(err?.message || "הייבוא נכשל.", "err");
    }
    setImp(null);
    if (file.current) file.current.value = "";
  };
  const insertHeading = () => {
    const el = area.current;
    if (!el) return;
    const pos = el.selectionStart ?? body.length;
    const before = body.slice(0, pos);
    const after = body.slice(pos);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const next = `${before}${prefix}# `;
    setBody(next + after);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = next.length;
    });
  };
  const titleOf = existing ? "עריכת המסמך" : kind === "summary" ? "סיכום שכתבתי" : kind === "exercise" ? "תרגול שבניתי" : "מאמר / פסק דין";
  const pct = imp ? Math.round((imp.done / Math.max(1, imp.total)) * 100) : 0;
  return (
    <div class="cp-editor" role="dialog" aria-modal="true" aria-label={titleOf}>
      <header class="cp-ed-head">
        <button class="icon-btn" onClick={close} aria-label="סגירה" disabled={busy}>
          <X />
        </button>
        <div class="cp-ed-headtext">
          <span class="cp-ed-kind">{titleOf}</span>
          <span class="cp-ed-place" dir="auto">
            {placeTitle(pl)}
          </span>
        </div>
        <span class="pane-sp" />
        <span class={`cp-ed-count num ${n > MAX ? "over" : n < MIN ? "under" : ""}`} aria-live="polite">
          {n.toLocaleString("he-IL")} / {MAX.toLocaleString("he-IL")}
        </span>
      </header>
      <div class="cp-ed-body">
        <div class="cp-ed-main">
          <input class="cp-ed-title" dir="auto" maxLength={160} value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={kind === "summary" ? "כותרת: למשל «סיכום שיעורים 1–4 · חוזים»" : kind === "exercise" ? "כותרת: למשל «שאלות תרגול לפרק 3 עם פתרונות»" : "כותרת: שם המאמר והמחבר, או שם פסק הדין"} />
          {lesson && (
            <div class="cp-ed-lesson">
              <label class="field">
                <span>קורס</span>
                <input class="input" dir="auto" list="cp-courses" value={course} disabled={!!existing} maxLength={60} onInput={(e) => setCourse(e.currentTarget.value)} placeholder="דיני חוזים" />
                <datalist id="cp-courses">
                  {knownCourses.map((c) => (
                    <option key={c} value={unslug(c)} />
                  ))}
                </datalist>
              </label>
              <label class="field">
                <span>מרצה</span>
                <input class="input" dir="auto" list="cp-lecturers" value={lecturer} maxLength={60} onInput={(e) => setLecturer(e.currentTarget.value)} placeholder="פרופ׳ כהן" />
                <datalist id="cp-lecturers">
                  {knownLecturers.map((c) => (
                    <option key={c} value={unslug(c)} />
                  ))}
                </datalist>
              </label>
              <label class="field">
                <span>תאריך השיעור</span>
                <input class="input ltr" type="date" value={lessonDate} onInput={(e) => setLessonDate(e.currentTarget.value)} />
              </label>
              <label class="field cp-ed-no">
                <span>מס׳ שיעור</span>
                <input class="input ltr" type="number" min={1} max={99} value={lessonNo} onInput={(e) => setLessonNo(e.currentTarget.value)} placeholder="3" />
              </label>
            </div>
          )}
          {kind === "article" && (
            <label class="field cp-ed-link">
              <span>קישור או DOI</span>
              <input class="input ltr" dir="ltr" value={link} onInput={(e) => setLink(e.currentTarget.value)} placeholder="https://… או 10.1000/…" />
              <small class={`cp-hint ${u && !linkOk ? "bad" : ""}`}>{linkHint}</small>
            </label>
          )}
          <div class="cp-ed-tools">
            <button class="btn btn-secondary btn-sm" onClick={insertHeading} title="שורה שמתחילה ב-# הופכת לכותרת סעיף">
              <span class="cp-hash">#</span> כותרת סעיף
            </button>
            <button class="btn btn-secondary btn-sm" onClick={() => file.current?.click()} disabled={!!imp}>
              <Upload size={14} /> {imp ? `מייבא… ${imp.total > 1 ? `${imp.done}/${imp.total}` : ""}` : "ייבוא מקובץ"}
            </button>
            <input ref={file} type="file" accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden onChange={(e) => doImport(e.currentTarget.files?.[0])} />
            <span class="cp-ed-toolnote">הקובץ נשאר אצלכם; רק הטקסט שתערכו נשמר.</span>
            {restored && (
              <span class="cp-ed-restored">
                <Check size={12} /> טיוטה שוחזרה
              </span>
            )}
          </div>
          {imp && (
            <div class="cp-progress">
              <div class="cp-progress-bar" style={{ width: `${pct}%` }} />
              <span>מחלץ טקסט במכשיר שלכם…</span>
            </div>
          )}
          {loading ? (
            <div class="cp-ed-loading">טוען את הטקסט…</div>
          ) : (
            <textarea
              ref={area}
              class="cp-ed-area"
              dir="auto"
              value={body}
              spellcheck
              placeholder={kind === "article" ? "תקציר המאמר ואחריו הסיכום שלכם: מה הטענה, מה חשוב לקורס, מה נופל במבחן.\n\nשורה שמתחילה ב-# היא כותרת סעיף, למשל:\n# התקציר\n# מה חשוב לקורס" : "כתבו כאן. שורה שמתחילה ב-# היא כותרת סעיף, למשל:\n\n# שיעור 1 · כריתת חוזה\nהצעה וקיבול…\n\n# שיעור 2 · פגמים בכריתה"}
              onInput={(e) => setBody(e.currentTarget.value)}
            />
          )}
        </div>
        <aside class="cp-ed-side">
          <section class="cp-ed-card">
            <div class="cp-ed-card-title">סעיפים</div>
            {!sections.length && <div class="cp-ed-muted">עוד אין כותרות. שורה שמתחילה ב-<span class="cp-hash">#</span> הופכת לסעיף, שאפשר לקשר אליו ולדון בו.</div>}
            <ol class="cp-ed-secs">
              {sections.map((s) => (
                <li key={s.i} dir="auto">
                  <span class="num">§{s.i}</span> {s.heading}
                </li>
              ))}
            </ol>
          </section>
          {!existing && (
            <label class={`cp-declare ${author ? "on" : ""}`}>
              <input type="checkbox" checked={author} onChange={(e) => setAuthor(e.currentTarget.checked)} />
              <span>
                <b>כתבתי או ערכתי את הטקסט במילותיי</b>
                <small>לא העתקתי מצגת, הקלטה או מבחן של מרצה.</small>
              </span>
            </label>
          )}
          <div class="cp-publish">
            <button class={`btn btn-primary btn-lg btn-block ${ok ? "cp-ed-ready" : ""}`} disabled={!ok || busy} onClick={submit}>
              {busy ? "שומר…" : existing ? "שמירת השינויים" : "פרסום הסיכום"}
            </button>
            {!ok && !busy && missing.length > 0 && (
              <div class="cp-ed-missing" role="status">
                כדי לפרסם חסר: {missing.join(" · ")}
              </div>
            )}
          </div>
          <div class="cp-trust sm">
            <Shield size={16} />
            <span>
              <b>הסרה לפי דרישה:</b> בעלי זכויות, מרצים ומוסדות — כל פריט מוסר תוך 24–48 שעות מהפנייה.
            </span>
            <button class="link" onClick={() => (takedownOpen.value = {})}>
              בקשת הסרה
            </button>
          </div>
          <section class="cp-ed-card cp-why">
            <button class="cp-why-btn" aria-expanded={why} onClick={() => setWhy(!why)}>
              <span>למה טקסט ולא קובץ?</span>
              <Chevron size={14} class={why ? "up" : ""} />
            </button>
            {why && (
              <p class="cp-why-text">
                הקמפוס לא מארח קבצים, ולכן אף מצגת, הקלטה או מאמר בתשלום של מישהו אחר לא יגיעו לכאן. מה שמשותף הוא המילים שלכם — וזה מה שמותר לשתף עם כל השנה, וגם מה שמאפשר לחפש בתוך הסיכומים ולצטט סעיף. ייבוא מקובץ מחלץ את הטקסט במכשיר שלכם, לעריכה; הקובץ לא עולה.
              </p>
            )}
          </section>
          <div class="cp-ed-muted">
            {n < MIN ? `עוד ${MIN - n} תווים לפחות.` : n > MAX ? `ארוך ב-${(n - MAX).toLocaleString("he-IL")} תווים.` : `${sections.length ? `${sections.length} סעיפים · ` : ""}כ-${readMinutes(n)} דק׳ קריאה.`} שמירה: Ctrl+Enter.
          </div>
        </aside>
      </div>
    </div>
  );
}
