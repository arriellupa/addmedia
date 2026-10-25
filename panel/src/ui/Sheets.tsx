import { useEffect, useRef, useState } from "preact/hooks";
import { API_BASE, ApiError, api, type ChatMsg, type Post, type Product } from "../api";
import { ago, count, date, left, price } from "../fmt";
import { host } from "../host";
import { Ban, Check, Copy, Flag, Heart, ImageI, LogOut, Mail, Pin, Shield, Sparkles, Trash } from "../icons";
import { blockUser, blocked, bundle, me, page, posts, media, report, roomId, say, scope, sheet, signOut, signedIn, toggleLike, unblockUser, uploadImage } from "../state";
import { Avatar, SheetFrame } from "./Bits";
import { mediaUrl } from "./Media";

export function Sheets() {
  const s = sheet.value;
  if (!s) return null;
  if (s.type === "signin") return <SignIn then={s.then} />;
  if (s.type === "menu") return <ItemMenu itemType={s.itemType} item={s.item} />;
  if (s.type === "report") return <ReportSheet itemType={s.itemType} item={s.item} />;
  if (s.type === "viewer") return <Viewer post={s.post} />;
  if (s.type === "mymedia") return <MyMedia section={s.section} pinFor={s.pinFor} />;
  return null;
}

// ---------------- sign in ----------------
export const RULES = [
  "מדברים בכבוד: בלי קללות, הסתה, איומים או השפלה.",
  "לא מפרסמים פרטים אישיים — לא שלכם ולא של אחרים.",
  "בלי תוכן מיני, אלים, או תמונות של אנשים בלי הסכמתם.",
  "בלי ספאם, הונאות או קישורים מטעים.",
  "תוכן שמפר את הכללים מוסר, וחשבון שחוזר על כך מושעה.",
];

function SignIn({ then }: { then?: () => void }) {
  const u = me.value;
  const [step, setStep] = useState<"email" | "code" | "rules">(u && !u.termsAccepted ? "rules" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState(u?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dev, setDev] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e: any) {
      setErr(e instanceof ApiError ? e.message : "משהו השתבש. נסו שוב.");
    }
    setBusy(false);
  };
  const sendCode = () =>
    go(async () => {
      const r = await api.authStart(email.trim());
      if (r.devCode) setDev(r.devCode);
      setStep("code");
    });
  const verify = (c = code) =>
    go(async () => {
      const r = await api.authVerify(email.trim(), c);
      await signedIn(r.token, r.user);
      setName(r.user.name);
      if (r.user.termsAccepted) finish();
      else setStep("rules");
    });
  const accept = () =>
    go(async () => {
      const r = await api.updateMe({ acceptTerms: true, name: name.trim() || undefined });
      me.value = r.user;
      host.haptic("success");
      finish();
    });
  const finish = () => {
    sheet.value = null;
    then?.();
  };

  return (
    <SheetFrame title={step === "rules" ? "עוד צעד אחד" : "התחברו כדי להשתתף"}>
      {step === "email" && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), sendCode())}>
          <p class="lead">קריאה פתוחה לכולם. כדי לכתוב, להגיב או להעלות — מתחברים עם המייל, בלי סיסמה.</p>
          <label class="field">
            <span>מייל</span>
            <input class="input" type="email" dir="ltr" autoComplete="email" required placeholder="name@example.com" value={email} onInput={(e) => setEmail(e.currentTarget.value)} autoFocus />
          </label>
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || !email.includes("@")}>
            <Mail size={18} /> {busy ? "שולח…" : "שלחו לי קוד"}
          </button>
          <p class="fine">נשמור רק גיבוב של כתובת המייל, לצורך התחברות. ראו <a href={API_BASE + "/privacy/"} target="_blank" rel="noopener">מדיניות הפרטיות</a>.</p>
        </form>
      )}
      {step === "code" && (
        <form class="form" onSubmit={(e) => (e.preventDefault(), verify())}>
          <p class="lead">
            שלחנו קוד בן 6 ספרות אל <bdi dir="ltr">{email}</bdi>
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
            {busy ? "בודק…" : "כניסה"}
          </button>
          <button type="button" class="link center" onClick={() => setStep("email")}>
            שינוי כתובת או שליחה מחדש
          </button>
        </form>
      )}
      {step === "rules" && (
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
            </ul>
          </div>
          {err && <div class="form-err" role="alert">{err}</div>}
          <button class="btn btn-primary btn-block" disabled={busy || name.trim().length < 2}>
            <Check size={18} /> {busy ? "שומר…" : "מסכימ/ה, אפשר להתחיל"}
          </button>
          <p class="fine">
            בלחיצה אתם מאשרים את <a href={API_BASE + "/terms/"} target="_blank" rel="noopener">תנאי השימוש</a>. AddMedia אינה קשורה לאתרים שלצידם היא מוצגת.
          </p>
        </form>
      )}
    </SheetFrame>
  );
}

// ---------------- item menu & report ----------------
function ItemMenu({ itemType, item }: { itemType: "post" | "chat"; item: Post | ChatMsg }) {
  const mine = item.uid === me.value?.id;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.body);
      say("הועתק.");
    } catch {}
    sheet.value = null;
  };
  return (
    <SheetFrame title="פעולות">
      <div class="menu-preview">
        <bdi class="msg-name">{item.name}</bdi>
        <div dir="auto">{item.body}</div>
      </div>
      <div class="menu">
        <button class="menu-item" onClick={copy}>
          <Copy /> העתקה
        </button>
        {mine && itemType === "post" && (
          <>
            <button class="menu-item" onClick={() => (sheet.value = { type: "mymedia", section: "store", pinFor: item as Post })}>
              <Pin /> הצמדה לתקופה ארוכה
            </button>
            <button
              class="menu-item danger"
              onClick={async () => {
                try {
                  await api.deletePost(roomId.value, item.id);
                  posts.value = posts.value.filter((p) => p.id !== item.id);
                  media.value = media.value.filter((p) => p.id !== item.id);
                  sheet.value = null;
                  say("נמחק.");
                } catch (e: any) {
                  say(e.message, "err");
                }
              }}
            >
              <Trash /> מחיקה
            </button>
          </>
        )}
        {!mine && (
          <>
            <button class="menu-item danger" onClick={() => (sheet.value = { type: "report", itemType, item })}>
              <Flag /> דיווח
            </button>
            <button class="menu-item danger" onClick={() => blockUser(item.uid, item.name)}>
              <Ban /> חסימת <bdi>{item.name}</bdi>
            </button>
          </>
        )}
      </div>
    </SheetFrame>
  );
}

const REASONS: [string, string][] = [
  ["spam", "ספאם או פרסום"],
  ["harassment", "הטרדה או בריונות"],
  ["hate", "שנאה או הסתה"],
  ["violence", "אלימות או איומים"],
  ["sexual", "תוכן מיני"],
  ["intimate", "תמונה אינטימית בלי הסכמה"],
  ["minor", "פגיעה בקטינים"],
  ["privacy", "חשיפת פרטים אישיים"],
  ["copyright", "הפרת זכויות יוצרים"],
  ["other", "אחר"],
];

function ReportSheet({ itemType, item }: { itemType: "post" | "chat"; item: Post | ChatMsg }) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <SheetFrame title="דיווח על תוכן" onBack={() => (sheet.value = { type: "menu", itemType, item })}>
      <p class="lead">מה הבעיה? הדיווח אנונימי למפרסם.</p>
      <div class="reasons" role="radiogroup">
        {REASONS.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={reason === id} class={`reason ${reason === id ? "on" : ""}`} onClick={() => setReason(id)}>
            {label}
            {reason === id && <Check size={16} />}
          </button>
        ))}
      </div>
      {reason && (
        <label class="field">
          <span>פרטים נוספים (לא חובה)</span>
          <textarea class="input" rows={2} maxLength={500} dir="auto" value={details} onInput={(e) => setDetails(e.currentTarget.value)} />
        </label>
      )}
      <button
        class="btn btn-danger btn-block"
        disabled={!reason || busy}
        onClick={async () => {
          setBusy(true);
          await report(itemType, item, reason!, details);
          setBusy(false);
        }}
      >
        <Flag size={18} /> שליחת דיווח
      </button>
      <p class="fine">{reason === "intimate" || reason === "minor" ? "דיווח כזה מטופל בעדיפות עליונה, תוך 48 שעות לכל היותר." : "אנחנו בודקים כל דיווח תוך 24 שעות."}</p>
    </SheetFrame>
  );
}

// ---------------- viewer ----------------
function Viewer({ post }: { post: Post }) {
  const p = media.value.find((x) => x.id === post.id) || post;
  return (
    <SheetFrame title={p.body || "תמונה"} wide>
      <figure class="viewer">
        <img src={mediaUrl(p.media!)} alt={p.body || ""} />
        <figcaption class="viewer-meta">
          <Avatar id={p.uid} name={p.name} size={28} />
          <div class="viewer-text">
            <bdi class="cb-name">{p.name}</bdi>
            <span class="cb-time">{ago(p.ts)}</span>
            {p.body && <div dir="auto">{p.body}</div>}
          </div>
          <button class={`act ${p.liked ? "liked" : ""}`} onClick={() => toggleLike(p)} aria-pressed={p.liked} aria-label="לייק">
            <Heart size={18} fill={p.liked} /> {p.likes > 0 && <span class="num">{count(p.likes)}</span>}
          </button>
          <button class="act" aria-label="פעולות" onClick={() => (sheet.value = { type: "menu", itemType: "post", item: p })}>
            <Flag size={18} />
          </button>
        </figcaption>
      </figure>
    </SheetFrame>
  );
}

// ---------------- my media ----------------
type Section = "create" | "items" | "store" | "safety";

function MyMedia({ section = "create", pinFor }: { section?: Section; pinFor?: Post }) {
  const [sec, setSec] = useState<Section>(pinFor ? "store" : section);
  const u = me.value;
  if (!u) return null;
  return (
    <SheetFrame title="המדיה שלי" wide>
      <div class="mm-profile">
        <Avatar id={u.id} name={u.name} size={40} />
        <div>
          <div class="mm-name">{u.name}</div>
          <div class="mm-credits">
            <span class="num">{u.credits.media}</span> העלאות זמינות
          </div>
        </div>
      </div>
      <div class="seg seg-wide" role="tablist">
        {(
          [
            ["create", "יצירה"],
            ["items", "הפריטים שלי"],
            ["store", "רכישות"],
            ["safety", "בטיחות"],
          ] as [Section, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={sec === id} class={sec === id ? "on" : ""} onClick={() => setSec(id)}>
            {label}
          </button>
        ))}
      </div>
      {sec === "create" && <Create goStore={() => setSec("store")} />}
      {sec === "items" && <Items onPin={(p) => (sheet.value = { type: "mymedia", section: "store", pinFor: p })} />}
      {sec === "store" && <Store pinFor={pinFor} />}
      {sec === "safety" && <Safety />}
    </SheetFrame>
  );
}

function Create({ goStore }: { goStore: () => void }) {
  const u = me.value!;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(f.type)) return say("אפשר להעלות תמונות בלבד (JPEG, PNG, WebP).", "err");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const b = bundle.value;
  return (
    <div class="create">
      <div class="target">
        מתפרסם ב: <strong>{scope.value === "page" ? page.value?.title || b?.page.display : `כל ${b?.page.site}`}</strong>
      </div>
      {!preview ? (
        <button class="drop" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), pick(e.dataTransfer?.files?.[0]))}>
          <ImageI size={28} />
          <span class="drop-title">בחירת תמונה</span>
          <span class="drop-sub">JPEG, PNG או WebP · נדחסת אוטומטית במכשיר שלכם</span>
        </button>
      ) : (
        <div class="preview-card">
          <img src={preview} alt="" />
          <button class="link" onClick={() => (setFile(null), setPreview(null))}>
            החלפה
          </button>
        </div>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.currentTarget.files?.[0])} />
      {preview && (
        <label class="field">
          <span>כיתוב (לא חובה)</span>
          <input class="input" dir="auto" maxLength={300} value={caption} onInput={(e) => setCaption(e.currentTarget.value)} placeholder="מה רואים בתמונה?" />
        </label>
      )}
      <div class="summary">
        <span>פרסום ל-7 ימים</span>
        <span>{u.credits.media > 0 ? <>מנכה העלאה אחת מתוך <span class="num">{u.credits.media}</span></> : "צריך חבילת העלאות"}</span>
      </div>
      {u.credits.media > 0 ? (
        <button
          class="btn btn-primary btn-block"
          disabled={!file || busy}
          onClick={async () => {
            setBusy(true);
            if (await uploadImage(file!, caption)) sheet.value = null;
            setBusy(false);
          }}
        >
          {busy ? "מעלה…" : "פרסום התמונה"}
        </button>
      ) : (
        <button class="btn btn-primary btn-block" onClick={goStore}>
          לרכישת חבילה · מ-9.90 ₪
        </button>
      )}
      <p class="fine">כל תמונה עוברת בדיקה אוטומטית לפני הפרסום. תמונה שלא אושרה — ההעלאה חוזרת אליכם.</p>
    </div>
  );
}

function Items({ onPin }: { onPin: (p: Post) => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => {
    api.me().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  if (!items) return <div class="muted pad">טוען…</div>;
  if (!items.length) return <div class="muted pad">עוד לא פרסמתם כלום. כל מה שתפרסמו יופיע כאן, עם הזמן שנותר לו.</div>;
  const here = new Map([...posts.value, ...media.value].map((p) => [p.id, p]));
  return (
    <div class="items">
      {items.map((it) => {
        const p = here.get(it.item_id);
        const expired = it.expires_at <= Date.now();
        return (
          <div class={`item ${expired ? "expired" : ""}`} key={it.item_id}>
            <span class="item-kind">{it.kind === "image" ? <ImageI size={16} /> : "Aa"}</span>
            <div class="item-main">
              <div class="item-text" dir="auto">
                {p ? p.body || "תמונה" : it.kind === "image" ? "תמונה" : "תגובה"}
              </div>
              <div class="item-sub">
                {ago(it.created_at)} · {expired ? "פג תוקף" : left(it.expires_at)}
                {p?.pinned && <span class="badge badge-pin">נעוץ</span>}
              </div>
            </div>
            {p && !expired && it.room_id === roomId.value && (
              <button class="btn btn-secondary btn-sm" onClick={() => onPin(p)}>
                <Pin size={14} /> הצמדה
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Store({ pinFor }: { pinFor?: Post }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [test, setTest] = useState(false);
  const [pick, setPick] = useState<string>(pinFor ? "pin90" : "media20");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.products().then((r) => {
      setProducts(r.products);
      setTest(r.testMode);
    });
  }, []);
  const list = products.filter((p) => (pinFor ? p.kind === "pin" : p.kind === "media"));
  const sel = products.find((p) => p.id === pick);
  const buy = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await api.checkout(sel.id, pinFor ? { roomId: roomId.value, postId: pinFor.id } : undefined);
      host.haptic("success");
      if (sel.kind === "media") {
        me.value = { ...me.value!, credits: { ...me.value!.credits, media: r.credits } };
        say(`נוספו ${sel.qty} העלאות לחשבון.`);
      } else {
        posts.value = posts.value.map((p) => (p.id === r.post.id ? { ...p, ...r.post, liked: p.liked } : p));
        media.value = media.value.map((p) => (p.id === r.post.id ? { ...p, ...r.post, liked: p.liked } : p));
        say(`הפריט נעוץ עד ${date(r.post.expiresAt)}.`);
        sheet.value = null;
      }
    } catch (e: any) {
      say(e.message, "err");
    }
    setBusy(false);
  };
  return (
    <div class="store">
      {test && <div class="test-banner">מצב בדיקה — לא מתבצע חיוב אמיתי</div>}
      {pinFor && (
        <div class="pin-target" dir="auto">
          <Pin size={14} /> הצמדת: {pinFor.body || "תמונה"}
        </div>
      )}
      <div class={`plans ${list.length === 3 ? "plans-3" : ""}`} role="radiogroup">
        {list.map((p) => {
          const perDay = p.days ? p.price / p.days : null;
          return (
            <button key={p.id} role="radio" aria-checked={pick === p.id} class={`plan ${pick === p.id ? "on" : ""}`} onClick={() => setPick(p.id)}>
              {p.best && <span class="plan-best">הכי משתלם</span>}
              <span class="plan-big">{p.days ?? p.qty}</span>
              <span class="plan-unit">{p.days ? "ימים" : "העלאות"}</span>
              <span class="plan-price">{price(p.price)}</span>
              {perDay && <span class="plan-sub">{price(Math.round(perDay))} ליום</span>}
              {p.days && <span class="plan-sub">עד {date(Date.now() + p.days * 864e5)}</span>}
              {pick === p.id && (
                <span class="plan-check">
                  <Check size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {pinFor && <p class="fine">ההצמדה נשארת כל עוד הדף קיים. אם הדף יורד ונותרו יותר מ-7 ימים — מקבלים החזר יחסי.</p>}
      <button class="btn btn-primary btn-block btn-lg" disabled={!sel || busy} onClick={buy}>
        {busy ? "מעבד…" : sel ? `לתשלום ${price(sel.price)}` : "בחרו מסלול"}
      </button>
      <p class="fine center">כולל מע״מ · תשלום חד-פעמי, ללא חידוש אוטומטי</p>
      {!pinFor && (
        <p class="fine center">
          <Sparkles size={13} /> רוצים להצמיד פריט? פתחו אותו ב"הפריטים שלי".
        </p>
      )}
    </div>
  );
}

function Safety() {
  const u = me.value!;
  const [name, setName] = useState(u.name);
  const [confirm, setConfirm] = useState(false);
  const saveName = async () => {
    try {
      const r = await api.updateMe({ name: name.trim() });
      me.value = r.user;
      say("השם עודכן.");
    } catch (e: any) {
      say(e.message, "err");
    }
  };
  return (
    <div class="safety">
      <label class="field">
        <span>השם שלך</span>
        <div class="row">
          <input class="input" maxLength={24} value={name} onInput={(e) => setName(e.currentTarget.value)} />
          <button class="btn btn-secondary btn-sm" disabled={name.trim() === u.name || name.trim().length < 2} onClick={saveName}>
            שמירה
          </button>
        </div>
      </label>
      <div class="kv">
        <span>משתמשים חסומים</span>
        <span>
          <span class="num">{blocked.value.size}</span>
          {blocked.value.size > 0 && (
            <button class="link" onClick={() => [...blocked.value].forEach((id) => unblockUser(id))}>
              ביטול כל החסימות
            </button>
          )}
        </span>
      </div>
      <div class="links">
        <a href={API_BASE + "/rules/"} target="_blank" rel="noopener">כללי הקהילה</a>
        <a href={API_BASE + "/terms/"} target="_blank" rel="noopener">תנאי שימוש</a>
        <a href={API_BASE + "/privacy/"} target="_blank" rel="noopener">מדיניות פרטיות</a>
        <a href={API_BASE + "/accessibility/"} target="_blank" rel="noopener">הצהרת נגישות</a>
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
          <p>החשבון וכל מה שפרסמתם יימחקו לצמיתות. אי אפשר לבטל.</p>
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
    </div>
  );
}
