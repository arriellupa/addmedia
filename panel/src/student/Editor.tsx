// «העלה סיכום» — ONE editor («הכל צריך להתווסף לאותו חלון»): the lesson's details on top, a sticky toolbar
// (כותרת · הדבקה · צירוף קובץ · מספור פסקאות · שמירת טיוטה · פרסום), the author's declaration one line under it,
// and the text, which grows with the writing while the window scrolls. Everything inserts at the caret: a heading
// mark, the clipboard (rich text → headings and lists), the text extracted on the device from an attached Word /
// PDF file (the file itself goes up with the summary, one per document). The owner's «עריכה» opens the same
// window on the published text (PUT), with the file chip read-only.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { CampusDoc, CampusPlace, DirectoryTree, api } from "../api";
import { Check, Clipboard, Edit, FileI, ListNum, Paperclip, Save, Shield, X } from "../icons";
import { say, sheet } from "../state";
import { Dialog } from "../media/Dialog";
import { YEAR_HE, docs, fetchBody, instName, loadTree, openDoc, openPlace, place, saveDoc, saveDocFile, slug, splitSections, student, today, unslug } from "../media/state";

const MIN = 20;
const MAX = 60_000;
const MAX_FILE = 15 * 1024 * 1024;

// ---------- text helpers ----------
/** rich text from the clipboard: headings, bold-only paragraphs and list items become `# ` headings and `• ` items */
export function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll("script,style,meta,link").forEach((e) => e.remove());
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) out.push(n.textContent || "");
      else if (n.nodeType === 1) {
        const e = n as Element;
        const tag = e.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) out.push(`\n\n# ${(e.textContent || "").trim()}\n\n`);
        else if (tag === "li") (out.push("\n• "), walk(e));
        else if (tag === "br") out.push("\n");
        else if (/^(p|div|tr|ul|ol|table|section|blockquote|article)$/.test(tag)) (out.push("\n\n"), walk(e), out.push("\n\n"));
        else if (tag === "td" || tag === "th") (walk(e), out.push(" | "));
        else if ((tag === "b" || tag === "strong") && (e.textContent || "").trim().length <= 60 && e.parentElement && (e.parentElement.textContent || "").trim() === (e.textContent || "").trim()) out.push(`\n\n# ${(e.textContent || "").trim()}\n\n`);
        else walk(e);
      }
    }
  };
  walk(div);
  return out
    .join("")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** plain text from the clipboard: a short line standing alone between blank lines becomes a heading */
export function plainToText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((l, i) => {
      const t = l.trim();
      if (!t || t.startsWith("#")) return t;
      const prevBlank = i === 0 || !lines[i - 1].trim();
      const nextBlank = i === lines.length - 1 || !lines[i + 1].trim();
      const short = t.length <= 60 && t.split(/\s+/).length <= 8 && !/[.,;:!?…]$/.test(t);
      return prevBlank && nextBlank && short && i < lines.length - 1 ? `# ${t}` : t;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NUM = /^(\d+)\.\s/;
const isHeading = (p: string) => /^#\s/.test(p);
/** strip the paragraph numbers and map a caret position through */
export function stripNumbers(text: string, pos: number): [string, number] {
  let out = "";
  let np = pos;
  let off = 0;
  for (const part of text.split(/(\n{2,})/)) {
    const m = !/^\n{2,}$/.test(part) && !isHeading(part) ? part.match(NUM) : null;
    if (m) {
      const L = m[0].length;
      if (pos > off) np -= Math.min(L, pos - off);
      out += part.slice(L);
    } else out += part;
    off += part.length;
  }
  return [out, np];
}
/** number every non-heading paragraph `1. 2. 3.` in order and map a caret position through */
export function addNumbers(text: string, pos: number): [string, number] {
  let out = "";
  let np = pos;
  let off = 0;
  let n = 0;
  for (const part of text.split(/(\n{2,})/)) {
    if (/^\n{2,}$/.test(part) || !part.trim() || isHeading(part)) out += part;
    else {
      const P = `${++n}. `;
      if (pos >= off) np += P.length;
      out += P + part;
    }
    off += part.length;
  }
  return [out, np];
}
export const renumber = (text: string, pos: number): [string, number] => {
  const [s, p] = stripNumbers(text, pos);
  return addNumbers(s, p);
};

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const okFile = (f: File) => /\.(pdf|docx)$/i.test(f.name) || f.type === "application/pdf" || f.type.includes("wordprocessingml");

type Draft = { course?: string; topic?: string; lecturer?: string; published?: string; lessonDate?: string; body?: string; numbering?: boolean; fileName?: string; ts?: number };
const draftKey = (id?: string) => `am_st_draft_${id || "new"}`;

/** a toolbar button: icon and label on the desktop, icon with a tooltip on the phone */
function Tool({ label, icon, onClick, disabled, on, title }: { label: string; icon: any; onClick: () => void; disabled?: boolean; on?: boolean; title: string }) {
  return (
    <button type="button" class={`btn btn-secondary btn-sm st-tool ${on ? "on" : ""}`} onClick={onClick} disabled={disabled} title={title} aria-label={label} aria-pressed={on}>
      {icon}
      <span class="st-tool-lbl">{label}</span>
    </button>
  );
}

export function UploadWindow({ onClose, existing }: { onClose: () => void; existing?: CampusDoc }) {
  // the profile, kept through a reload of the student signal (a password set, a name change)
  const sRef = useRef(student.value || null);
  if (student.value) sRef.current = student.value;
  const s = sRef.current!;
  const key = draftKey(existing?.id);
  const [course, setCourse] = useState(unslug(existing?.place.course || ""));
  const [topic, setTopic] = useState(existing?.topic || existing?.title || "");
  const [lecturer, setLecturer] = useState(existing?.lecturerName || existing?.lecturer || "");
  const [published, setPublished] = useState(existing?.published || today());
  const [lessonDate, setLessonDate] = useState(existing?.lessonDate || "");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [extracting, setExtracting] = useState<{ done: number; total: number } | null>(null);
  const [numbering, setNumbering] = useState(false);
  const [author, setAuthor] = useState(!!existing);
  const [pasteBox, setPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [loading, setLoading] = useState(!!existing);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [done, setDone] = useState<{ doc: CampusDoc; textOk: boolean } | null>(null);
  const [dir, setDir] = useState<DirectoryTree | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  /** a caret to restore after the next render (set by the caret-aware edits) */
  const caret = useRef<{ pos: number; scrollTo?: number } | null>(null);

  useEffect(() => {
    loadTree();
    api
      .facultyTree(s.inst, s.faculty, s.year)
      .then(setDir)
      .catch(() => setDir({ courses: [] }));
  }, []);
  // the published text (when editing), then the draft on top of it
  useEffect(() => {
    let alive = true;
    (async () => {
      let draft: Draft | null = null;
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
      if (draft && alive && (draft.body || draft.topic || draft.course)) {
        if (draft.body !== undefined) setBody(draft.body);
        if (draft.course) setCourse(draft.course);
        if (draft.topic) setTopic(draft.topic);
        if (draft.lecturer) setLecturer(draft.lecturer);
        if (draft.published) setPublished(draft.published);
        if (draft.lessonDate !== undefined) setLessonDate(draft.lessonDate);
        if (draft.numbering) setNumbering(true);
        if (draft.fileName && !existing) setFileNote(`הקובץ «${draft.fileName}» לא נשמר בטיוטה — צרפו אותו שוב לפני הפרסום.`);
        setRestored(true);
      }
    })();
    return () => void (alive = false);
  }, [key]);
  const snapshot = (): Draft => ({ course, topic, lecturer, published, lessonDate, body, numbering, fileName: file?.name, ts: Date.now() });
  const saveDraft = (explicit = false) => {
    try {
      if (body.trim() || topic.trim() || course.trim()) localStorage.setItem(key, JSON.stringify(snapshot()));
      else localStorage.removeItem(key);
      setSavedAt(Date.now());
      if (explicit) say("הטיוטה נשמרה");
    } catch {
      if (explicit) say("הטיוטה לא נשמרה (אין מקום בדפדפן).", "err");
    }
  };
  // autosave
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => saveDraft(false), 700);
    return () => clearTimeout(t);
  }, [course, topic, lecturer, published, lessonDate, body, numbering, loading]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) (e.preventDefault(), saveDraft(true));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  // the textarea grows with the text; the window scrolls, the toolbar stays
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 280)}px`;
  }, [body, loading]);
  // restore the caret (and bring an insertion into view) after a caret-aware edit — before paint, so the caret
  // never shows at the end of the text and a fast keystroke never lands there
  useLayoutEffect(() => {
    const c = caret.current;
    const el = area.current;
    if (!c || !el) return;
    caret.current = null;
    el.focus({ preventScroll: true });
    el.selectionStart = el.selectionEnd = c.pos;
    if (c.scrollTo !== undefined) {
      const box = el.closest<HTMLElement>(".sheet-body");
      if (box) {
        const y = el.offsetTop + lineTop(el, c.scrollTo) - 120;
        box.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
    }
  }, [body]);

  const courses = useMemo(() => (dir?.courses || []).filter((c) => !!c.course).map((c) => c.course!), [dir]);
  const lecturers = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dir?.courses || []) for (const l of c.lecturers) if (l.lecturer) m.set(l.lecturer, l.name || unslug(l.lecturer));
    for (const d of docs.value) if (d.lecturer) m.set(d.lecturer, d.lecturerName || unslug(d.lecturer));
    return [...m.values()];
  }, [dir]);
  const n = body.length;
  const sections = useMemo(() => splitSections(body).filter((x) => x.heading), [body]);
  const metaOk = (existing ? true : slug(course).length >= 2) && topic.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(published) && (!lessonDate || /^\d{4}-\d{2}-\d{2}$/.test(lessonDate));
  const hasFile = !!file || !!existing?.file;
  const contentOk = hasFile ? n <= MAX || !!file : n >= MIN && n <= MAX;
  const ok = metaOk && contentOk && author && !extracting;
  const missing = [
    !existing && slug(course).length < 2 ? "שם השיעור" : null,
    topic.trim().length < 2 ? "נושא" : null,
    !/^\d{4}-\d{2}-\d{2}$/.test(published) ? "תאריך פרסום" : null,
    !hasFile && n < MIN ? `עוד ${MIN - n} תווים` : n > MAX && !file ? "קיצור הטקסט" : null,
    !author ? "הצהרת המחבר" : null,
  ].filter(Boolean) as string[];

  // ---------- caret-aware edits ----------
  /** replace the selection (or insert at the caret); `block` keeps a blank line around the insertion */
  const insertAt = (text: string, block = false, scroll = false) => {
    const el = area.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? start;
    const before = body.slice(0, start);
    const after = body.slice(end);
    let lead = "";
    let tail = "";
    if (block) {
      if (before && !before.endsWith("\n\n")) lead = before.endsWith("\n") ? "\n" : "\n\n";
      if (after && !after.startsWith("\n\n")) tail = after.startsWith("\n") ? "\n" : "\n\n";
    }
    let next = before + lead + text + tail + after;
    let pos = (before + lead + text).length;
    if (numbering) [next, pos] = renumber(next, pos);
    caret.current = { pos, scrollTo: scroll ? (before + lead).length : undefined };
    setBody(next);
  };
  const insertHeading = () => {
    const el = area.current;
    const pos = el?.selectionStart ?? body.length;
    const lineStart = body.lastIndexOf("\n", pos - 1) + 1;
    const line = body.slice(lineStart, body.indexOf("\n", lineStart) === -1 ? body.length : body.indexOf("\n", lineStart));
    let next: string;
    let np: number;
    if (/^#\s/.test(line)) {
      // already a heading: take the mark off
      next = body.slice(0, lineStart) + line.replace(/^#\s+/, "") + body.slice(lineStart + line.length);
      np = Math.max(lineStart, pos - (line.length - line.replace(/^#\s+/, "").length));
    } else {
      const m = numbering ? line.match(NUM) : null;
      const bare = m ? line.slice(m[0].length) : line;
      next = body.slice(0, lineStart) + "# " + bare + body.slice(lineStart + line.length);
      np = pos + 2 - (m ? m[0].length : 0);
      if (numbering) [next, np] = renumber(next, np);
    }
    caret.current = { pos: np };
    setBody(next);
  };
  const onInput = (e: Event) => {
    const el = e.currentTarget as HTMLTextAreaElement;
    const raw = el.value;
    if (!numbering) return void setBody(raw);
    const [next, pos] = renumber(raw, el.selectionStart ?? raw.length);
    if (next !== raw) {
      // the numbers changed under the caret: fix the field at once, then let the state follow
      el.value = next;
      el.selectionStart = el.selectionEnd = pos;
      caret.current = { pos };
    }
    setBody(next);
  };
  const toggleNumbering = () => {
    const el = area.current;
    const pos = el?.selectionStart ?? body.length;
    const [next, np] = numbering ? stripNumbers(body, pos) : renumber(body, pos);
    setNumbering(!numbering);
    caret.current = { pos: np };
    setBody(next);
  };
  const pasteClipboard = async () => {
    try {
      let html = "";
      let text = "";
      const cb: any = navigator.clipboard;
      if (cb?.read) {
        const items: any[] = await cb.read();
        for (const it of items) {
          if (!html && it.types.includes("text/html")) html = await (await it.getType("text/html")).text();
          if (!text && it.types.includes("text/plain")) text = await (await it.getType("text/plain")).text();
        }
      } else if (cb?.readText) text = await cb.readText();
      else throw new Error("no-clipboard");
      const out = html ? htmlToText(html) : plainToText(text);
      if (!out.trim()) return say("הלוח ריק. העתיקו טקסט ונסו שוב.", "err");
      insertAt(out, true, true);
      say("הודבק במקום הסמן.");
    } catch {
      // the browser refused the clipboard: a small box the student pastes into
      setPasteBox(true);
      requestAnimationFrame(() => pasteRef.current?.focus());
    }
  };
  const insertPasteBox = () => {
    if (!pasteText.trim()) return;
    insertAt(pasteText.trim(), true, true);
    setPasteText("");
    setPasteBox(false);
  };
  const attach = async (f: File | undefined) => {
    if (fileIn.current) fileIn.current.value = "";
    if (!f) return;
    if (!okFile(f)) return say("רק קובצי Word (.docx) או PDF.", "err");
    if (f.size > MAX_FILE) return say("הקובץ גדול מדי (עד 15MB).", "err");
    setFile(f);
    setFileNote(null);
    if (!topic.trim()) setTopic(f.name.replace(/\.(pdf|docx)$/i, "").replace(/[_-]+/g, " ").slice(0, 120));
    setExtracting({ done: 0, total: 1 });
    try {
      const m = await import("../media/importText");
      const text = await m.importFile(f, (done, total) => setExtracting({ done, total }));
      if (!text.trim()) setFileNote("לא נמצא טקסט בקובץ (אולי סריקה). הקובץ יפורסם כמו שהוא; אפשר לכתוב כאן תקציר, כדי שאפשר יהיה לחפש אותו.");
      else {
        insertAt(text.slice(0, MAX), true, true);
        say("הטקסט מהקובץ נכנס לעריכה במקום הסמן.");
      }
    } catch {
      setFileNote("הטקסט לא חולץ מהקובץ. הקובץ יפורסם כמו שהוא; אפשר לכתוב כאן תקציר, כדי שאפשר יהיה לחפש אותו.");
    }
    setExtracting(null);
  };
  const removeFile = () => {
    setFile(null);
    setFileNote(null);
  };

  const submit = async () => {
    if (!ok || busy) return;
    const text = body.replace(/\r\n/g, "\n").trim();
    const meta = { topic: topic.trim(), lecturer: lecturer.trim() || undefined, lessonDate: lessonDate || undefined, published };
    if (existing) {
      setBusy("שומר…");
      const d = await saveDoc({ kind: existing.kind, title: topic.trim(), body: text, ...meta }, existing, submit);
      setBusy(null);
      if (!d) return;
      try {
        localStorage.removeItem(key);
      } catch {}
      onClose();
      openDoc(d);
      return;
    }
    // the summary belongs to the student's own faculty and year
    const target: CampusPlace = { inst: s.inst, faculty: s.faculty, year: s.year };
    if (!place.value || place.value.inst !== target.inst || place.value.faculty !== target.faculty || place.value.year !== target.year) place.value = target;
    let r: { doc: CampusDoc; textOk: boolean } | null = null;
    if (file) {
      setBusy("מעלה את הקובץ…");
      r = await saveDocFile({ title: topic.trim(), course: slug(course), ...meta }, file, (stage) => setBusy(stage === "upload" ? "מעלה את הקובץ…" : "שומר את הטקסט לחיפוש…"), text, submit);
    } else {
      setBusy("מפרסם…");
      const d = await saveDoc({ kind: "summary", title: topic.trim(), body: text, course: slug(course), ...meta }, undefined, submit);
      r = d ? { doc: d, textOk: true } : null;
    }
    setBusy(null);
    if (!r) return;
    try {
      localStorage.removeItem(key);
    } catch {}
    setDone(r);
  };

  if (done)
    return (
      <Dialog title="הסיכום פורסם" onClose={onClose}>
        <div class="cp-done">
          <span class="cp-done-ic">
            <Check size={26} />
          </span>
          <div class="cp-done-title" dir="auto">
            {done.doc.title}
          </div>
          <div class="cp-done-sub">
            {unslug(done.doc.place.course)} · שנה {YEAR_HE[done.doc.place.year]} · גלוי לכל השנה עם שמכם.
          </div>
          {!done.textOk && <div class="cp-hint">הטקסט לא נשמר לחיפוש (ריק או קצר מדי). הקובץ זמין לקריאה ולהורדה.</div>}
          <div class="cp-done-actions">
            <button class="btn btn-primary" onClick={() => (onClose(), openPlace(done.doc.place), openDoc(done.doc))}>
              פתיחה
            </button>
            <button class="btn btn-secondary" onClick={() => (onClose(), openPlace(done.doc.place))}>
              לדף הקורס
            </button>
          </div>
        </div>
      </Dialog>
    );
  const pct = extracting ? Math.round((extracting.done / Math.max(1, extracting.total)) * 100) : 0;
  return (
    <Dialog title={existing ? "עריכת הסיכום" : "העלה סיכום"} onClose={onClose} closable={!busy} wide cls="st-upload">
      <div class="st-ed">
        <div class="st-up-profile">
          <div class="st-up-pf">
            <span class="st-up-k">פקולטה</span>
            <b dir="auto">{unslug(s.faculty)}</b>
          </div>
          <div class="st-up-pf">
            <span class="st-up-k">חוג / מגמה</span>
            <b dir="auto">{s.track}</b>
          </div>
          <div class="st-up-pf">
            <span class="st-up-k">שנה</span>
            <b>שנה {YEAR_HE[s.year]}</b>
          </div>
          <div class="st-up-pf">
            <span class="st-up-k">מוסד</span>
            <b dir="auto">{instName(s.inst)}</b>
          </div>
          {!existing && (
            <button class="link" onClick={() => (sheet.value = { type: "student" })}>
              <Edit size={12} /> שינוי
            </button>
          )}
        </div>
        <div class="st-up-grid">
          <label class="field">
            <span>שם השיעור</span>
            <input class="input" dir="auto" list="st-up-course" value={course} maxLength={60} disabled={!!existing} onInput={(e) => setCourse(e.currentTarget.value)} placeholder="דיני חוזים" />
            <datalist id="st-up-course">{courses.map((c) => <option key={c} value={unslug(c)} />)}</datalist>
          </label>
          <label class="field">
            <span>נושא הסיכום</span>
            <input class="input" dir="auto" value={topic} maxLength={120} onInput={(e) => setTopic(e.currentTarget.value)} placeholder="כריתת חוזה: הצעה וקיבול" />
          </label>
          <label class="field">
            <span>שם המרצה</span>
            <input class="input" dir="auto" list="st-up-lect" value={lecturer} maxLength={60} onInput={(e) => setLecturer(e.currentTarget.value)} placeholder="פרופ׳ כהן" />
            <datalist id="st-up-lect">{lecturers.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
          <label class="field">
            <span>תאריך הפרסום</span>
            <input class="input ltr" type="date" value={published} onInput={(e) => setPublished(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span>תאריך השיעור (לא חובה)</span>
            <input class="input ltr" type="date" value={lessonDate} onInput={(e) => setLessonDate(e.currentTarget.value)} />
          </label>
        </div>

        <div class="st-ed-tools" role="toolbar" aria-label="כלי העריכה">
          <Tool label="כותרת" title="כותרת סעיף: השורה שבה הסמן הופכת לכותרת (שורה שמתחילה ב-#)" icon={<span class="cp-hash">#</span>} onClick={insertHeading} disabled={loading} />
          <Tool label="הדבקה" title="הדבקה מהלוח במקום הסמן: כותרות ורשימות מהמקור נשמרות" icon={<Clipboard size={15} />} onClick={pasteClipboard} disabled={loading} />
          <Tool label="צירוף קובץ" title={existing ? "הקובץ לא ניתן להחלפה אחרי הפרסום" : "Word או PDF עד 15MB: הקובץ מצורף לסיכום והטקסט שלו נכנס לכאן לעריכה"} icon={<Paperclip size={15} />} onClick={() => fileIn.current?.click()} disabled={loading || !!extracting || !!existing} on={!!file} />
          <Tool label="מספור פסקאות" title="מספור כל הפסקאות (1. 2. 3.) — מתעדכן תוך כדי כתיבה; לחיצה נוספת מסירה" icon={<ListNum size={15} />} onClick={toggleNumbering} disabled={loading} on={numbering} />
          <span class="pane-sp" />
          <span class={`cp-ed-count num ${n > MAX ? "over" : n && n < MIN && !hasFile ? "under" : ""}`} aria-live="polite" title="תווים">
            {n.toLocaleString("he-IL")} / {MAX.toLocaleString("he-IL")}
          </span>
          <Tool label="שמירת טיוטה" title={savedAt ? `טיוטה נשמרת אוטומטית במכשיר הזה (Ctrl+S) · נשמר ${new Date(savedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : "שמירת טיוטה במכשיר הזה (Ctrl+S); נשמרת גם אוטומטית"} icon={<Save size={15} />} onClick={() => saveDraft(true)} disabled={loading} />
          <button type="button" class="btn btn-primary btn-sm st-tool st-publish" disabled={!ok || !!busy} onClick={submit} title={ok ? "פרסום (Ctrl+Enter)" : `כדי לפרסם חסר: ${missing.join(" · ")}`}>
            {busy ? busy : existing ? "שמירה" : "פרסום"}
          </button>
        </div>
        <input ref={fileIn} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => attach(e.currentTarget.files?.[0])} />

        <label class={`cp-declare st-declare ${author ? "on" : ""}`}>
          <input type="checkbox" checked={author} onChange={(e) => setAuthor(e.currentTarget.checked)} />
          <span>
            <b>כתבתי או ערכתי את הסיכום במילותיי</b>
            <small>לא העתקתי מצגת, הקלטה או מבחן של מרצה. חומר של מרצים ומוסדות מוסר לבקשתם, והחשבון מקבל ציון.</small>
          </span>
        </label>
        {!ok && !busy && missing.length > 0 && (author || topic || course || body) && (
          <div class="cp-ed-missing st-missing" role="status">
            כדי לפרסם חסר: {missing.join(" · ")}
          </div>
        )}

        {(file || existing?.file) && (
          <div class={`st-chip ${existing ? "ro" : ""}`}>
            <FileI size={16} />
            <span class="st-chip-main">
              <bdi class="st-chip-name">{file ? file.name : `קובץ ${existing!.file!.type === "pdf" ? "PDF" : "Word"}`}</bdi>
              <span class="st-chip-sub num">{fmtSize(file ? file.size : existing!.file!.size)}</span>
            </span>
            {file && !existing ? (
              <>
                <button class="link" onClick={() => fileIn.current?.click()} disabled={!!extracting}>
                  החלפה
                </button>
                <button class="link" onClick={removeFile} disabled={!!extracting}>
                  <X size={12} /> הסרה
                </button>
              </>
            ) : (
              <span class="st-chip-ro">הקובץ לא ניתן להחלפה אחרי הפרסום</span>
            )}
          </div>
        )}
        {fileNote && <div class="cp-hint st-filenote">{fileNote}</div>}
        {file && !existing && <LocalFilePreview file={file} />}
        {extracting && (
          <div class="cp-progress">
            <div class="cp-progress-bar" style={{ width: `${pct}%` }} />
            <span>מחלץ טקסט מהקובץ במכשיר שלכם… {extracting.total > 1 ? `${extracting.done}/${extracting.total}` : ""}</span>
          </div>
        )}
        {pasteBox && (
          <div class="st-pastebox">
            <div class="st-pastebox-head">
              <span>הדפדפן לא פתח את הלוח. הדביקו כאן (Ctrl+V) — והטקסט ייכנס במקום הסמן.</span>
              <button class="icon-btn sm" onClick={() => setPasteBox(false)} aria-label="סגירה">
                <X size={14} />
              </button>
            </div>
            <textarea
              ref={pasteRef}
              class="input"
              rows={4}
              dir="auto"
              value={pasteText}
              onInput={(e) => setPasteText(e.currentTarget.value)}
              onPaste={(e) => {
                const html = e.clipboardData?.getData("text/html");
                if (!html) return;
                e.preventDefault();
                setPasteText(htmlToText(html));
              }}
            />
            <button class="btn btn-primary btn-sm" disabled={!pasteText.trim()} onClick={insertPasteBox}>
              הכנסה במקום הסמן
            </button>
          </div>
        )}

        {loading ? (
          <div class="cp-ed-loading">טוען את הטקסט…</div>
        ) : (
          <textarea
            ref={area}
            class="cp-ed-area st-ed-area"
            dir="auto"
            value={body}
            spellcheck
            placeholder={"כתבו כאן, הדביקו, או צרפו קובץ — הכול באותו חלון.\n\n# כריתת חוזה\nהצעה וקיבול…\n\n# גמירת דעת\n…"}
            onInput={onInput}
            onPaste={(e) => {
              const html = e.clipboardData?.getData("text/html");
              if (!html) return;
              e.preventDefault();
              insertAt(htmlToText(html), true);
            }}
          />
        )}
        <div class="st-ed-foot">
          {sections.length > 0 && (
            <div class="st-secs">
              {sections.map((x) => (
                <span key={x.i} class="cp-card-sec" dir="auto">
                  §{x.i} {x.heading}
                </span>
              ))}
            </div>
          )}
          <div class="cp-ed-muted">
            {restored && (
              <span class="cp-ed-restored">
                <Check size={12} /> טיוטה שוחזרה ·{" "}
              </span>
            )}
            שורה שמתחילה ב-# היא כותרת סעיף; לכל סעיף יש קישור ודיון. הטיוטה נשמרת במכשיר הזה. פרסום: Ctrl+Enter.
          </div>
          <div class="cp-trust sm">
            <Shield size={16} />
            <span>
              <b>הסרה לפי דרישה:</b> בעלי זכויות, מרצים ומוסדות — כל פריט מוסר תוך 24–48 שעות מהפנייה.
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** the y of a character offset inside a textarea (a mirror of its text, measured once) */
function lineTop(el: HTMLTextAreaElement, offset: number): number {
  const m = document.createElement("div");
  const cs = getComputedStyle(el);
  for (const k of ["font", "fontSize", "fontFamily", "lineHeight", "letterSpacing", "padding", "border", "boxSizing", "whiteSpace", "wordBreak", "overflowWrap", "direction"] as const) (m.style as any)[k] = cs[k];
  m.style.position = "absolute";
  m.style.visibility = "hidden";
  m.style.whiteSpace = "pre-wrap";
  m.style.width = `${el.clientWidth}px`;
  m.style.height = "auto";
  m.textContent = el.value.slice(0, offset);
  const mark = document.createElement("span");
  mark.textContent = "​";
  m.appendChild(mark);
  document.body.appendChild(m);
  const y = mark.offsetTop;
  m.remove();
  return y;
}


/** the attached file as it is — a PDF in a frame, a Word file rendered with its images — shown above the editable text,
 *  so the student sees the presentation and not only the extracted words */
function LocalFilePreview({ file }: { file: File }) {
  const [open, setOpen] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  useEffect(() => {
    let alive = true;
    setHtml(null);
    if (isPdf) {
      const u = URL.createObjectURL(file);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    (async () => {
      try {
        const mammoth = await import("mammoth/mammoth.browser.js");
        const out = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        if (alive) setHtml(out.value);
      } catch {
        if (alive) setHtml("");
      }
    })();
    return () => void (alive = false);
  }, [file]);
  return (
    <div class="st-preview">
      <button class="st-preview-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <FileI size={14} /> תצוגת הקובץ כפי שהוא {open ? "▾" : "▸"}
        <span class="st-preview-sub">הקובץ מתפרסם כמו שהוא; הטקסט למטה הוא לחיפוש ולעריכה</span>
      </button>
      {open &&
        (isPdf ? (
          url && <iframe class="st-preview-frame" src={url + "#view=FitH"} title={file.name} />
        ) : html === null ? (
          <div class="cp-hint">טוען תצוגה…</div>
        ) : html === "" ? (
          <div class="cp-hint">לא ניתן להציג את הקובץ כאן; הוא יפורסם כמו שהוא.</div>
        ) : (
          <iframe class="st-preview-frame" sandbox="" title={file.name} srcdoc={`<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;padding:8px;margin:0;color:#1c1a22}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body>${html}</body></html>`} />
        ))}
    </div>
  );
}
