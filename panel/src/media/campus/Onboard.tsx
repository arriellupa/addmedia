// Onboarding and home: the picker (institution › faculty › second faculty › year) as the first screen of a new
// visitor; «הדפים שלי» (the follows) as the home when signed in; the «פרטי סטודנט» sheet that identifies every
// student before the first write; the paywall sheet («קמפוס · סמסטר»).
import { useEffect, useState } from "preact/hooks";
import type { CampusPlace } from "../../api";
import { price } from "../../fmt";
import { Cap, Check, Globe, Shield, Star, Users } from "../../icons";
import { bundle, me, sheet } from "../../state";
import { Avatar } from "../../ui/Bits";
import { Dialog } from "../Dialog";
import { YEAR_HE, followPrompt, follows, loadDirTree, loadDocs, loadStudent, loadTree, openPlace, paywall, picker, place, saveStudent, slug, student, takedownOpen, tree, unslug } from "../state";

export function Onboarding() {
  const u = me.value;
  const list = follows.value;
  if (u && list.length) return <Home />;
  return (
    <div class="cp-onboard">
      <div class="cp-ob-hero">
        <span class="cp-ob-badge">
          <Cap size={14} /> הקמפוס
        </span>
        <h1 class="cp-ob-title">הסיכומים של השנה שלכם, במקום אחד</h1>
        <p class="cp-ob-sub">סטודנטים נפגשים סביב קורס או מאמר, לפי מוסד, פקולטה ושנה. סיכומים ותרגולים במילים שלכם, מאמרים בקישור למקור, לוח סמסטר משותף, שיחה חיה של השנה — ומי לומד עכשיו.</p>
        <ul class="cp-ob-points">
          <li>
            <Check size={14} /> הכול גלוי, בלי מנעולים ובלי טשטוש — כל מסמך עם שם המחבר/ת
          </li>
          <li>
            <Check size={14} /> טקסט, לא קבצים: אף מצגת או הקלטה של מרצה לא מגיעה לכאן
          </li>
          <li>
            <Shield size={14} /> הסרה לפי דרישה: בעלי זכויות, מרצים ומוסדות — כל פריט מוסר תוך 24–48 שעות מהפנייה
          </li>
        </ul>
        <button class="link cp-ob-td" onClick={() => (takedownOpen.value = {})}>
          בקשת הסרה למרצים ומוסדות
        </button>
      </div>
      <div class="cp-ob-card">
        <PickerForm />
      </div>
    </div>
  );
}

function Home() {
  const u = me.value!;
  const list = follows.value;
  const campus = list.filter((f) => f.path.startsWith("/media/campus/"));
  const sites = list.filter((f) => !f.path.startsWith("/media/campus/"));
  return (
    <div class="cp-home">
      <div class="cp-home-head">
        <Avatar id={u.id} name={u.name} size={40} />
        <div>
          <h1 class="cp-home-title">הדפים שלי</h1>
          <div class="cp-home-sub">שלום {u.name}. הקורסים והפקולטות שבמעקב מחכים כאן תמיד.</div>
        </div>
        <span class="pane-sp" />
        <button class="btn btn-primary" onClick={() => (picker.value = true)}>
          <Cap size={16} /> פקולטה אחרת
        </button>
      </div>
      <div class="cp-home-grid">
        {campus.map((f, i) => {
          const m = f.path.match(/^\/media\/campus\/([^/]+)\/([^/]+)\/([1-6])(?:\/([^/]+))?$/);
          const course = m?.[4];
          return (
            <a key={f.path} class={`cp-home-card ${course ? "course" : "year"}`} href={f.path} style={{ "--i": String(i) }} onClick={(e) => (e.preventDefault(), m && openPlace({ inst: decodeURIComponent(m[1]), faculty: decodeURIComponent(m[2]), year: Number(m[3]), course: course ? decodeURIComponent(course) : undefined }))}>
              <span class="cp-home-kind">{course ? "קורס" : "שנה"}</span>
              <span class="cp-home-name" dir="auto">
                {course ? unslug(course) : m ? `שנה ${YEAR_HE[Number(m[3])]} · ${unslug(decodeURIComponent(m[2]))}` : f.title}
              </span>
              <span class="cp-home-path" dir="auto">
                {f.title}
              </span>
              <Star size={14} fill class="cp-home-star" />
            </a>
          );
        })}
      </div>
      {sites.length > 0 && (
        <div class="cp-home-sites">
          <div class="cp-h3">
            <Globe size={14} /> אתרים במעקב
          </div>
          {sites.map((f) => (
            <a key={f.path} class="mc-menu-item" href={f.path}>
              <Globe size={14} /> <bdi dir="ltr">{f.title}</bdi>
            </a>
          ))}
        </div>
      )}
      <div class="cp-trust">
        <Shield size={18} />
        <span>
          <b>הסרה לפי דרישה:</b> בעלי זכויות, מרצים ומוסדות — כל פריט מוסר תוך 24–48 שעות מהפנייה.
        </span>
        <button class="btn btn-secondary btn-sm" onClick={() => (takedownOpen.value = {})}>
          בקשת הסרה
        </button>
      </div>
    </div>
  );
}

/** institution › faculty (chips + free text) › second faculty › year */
export function PickerForm({ onDone }: { onDone?: () => void }) {
  const t = tree.value;
  const cur = place.value;
  const [inst, setInst] = useState(cur?.inst || "");
  const [faculty, setFaculty] = useState(cur ? unslug(cur.faculty) : "");
  const [faculty2, setFaculty2] = useState("");
  const [dual, setDual] = useState(false);
  const [year, setYear] = useState(cur?.year || 1);
  const [step, setStep] = useState(0);
  useEffect(() => void loadTree(), []);
  const i = t?.institutions.find((x) => x.id === inst);
  const ok = !!inst && slug(faculty).length >= 2;
  const go = (f: string) => {
    openPlace({ inst, faculty: slug(f), year });
    if (!cur) followPrompt.value = true;
    onDone?.();
  };
  if (!t) return <div class="muted pad">טוען את רשימת המוסדות…</div>;
  return (
    <div class="cp-picker">
      <ol class="cp-steps" aria-hidden="true">
        {["מוסד", "פקולטה", "שנה"].map((s, k) => (
          <li key={s} class={k === step ? "on" : k < step ? "done" : ""}>
            <span class="num">{k + 1}</span> {s}
          </li>
        ))}
      </ol>
      <div class="field">
        <span>מוסד</span>
        <div class="cp-insts">
          {t.institutions.map((x) => (
            <button key={x.id} class={`cp-inst ${inst === x.id ? "on" : ""}`} onClick={() => (setInst(x.id), setFaculty(""), setStep(1))}>
              {x.name}
            </button>
          ))}
        </div>
      </div>
      {i && (
        <div class="field">
          <span>פקולטה</span>
          <div class="chips">
            {i.faculties.map((f) => (
              <button key={f} class={`chip ${faculty === f ? "on" : ""}`} onClick={() => (setFaculty(f), setStep(2))}>
                {f}
              </button>
            ))}
          </div>
          <input class="input" dir="auto" value={faculty} maxLength={60} onInput={(e) => (setFaculty(e.currentTarget.value), setStep(2))} placeholder="או כתבו פקולטה אחרת" />
          {!dual ? (
            <button class="link" onClick={() => setDual(true)}>
              + פקולטה שנייה (דו-חוגי)
            </button>
          ) : (
            <div class="chips">
              {i.faculties
                .filter((f) => f !== faculty)
                .map((f) => (
                  <button key={f} class={`chip ${faculty2 === f ? "on" : ""}`} onClick={() => setFaculty2(faculty2 === f ? "" : f)}>
                    {f}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      {i && (
        <div class="field">
          <span>שנה</span>
          <div class="chips">
            {t.years.map((y) => (
              <button key={y} class={`chip ${year === y ? "on" : ""}`} onClick={() => setYear(y)}>
                שנה {YEAR_HE[y]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="cp-picker-go">
        <button class="btn btn-primary btn-lg" disabled={!ok} onClick={() => go(faculty)}>
          לדף של {ok ? `${unslug(slug(faculty))} · שנה ${YEAR_HE[year]}` : "הפקולטה"}
        </button>
        {dual && faculty2 && (
          <button class="btn btn-secondary btn-lg" onClick={() => go(faculty2)}>
            {faculty2} · שנה {YEAR_HE[year]}
          </button>
        )}
      </div>
      <p class="fine">הדף של הפקולטה הוא כתובת קבועה. הכוכב שומר אותו במעקב, כדי שייפתח בלחיצה מכל מקום.</p>
    </div>
  );
}

export function PickerDialog() {
  const cur = place.value;
  return (
    <Dialog title="הפקולטה שלכם" onClose={() => (picker.value = false)} closable={!!cur} wide>
      <PickerForm onDone={() => (picker.value = false)} />
    </Dialog>
  );
}

// ---------- «פרטי סטודנט» ----------
export function StudentSheet({ then }: { then?: () => void }) {
  const t = tree.value;
  const u = me.value;
  const s = student.value || null;
  const pl = place.value;
  const [fullName, setFullName] = useState(s?.fullName || "");
  const [inst, setInst] = useState(s?.inst || pl?.inst || "");
  const [faculty, setFaculty] = useState(s ? unslug(s.faculty) : pl ? unslug(pl.faculty) : "");
  const [faculty2, setFaculty2] = useState(s?.faculty2 ? unslug(s.faculty2) : "");
  const [year, setYear] = useState(s?.year || pl?.year || 1);
  const [track, setTrack] = useState(s?.track || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => void loadTree(), []);
  const i = t?.institutions.find((x) => x.id === inst);
  const ok = fullName.trim().length >= 2 && !!inst && slug(faculty).length >= 2 && track.trim().length >= 2;
  const close = () => (sheet.value = null);
  return (
    <Dialog title="פרטי סטודנט" onClose={close} closable={!!s}>
      <div class="form cp-student">
        <p class="lead">כדי להשתתף בקמפוס — לכתוב, להגיב ולעדכן — מזדהים פעם אחת. הפרטים מופיעים לשנה שלכם כ«שם · פקולטה · שנה» ליד מה שתכתבו.</p>
        <label class="field">
          <span>שם מלא</span>
          <input class="input" dir="auto" value={fullName} maxLength={80} onInput={(e) => setFullName(e.currentTarget.value)} placeholder="שם פרטי ומשפחה" autoFocus />
        </label>
        <label class="field">
          <span>אימייל</span>
          <input class="input ltr" value={s?.email || u?.email || "כתובת ההתחברות שלכם (מאומתת)"} disabled />
        </label>
        <label class="field">
          <span>מוסד</span>
          <select class="input" value={inst} onChange={(e) => (setInst(e.currentTarget.value), setFaculty(""))}>
            <option value="">בחרו…</option>
            {t?.institutions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div class="cp-student-grid">
          <label class="field">
            <span>פקולטה</span>
            <input class="input" dir="auto" list="st-fac" value={faculty} maxLength={60} onInput={(e) => setFaculty(e.currentTarget.value)} />
            <datalist id="st-fac">{i?.faculties.map((f) => <option key={f} value={f} />)}</datalist>
          </label>
          <label class="field">
            <span>פקולטה שנייה (לא חובה)</span>
            <input class="input" dir="auto" list="st-fac" value={faculty2} maxLength={60} onInput={(e) => setFaculty2(e.currentTarget.value)} placeholder="דו-חוגי" />
          </label>
          <label class="field">
            <span>שנה</span>
            <select class="input" value={year} onChange={(e) => setYear(Number(e.currentTarget.value))}>
              {(t?.years || [1, 2, 3, 4, 5, 6]).map((y) => (
                <option key={y} value={y}>
                  שנה {YEAR_HE[y]}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>מגמה</span>
            <input class="input" dir="auto" value={track} maxLength={60} onInput={(e) => setTrack(e.currentTarget.value)} placeholder="למשל: משפט עסקי" />
          </label>
        </div>
        <button
          class="btn btn-primary btn-block btn-lg"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            const done = await saveStudent({ fullName: fullName.trim(), inst, faculty: slug(faculty), faculty2: faculty2.trim() ? slug(faculty2) : null, year, track: track.trim() });
            setBusy(false);
            if (done) {
              sheet.value = null;
              then?.();
            }
          }}
        >
          {busy ? "שומר…" : s ? "עדכון הפרטים" : "אישור והמשך"}
        </button>
        <p class="fine">
          <Users size={12} /> הפרטים נשמרים בחשבון שלכם ומוצגים רק בקמפוס. אפשר לעדכן אותם בכל עת מ«המדיה שלי». <a href="/privacy/" target="_blank" rel="noopener">מדיניות הפרטיות</a>.
        </p>
      </div>
    </Dialog>
  );
}

// ---------- the paywall ----------
export function PaywallSheet() {
  const s = bundle.value?.settings;
  const pw = paywall.value;
  const p = pw?.price ?? s?.campusPrice ?? 2990;
  const u = me.value;
  const msg = pw?.msg;
  const close = () => (paywall.value = null);
  return (
    <Dialog title="קמפוס · סמסטר" onClose={close}>
      <div class="cp-pay">
        <div class="cp-pay-price">
          <span class="cp-pay-big">{price(p)}</span>
          <span class="cp-pay-unit">לסמסטר · 14 ימי ניסיון חינם עם ההזדהות</span>
        </div>
        {msg && <div class="cp-pay-msg">{msg}</div>}
        <ul class="cp-pay-list">
          <li>
            <Check size={14} /> קריאה של כל הסיכומים והתרגולים של הפקולטה, לפי קורס, מרצה ושיעור
          </li>
          <li>
            <Check size={14} /> חיפוש בטקסט המלא וציטוט סעיפים לשיחה
          </li>
          <li>
            <Check size={14} /> ארכיון לפי מרצה, לוח סמסטר ומצב מבחן
          </li>
          <li>
            <Check size={14} /> כתיבה, מעקב והדף של הקורס — חינם תמיד
          </li>
        </ul>
        {u && student.value === null ? (
          <button class="btn btn-primary btn-block btn-lg" onClick={() => ((paywall.value = null), (sheet.value = { type: "student", then: () => (loadDocs(), loadDirTree(), loadStudent(true)) }))}>
            הזדהות כסטודנט/ית · 14 ימי ניסיון חינם
          </button>
        ) : (
          <button class="btn btn-primary btn-block btn-lg" disabled>
            בקרוב · תשלום מאובטח
          </button>
        )}
        {!u && (
          <button class="btn btn-secondary btn-block" onClick={() => (sheet.value = { type: "signin", then: close })}>
            כבר יש לי מנוי · כניסה
          </button>
        )}
        <p class="fine">עד שהתשלום יתחבר, מנוי ניתן דרך הצוות. {u?.campusUntil ? `המנוי שלכם בתוקף עד ${u.campusUntil}.` : "המחיר נקבע בהגדרות המערכת."}</p>
      </div>
    </Dialog>
  );
}

export const placeOfStudent = (): CampusPlace | null => {
  const s = student.value;
  return s ? { inst: s.inst, faculty: s.faculty, year: s.year } : null;
};
