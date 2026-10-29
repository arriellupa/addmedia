// AddStudent's account: password sign-in and sign-up (the email code is the second factor on a new device),
// «שכחתי סיסמה», the set-a-password prompt for code-only accounts (403 `password`), and «החשבון שלי» with the
// active devices («ניתוק») and a password change. AddMedia keeps its own code-only sheet (ui/Sheets.tsx).
// Built to the contract of 2026-10-29 18:44; the calls live in api.ts.
import { useEffect, useRef, useState } from "preact/hooks";
import { API_BASE, ApiError, Device, Me, api } from "../api";
import { ago, date } from "../fmt";
import { host } from "../host";
import { Check, Lock, LogOut, Mail, Shield, Trash, UserI, X } from "../icons";
import { me, say, sheet, signOut, signedIn } from "../state";
import { Avatar, SheetFrame } from "../ui/Bits";
import { RULES } from "../ui/Sheets";
import { student } from "../media/state";

export const PERSONAL = "החשבון אישי. שיתוף סיסמה או מכשיר עם אחר = ביטול המנוי ללא החזר.";
const MIN_PW = 8;

/** the reset token of an emailed `/#reset=<token>` link, if the page opened with one */
export function resetTokenFromHash(): string | null {
  const m = location.hash.match(/^#reset=([A-Za-z0-9_.-]+)/);
  return m ? m[1] : null;
}

/** a password field with «הצגה»/«הסתרה» (a top-level component, so the input keeps its focus between renders) */
function PwField({ label = "סיסמה", value, set, auto, show, toggle }: { label?: string; value: string; set: (v: string) => void; auto: string; show: boolean; toggle: () => void }) {
  return (
    <label class="field">
      <span>{label}</span>
      <div class="st-pw">
        <input class="input" type={(show ? "text" : "password") as any} dir="ltr" autoComplete={auto} minLength={MIN_PW} required value={value} onInput={(e) => set(e.currentTarget.value)} placeholder={"•".repeat(MIN_PW)} />
        <button type="button" class="link st-pw-eye" onClick={toggle} aria-pressed={show}>
          {show ? "הסתרה" : "הצגה"}
        </button>
      </div>
    </label>
  );
}

type Mode = "in" | "up" | "forgot" | "code" | "newpw" | "reset" | "rules";

/** the sign-in sheet of the students' site */
export function StudentSignIn({ then, resetToken }: { then?: () => void; resetToken?: string | null }) {
  const u = me.value;
  const [mode, setMode] = useState<Mode>(u && !u.termsAccepted ? "rules" : resetToken ? "reset" : "in");
  /** what the code step completes: a sign-in on a new device, a sign-up, or a forgotten password */
  const [ctx, setCtx] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState(u?.name ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dev, setDev] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode === "code") codeRef.current?.focus();
    setErr(null);
  }, [mode]);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 423) {
        // the account must reset its password (velocity lock): straight to «שכחתי סיסמה» with the reason
        setNote(e.message || "החשבון ננעל. צריך לקבוע סיסמה חדשה דרך המייל.");
        setMode("forgot");
      } else setErr(e instanceof ApiError ? e.message : "משהו השתבש. נסו שוב.");
    }
    setBusy(false);
  };
  const finish = () => {
    sheet.value = null;
    then?.();
  };
  const afterSignIn = (user: Me) => {
    // keep the name typed at sign-up; a placeholder from the server («גולש/ת 1234») never replaces it
    if (!name.trim() || !/^גולש/.test(user.name)) setName(user.name);
    if (user.termsAccepted) finish();
    else setMode("rules");
  };
  const login = () =>
    go(async () => {
      const r = await api.login(email.trim(), password);
      if (r.token && r.user) return void (await signedIn(r.token, r.user), afterSignIn(r.user));
      // a new device: the email code is the second factor
      setDev(r.devCode || null);
      setCtx("login");
      setCode("");
      setMode("code");
    });
  const register = () =>
    go(async () => {
      const r = await api.register(email.trim(), password, name.trim());
      setDev(r.devCode || null);
      setCtx("register");
      setCode("");
      setMode("code");
    });
  const forgot = () =>
    go(async () => {
      const r = await api.forgotPassword(email.trim());
      setDev(r.devCode || null);
      setCtx("forgot");
      setCode("");
      setNote(null);
      setMode("code");
    });
  const verify = (c = code) =>
    go(async () => {
      if (ctx === "forgot") {
        // the code goes with the new password in one step
        setCode(c);
        setPassword("");
        setPassword2("");
        setMode("newpw");
        return;
      }
      const r = await api.authVerify(email.trim(), c, ctx === "register" ? password : undefined);
      await signedIn(r.token, r.user);
      afterSignIn(r.user);
    });
  const resetByCode = () =>
    go(async () => {
      const r = await api.resetPassword({ email: email.trim(), code, password });
      if (r.token && r.user) return void (await signedIn(r.token, r.user), say("הסיסמה הוחלפה. שאר המכשירים נותקו."), afterSignIn(r.user));
      say("הסיסמה הוחלפה. אפשר להיכנס.");
      setPassword("");
      setMode("in");
    });
  const resetByToken = () =>
    go(async () => {
      const r = await api.resetPassword({ token: resetToken!, password });
      history.replaceState(null, "", location.pathname + location.search);
      if (r.token && r.user) return void (await signedIn(r.token, r.user), say("הסיסמה הוחלפה. שאר המכשירים נותקו."), afterSignIn(r.user));
      say("הסיסמה הוחלפה. אפשר להיכנס.");
      setPassword("");
      setMode("in");
    });
  const accept = () =>
    go(async () => {
      const r = await api.updateMe({ acceptTerms: true, name: name.trim() || undefined });
      me.value = r.user;
      host.haptic("success");
      finish();
    });

  const pwOk = password.length >= MIN_PW;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const title = mode === "up" ? "הרשמה ל-AddStudent" : mode === "forgot" ? "שכחתי סיסמה" : mode === "code" ? "הקוד מהמייל" : mode === "newpw" || mode === "reset" ? "סיסמה חדשה" : mode === "rules" ? "עוד צעד אחד" : "כניסה ל-AddStudent";
  return (
    <SheetFrame title={title} onBack={mode === "up" || mode === "forgot" || (mode === "code" && ctx !== "forgot") ? () => setMode(mode === "code" ? (ctx === "register" ? "up" : "in") : "in") : undefined}>
      {mode === "in" && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), login())}>
          <p class="lead">הסיכומים, ההעלאות והדפים שלכם — עם מייל וסיסמה. במכשיר חדש נשלח גם קוד למייל.</p>
          <label class="field">
            <span>מייל</span>
            <input class="input" type="email" dir="ltr" autoComplete="email" required placeholder="name@example.com" value={email} onInput={(e) => setEmail(e.currentTarget.value)} autoFocus />
          </label>
          <PwField value={password} set={setPassword} auto="current-password" show={showPw} toggle={() => setShowPw(!showPw)} />
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || !emailOk || !password}>
            <Lock size={18} /> {busy ? "נכנס…" : "כניסה"}
          </button>
          <div class="st-auth-links">
            <button type="button" class="link" onClick={() => setMode("forgot")}>
              שכחתי סיסמה
            </button>
            <button type="button" class="link" onClick={() => setMode("up")}>
              אין לכם חשבון? הרשמה
            </button>
          </div>
        </form>
      )}
      {mode === "up" && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), register())}>
          <label class="field">
            <span>השם שיוצג לאחרים</span>
            <input class="input" maxLength={24} required value={name} onInput={(e) => setName(e.currentTarget.value)} autoFocus />
          </label>
          <label class="field">
            <span>מייל</span>
            <input class="input" type="email" dir="ltr" autoComplete="email" required placeholder="name@example.com" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <PwField label={`סיסמה (לפחות ${MIN_PW} תווים)`} value={password} set={setPassword} auto="new-password" show={showPw} toggle={() => setShowPw(!showPw)} />
          <div class="st-personal">
            <Shield size={15} />
            <span>{PERSONAL}</span>
          </div>
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || !emailOk || !pwOk || name.trim().length < 2}>
            <Mail size={18} /> {busy ? "שולח…" : "הרשמה — שלחו לי קוד"}
          </button>
          <p class="fine">
            בהרשמה אתם מאשרים את <a href={API_BASE + "/terms/"} target="_blank" rel="noopener">תנאי השימוש</a> ואת <a href={API_BASE + "/privacy/"} target="_blank" rel="noopener">מדיניות הפרטיות</a>. המייל נשמר לצורך הכניסה והחותמת על העותקים שלכם.
          </p>
        </form>
      )}
      {mode === "forgot" && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), forgot())}>
          {note && <div class="form-err" role="alert">{note}</div>}
          <p class="lead">נשלח למייל קוד (או קישור) לקביעת סיסמה חדשה. החלפת הסיסמה מנתקת את שאר המכשירים.</p>
          <label class="field">
            <span>מייל</span>
            <input class="input" type="email" dir="ltr" autoComplete="email" required placeholder="name@example.com" value={email} onInput={(e) => setEmail(e.currentTarget.value)} autoFocus />
          </label>
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || !emailOk}>
            <Mail size={18} /> {busy ? "שולח…" : "שלחו לי קוד"}
          </button>
        </form>
      )}
      {mode === "code" && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), verify())}>
          <p class="lead">
            שלחנו קוד בן 6 ספרות אל <bdi dir="ltr">{email.trim()}</bdi>
            {ctx === "login" && " — מכשיר חדש מאומת פעם אחת במייל."}
            {ctx === "forgot" && ". אם קיבלתם קישור במקום קוד — פתחו אותו."}
          </p>
          {dev && <div class="dev-note">מצב פיתוח — הקוד: <span class="num">{dev}</span></div>}
          <input
            ref={codeRef}
            class="input code-input num"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            placeholder="••••••"
            aria-label="קוד"
            value={code}
            onInput={(e) => {
              const v = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) verify(v);
            }}
          />
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
            {busy ? "בודק…" : "המשך"}
          </button>
          <button type="button" class="link center" onClick={() => (ctx === "register" ? register() : ctx === "forgot" ? forgot() : login())} disabled={busy}>
            שליחה מחדש
          </button>
        </form>
      )}
      {(mode === "newpw" || mode === "reset") && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), mode === "reset" ? resetByToken() : resetByCode())}>
          <p class="lead">קבעו סיסמה חדשה. שאר המכשירים שמחוברים לחשבון ינותקו.</p>
          <PwField label={`סיסמה חדשה (לפחות ${MIN_PW} תווים)`} value={password} set={setPassword} auto="new-password" show={showPw} toggle={() => setShowPw(!showPw)} />
          <PwField label="שוב, לאימות" value={password2} set={setPassword2} auto="new-password" show={showPw} toggle={() => setShowPw(!showPw)} />
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || !pwOk || password !== password2}>
            <Check size={18} /> {busy ? "שומר…" : "שמירת הסיסמה"}
          </button>
        </form>
      )}
      {mode === "rules" && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), accept())}>
          <label class="field">
            <span>השם שיוצג לאחרים</span>
            <input class="input" maxLength={24} value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <div class="rules">
            <div class="rules-title">
              <Shield size={16} /> כללי הקהילה
            </div>
            <ul>
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
              <li>{PERSONAL}</li>
            </ul>
          </div>
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || name.trim().length < 2}>
            <Check size={18} /> {busy ? "שומר…" : "מסכימ/ה, אפשר להתחיל"}
          </button>
          <p class="fine">
            בלחיצה אתם מאשרים את <a href={API_BASE + "/terms/"} target="_blank" rel="noopener">תנאי השימוש</a>.
          </p>
        </form>
      )}
    </SheetFrame>
  );
}

/** «קביעת סיסמה»: a code-only account before its first campus write (403 `password`), or from «החשבון שלי» */
export function PasswordSheet({ then, reason, change }: { then?: () => void; reason?: string; change?: boolean }) {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (busy || pw.length < MIN_PW || pw !== pw2) return;
    setBusy(true);
    setErr(null);
    try {
      await api.setPassword(pw, change ? current : undefined);
      if (me.value) me.value = { ...me.value, hasPassword: true };
      say(change ? "הסיסמה הוחלפה. שאר המכשירים נותקו." : "הסיסמה נקבעה.");
      sheet.value = null;
      then?.();
    } catch (e: any) {
      setErr(e instanceof ApiError ? e.message : "משהו השתבש. נסו שוב.");
    }
    setBusy(false);
  };
  return (
    <SheetFrame title={change ? "החלפת סיסמה" : "קביעת סיסמה"}>
      <form class="form" onSubmit={(e) => (e.preventDefault(), submit())}>
        <p class="lead">{reason || (change ? "אחרי ההחלפה שאר המכשירים ינותקו." : "ב-AddStudent נכנסים עם סיסמה. קבעו אותה פעם אחת; במכשיר חדש נבקש גם קוד מהמייל.")}</p>
        {change && (
          <label class="field">
            <span>הסיסמה הנוכחית</span>
            <input class="input" type="password" dir="ltr" autoComplete="current-password" value={current} onInput={(e) => setCurrent(e.currentTarget.value)} />
          </label>
        )}
        <label class="field">
          <span>סיסמה חדשה (לפחות {MIN_PW} תווים)</span>
          <input class="input" type="password" dir="ltr" autoComplete="new-password" minLength={MIN_PW} value={pw} onInput={(e) => setPw(e.currentTarget.value)} autoFocus />
        </label>
        <label class="field">
          <span>שוב, לאימות</span>
          <input class="input" type="password" dir="ltr" autoComplete="new-password" value={pw2} onInput={(e) => setPw2(e.currentTarget.value)} />
        </label>
        <div class="st-personal">
          <Shield size={15} />
          <span>{PERSONAL}</span>
        </div>
        {err && <div class="form-err" role="alert">{err}</div>}
        <button class="btn btn-primary btn-block" disabled={busy || pw.length < MIN_PW || pw !== pw2}>
          <Lock size={18} /> {busy ? "שומר…" : change ? "החלפת הסיסמה" : "קביעת הסיסמה"}
        </button>
      </form>
    </SheetFrame>
  );
}

const seen = (d: Device) => {
  if (!d.lastSeen) return "";
  const t = typeof d.lastSeen === "number" ? d.lastSeen : Date.parse(d.lastSeen);
  if (!t) return "";
  return Date.now() - t < 86400_000 * 2 ? ago(t) : date(t);
};

/** «החשבון שלי» on AddStudent: who I am, my student details, the devices, the password, sign-out */
export function AccountSheet({ section }: { section?: "devices" | "password" }) {
  const u = me.value;
  const s = student.value;
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [devErr, setDevErr] = useState<string | null>(null);
  const [pw, setPw] = useState(section === "password");
  const [confirm, setConfirm] = useState(false);
  const load = () => {
    setDevErr(null);
    api
      .devices()
      .then((r) => setDevices(r.devices))
      .catch((e) => (setDevices([]), setDevErr(e?.status === 404 ? "רשימת המכשירים עוד לא זמינה בשרת." : e?.message || "המכשירים לא נטענו.")));
  };
  useEffect(load, []);
  if (!u) return null;
  const drop = async (d: Device) => {
    if (!window.confirm(`לנתק את «${d.name}»?`)) return;
    try {
      await api.removeDevice(d.id);
      setDevices((l) => (l || []).filter((x) => x.id !== d.id));
      say("המכשיר נותק.");
      if (d.current) signOut();
    } catch (e: any) {
      say(e.message, "err");
    }
  };
  if (pw) return <PasswordSheet change={u.hasPassword !== false} then={() => (sheet.value = { type: "account" })} />;
  return (
    <SheetFrame title="החשבון שלי">
      <div class="mm-profile">
        <Avatar id={u.id} name={u.name} size={40} />
        <div>
          <div class="mm-name">{u.name}</div>
          <div class="mm-credits">
            {u.email ? <bdi dir="ltr">{u.email}</bdi> : "מייל לא נשמר עדיין"}
            {!!u.holds && <> · <span class="mm-hold">{u.holds} בבדיקה לאחר בקשת הסרה</span></>}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm mm-student" onClick={() => (sheet.value = { type: "student", then: () => (sheet.value = { type: "account" }) })}>
          <UserI size={14} /> פרטי סטודנט
        </button>
      </div>
      {s && (
        <div class="kv st-acc-student">
          <span>לומד/ת</span>
          <span dir="auto">
            {s.fullName} · {s.faculty.replace(/-/g, " ")} · שנה {s.year} · {s.track}
          </span>
        </div>
      )}
      <section class="st-acc-sec">
        <div class="st-acc-head">
          <h3>מכשירים מחוברים</h3>
          <span class="st-acc-sub">עד שני מכשירים פעילים. כניסה משלישי מנתקת את הישן.</span>
        </div>
        {devices === null && <div class="muted pad">טוען…</div>}
        {devErr && <div class="cp-hint">{devErr}</div>}
        {devices && devices.length > 0 && (
          <ul class="st-devices">
            {devices.map((d) => (
              <li key={d.id} class={`st-device ${d.current ? "cur" : ""}`}>
                <span class="st-device-ic" aria-hidden="true">
                  <Lock size={15} />
                </span>
                <span class="st-device-main">
                  <bdi class="st-device-name">{d.name || "מכשיר"}</bdi>
                  <span class="st-device-sub">
                    {d.current ? "המכשיר הזה" : "מכשיר אחר"}
                    {seen(d) && <> · {seen(d)}</>}
                  </span>
                </span>
                <button class="btn btn-secondary btn-sm" onClick={() => drop(d)}>
                  <X size={13} /> ניתוק
                </button>
              </li>
            ))}
          </ul>
        )}
        {devices && !devices.length && !devErr && <div class="muted pad">אין מכשירים רשומים.</div>}
      </section>
      <section class="st-acc-sec">
        <div class="st-acc-head">
          <h3>סיסמה</h3>
          <span class="st-acc-sub">{u.hasPassword === false ? "עוד לא נקבעה סיסמה לחשבון." : "החלפה מנתקת את שאר המכשירים."}</span>
        </div>
        <button class="btn btn-secondary" onClick={() => setPw(true)}>
          <Lock size={15} /> {u.hasPassword === false ? "קביעת סיסמה" : "החלפת סיסמה"}
        </button>
      </section>
      <div class="st-personal">
        <Shield size={15} />
        <span>{PERSONAL}</span>
      </div>
      <div class="links">
        <a href={API_BASE + "/terms/"} target="_blank" rel="noopener">תנאי שימוש</a>
        <a href={API_BASE + "/privacy/"} target="_blank" rel="noopener">מדיניות פרטיות</a>
        <a href={API_BASE + "/contact/"} target="_blank" rel="noopener">יצירת קשר ובקשת הסרה</a>
      </div>
      <button class="btn btn-secondary btn-block" onClick={signOut}>
        <LogOut size={18} /> התנתקות
      </button>
      {!confirm ? (
        <button class="link danger center" onClick={() => setConfirm(true)}>
          <Trash size={14} /> מחיקת החשבון וכל התוכן שלי
        </button>
      ) : (
        <div class="confirm">
          <p>החשבון, הסיכומים ופרטי הסטודנט יימחקו לצמיתות. אי אפשר לבטל.</p>
          <div class="row">
            <button
              class="btn btn-danger"
              onClick={async () => {
                await api.deleteMe();
                await signOut();
                say("החשבון נמחק.");
              }}
            >
              מחיקה לצמיתות
            </button>
            <button class="btn btn-secondary" onClick={() => setConfirm(false)}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </SheetFrame>
  );
}
