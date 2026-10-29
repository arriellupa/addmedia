// The student directory (the start pane): the institution's name as text — never a logo — the student's faculty
// (and a second one when dual-major), the tree course › lecturer › lesson (date) counted from the documents,
// and «ארכיון לפי מרצה». Choosing a node filters the main pane. On the phone it is the «ניווט» sheet.
import { useState } from "preact/hooks";
import { Book, Cap, Chevron, UserI, Users } from "../../icons";
import { me } from "../../state";
import { Dialog } from "../Dialog";
import { YEAR_HE, archive, dirNode, dirOpen, dirTree, instName, openArchive, openPlace, picker, place, student, unslug } from "../state";

export function DirectoryPane() {
  const pl = place.value!;
  const t = dirTree.value;
  const s = student.value;
  const [openCourse, setOpenCourse] = useState<string | null>(pl.course || null);
  const [openLect, setOpenLect] = useState<string | null>(null);
  const courses = t?.courses || [];
  const cur = openCourse ?? pl.course ?? null;
  const node = dirNode.value;
  const lecturers = new Map<string, { n: number; name: string }>();
  for (const c of courses) for (const l of c.lecturers) if (l.lecturer) lecturers.set(l.lecturer, { n: (lecturers.get(l.lecturer)?.n || 0) + l.n, name: l.name || unslug(l.lecturer) });
  const facs = [pl.faculty, ...(s && s.inst === pl.inst && s.faculty2 && s.faculty2 !== pl.faculty ? [s.faculty2] : [])];
  return (
    <div class="cp-dir">
      <div class="cp-dir-inst">
        <Cap size={16} />
        <span class="cp-dir-instname" dir="auto">
          {instName(pl.inst)}
        </span>
      </div>
      <div class="cp-dir-facs">
        {facs.map((f) => (
          <button key={f} class={`cp-dir-fac ${f === pl.faculty ? "on" : ""}`} onClick={() => f !== pl.faculty && openPlace({ inst: pl.inst, faculty: f, year: pl.year })}>
            <span dir="auto">{unslug(f)}</span>
            <span class="cp-dir-year">שנה {YEAR_HE[pl.year]}</span>
          </button>
        ))}
        <button class="link cp-dir-change" onClick={() => (picker.value = true)}>
          שינוי
        </button>
      </div>
      <div class="cp-dir-title">
        <Book size={13} /> קורסים
      </div>
      {!t && <div class="cp-dir-empty">טוען…</div>}
      {t && !courses.length && <div class="cp-dir-empty">עוד אין סיכומים בשנה הזאת. הראשון שלכם פותח את העץ: קורס › מרצה › שיעור.</div>}
      <ul class="cp-tree">
        {courses.map((c) => {
          const open = cur === c.course;
          const n = c.lecturers.reduce((a, l) => a + l.n, 0);
          return (
            <li key={c.course} class={`cp-tree-course ${open ? "open" : ""} ${pl.course === c.course ? "cur" : ""}`}>
              <div class="cp-tree-row">
                <button class="cp-tree-toggle" aria-expanded={open} onClick={() => setOpenCourse(open ? "" : c.course)} aria-label={open ? "סגירה" : "פתיחה"}>
                  <Chevron size={13} class={open ? "up" : ""} />
                </button>
                <button class="cp-tree-name" dir="auto" onClick={() => (pl.course === c.course ? (dirNode.value = null) : openPlace({ ...pl, course: c.course! }), setOpenCourse(c.course), (dirOpen.value = false))}>
                  {unslug(c.course)}
                </button>
                <span class="cp-tree-n num">{n}</span>
              </div>
              {open && (
                <ul class="cp-tree-lects">
                  {c.lecturers.map((l) => {
                    const lo = openLect === c.course + "/" + l.lecturer;
                    const on = pl.course === c.course && node?.lecturer === (l.lecturer || "") && !node.date;
                    return (
                      <li key={l.lecturer || "-"}>
                        <div class="cp-tree-row">
                          <button class="cp-tree-toggle" aria-expanded={lo} onClick={() => setOpenLect(lo ? null : c.course + "/" + l.lecturer)} aria-label="שיעורים">
                            <Chevron size={12} class={lo ? "up" : ""} />
                          </button>
                          <button class={`cp-tree-name lect ${on ? "on" : ""}`} dir="auto" onClick={() => pick(pl, c.course!, { lecturer: l.lecturer || "" })}>
                            <UserI size={12} /> {l.lecturer ? l.name || unslug(l.lecturer) : "בלי מרצה"}
                          </button>
                          <span class="cp-tree-n num">{l.n}</span>
                        </div>
                        {lo && (
                          <ul class="cp-tree-lessons">
                            {l.lessons.filter((ls) => !!ls.date).map((ls) => {
                              const lon = pl.course === c.course && node?.lecturer === (l.lecturer || "") && node?.date === ls.date;
                              return (
                                <li key={ls.date}>
                                  <button class={`cp-tree-name lesson ${lon ? "on" : ""}`} onClick={() => pick(pl, c.course!, { lecturer: l.lecturer || "", date: ls.date! })}>
                                    <span class="num">{ls.date!.split("-").reverse().slice(0, 2).join(".")}</span> שיעור
                                    <span class="cp-tree-n num">{ls.n}</span>
                                  </button>
                                </li>
                              );
                            })}
                            {!l.lessons.length && <li class="cp-dir-empty">בלי תאריכי שיעור</li>}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {lecturers.size > 0 && (
        <>
          <div class="cp-dir-title">
            <Users size={13} /> ארכיון לפי מרצה
          </div>
          <ul class="cp-tree cp-arch">
            {[...lecturers.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .map(([l, v]) => (
                <li key={l}>
                  <button class={`cp-tree-name lect ${archive.value?.lecturer === l ? "on" : ""}`} dir="auto" onClick={() => openArchive(l)}>
                    <UserI size={12} /> {v.name} <span class="cp-tree-n num">{v.n}</span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
      {me.value && !s && <div class="cp-dir-empty">הפקולטה השנייה מופיעה כאן אחרי ההזדהות כסטודנט/ית.</div>}
    </div>
  );
}

function pick(pl: { inst: string; faculty: string; year: number; course?: string }, course: string, node: { lecturer: string; date?: string }) {
  archive.value = null;
  if (pl.course !== course) openPlace({ ...pl, course });
  dirNode.value = node;
  dirOpen.value = false;
}

export function DirectorySheet() {
  return (
    <Dialog title="ניווט" onClose={() => (dirOpen.value = false)} cls="cp-dir-sheet">
      <DirectoryPane />
    </Dialog>
  );
}
