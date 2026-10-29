// AddStudent — the students' own site (addstudent.noaplate.com, /student/): light, simple. Two directories and a
// search: «מצא סיכום» (institution › faculty › year › course › lecturer › lesson, with counts and topics, plus free
// text and filters) and «העלה סיכום» (one window: the lesson's details from the profile, then write / paste / file).
// The course page, the reader, the editor, the student sheet, the paywall and the takedown flow come from the campus.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CampusPlace, DirectoryTree, SearchHit, api } from "../api";
import { Book, Calendar, Cap, Chevron, Search as SearchI, Shield, Star, Upload, UserI, X } from "../icons";
import { me, needAuth, presence, say, sheet } from "../state";
import { Avatar, LiveDot, Toast } from "../ui/Bits";
import { Sheets } from "../ui/Sheets";
import { ShareButton } from "../ui/Share";
import { Course } from "../media/campus/CampusPage";
import { DirectorySheet } from "../media/campus/Directory";
import { DocCard } from "../media/campus/Docs";
import { PaywallSheet, StudentSheet } from "../media/campus/Onboard";
import { Reader } from "../media/campus/Reader";
import { TakedownDialog } from "../media/campus/Takedown";
import { YEAR_HE, dirNode, dirOpen, editor, follows, goHome, instName, loadStudent, loadTree, openDoc, openPlace, paywall, place, reader, showPaywall, slug, student, takedownOpen, tree, unslug } from "../media/state";
import { AccountSheet, PasswordSheet, StudentSignIn, resetTokenFromHash } from "./Account";
import { UploadWindow } from "./Editor";

/** the site's own routes (besides the campus's /student/campus/… course pages): home, an institution, a faculty's finder, my pages */
type View = { v: "home" } | { v: "inst"; inst: string } | { v: "find"; inst: string; faculty: string } | { v: "mine" };
const parseView = (): View => {
  const p = location.pathname.replace(/\/+$/, "");
  const m = p.match(/^\/student\/inst\/([^/]+)(?:\/([^/]+))?$/);
  if (m) return m[2] ? { v: "find", inst: decodeURIComponent(m[1]), faculty: decodeURIComponent(m[2]) } : { v: "inst", inst: decodeURIComponent(m[1]) };
  if (p === "/student/mine") return { v: "mine" };
  return { v: "home" };
};
const viewPath = (v: View) => (v.v === "home" ? "/student/" : v.v === "mine" ? "/student/mine" : v.v === "inst" ? `/student/inst/${v.inst}` : `/student/inst/${v.inst}/${v.faculty}`);

/** institutions by region (client-side; the tree has no regions) */
export const REGION: Record<string, string> = { reichman: "השרון", openu: "השרון", tau: "מרכז", colman: "מרכז", ono: "מרכז", biu: "מרכז", technion: "צפון", haifa: "צפון", huji: "ירושלים", bgu: "דרום" };
export const REGIONS = ["מרכז", "השרון", "צפון", "ירושלים", "דרום"];

export function StudentApp() {
  const [view, setView] = useState<View>(parseView);
  const [upload, setUpload] = useState(false);
  /** an emailed `/#reset=<token>` link opens the new-password screen */
  const [resetToken] = useState(resetTokenFromHash);
  const pl = place.value;
  const u = me.value;
  const sh = sheet.value;
  useEffect(() => {
    if (resetToken) sheet.value = { type: "signin" };
  }, []);
  // the editor needs the student profile (the place of the summary comes from it)
  useEffect(() => {
    if (!editor.value || student.value) return;
    const ed = editor.value;
    loadStudent().then((st) => {
      if (st || editor.value !== ed) return;
      editor.value = null;
      sheet.value = { type: "student", then: () => (editor.value = ed) };
    });
  }, [editor.value, student.value]);
  const go = (v: View, replace = false) => {
    if (place.value) goHome();
    setView(v);
    const path = viewPath(v);
    if (location.pathname !== path) history[replace ? "replaceState" : "pushState"](null, "", path);
  };
  useEffect(() => {
    const h = () => setView(parseView());
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, []);
  const openUpload = () =>
    needAuth(async () => {
      if (!(await loadStudent())) return void (sheet.value = { type: "student", then: () => setUpload(true) });
      setUpload(true);
    });
  return (
    <div class="app layout-web mc st mode-campus">
      <header class="st-top">
        <a class="st-brand" href="/student/" onClick={(e) => (e.preventDefault(), go({ v: "home" }))}>
          <span class="st-logo">AddStudent</span>
          <span class="st-tag">הסיכומים של השנה שלך</span>
        </a>
        <nav class="st-nav">
          <button class={`st-navbtn ${!pl && view.v !== "mine" ? "on" : ""}`} onClick={() => go({ v: "home" })}>
            <SearchI size={16} /> מצא סיכום
          </button>
          <button class="st-navbtn primary" onClick={openUpload}>
            <Upload size={16} /> העלה סיכום
          </button>
          <button class={`st-navbtn ${!pl && view.v === "mine" ? "on" : ""}`} onClick={() => needAuth(() => go({ v: "mine" }))}>
            <Star size={16} /> הדפים שלי
          </button>
        </nav>
        <ShareButton title="AddStudent — הסיכומים של השנה שלך" url={location.pathname + location.search} text="סיכומים לפי שיעור, מרצה ותאריך — כאן הסטודנטים מעלים ומוצאים" />
        <button class={`me-btn ${u ? "" : "out"}`} onClick={() => (sheet.value = u ? { type: "account" } : { type: "signin" })}>
          {u && <Avatar id={u.id} name={u.name} size={24} />}
          {u ? u.name : "כניסה"}
        </button>
      </header>
      <main class="st-main">
        {pl ? (
          <Course radar={<Presence />} />
        ) : view.v === "mine" ? (
          <Mine onFind={() => go({ v: "home" })} />
        ) : view.v === "inst" ? (
          <InstPage inst={view.inst} onFaculty={(f) => go({ v: "find", inst: view.inst, faculty: f })} onHome={() => go({ v: "home" })} />
        ) : view.v === "find" ? (
          <Find inst={view.inst} faculty={view.faculty} onUpload={openUpload} onInst={() => go({ v: "inst", inst: view.inst })} />
        ) : (
          <HomePage onInst={(id) => go({ v: "inst", inst: id })} onUpload={openUpload} />
        )}
      </main>
      <footer class="st-foot">
        <div class="cp-trust">
          <Shield size={18} />
          <span>
            <b>הסרה לפי דרישה:</b> בעלי זכויות, מרצים ומוסדות — כל פריט מוסר תוך 24–48 שעות מהפנייה.
          </span>
          <button class="btn btn-secondary btn-sm" onClick={() => (takedownOpen.value = {})}>
            בקשת הסרה
          </button>
        </div>
        <div class="st-foot-row">
          <span>
            AddStudent · <span class="st-foot-by">מבית AddMedia</span>
          </span>
          <a href="/terms/" target="_blank" rel="noopener">
            תנאי שימוש
          </a>
          <a href="/privacy/" target="_blank" rel="noopener">
            פרטיות
          </a>
        </div>
      </footer>
      <nav class="st-bar" aria-label="ניווט">
        <button class={`st-bar-btn ${!pl && view.v !== "mine" ? "on" : ""}`} onClick={() => go({ v: "home" })}>
          <SearchI size={20} />
          <span>מצא</span>
        </button>
        <button class="st-bar-btn" onClick={openUpload}>
          <Upload size={20} />
          <span>העלה</span>
        </button>
        <button class={`st-bar-btn ${!pl && view.v === "mine" ? "on" : ""}`} onClick={() => needAuth(() => go({ v: "mine" }))}>
          <Star size={20} />
          <span>הדפים שלי</span>
        </button>
        <button class="st-bar-btn" onClick={() => (sheet.value = u ? { type: "account" } : { type: "signin" })}>
          {u ? <Avatar id={u.id} name={u.name} size={22} /> : <UserI size={20} />}
          <span>{u ? "פרופיל" : "כניסה"}</span>
        </button>
      </nav>
      {upload && <UploadWindow onClose={() => setUpload(false)} />}
      {reader.value && <Reader />}
      {/* the campus's own openings of the editor (a course page's buttons, the owner's «עריכה» in the reader or on a card) land in the same window */}
      {editor.value && student.value && <UploadWindow existing={editor.value.doc} onClose={() => (editor.value = null)} />}
      {dirOpen.value && pl && <DirectorySheet />}
      {takedownOpen.value && <TakedownDialog onClose={() => (takedownOpen.value = false)} />}
      {sh?.type === "student" && <StudentSheet then={sh.then} />}
      {paywall.value && <PaywallSheet />}
      {/* the students' own sheets: password sign-in, the account, the set-a-password prompt; the rest from AddMedia */}
      {sh?.type === "signin" ? <StudentSignIn then={sh.then} resetToken={resetToken} /> : sh?.type === "account" ? <AccountSheet section={sh.section} /> : sh?.type === "password" ? <PasswordSheet then={sh.then} reason={sh.reason} /> : <Sheets />}
      <Toast />
    </div>
  );
}

/** who is in the course now — the small tile the course page shows on the side */
function Presence() {
  const n = presence.value;
  return (
    <div class="st-presence">
      <div class="pane-head">
        <LiveDot pulse={n > 0} />
        <span class="pane-title">לומדים עכשיו</span>
      </div>
      <div class="radar-total num">{n}</div>
      <div class="pane-empty">{n > 1 ? "יש כאן עוד אנשים — השיחה החיה פתוחה." : "שקט כרגע. הראשונים שיכתבו בשיחה יראו מי מצטרף."}</div>
    </div>
  );
}

// ---------- home: a headline, one search field, the institutions by region ----------
function HomePage({ onInst, onUpload }: { onInst: (id: string) => void; onUpload: () => void }) {
  const t = tree.value;
  const [q, setQ] = useState("");
  useEffect(() => void loadTree(), []);
  const all = t?.institutions || [];
  const list = q.trim() ? all.filter((i) => i.name.includes(q.trim())) : all;
  const byRegion = REGIONS.map((r) => [r, list.filter((i) => (REGION[i.id] || "מרכז") === r)] as const).filter(([, l]) => l.length);
  return (
    <div class="st-home">
      <section class="st-home-hero">
        <h1 class="st-home-h1">הסיכומים של השנה שלך</h1>
        <p class="st-home-diff">כאן הסטודנטים מעלים את הסיכומים — ומוצאים אותם לפי שיעור, מרצה ותאריך.</p>
        <div class="st-home-search">
          <SearchI size={20} class="st-home-search-ic" />
          <input class="st-home-in" dir="auto" value={q} placeholder="הזינו מוסד לימוד" onInput={(e) => setQ(e.currentTarget.value)} aria-label="מוסד לימוד" onKeyDown={(e) => e.key === "Enter" && list.length === 1 && onInst(list[0].id)} />
          {q && (
            <button class="icon-btn" onClick={() => setQ("")} aria-label="ניקוי">
              <X size={16} />
            </button>
          )}
        </div>
        <button class="link st-home-up" onClick={onUpload}>
          <Upload size={14} /> יש לכם סיכום? העלו אותו — דקה אחת
        </button>
      </section>
      <section class="st-home-dir">
        {!t && <div class="pane-empty">טוען את המוסדות…</div>}
        {t && !list.length && <div class="pane-empty">לא נמצא מוסד בשם «{q.trim()}». אפשר לבחור מהרשימה.</div>}
        <div class="st-regions">
          {byRegion.map(([r, l]) => (
            <div key={r} class="st-region">
              <h2 class="st-region-h">{r}</h2>
              <ul class="st-region-list">
                {l.map((i) => (
                  <li key={i.id}>
                    <button class="st-inst-link" onClick={() => onInst(i.id)} dir="auto">
                      <span>{i.name}</span>
                      <Chevron size={14} class="rot" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {q.trim() && list.length > 0 && (
          <button class="link" onClick={() => setQ("")}>
            הצג הכל
          </button>
        )}
      </section>
    </div>
  );
}

// ---------- an institution: counters, the popular faculties, all the faculties ----------
function InstPage({ inst, onFaculty, onHome }: { inst: string; onFaculty: (f: string) => void; onHome: () => void }) {
  const t = tree.value;
  const [stats, setStats] = useState<Map<string, { docs: number; courses: number }> | null>(null);
  const [students, setStudents] = useState<number | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => void loadTree(), []);
  const i = t?.institutions.find((x) => x.id === inst);
  useEffect(() => {
    if (!i) return;
    let alive = true;
    (async () => {
      const m = new Map<string, { docs: number; courses: number }>();
      await Promise.all(
        i.faculties.map(async (f) => {
          try {
            const r: any = await api.facultyTree(inst, f);
            const cs = (r.courses || []).filter((c: any) => !!c.course);
            m.set(f, { docs: cs.reduce((a: number, c: any) => a + (c.n ?? c.lecturers.reduce((x: number, l: any) => x + l.n, 0)), 0), courses: cs.length });
            if (typeof r.students === "number") setStudents((s) => (s || 0) + r.students);
          } catch {
            m.set(f, { docs: 0, courses: 0 });
          }
        }),
      );
      if (alive) setStats(m);
    })();
    return () => void (alive = false);
  }, [i?.id]);
  if (!t) return <div class="pane-empty">טוען…</div>;
  if (!i)
    return (
      <div class="cp-state">
        <div class="cp-state-title">המוסד לא נמצא</div>
        <button class="btn btn-primary" onClick={onHome}>
          לרשימת המוסדות
        </button>
      </div>
    );
  const docsN = stats ? [...stats.values()].reduce((a, v) => a + v.docs, 0) : null;
  const coursesN = stats ? [...stats.values()].reduce((a, v) => a + v.courses, 0) : null;
  const popular = stats ? [...stats.entries()].sort((a, b) => b[1].docs - a[1].docs || b[1].courses - a[1].courses).slice(0, 4) : [];
  const facs = i.faculties.filter((f) => !q.trim() || f.includes(q.trim()));
  return (
    <div class="st-inst">
      <button class="link st-back" onClick={onHome}>
        <Chevron size={13} class="rot-back" /> כל המוסדות
      </button>
      <section class="st-inst-head">
        <span class="st-inst-ic" aria-hidden="true">
          {i.name.replace(/^(אוניברסיטת|האוניברסיטה|המכללה|הקריה)\s+/, "").slice(0, 1)}
        </span>
        <h1 class="st-home-h1" dir="auto">
          {i.name}
        </h1>
        <span class="st-inst-region">{REGION[i.id] || "מרכז"}</span>
      </section>
      <section class="st-stats">
        {students !== null && (
          <div class="st-stat">
            <b class="num">{students.toLocaleString("he-IL")}</b>
            <span>סטודנטים רשומים</span>
          </div>
        )}
        <div class="st-stat">
          <b class="num">{docsN === null ? "…" : docsN.toLocaleString("he-IL")}</b>
          <span>סיכומים</span>
        </div>
        <div class="st-stat">
          <b class="num">{coursesN === null ? "…" : coursesN.toLocaleString("he-IL")}</b>
          <span>קורסים</span>
        </div>
      </section>
      <section class="st-sec">
        <h2 class="st-h2">החוגים הכי פופולריים</h2>
        <div class="st-pop">
          {(popular.length ? popular : i.faculties.slice(0, 4).map((f) => [f, { docs: 0, courses: 0 }] as const)).map(([f, v]) => (
            <button key={f} class="st-pop-card" onClick={() => onFaculty(f)}>
              <span class="st-pop-ic">
                <Book size={18} />
              </span>
              <b dir="auto">{f}</b>
              <small>
                {stats ? (
                  <>
                    <span class="num">{v.docs}</span> סיכומים · <span class="num">{v.courses}</span> קורסים
                  </>
                ) : (
                  "…"
                )}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section class="st-sec">
        <div class="st-sec-head">
          <h2 class="st-h2">
            חוגי לימוד (<span class="num">{i.faculties.length}</span>)
          </h2>
          <div class="cp-search-row st-fac-search">
            <SearchI size={15} class="cp-search-ic" />
            <input class="cp-search-in" dir="auto" value={q} placeholder="חיפוש לפי חוג" onInput={(e) => setQ(e.currentTarget.value)} aria-label="חיפוש לפי חוג" />
          </div>
        </div>
        <ul class="st-region-list st-facs">
          {facs.map((f) => (
            <li key={f}>
              <button class="st-inst-link" onClick={() => onFaculty(f)} dir="auto">
                <span>{f}</span>
                {stats?.get(f) && <span class="st-count num">{stats.get(f)!.docs}</span>}
                <Chevron size={14} class="rot" />
              </button>
            </li>
          ))}
          {!facs.length && <li class="pane-empty">אין חוג בשם הזה. אפשר לכתוב אותו בעצמכם בחלון ההעלאה.</li>}
        </ul>
      </section>
    </div>
  );
}

// ---------- «מצא סיכום» inside a faculty: the drill-down and the search ----------
function Find({ inst, faculty, onUpload, onInst }: { inst: string; faculty: string; onUpload: () => void; onInst: () => void }) {
  const t = tree.value;
  const s = student.value;
  const [year, setYear] = useState<number | 0>(s && s.inst === inst && slug(s.faculty) === slug(faculty) ? s.year : 0);
  const [dir, setDir] = useState<DirectoryTree | null>(null);
  const [dirErr, setDirErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fCourse, setFCourse] = useState("");
  const [fLect, setFLect] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [total, setTotal] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const seq = useRef(0);
  useEffect(() => void loadTree(), []);
  useEffect(() => {
    if (!inst || !faculty) return setDir(null);
    setDir(null);
    setDirErr(null);
    api
      .facultyTree(inst, faculty, year || undefined)
      .then((r) => setDir({ courses: (r.courses || []).filter((c) => !!c.course) }))
      .catch((e) => {
        if (e?.status === 402) showPaywall(e);
        setDirErr(e?.message || "המדריך לא נטען.");
        setDir({ courses: [] });
      });
  }, [inst, faculty, year]);
  // search: free text and/or filters
  const active = q.trim().length >= 2 || fCourse || fLect || from || to;
  useEffect(() => {
    if (!inst || !faculty || !active) return void setHits(null);
    const n = ++seq.current;
    setBusy(true);
    const h = setTimeout(async () => {
      try {
        const r = await api.searchDocs(inst, faculty, { q: q.trim() || undefined, year: year || undefined, course: fCourse ? slug(fCourse) : undefined, lecturer: fLect ? slug(fLect) : undefined, from: from || undefined, to: to || undefined });
        if (seq.current !== n) return;
        setHits(r.hits.slice().sort((a, b) => (b.doc.published || "").localeCompare(a.doc.published || "") || b.doc.ts - a.doc.ts));
        setTotal(r.total);
      } catch (e: any) {
        if (seq.current !== n) return;
        if (e?.status === 402) showPaywall(e);
        say(e?.message || "החיפוש נכשל.", "err");
        setHits([]);
      } finally {
        if (seq.current === n) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(h);
  }, [inst, faculty, year, q, fCourse, fLect, from, to]);
  const i = t?.institutions.find((x) => x.id === inst);
  const courses = dir?.courses || [];
  const lecturers = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of courses) for (const l of c.lecturers) if (l.lecturer) m.set(l.lecturer, l.name || unslug(l.lecturer));
    return [...m.entries()];
  }, [courses]);
  const total_docs = courses.reduce((a, c) => a + (c.n ?? c.lecturers.reduce((x, l) => x + l.n, 0)), 0);
  const plOf = (course?: string): CampusPlace => ({ inst, faculty: slug(faculty), year: year || s?.year || 1, course });
  return (
    <div class="st-find">
      <section class="st-hero">
        <button class="link st-back" onClick={onInst}>
          <Chevron size={13} class="rot-back" /> {instName(inst)}
        </button>
        <h1 class="st-h1" dir="auto">
          {faculty}
        </h1>
        <p class="st-lead">סיכומים לפי שנה, קורס, מרצה ושיעור. חיפוש חופשי — או לפי שם השיעור, המרצה ותאריך.</p>
        <div class="chips st-years">
          <button class={`chip ${!year ? "on" : ""}`} onClick={() => setYear(0)}>
            כל השנים
          </button>
          {(t?.years || [1, 2, 3, 4, 5, 6]).map((y) => (
            <button key={y} class={`chip ${year === y ? "on" : ""}`} onClick={() => setYear(y)}>
              שנה {YEAR_HE[y]}
            </button>
          ))}
        </div>
      </section>

      {inst && faculty && (
        <section class="st-card st-search">
          <div class="cp-search-row">
            <SearchI size={16} class="cp-search-ic" />
            <input class="cp-search-in" dir="auto" value={q} placeholder="חיפוש חופשי: מושג, נושא, מילים מהסיכום…" onInput={(e) => setQ(e.currentTarget.value)} aria-label="חיפוש" />
            {q && (
              <button class="icon-btn sm" onClick={() => setQ("")} aria-label="ניקוי">
                <X size={14} />
              </button>
            )}
            <button class={`link ${more || fCourse || fLect || from || to ? "on" : ""}`} onClick={() => setMore(!more)}>
              סינון <Chevron size={13} class={more ? "up" : ""} />
            </button>
          </div>
          {(more || fCourse || fLect || from || to) && (
            <div class="st-filters">
              <label class="field">
                <span>שם השיעור</span>
                <input class="input" dir="auto" list="st-f-course" value={fCourse} onInput={(e) => setFCourse(e.currentTarget.value)} placeholder="דיני חוזים" />
                <datalist id="st-f-course">{courses.map((c) => <option key={c.course!} value={unslug(c.course!)} />)}</datalist>
              </label>
              <label class="field">
                <span>מרצה</span>
                <input class="input" dir="auto" list="st-f-lect" value={fLect} onInput={(e) => setFLect(e.currentTarget.value)} placeholder="פרופ׳ כהן" />
                <datalist id="st-f-lect">{lecturers.map(([k, n]) => <option key={k} value={n} />)}</datalist>
              </label>
              <label class="field">
                <span>מתאריך</span>
                <input class="input ltr" type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
              </label>
              <label class="field">
                <span>עד תאריך</span>
                <input class="input ltr" type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
              </label>
              {(fCourse || fLect || from || to) && (
                <button class="link" onClick={() => (setFCourse(""), setFLect(""), setFrom(""), setTo(""))}>
                  <X size={12} /> ניקוי הסינון
                </button>
              )}
            </div>
          )}
          {active && (
            <div class="st-results">
              <div class="st-results-head">
                {busy && !hits ? "מחפש…" : hits ? `${total ?? hits.length} תוצאות · החדש קודם` : ""}
              </div>
              {hits && !hits.length && !busy && <div class="cp-sr-empty">לא נמצא. נסו מילה אחרת, או הרחיבו לכל השנים.</div>}
              {hits && hits.length > 0 && (
                <div class="cp-cards st-hits">
                  {hits.map((h, k) => (
                    <div key={h.doc.id + ":" + (h.section || 0)} class="st-hit">
                      <DocCard d={h.doc} i={k} compact />
                      {h.section && (
                        <button class="st-hit-snip" onClick={() => openDoc(h.doc, h.section || 1)} dir="auto">
                          <span class="cp-sr-sec num">§{h.section}</span> {h.snippet}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {inst && faculty && !active && (
        <section class="st-card st-dir">
          <div class="st-dir-head">
            <Cap size={16} />
            <span class="st-dir-title" dir="auto">
              {instName(inst)} · {faculty}
              {year ? ` · שנה ${YEAR_HE[year]}` : " · כל השנים"}
            </span>
            <span class="st-dir-n num">{total_docs} סיכומים</span>
            <span class="pane-sp" />
            <button class="btn btn-secondary btn-sm" onClick={() => openPlace(plOf())}>
              לדף השנה <Chevron size={13} class="rot" />
            </button>
          </div>
          {!dir && !dirErr && <div class="pane-empty">טוען את המדריך…</div>}
          {dirErr && <div class="cp-state err">{dirErr}</div>}
          {dir && !courses.length && !dirErr && (
            <div class="cp-state">
              <div class="cp-state-art">
                <Book size={26} />
              </div>
              <div class="cp-state-title">עוד אין סיכומים כאן</div>
              <div class="cp-state-sub">הסיכום הראשון פותח את המדריך: קורס › מרצה › שיעור. כמה דקות — וכל השנה נהנית.</div>
              <button class="btn btn-primary" onClick={onUpload}>
                <Upload size={15} /> העלה סיכום
              </button>
            </div>
          )}
          <ul class="st-courses">
            {courses.map((c) => {
              const n = c.n ?? c.lecturers.reduce((a, l) => a + l.n, 0);
              const isOpen = open === c.course;
              return (
                <li key={c.course!} class={`st-course ${isOpen ? "open" : ""}`}>
                  <div class="st-course-row">
                    <button class="st-course-name" dir="auto" onClick={() => setOpen(isOpen ? null : c.course)}>
                      <Book size={16} /> {unslug(c.course!)}
                      <span class="st-count num">{n}</span>
                      <Chevron size={14} class={`st-chev ${isOpen ? "up" : ""}`} />
                    </button>
                    <button class="btn btn-secondary btn-sm" onClick={() => openPlace(plOf(c.course!))}>
                      לקורס
                    </button>
                  </div>
                  {isOpen && (
                    <ul class="st-lects">
                      {c.lecturers.map((l) => (
                        <li key={l.lecturer || "-"} class="st-lect">
                          <button class="st-lect-name" dir="auto" onClick={() => (openPlace(plOf(c.course!)), (dirNode.value = { lecturer: l.lecturer || "" }))}>
                            <UserI size={14} /> {l.lecturer ? l.name || unslug(l.lecturer) : "בלי שם מרצה"} <span class="st-count num">{l.n}</span>
                          </button>
                          <ul class="st-lessons">
                            {l.lessons
                              .filter((ls) => !!ls.date)
                              .map((ls) => (
                                <li key={ls.date!}>
                                  <button class="st-lesson" onClick={() => (openPlace(plOf(c.course!)), (dirNode.value = { lecturer: l.lecturer || "", date: ls.date! }))}>
                                    <Calendar size={13} />
                                    <span class="num">{ls.date!.split("-").reverse().join(".")}</span>
                                    <span class="st-topics" dir="auto">
                                      {(ls.topics || []).join(" · ") || "שיעור"}
                                    </span>
                                    <span class="st-count num">{ls.n}</span>
                                  </button>
                                </li>
                              ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------- «הדפים שלי» ----------
function Mine({ onFind }: { onFind: () => void }) {
  const list = follows.value.filter((f) => f.path.startsWith("/media/campus/"));
  const u = me.value!;
  return (
    <div class="st-mine">
      <h1 class="st-h1">הדפים שלי</h1>
      <p class="st-lead">הקורסים והשנים שסימנת בכוכב, {u.name}.</p>
      {!list.length && (
        <div class="cp-state">
          <div class="cp-state-art">
            <Star size={26} />
          </div>
          <div class="cp-state-title">עוד אין דפים במעקב</div>
          <div class="cp-state-sub">הכוכב בראש כל קורס או שנה שומר אותם כאן.</div>
          <button class="btn btn-primary" onClick={onFind}>
            <SearchI size={15} /> מצא סיכום
          </button>
        </div>
      )}
      <ul class="st-follows">
        {list.map((f) => {
          const m = f.path.match(/^\/media\/campus\/([^/]+)\/([^/]+)\/([1-6])(?:\/([^/]+))?$/);
          if (!m) return null;
          const pl: CampusPlace = { inst: decodeURIComponent(m[1]), faculty: decodeURIComponent(m[2]), year: Number(m[3]), course: m[4] ? decodeURIComponent(m[4]) : undefined };
          return (
            <li key={f.path}>
              <button class="st-follow" onClick={() => openPlace(pl)}>
                <span class="st-follow-ic">{pl.course ? <Book size={18} /> : <Cap size={18} />}</span>
                <span class="st-follow-main">
                  <span class="st-follow-name" dir="auto">
                    {pl.course ? unslug(pl.course) : `שנה ${YEAR_HE[pl.year]} · ${unslug(pl.faculty)}`}
                  </span>
                  <span class="st-follow-sub" dir="auto">
                    {f.title}
                  </span>
                </span>
                <Chevron size={16} class="rot" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
