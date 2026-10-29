// The campus (students' mode of the media page): a course page with a hero, a live status strip, the semester
// calendar, tabs (documents / live chat / talkbacks / media / people), the in-page PDF viewer and, on a phone,
// a bottom tab bar. Rooms, chat and talkbacks come from the shared panel state.
import { useMemo, useState } from "preact/hooks";
import type { CampusEvent, EventKind } from "../../api";
import { date as fmtDate } from "../../fmt";
import { Alert, Book, Calendar, Cap, Chevron, Compass, Edit, Home, LinkI, MessageI, Plus, Search, Shield, Star, Trash, UserI, Users, X } from "../../icons";
import { bundle, loadError, me, needAuth, presence, scope, setScope, sheet, visiblePosts } from "../../state";
import { Avatar, LiveDot } from "../../ui/Bits";
import { ChatView } from "../../ui/Chat";
import { CommentsView } from "../../ui/Comments";
import {
  EVENT_HE, YEAR_HE, addEvent, archive, chatActive, courseMeta, ctab, daysUntil, dirOpen, docs, editor, events, eventsError, examMode, followPrompt, followed, goHome, instName, lecturerName, nextEvent, nextExam, openDoc, openPlace, paywall, picker, place, reader, removeEvent, saveCourse, searchOpen, slug, takedownOpen, toggleFollow, unslug,
} from "../state";
import { Dialog } from "../Dialog";
import { DirectoryPane, DirectorySheet } from "./Directory";
import { DocCard, DocsTab, Editor } from "./Docs";
import { Onboarding, PaywallSheet, PickerDialog, StudentSheet } from "./Onboard";
import { Reader } from "./Reader";
import { SearchBox, SearchSheet } from "./Search";
import { TakedownDialog } from "./Takedown";

export function CampusPage({ radar, media }: { radar: any; media: any }) {
  const pl = place.value;
  return (
    <div class={`cp ${examMode.value ? "cp-exam" : ""}`}>
      {!pl ? <Onboarding /> : <Course radar={radar} media={media} />}
      <PhoneBar />
      {reader.value && <Reader />}
      {editor.value && <Editor />}
      {picker.value && <PickerDialog />}
      {dirOpen.value && pl && <DirectorySheet />}
      {takedownOpen.value && <TakedownDialog onClose={() => (takedownOpen.value = false)} />}
      {searchOpen.value && pl && <SearchSheet onClose={() => (searchOpen.value = false)} />}
      {sheet.value?.type === "student" && <StudentSheet then={sheet.value.then} />}
      {paywall.value && <PaywallSheet />}
    </div>
  );
}

export function Course({ radar, media }: { radar: any; media?: any }) {
  const pl = place.value!;
  const b = bundle.value;
  const tab = ctab.value;
  const name = pl.course ? unslug(pl.course) : `שנה ${YEAR_HE[pl.year]} · ${unslug(pl.faculty)}`;
  return (
    <>
      <section class="cp-hero">
        <div class="cp-hero-in">
          <nav class="cp-crumbs" aria-label="מיקום">
            <button class="cp-crumb" onClick={() => (picker.value = true)}>
              <Cap size={13} /> {instName(pl.inst)}
            </button>
            <Chevron size={12} class="crumb-sep" />
            <button class="cp-crumb" onClick={() => (picker.value = true)}>{unslug(pl.faculty)}</button>
            <Chevron size={12} class="crumb-sep" />
            <button class={`cp-crumb ${pl.course ? "" : "cur"}`} onClick={() => pl.course && openPlace({ inst: pl.inst, faculty: pl.faculty, year: pl.year })}>
              שנה {YEAR_HE[pl.year]}
            </button>
          </nav>
          <div class="cp-title-row">
            <h1 class="cp-title" dir="auto">
              {name}
            </h1>
            <UploadCta />
            <button class={`cp-follow ${followed.value ? "on" : ""}`} aria-pressed={followed.value} onClick={() => needAuth(toggleFollow)} title={followed.value ? "במעקב · לחיצה מסירה" : "הדף הזה תמיד יחכה לך למעלה"}>
              <Star size={18} fill={followed.value} />
              <span>{followed.value ? "עוקב" : "עקוב"}</span>
            </button>
          </div>
          <div class="cp-presence">
            <span class="cp-pres-item">
              <LiveDot pulse={presence.value > 0} /> <b class="num">{presence.value}</b> {pl.course ? "בקורס עכשיו" : "בשנה עכשיו"}
            </span>
            {pl.course && b && b.other.presence > 0 && (
              <span class="cp-pres-item muted2">
                <Users size={13} /> <b class="num">{b.other.presence}</b> בשנה {YEAR_HE[pl.year]}
              </span>
            )}
            {!pl.course && <CohortLine />}
          </div>
          {followPrompt.value && !followed.value && (
            <div class="cp-prompt">
              <Star size={16} />
              <span>
                לעקוב אחרי <b>שנה {YEAR_HE[pl.year]} · {unslug(pl.faculty)}</b>? הדף יחכה לכם ב«הדפים שלי» ובכוכב למעלה.
              </span>
              <button class="btn btn-primary btn-sm" onClick={() => needAuth(async () => (await toggleFollow(), (followPrompt.value = false)))}>
                עקוב
              </button>
              <button class="icon-btn sm" aria-label="לא עכשיו" onClick={() => (followPrompt.value = false)}>
                <X size={14} />
              </button>
            </div>
          )}
          {!pl.course && <CourseEntry />}
        </div>
      </section>

      <StatusStrip />

      <div class="cp-body">
        <aside class="cp-dirpane">
          <DirectoryPane />
        </aside>
        <main class="cp-main">
          <div class="cp-trust cp-trust-bar">
            <Shield size={18} />
            <span>
              <b>הסרה לפי דרישה:</b> בעלי זכויות, מרצים ומוסדות — כל פריט מוסר תוך 24–48 שעות מהפנייה.
            </span>
            <button class="btn btn-secondary btn-sm" onClick={() => (takedownOpen.value = {})}>
              <Shield size={13} /> בקשת הסרה
            </button>
          </div>
          {archive.value && <ArchiveView />}
          {!archive.value && examMode.value && <ExamBanner />}
          {!archive.value && (
            <>
          <SemesterCalendar />
          <MetaRow />
          <SearchBox />
          <div class="cp-tabs" role="tablist" aria-label="חלקי הקורס">
            {(
              [
                ["docs", "מסמכים", docs.value.length],
                ["chat", "שיחה חיה", presence.value],
                ["talk", "תגובות", b?.room.postCount],
                ["media", "מדיה", b?.room.mediaCount],
                ["people", "אנשים", undefined],
              ] as const
            )
              .filter(([k]) => k !== "media" || !!media)
              .map(([k, label, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} class={`cp-tab ${tab === k ? "on" : ""}`} onClick={() => (ctab.value = k)}>
                {k === "chat" && chatActive.value && <LiveDot pulse />}
                {label}
                {!!n && <span class="cp-tab-n num">{n}</span>}
              </button>
            ))}
          </div>
          <div class="cp-tabpanel" role="tabpanel">
            {tab === "docs" && <DocsTab />}
            {tab === "chat" && (
              <div class="cp-pane cp-chat">
                <ChatAnchor />
                <div class="pane-views">{b && !b.disabled ? <ChatView /> : <RoomEmpty />}</div>
              </div>
            )}
            {tab === "talk" && (
              <div class="cp-pane cp-talk">
                <div class="cp-pane-note">
                  <MessageI size={14} /> התגובות כאן הן על הקורס והחומר — לא על אנשים.
                </div>
                <div class="pane-views">{b && !b.disabled ? <CommentsView /> : <RoomEmpty />}</div>
              </div>
            )}
            {tab === "media" && <div class="cp-pane cp-media">{media}</div>}
            {tab === "people" && <PeopleTab radar={radar} />}
          </div>
            </>
          )}
          <footer class="cp-foot">
            <span>הקמפוס של AddMedia · חומרים שסטודנטים כתבו, ומאמרים בקישור למקור.</span>
            <button class="link" onClick={() => (takedownOpen.value = {})}>
              בקשת הסרה למרצים ומוסדות
            </button>
          </footer>
        </main>
        <aside class="cp-side">
          {examMode.value && <ExamSide />}
          <div class="pane cp-side-pane">{radar}</div>
        </aside>
      </div>
    </>
  );
}

/** the prominent «העלאת סיכום» with the visible quota */
function UploadCta() {
  const u = me.value;
  const s = bundle.value?.settings;
  const perDoc = s?.campusCharsPerDoc ?? 60_000;
  const perMonth = s?.campusDocsPerMonth ?? 20;
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const mine = u ? docs.value.filter((d) => d.uid === u.id && d.ts >= month.getTime()).length : 0;
  return (
    <div class="cp-cta">
      <button class="cp-cta-btn" onClick={() => needAuth(() => (editor.value = { kind: "summary" }))} title="כתיבת סיכום במילים שלכם">
        <span class="cp-cta-ic">
          <Edit size={22} />
        </span>
        <span class="cp-cta-text">
          <b>העלאת סיכום</b>
          <small>טקסט במילים שלכם · גלוי מיד</small>
        </span>
      </button>
      <div class="cp-quota num">
        עד {perDoc.toLocaleString("he-IL")} תווים לסיכום · {u ? `${Math.max(0, perMonth - mine)} מתוך ${perMonth} סיכומים נותרו החודש` : `${perMonth} סיכומים בחודש`}
      </div>
    </div>
  );
}

/** «ארכיון לפי מרצה»: every lesson summary of a lecturer across courses and years */
function ArchiveView() {
  const a = archive.value!;
  return (
    <section class="cp-archive">
      <div class="cp-archive-head">
        <UserI size={16} />
        <h2 class="cp-h2" dir="auto">
          ארכיון · {lecturerName(a.lecturer)}
        </h2>
        <span class="cp-archive-sub">כל הסיכומים של המרצה, מכל הקורסים והשנים</span>
        <span class="pane-sp" />
        <button class="btn btn-secondary btn-sm" onClick={() => (archive.value = null)}>
          <X size={13} /> חזרה לקורס
        </button>
      </div>
      {a.docs === null && <div class="pane-empty">טוען…</div>}
      {a.error && <div class="cp-state err">{a.error}</div>}
      {a.docs && !a.docs.length && !a.error && <div class="pane-empty">עוד אין סיכומים של המרצה בארכיון.</div>}
      {a.docs && a.docs.length > 0 && (
        <div class="cp-cards">
          {a.docs.map((d, i) => (
            <DocCard key={d.id} d={d} i={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoomEmpty() {
  if (loadError.value) return <div class="pane-empty">{loadError.value}</div>;
  return <div class="pane-empty">החדר נפתח…</div>;
}

/** the year's chat: who is in it now (the hub's room is the year) */
function CohortLine() {
  const b = bundle.value;
  if (!b) return null;
  return (
    <span class="cp-pres-item muted2">
      <MessageI size={13} /> <b class="num">{b.room.postCount}</b> תגובות בשנה
    </span>
  );
}

function CourseEntry() {
  const pl = place.value!;
  const [v, setV] = useState("");
  const go = () => {
    const c = slug(v);
    if (c.length < 2) return;
    openPlace({ inst: pl.inst, faculty: pl.faculty, year: pl.year, course: c });
    setV("");
  };
  const known = useMemo(() => {
    const set = new Map<string, number>();
    for (const d of docs.value) if (d.place.course) set.set(d.place.course, (set.get(d.place.course) || 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [docs.value]);
  return (
    <div class="cp-entry">
      <div class="cp-entry-row">
        <input class="input" dir="auto" value={v} placeholder="נושא השיעור או הקורס (למשל: דיני חוזים) — וחדר נפתח" maxLength={60} onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        <button class="btn btn-primary" onClick={go} disabled={slug(v).length < 2}>
          פתיחה
        </button>
      </div>
      {known.length > 0 && (
        <div class="cp-courses">
          {known.map(([c, n]) => (
            <button key={c} class="cp-course-chip" onClick={() => openPlace({ ...pl, course: c })}>
              <Book size={13} /> {unslug(c)} <span class="num">{n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- the live status strip ----------
function StatusStrip() {
  const b = bundle.value;
  const ex = nextExam.value;
  const nx = nextEvent.value;
  const n = presence.value;
  const talk = b?.room.postCount ?? 0;
  return (
    <div class="cp-strip" role="status">
      <span class="cp-strip-item live">
        <LiveDot pulse={n > 0} />
        <b class="num">{n}</b> {n === 1 ? "לומד/ת עכשיו" : "לומדים עכשיו"}
      </span>
      {ex && (
        <span class={`cp-strip-item ${daysUntil(ex.date) <= 10 ? "hot" : ""}`}>
          <Alert size={14} /> מבחן {daysUntil(ex.date) === 0 ? "היום" : daysUntil(ex.date) === 1 ? "מחר" : <>בעוד <b class="num">{daysUntil(ex.date)}</b> ימים</>}
        </span>
      )}
      <span class="cp-strip-item">
        <MessageI size={14} /> {chatActive.value ? "צ'אט פעיל" : talk ? <><b class="num">{talk}</b> תגובות</> : "שקט בצ'אט"}
      </span>
      {nx && (
        <button class="cp-strip-item next" onClick={() => (ctab.value = "docs")} title="לוח הסמסטר">
          <Calendar size={14} /> הבא בתור: <b dir="auto">{nx.title}</b> · <span class="num">{shortDate(nx.date)}</span>
        </button>
      )}
    </div>
  );
}

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}${new Date().getFullYear() !== Number(y) ? "." + y.slice(2) : ""}`;
};

/** the cohort chat's daily anchor: the date, and what is next */
function ChatAnchor() {
  const nx = nextEvent.value;
  const pl = place.value!;
  const d = new Date();
  const dayName = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(d);
  return (
    <div class="cp-anchor">
      <span class="cp-anchor-day">{dayName}</span>
      <span class="cp-anchor-what" dir="auto">
        {nx ? <>{EVENT_HE[nx.kind]}: {nx.title} · {daysUntil(nx.date) === 0 ? "היום" : `בעוד ${daysUntil(nx.date)} ימים`}</> : pl.course ? "מה למדתם היום? ספרו לקורס." : `השיחה של שנה ${YEAR_HE[pl.year]} — כולם כאן.`}
      </span>
      {bundle.value && pl.course && (
        <div class="scope cp-scope" role="tablist" aria-label="היקף השיחה">
          <button role="tab" aria-selected={scope.value === "page"} class={scope.value === "page" ? "on" : ""} onClick={() => setScope("page")}>
            הקורס
          </button>
          <button role="tab" aria-selected={scope.value === "site"} class={scope.value === "site" ? "on" : ""} onClick={() => setScope("site")}>
            כל שנה {YEAR_HE[pl.year]}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- exam mode ----------
function ExamBanner() {
  const ex = nextExam.value;
  const until = courseMeta.value?.examUntil;
  return (
    <div class="cp-exam-banner" role="status">
      <span class="cp-exam-ic">
        <Alert size={18} />
      </span>
      <div class="cp-exam-text">
        <b>מצב מבחן</b>
        <span>
          {ex ? (
            <>
              {ex.title} · {daysUntil(ex.date) === 0 ? "היום" : daysUntil(ex.date) === 1 ? "מחר" : `בעוד ${daysUntil(ex.date)} ימים`} ({shortDate(ex.date)})
            </>
          ) : until ? (
            <>תקופת מבחנים עד {shortDate(until)}</>
          ) : (
            "תקופת מבחנים"
          )}
          {" · "}הכי חשוב למעלה: החדש, והשאלות שעוד לא נענו.
        </span>
      </div>
      <button class="btn btn-secondary btn-sm" onClick={() => (ctab.value = "docs")}>
        לחומר
      </button>
    </div>
  );
}

function ExamSide() {
  const newest = docs.value.slice(0, 4);
  const all = visiblePosts.value;
  const ids = new Set(all.map((p) => p.id));
  const parents = new Set(all.filter((p) => p.parentId && ids.has(p.parentId)).map((p) => p.parentId));
  const open = all.filter((p) => !p.parentId && !parents.has(p.id)).slice(0, 5);
  return (
    <>
      <div class="pane cp-side-pane cp-exam-pane">
        <div class="pane-head">
          <span class="pane-title">הכי נקרא השבוע</span>
          <span class="pane-sp" />
          <span class="cp-side-note">לפי החדש ביותר</span>
        </div>
        {!newest.length && <div class="pane-empty">עוד אין מסמכים בקורס.</div>}
        {newest.map((d) => (
          <button key={d.id} class="cp-mini-doc" onClick={() => openDoc(d)}>
            <span class={`doc-kind ${d.kind}`}>{d.kind === "article" ? "מאמר" : d.kind === "exercise" ? "תרגול" : "סיכום"}</span>
            <span class="cp-mini-title" dir="auto">
              {d.title}
            </span>
          </button>
        ))}
      </div>
      <div class="pane cp-side-pane cp-exam-pane">
        <div class="pane-head">
          <span class="pane-title">שאלות פתוחות</span>
          <span class="pane-n num">{open.length}</span>
          <span class="pane-sp" />
        </div>
        {!open.length && <div class="pane-empty">אין תגובות שמחכות לתשובה. שאלו משהו — מישהו בקורס כבר יודע.</div>}
        {open.map((p) => (
          <button key={p.id} class="cp-open-q" onClick={() => (ctab.value = "talk")}>
            <Avatar id={p.uid} name={p.name} size={20} />
            <span dir="auto">{p.body}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- semester calendar ----------
function SemesterCalendar() {
  const [edit, setEdit] = useState(false);
  const [add, setAdd] = useState(false);
  const list = events.value;
  const u = me.value;
  return (
    <section class="cp-cal" aria-label="לוח הסמסטר">
      <div class="cp-cal-head">
        <Calendar size={15} />
        <span class="cp-cal-title">לוח הסמסטר</span>
        <span class="cp-cal-sub">{place.value?.course ? "מבחנים והגשות של הקורס" : "מבחנים והגשות של השנה"} · כולם יכולים לעדכן</span>
        <span class="pane-sp" />
        {list.length > 0 && (
          <button class={`link cp-cal-edit ${edit ? "on" : ""}`} onClick={() => needAuth(() => setEdit(!edit))}>
            <Edit size={13} /> {edit ? "סיום" : "עריכה"}
          </button>
        )}
        <button class="btn btn-secondary btn-sm" onClick={() => needAuth(() => setAdd(true))}>
          <Plus size={13} /> אירוע
        </button>
      </div>
      {eventsError.value && (
        <div class="cp-cal-empty err">
          {eventsError.value}
        </div>
      )}
      {!eventsError.value && !list.length && <div class="cp-cal-empty">עוד אין תאריכים. הוסיפו את המבחן או ההגשה הבאים — וכל הקורס יראה.</div>}
      {list.length > 0 && (
        <ol class="cp-events">
          {list.map((e) => (
            <EventRow key={e.id} e={e} edit={edit} mine={!!u && (u.id === e.uid || u.role === "admin")} />
          ))}
        </ol>
      )}
      {add && <AddEvent onClose={() => setAdd(false)} />}
    </section>
  );
}

function EventRow({ e, edit, mine }: { e: CampusEvent; edit: boolean; mine: boolean }) {
  const d = daysUntil(e.date);
  const [y, m, day] = e.date.split("-");
  const when = d === 0 ? "היום" : d === 1 ? "מחר" : d < 0 ? `לפני ${-d} ימים` : `בעוד ${d} ימים`;
  return (
    <li class={`cp-event k-${e.kind} ${d < 0 ? "past" : ""} ${d >= 0 && d <= 3 ? "soon" : ""}`}>
      <span class="cp-event-date num" title={`${day}.${m}.${y}`}>
        <b>{Number(day)}</b>
        <small>{new Intl.DateTimeFormat("he-IL", { month: "short" }).format(new Date(e.date + "T00:00:00"))}</small>
      </span>
      <span class="cp-event-main">
        <span class="cp-event-title" dir="auto">
          {e.title}
        </span>
        <span class="cp-event-sub">
          <span class={`cp-event-kind k-${e.kind}`}>{EVENT_HE[e.kind]}</span> · {when}
          {e.course && !place.value?.course && <> · {unslug(e.course)}</>}
          {e.name && <> · {e.name}</>}
        </span>
      </span>
      {edit && (
        <button class="icon-btn sm" title={mine ? "מחיקה" : "רק מי שהוסיף יכול למחוק"} disabled={!mine} onClick={() => confirm(`למחוק «${e.title}» מלוח הסמסטר?`) && removeEvent(e.id)}>
          <Trash size={14} />
        </button>
      )}
    </li>
  );
}

function AddEvent({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<EventKind>("exam");
  const [busy, setBusy] = useState(false);
  const ok = title.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <Dialog title="אירוע בלוח הסמסטר" onClose={onClose}>
      <div class="form">
        <div class="seg seg-wide" role="tablist">
          {(["exam", "deadline", "other"] as EventKind[]).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} class={kind === k ? "on" : ""} onClick={() => setKind(k)}>
              {EVENT_HE[k]}
            </button>
          ))}
        </div>
        <label class="field">
          <span>מה</span>
          <input class="input" dir="auto" maxLength={80} value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={kind === "exam" ? "מבחן סוף סמסטר · מועד א׳" : kind === "deadline" ? "הגשת עבודה 2" : "הרצאת אורח"} />
        </label>
        <label class="field">
          <span>מתי</span>
          <input class="input ltr" type="date" value={date} min={new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
        <button
          class="btn btn-primary btn-block"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            if (await addEvent({ title: title.trim(), date, kind })) onClose();
            setBusy(false);
          }}
        >
          {busy ? "שומר…" : "הוספה ללוח"}
        </button>
        <p class="fine">הלוח הוא ויקי: כולם רואים, כל מי שמחובר מוסיף, ומי שהוסיף יכול למחוק. מבחן בעשרת הימים הקרובים מעביר את הקורס ל«מצב מבחן».</p>
      </div>
    </Dialog>
  );
}

// ---------- course meta: the group link, the exam period ----------
function MetaRow() {
  const m = courseMeta.value;
  const [edit, setEdit] = useState(false);
  const url = m?.chatUrl || null;
  let host = "";
  try {
    host = url ? new URL(url).host : "";
  } catch {}
  const isWa = host === "chat.whatsapp.com";
  return (
    <div class="cp-meta">
      {url ? (
        <a class={`cp-group ${isWa ? "wa" : "tg"}`} href={url} target="_blank" rel="noopener nofollow">
          <LinkI size={14} /> קבוצת {isWa ? "WhatsApp" : "Telegram"} של הקורס
        </a>
      ) : (
        <span class="cp-group none">
          <LinkI size={14} /> עוד אין קישור לקבוצת הקורס
        </span>
      )}
      <button class="link" onClick={() => needAuth(() => setEdit(true))}>
        <Edit size={13} /> {url ? "עדכון" : "הוספת קישור"}
      </button>
      {m?.examUntil && m.examUntil >= new Date().toISOString().slice(0, 10) && (
        <span class="cp-meta-exam">
          <Alert size={13} /> תקופת מבחנים עד <span class="num">{shortDate(m.examUntil)}</span>
        </span>
      )}
      {m === null && <span class="cp-meta-loading">…</span>}
      {edit && <MetaEdit onClose={() => setEdit(false)} />}
    </div>
  );
}

function MetaEdit({ onClose }: { onClose: () => void }) {
  const m = courseMeta.value || {};
  const [url, setUrl] = useState(m.chatUrl || "");
  const [until, setUntil] = useState(m.examUntil || "");
  const [busy, setBusy] = useState(false);
  const u = url.trim();
  const urlOk = !u || /^https:\/\/(chat\.whatsapp\.com|t\.me)\/\S+$/.test(u);
  const hint = !u ? "קישור הזמנה לקבוצת WhatsApp או Telegram של הקורס." : urlOk ? (u.includes("whatsapp") ? "קישור WhatsApp תקין." : "קישור Telegram תקין.") : "רק קישורים שמתחילים ב-https://chat.whatsapp.com/ או https://t.me/ מתקבלים.";
  return (
    <Dialog title="פרטי הקורס" onClose={onClose}>
      <div class="form">
        <label class="field">
          <span>קבוצת הקורס</span>
          <input class="input ltr" type="url" value={url} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://chat.whatsapp.com/…" />
          <small class={`cp-hint ${u && !urlOk ? "bad" : ""}`}>{hint}</small>
        </label>
        <label class="field">
          <span>תקופת מבחנים עד (לא חובה)</span>
          <input class="input ltr" type="date" value={until} onInput={(e) => setUntil(e.currentTarget.value)} />
          <small class="cp-hint">עד התאריך הזה הקורס במצב מבחן: החדש והשאלות הפתוחות למעלה.</small>
        </label>
        <button
          class="btn btn-primary btn-block"
          disabled={!urlOk || busy}
          onClick={async () => {
            setBusy(true);
            if (await saveCourse({ chatUrl: u || null, examUntil: until || null })) onClose();
            setBusy(false);
          }}
        >
          {busy ? "שומר…" : "שמירה"}
        </button>
        <p class="fine">הפרטים משותפים לכל הקורס ונרשמים בשם מי שעדכן.</p>
      </div>
    </Dialog>
  );
}

// ---------- people ----------
function PeopleTab({ radar }: { radar: any }) {
  const ups = useMemo(() => {
    const m = new Map<string, { uid: string; name: string; n: number; last: number }>();
    for (const d of docs.value) {
      const cur = m.get(d.uid) || { uid: d.uid, name: d.name, n: 0, last: 0 };
      cur.n++;
      cur.last = Math.max(cur.last, d.ts);
      m.set(d.uid, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || b.last - a.last);
  }, [docs.value]);
  return (
    <div class="cp-people">
      <section class="cp-people-sec">
        <h3 class="cp-h3">
          <UserI size={15} /> מי מעלה חומר
        </h3>
        {!ups.length && <div class="pane-empty">עוד אין מי שהעלה. הסיכום הראשון מופיע כאן עם השם.</div>}
        <ul class="cp-uploaders">
          {ups.map((u) => (
            <li key={u.uid} class="cp-uploader">
              <Avatar id={u.uid} name={u.name} size={32} />
              <span class="cp-uploader-main">
                <bdi class="cp-uploader-name">{u.name}</bdi>
                <span class="cp-uploader-sub">
                  <b class="num">{u.n}</b> {u.n === 1 ? "מסמך" : "מסמכים"} · אחרון {fmtDate(u.last)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section class="cp-people-sec">
        <div class="pane cp-side-pane">{radar}</div>
      </section>
    </div>
  );
}

// ---------- phone: the bottom tab bar ----------
function PhoneBar() {
  const u = me.value;
  const pl = place.value;
  const home = !pl;
  return (
    <nav class="cp-bar" aria-label="ניווט">
      <button class={`cp-bar-btn ${home ? "on" : ""}`} onClick={goHome}>
        <Home size={20} />
        <span>בית</span>
      </button>
      <button class="cp-bar-btn" onClick={() => (pl ? (dirOpen.value = true) : (picker.value = true))}>
        <Compass size={20} />
        <span>ניווט</span>
      </button>
      <button class="cp-bar-btn" disabled={!pl} onClick={() => (searchOpen.value = true)}>
        <Search size={20} />
        <span>חיפוש</span>
      </button>
      <button class="cp-bar-btn" onClick={() => (sheet.value = u ? { type: "mymedia" } : { type: "signin" })}>
        {u ? <Avatar id={u.id} name={u.name} size={22} /> : <UserI size={20} />}
        <span>{u ? "פרופיל" : "כניסה"}</span>
      </button>
    </nav>
  );
}
