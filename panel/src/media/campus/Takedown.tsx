// «הסרה לפי דרישה»: the notice-and-removal flow, in place. The item is preselected (a document with its sections,
// a talkback or an image); the requester identifies with a full name, an email verified by a code (a signed-in
// person's login email is already verified) and a mobile phone; the items are put on hold at once and the reply
// carries a reference id. The tone is calm and professional: this is a trust mark, not an error.
import { useState } from "preact/hooks";
import { ApiError, api } from "../../api";
import { Check, Shield } from "../../icons";
import { me } from "../../state";
import { Dialog } from "../Dialog";
import { place, placeTitle, takedownOpen } from "../state";

type Role = "lecturer" | "institution" | "author" | "other";
const WHY: [string, string][] = [
  ["copyright", "זכויות יוצרים: הטקסט מועתק מחומר שלי"],
  ["lecturer", "חומר של מרצה: מצגת, הקלטה או מבחן"],
  ["privacy", "פגיעה בפרטיות: פרטים אישיים שלי או של אחר"],
  ["defamation", "לשון הרע: פגיעה בשמי או בשם אחר"],
  ["minor", "תוכן הנוגע לקטין"],
  ["other", "סיבה אחרת"],
];
const ROLES: [Role, string][] = [
  ["lecturer", "מרצה"],
  ["institution", "מוסד"],
  ["author", "בעל/ת זכויות"],
  ["other", "אחר (למשל: שמי מופיע בטקסט)"],
];

export const normPhone = (p: string) => {
  const d = p.replace(/\D/g, "").replace(/^972/, "0");
  return /^05\d{8}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3)}` : null;
};

export function TakedownDialog({ onClose }: { onClose: () => void }) {
  const t = takedownOpen.value || {};
  const item = t.item;
  const u = me.value;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [dev, setDev] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("lecturer");
  const [whole, setWhole] = useState(true);
  const [secs, setSecs] = useState<Set<number>>(new Set());
  const [why, setWhy] = useState("");
  const [details, setDetails] = useState("");
  const reason = why ? `${WHY.find(([k]) => k === why)?.[1] || why}: ${details.trim()}` : details.trim();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; held?: number } | null>(null);
  const pl = place.value;
  const signedIn = !!u?.termsAccepted;
  const emailOk = signedIn || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneN = normPhone(phone);
  const sectionsOk = !item?.sections?.length || whole || secs.size > 0;
  const ok = name.trim().length >= 2 && emailOk && (signedIn || (codeSent && code.trim().length >= 4)) && !!phoneN && !!why && details.trim().length >= 10 && sectionsOk && !!pl;

  const sendCode = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.takedownStart(email.trim());
      setCodeSent(true);
      if (r.devCode) setDev(r.devCode);
    } catch (e: any) {
      setErr(e instanceof ApiError ? e.message : "שליחת הקוד נכשלה.");
    }
    setBusy(false);
  };
  const submit = async () => {
    if (!ok || !pl) return;
    setBusy(true);
    setErr(null);
    try {
      const items = item ? [{ type: item.type, id: item.id, ...(item.sections?.length && !whole ? { sections: [...secs].sort((a, b) => a - b) } : {}) }] : undefined;
      const r = await api.takedown({
        name: name.trim(),
        email: signedIn ? u!.email || email.trim() : email.trim(),
        ...(signedIn ? {} : { code: code.trim() }),
        phone: phoneN!,
        role,
        inst: pl.inst,
        faculty: pl.faculty,
        year: pl.year,
        course: pl.course,
        items,
        docIds: item?.type === "doc" ? [item.id] : undefined,
        reason: reason.trim(),
      });
      setDone({ id: r.id, held: r.held });
    } catch (e: any) {
      const m: Record<string, string> = { bad_phone: "מספר נייד ישראלי, למשל 052-1234567.", bad_email: "כתובת האימייל לא תקינה.", bad_code: "הקוד שגוי או פג. אפשר לבקש קוד חדש.", short: "פרטו בבקשה (לפחות 10 תווים).", too_many: "נשלחו יותר מדי בקשות מהכתובת הזאת. נסו בעוד שעה.", abuse: "הכתובת הזאת נחסמה מבקשות הסרה אחרי כמה בקשות שנדחו." };
      setErr(m[e?.code] || e?.message || "השליחה נכשלה.");
    }
    setBusy(false);
  };

  if (done)
    return (
      <Dialog title="הבקשה התקבלה" onClose={onClose}>
        <div class="cp-done">
          <span class="cp-done-ic">
            <Check size={26} />
          </span>
          <div class="cp-done-title">{item ? "הפריט הוסר זמנית עד לבדיקה" : "הפנייה נרשמה"}</div>
          <div class="cp-done-sub">
            מספר אסמכתה: <b class="num ltr">{done.id}</b>
            {typeof done.held === "number" && done.held > 0 && <> · {done.held === 1 ? "פריט אחד" : `${done.held} פריטים`} בהשהיה</>}
          </div>
          <p class="lead">נחזור אליך תוך 48 שעות — לכתובת {signedIn ? "ההתחברות שלכם" : <bdi dir="ltr">{email.trim()}</bdi>} ולטלפון <bdi dir="ltr">{phoneN}</bdi>. הפריט נשאר מוסתר מכולם עד להחלטה; המחבר/ת רואה אותו עם הסימון «בבדיקה לאחר בקשת הסרה».</p>
          <button class="btn btn-primary btn-block" onClick={onClose}>
            סגירה
          </button>
        </div>
      </Dialog>
    );

  return (
    <Dialog title="הסרה לפי דרישה" onClose={onClose} closable={!busy}>
      <div class="form cp-td">
        <div class="cp-trust">
          <Shield size={18} />
          <span>
            <b>מי רשאי לדרוש הסרה:</b> בעלי זכויות יוצרים, מרצה שחומר שלו הועתק, המוסד, אדם ששמו מופיע בטקסט, או מי שפרטיותו נפגעה. הפריט מוסתר מיד עם קבלת הבקשה ומוסר סופית תוך 24–48 שעות מהפנייה, לאחר בדיקה.
          </span>
        </div>
        {item ? (
          <div class="cp-td-item">
            <span class="cp-td-itemlabel">{item.type === "doc" ? "מסמך" : item.type === "post" ? "תגובה / תמונה" : "הודעה"}</span>
            <span class="cp-td-itemtitle" dir="auto">
              {item.title}
            </span>
            {!!item.sections?.length && (
              <div class="cp-td-secs">
                <label class="cp-td-sec">
                  <input type="radio" name="td-scope" checked={whole} onChange={() => setWhole(true)} /> כל המסמך
                </label>
                <label class="cp-td-sec">
                  <input type="radio" name="td-scope" checked={!whole} onChange={() => setWhole(false)} /> סעיפים מסוימים
                </label>
                {!whole && (
                  <div class="cp-td-seclist">
                    {item.sections.map((s) => (
                      <label key={s.i} class="cp-td-check">
                        <input type="checkbox" checked={secs.has(s.i)} onChange={(e) => setSecs((set) => (e.currentTarget.checked ? new Set(set).add(s.i) : (set.delete(s.i), new Set(set))))} />
                        <span class="num">§{s.i}</span> <span dir="auto">{s.heading || "פתיחה"}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          pl && (
            <div class="target">
              לגבי: <strong>{placeTitle(pl)}</strong>
            </div>
          )
        )}
        <div class="cp-td-grid">
          <label class="field">
            <span>שם מלא</span>
            <input class="input" dir="auto" value={name} maxLength={80} onInput={(e) => setName(e.currentTarget.value)} placeholder="שם פרטי ומשפחה" />
          </label>
          <label class="field">
            <span>תפקיד</span>
            <select class="input" value={role} onChange={(e) => setRole(e.currentTarget.value as Role)}>
              {ROLES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>אימייל לחזרה</span>
            {signedIn ? <input class="input ltr" value={u!.email || "כתובת ההתחברות שלכם"} disabled /> : <input class="input ltr" type="email" value={email} disabled={codeSent} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="name@example.ac.il" />}
          </label>
          <label class="field">
            <span>טלפון נייד לחזרה</span>
            <input class="input ltr" type="tel" inputMode="tel" value={phone} onInput={(e) => setPhone(e.currentTarget.value)} placeholder="052-1234567" />
            {phone && !phoneN && <small class="cp-hint bad">מספר נייד ישראלי: 05X-XXXXXXX.</small>}
          </label>
        </div>
        {!signedIn && (
          <div class="cp-td-code">
            {!codeSent ? (
              <button class="btn btn-secondary btn-sm" disabled={!emailOk || busy} onClick={sendCode}>
                שליחת קוד אימות לאימייל
              </button>
            ) : (
              <>
                <label class="field">
                  <span>הקוד שנשלח ל-{email.trim()}</span>
                  <input class="input code-input ltr" inputMode="numeric" maxLength={6} value={code} onInput={(e) => setCode(e.currentTarget.value)} />
                </label>
                {dev && <div class="dev-note">סביבת פיתוח · הקוד: {dev}</div>}
                <button class="link" disabled={busy} onClick={() => (setCodeSent(false), setCode(""))}>
                  כתובת אחרת
                </button>
              </>
            )}
          </div>
        )}
        <label class="field">
          <span>מדוע מבקשים להסיר</span>
          <select class="input" value={why} onChange={(e) => setWhy(e.currentTarget.value)}>
            <option value="">בחרו סיבה…</option>
            {WHY.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>פרטים</span>
          <textarea class="input" dir="auto" rows={4} maxLength={3000} value={details} onInput={(e) => setDetails(e.currentTarget.value)} placeholder="מה הקשר שלכם לפריט, איזה קטע בדיוק, ומה מבקשים — להסיר הכול או חלק" />
          {details && details.trim().length < 10 && <small class="cp-hint bad">פרטו בבקשה, לפחות 10 תווים.</small>}
        </label>
        <div class="cp-td-back">
          <b>נחזור אליך תוך 48 שעות</b> — לאימייל ולטלפון שמסרת. הפריט מוסתר מיד עם קבלת הבקשה.
        </div>
        {err && <div class="form-err">{err}</div>}
        <button class="btn btn-primary btn-block btn-lg" disabled={!ok || busy} onClick={submit}>
          {busy ? "שולח…" : "שליחת הבקשה"}
        </button>
        <p class="fine">הפרטים משמשים רק לטיפול בבקשה ולתשובה. נוהל ההסרה: פרטי הפונה נשמרים עם הבקשה, הפריט מוסתר מיד, והמחבר/ת רשאי/ת להשיב. פרטים נוספים ב<a href="/privacy/" target="_blank" rel="noopener">מדיניות הפרטיות</a>.</p>
      </div>
    </Dialog>
  );
}
