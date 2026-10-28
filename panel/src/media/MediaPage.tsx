// The media page (/media/): AddMedia as a place of its own — "מרכז הבקרה". Who is online (right), the center window
// (the operator's ad, or the room's card), the live chat (left), the talkbacks (center), the readers' media strip
// (bottom). A tap on the cap turns it into the campus: institution › faculty › year › course, with articles and summaries.
import { useEffect, useRef, useState } from "preact/hooks";
import { API_BASE, CampusDoc, CenterAd as CenterAdT, Post } from "../api";
import { ago, count, date } from "../fmt";
import { Book, Cap, Chevron, External, FileI, Globe, Grid, ImageI, LinkI, Plus, Radar, Refresh, Star, Trash, Upload, X } from "../icons";
import { bundle, canPost, load, loadError, loading, me, needAuth, page, presence, scope, setScope, sheet, status, uploadImage, visibleMedia } from "../state";
import { Avatar, LiveDot, Sponsored, Toast } from "../ui/Bits";
import { ChatView } from "../ui/Chat";
import { CommentsView } from "../ui/Comments";
import { GoBar } from "../ui/GoBar";
import { Sheets } from "../ui/Sheets";
import {
  YEAR_HE, currentPath, directory, docs, docsBusy, followed, follows, instName, joinRoom, loadDirectory, loadTree, mode, openPlace, openDocRoom, picker, place, placeTitle,
  removeDoc, slug, toggleFollow, toggleMode, tree, unslug, uploadDoc,
} from "./state";

const mediaUrl = (path: string) => API_BASE + path;

export function MediaPage() {
  const campus = mode.value === "campus";
  const [upload, setUpload] = useState(false);
  useEffect(() => {
    loadDirectory();
    const t = setInterval(loadDirectory, 20_000);
    const t2 = setTimeout(loadDirectory, 4_000); // once our own presence has been reported
    return () => (clearInterval(t), clearTimeout(t2));
  }, [mode.value, bundle.value?.roomId]);
  return (
    <div class={`app layout-web mc mode-${mode.value}`}>
      <Top />
      <div class="mc-grid">
        <aside class="pane t-radar">{campus ? <DocsTile /> : <RadarTile />}</aside>
        <section class="pane t-center">{campus ? <PlaceTile /> : <CenterTile />}</section>
        <section class="pane t-chat">
          <TileHead live={presence.value > 1} title="שיחה חיה" n={presence.value} />
          <div class="pane-views">{bundle.value && !bundle.value.disabled ? <ChatView /> : <TileEmpty />}</div>
        </section>
        <section class="pane t-talk">
          <TileHead title="טוקבקים" n={bundle.value?.room.postCount} />
          <div class="pane-views">{bundle.value && !bundle.value.disabled ? <CommentsView /> : <TileEmpty />}</div>
        </section>
        <section class="pane t-media">
          <MediaStrip onAdd={() => needAuth(() => setUpload(true))} />
        </section>
        {campus && (
          <aside class="pane t-radar2">
            <RadarTile />
          </aside>
        )}
      </div>
      {upload && <UploadDialog onClose={() => setUpload(false)} />}
      {picker.value && <Picker />}
      <Sheets />
      <Toast />
    </div>
  );
}

function Top() {
  const u = me.value;
  const campus = mode.value === "campus";
  const [showFollows, setShowFollows] = useState(false);
  const openMine = () => (sheet.value = u ? { type: "mymedia" } : { type: "signin", then: () => (sheet.value = { type: "mymedia" }) });
  const c = currentPath.value;
  return (
    <header class="mc-top">
      <a class="mc-brand" href="/media/">
        AddMedia
        <span class="mc-brand-sub">{campus ? "קמפוס" : "מרכז הבקרה"}</span>
      </a>
      {!campus && (
        <div class="mc-go">
          <GoBar compact />
        </div>
      )}
      {campus && (
        <button class="mc-crumb" onClick={() => (picker.value = true)} title="בחירת פקולטה">
          <Cap size={16} /> {place.value ? placeTitle(place.value) : "בחרו מוסד, פקולטה ושנה"} <Chevron size={14} />
        </button>
      )}
      <div class="mc-actions">
        {c && (
          <button class={`icon-btn mc-star ${followed.value ? "on" : ""}`} aria-pressed={followed.value} title={followed.value ? "במעקב · לחיצה מסירה" : "מעקב קבוע: הדף הזה תמיד זמין"} onClick={() => needAuth(toggleFollow)}>
            <Star size={18} fill={followed.value} />
          </button>
        )}
        <div class="mc-follows-wrap">
          <button class="icon-btn" title="הדפים שבמעקב" aria-expanded={showFollows} onClick={() => needAuth(() => setShowFollows((v) => !v))}>
            <Book size={18} />
          </button>
          {showFollows && <FollowsMenu onClose={() => setShowFollows(false)} />}
        </div>
        <button class={`mc-mode ${campus ? "on" : ""}`} onClick={toggleMode} title={campus ? "חזרה למרכז הבקרה" : "לגרסת הסטודנטים"}>
          {campus ? <Grid size={16} /> : <Cap size={16} />}
          <span>{campus ? "מרכז הבקרה" : "סטודנטים"}</span>
        </button>
        <button class={`me-btn ${u ? "" : "out"}`} onClick={openMine}>
          {u && <Avatar id={u.id} name={u.name} size={24} />}
          {u ? u.name : "כניסה"}
        </button>
      </div>
      {(status.value === "reconnecting" || status.value === "offline") && <div class="mc-conn">{status.value === "offline" ? "אין חיבור" : "מתחבר מחדש…"}</div>}
    </header>
  );
}

function FollowsMenu({ onClose }: { onClose: () => void }) {
  const list = follows.value;
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <div class="mc-menu" role="menu">
      <div class="mc-menu-title">במעקב</div>
      {!list.length && <div class="mc-menu-empty">עוד אין דפים במעקב. הכוכב ליד הכותרת שומר פקולטה, קורס או אתר — והם מחכים כאן תמיד.</div>}
      {list.map((f) => (
        <a key={f.path} class="mc-menu-item" href={f.path} role="menuitem" onClick={onClose}>
          {f.path.startsWith("/media/campus/") ? <Cap size={14} /> : <Globe size={14} />}
          <span dir="auto">{f.title}</span>
        </a>
      ))}
    </div>
  );
}

function TileHead({ title, n, live, right }: { title: string; n?: number; live?: boolean; right?: any }) {
  return (
    <div class="pane-head">
      {live && <LiveDot pulse />}
      <span class="pane-title">{title}</span>
      {!!n && <span class="pane-n num">{count(n)}</span>}
      <span class="pane-sp" />
      {right}
    </div>
  );
}

function TileEmpty() {
  const b = bundle.value;
  if (b?.disabled) return <div class="pane-empty">הפאנל כבוי בדף הזה.</div>;
  if (loadError.value) return (
    <div class="pane-empty">
      {loadError.value}
      <button class="btn btn-secondary btn-sm" onClick={() => load()}>
        <Refresh size={14} /> נסו שוב
      </button>
    </div>
  );
  if (loading.value && page.value) return <div class="pane-empty">טוען…</div>;
  return <div class="pane-empty">{mode.value === "campus" ? "בחרו פקולטה — והחדר נפתח." : "הקלידו כתובת או חפשו — והחדר נפתח."}</div>;
}

// ---------- who is online ----------
function RadarTile() {
  const d = directory.value;
  const campus = mode.value === "campus";
  const cur = bundle.value?.roomId;
  const threshold = bundle.value?.settings?.pageThreshold ?? 5;
  return (
    <>
      <TileHead title={campus ? "מי לומד עכשיו" : "מי מחובר עכשיו"} right={<Radar size={16} class="muted" />} />
      <div class="radar-total num">{d ? count(d.total) : "…"}</div>
      <div class="radar-list">
        {d && !d.sites.length && <div class="pane-empty">שקט כרגע. {campus ? "פתחו פקולטה — ותהיו הראשונים." : "פתחו אתר — ותהיו הראשונים."}</div>}
        {d?.sites.map((s) => (
          <div class="radar-site" key={s.site}>
            <div class="radar-site-head">
              <bdi dir={campus ? "auto" : "ltr"} class="radar-site-name">
                {campus ? instName(s.site.replace(/^campus\./, "")) : s.site}
              </bdi>
              <span class="radar-site-n num">{count(s.n)}</span>
            </div>
            {s.rooms.slice(0, 6).map((r) => (
              <button key={r.roomId} class={`radar-room ${r.roomId === cur ? "on" : ""}`} onClick={() => joinRoom(r)} title={r.url}>
                <span class="radar-room-ic">{r.kind === "site" ? <Globe size={13} /> : <FileI size={13} />}</span>
                <span class="radar-room-t" dir="auto">
                  {r.title || r.url?.replace(/^https?:\/\/(www\.)?/, "") || "חדר"}
                </span>
                <span class="radar-room-n num">{r.n}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {!campus && <div class="pane-foot">לחיצה על אתר מצטרפת לחדר שלו. דף נפתח על החדר של עצמו מ-{threshold} קוראים.</div>}
    </>
  );
}

// ---------- the center window: the operator's ad, or the room's card ----------
function CenterTile() {
  const b = bundle.value;
  const ad = b?.settings?.centerAd;
  const p = page.value;
  if (!p)
    return (
      <div class="center-welcome">
        <div class="cw-title">כל דף באינטרנט הוא חדר</div>
        <div class="cw-sub">הקלידו כתובת או חפשו בגוגל. דף שקט נפתח על «כל האתר», שם האנשים; מימין רואים איפה כולם עכשיו.</div>
        <div class="cw-go">
          <GoBar autoFocus />
        </div>
      </div>
    );
  return (
    <>
      <RoomCard />
      {ad && ad.modes.includes("center") ? <CenterAd ad={ad} /> : b?.ads.top ? <Sponsored ad={b.ads.top} /> : null}
    </>
  );
}

function RoomCard() {
  const p = page.value!;
  const b = bundle.value;
  const title = p.title || b?.page.display || p.url;
  return (
    <div class="room-card">
      <div class="room-id">
        <span class="fav-frame" aria-hidden="true">
          <Globe size={16} />
        </span>
        <div class="page-text">
          <div class="page-title" dir="auto" title={title}>
            {title}
          </div>
          {b && (
            <bdi class="page-domain" dir="ltr">
              {b.page.host}
            </bdi>
          )}
        </div>
        {mode.value === "center" && (
          <a class="icon-btn" href={p.url} target="_blank" rel="noopener" title="פתיחת הדף">
            <External />
          </a>
        )}
      </div>
      {b && !b.disabled && (
        <div class="scope" role="tablist" aria-label="היקף השיחה">
          <button role="tab" aria-selected={scope.value === "page"} class={scope.value === "page" ? "on" : ""} onClick={() => setScope("page")}>
            <FileI size={15} /> {mode.value === "campus" ? "השיעור" : "הדף הזה"}
          </button>
          <button role="tab" aria-selected={scope.value === "site"} class={scope.value === "site" ? "on" : ""} onClick={() => setScope("site")}>
            <Globe size={15} /> {mode.value === "campus" ? "כל השנה" : <>כל <bdi dir="ltr">{b.page.site}</bdi></>}
            {scope.value === "page" && b.other.presence > 0 && (
              <span class="scope-n num">
                <LiveDot /> {count(b.other.presence)}
              </span>
            )}
          </button>
        </div>
      )}
      {b && (
        <div class="room-stats">
          <span>
            <b class="num">{count(presence.value)}</b> כאן עכשיו
          </span>
          <span>
            <b class="num">{count(b.room.postCount)}</b> טוקבקים
          </span>
          <span>
            <b class="num">{count(b.room.mediaCount)}</b> תמונות
          </span>
        </div>
      )}
    </div>
  );
}

function CenterAd({ ad }: { ad: CenterAdT }) {
  const inner = (
    <>
      {ad.image && <img class="cad-img" src={ad.image} alt="" loading="lazy" />}
      <div class="cad-text">
        <span class="cad-label">{ad.label}</span>
        <div class="cad-title" dir="auto">
          {ad.title}
        </div>
        {ad.body && (
          <div class="cad-body" dir="auto">
            {ad.body}
          </div>
        )}
      </div>
    </>
  );
  return ad.url ? (
    <a class="cad" href={ad.url} target="_blank" rel="noopener sponsored">
      {inner}
    </a>
  ) : (
    <div class="cad">{inner}</div>
  );
}

// ---------- campus: the place, its documents ----------
function PlaceTile() {
  const pl = place.value;
  const b = bundle.value;
  const ad = b?.settings?.centerAd;
  if (!pl)
    return (
      <div class="center-welcome">
        <div class="cw-title">הקמפוס</div>
        <div class="cw-sub">סטודנטים נפגשים סביב מאמר או קורס, לפי מוסד, פקולטה ושנה. בחרו את הפקולטה שלכם — ושמרו אותה בכוכב, כדי שתחכה לכם תמיד.</div>
        <button class="btn btn-primary" onClick={() => (picker.value = true)}>
          <Cap size={16} /> בחירת פקולטה
        </button>
      </div>
    );
  return (
    <>
      <div class="room-card">
        <div class="crumbs">
          <span>{instName(pl.inst)}</span>
          <Chevron size={12} class="crumb-sep" />
          <span>{unslug(pl.faculty)}</span>
          <Chevron size={12} class="crumb-sep" />
          <button class="crumb-btn" onClick={() => pl.course && openPlace({ inst: pl.inst, faculty: pl.faculty, year: pl.year })}>
            שנה {YEAR_HE[pl.year]}
          </button>
          {pl.course && (
            <>
              <Chevron size={12} class="crumb-sep" />
              <b>{unslug(pl.course)}</b>
            </>
          )}
        </div>
        <CourseEntry />
        {b && !b.disabled && pl.course && (
          <div class="scope" role="tablist" aria-label="היקף השיחה">
            <button role="tab" aria-selected={scope.value === "page"} class={scope.value === "page" ? "on" : ""} onClick={() => setScope("page")}>
              <Book size={15} /> השיעור
            </button>
            <button role="tab" aria-selected={scope.value === "site"} class={scope.value === "site" ? "on" : ""} onClick={() => setScope("site")}>
              <Cap size={15} /> כל שנה {YEAR_HE[pl.year]}
              {scope.value === "page" && b.other.presence > 0 && (
                <span class="scope-n num">
                  <LiveDot /> {count(b.other.presence)}
                </span>
              )}
            </button>
          </div>
        )}
        {b && (
          <div class="room-stats">
            <span>
              <b class="num">{count(presence.value)}</b> כאן עכשיו
            </span>
            <span>
              <b class="num">{count(b.room.postCount)}</b> טוקבקים
            </span>
            <span>
              <b class="num">{count(docs.value.length)}</b> מסמכים
            </span>
          </div>
        )}
      </div>
      {ad && ad.modes.includes("campus") && <CenterAd ad={ad} />}
    </>
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
  return (
    <div class="course-entry">
      <input class="input" dir="auto" value={v} placeholder={pl.course ? "נושא שיעור או קורס אחר…" : "נושא השיעור או הקורס (למשל: דיני חוזים) — וחדר נפתח"} maxLength={60} onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <button class="btn btn-secondary btn-sm" onClick={go} disabled={slug(v).length < 2}>
        פתיחה
      </button>
    </div>
  );
}

function DocsTile() {
  const pl = place.value;
  const [kind, setKind] = useState<"all" | "article" | "summary">("all");
  const [up, setUp] = useState<"article" | "summary" | null>(null);
  const list = docs.value.filter((d) => kind === "all" || d.kind === kind);
  return (
    <>
      <TileHead title="מאמרים וסיכומים" n={docs.value.length} right={<Book size={16} class="muted" />} />
      {!pl ? (
        <div class="pane-empty">כאן יהיו המאמרים וסיכומי השיעור של הפקולטה והקורס.</div>
      ) : (
        <>
          <div class="seg seg-sm" role="tablist">
            {(["all", "article", "summary"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} class={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {k === "all" ? "הכול" : k === "article" ? "מאמרים" : "סיכומים"}
              </button>
            ))}
          </div>
          <div class="docs-list">
            {docsBusy.value && !list.length && <div class="pane-empty">טוען…</div>}
            {!docsBusy.value && !list.length && <div class="pane-empty">עוד אין כאן {kind === "summary" ? "סיכומים" : kind === "article" ? "מאמרים" : "מסמכים"}. הראשון שלכם?</div>}
            {list.map((d) => (
              <DocRow key={d.id} d={d} />
            ))}
          </div>
          <div class="docs-actions">
            <button class="btn btn-secondary btn-sm" onClick={() => needAuth(() => setUp("article"))}>
              <Upload size={14} /> מאמר
            </button>
            <button class="btn btn-secondary btn-sm" onClick={() => needAuth(() => setUp("summary"))}>
              <Upload size={14} /> סיכום שיעור
            </button>
          </div>
        </>
      )}
      {up && <DocUpload kind={up} onClose={() => setUp(null)} />}
    </>
  );
}

function DocRow({ d }: { d: CampusDoc }) {
  const mine = me.value?.id === d.uid;
  return (
    <div class="doc">
      <span class={`doc-kind ${d.kind}`}>{d.kind === "article" ? "מאמר" : "סיכום"}</span>
      <div class="doc-main">
        <a class="doc-title" dir="auto" href={mediaUrl(d.file)} target="_blank" rel="noopener" title="פתיחת ה-PDF">
          {d.title}
        </a>
        <div class="doc-sub">
          {d.name} · {date(d.ts)} · {Math.max(1, Math.round(d.size / 1024))}KB{d.place.course ? ` · ${unslug(d.place.course)}` : ""}
        </div>
      </div>
      <button class="icon-btn sm" title="לדיון על המסמך" onClick={() => openDocRoom(d)}>
        <Radar size={14} />
      </button>
      {mine && (
        <button class="icon-btn sm" title="מחיקה" onClick={() => confirm("למחוק את המסמך?") && removeDoc(d.id)}>
          <Trash size={14} />
        </button>
      )}
    </div>
  );
}

function DocUpload({ kind, onClose }: { kind: "article" | "summary"; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pl = place.value!;
  return (
    <Dialog title={kind === "article" ? "העלאת מאמר" : "העלאת סיכום שיעור"} onClose={onClose}>
      <div class="target">
        ל: <strong>{placeTitle(pl)}</strong>
      </div>
      <label class="field">
        <span>כותרת</span>
        <input class="input" dir="auto" maxLength={160} value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={kind === "article" ? "שם המאמר והמחבר" : "שם הקורס, השיעור והתאריך"} />
      </label>
      <button class="drop" onClick={() => input.current?.click()}>
        <FileI size={26} />
        <span class="drop-title">{file ? file.name : "בחירת קובץ PDF"}</span>
        <span class="drop-sub">עד 15MB</span>
      </button>
      <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.currentTarget.files?.[0] || null)} />
      <button
        class="btn btn-primary btn-block"
        disabled={!file || title.trim().length < 3 || busy}
        onClick={async () => {
          setBusy(true);
          if (await uploadDoc(kind, title.trim(), file!)) onClose();
          setBusy(false);
        }}
      >
        {busy ? "מעלה…" : "העלאה"}
      </button>
      <p class="fine">העלו רק חומר שמותר לכם לשתף: סיכומים שכתבתם, ומאמרים שפורסמו בגישה פתוחה או ברשות המחבר.</p>
    </Dialog>
  );
}

// ---------- the media strip ----------
function MediaStrip({ onAdd }: { onAdd: () => void }) {
  const items = visibleMedia.value;
  const s = bundle.value?.settings;
  const u = me.value;
  const price = u && u.credits.media > 0 ? `נותרו ${u.credits.media}` : s && s.freeMedia > 0 ? `${s.freeMedia === 1 ? "הראשונה" : `${s.freeMedia} ראשונות`} חינם` : "מ-9.90 ₪";
  return (
    <>
      <div class="strip-head">
        <span class="pane-title">מדיה מהקוראים</span>
        <span class="strip-sub">{s ? `${s.retentionDays} ימים באוויר` : ""}</span>
        {canPost.value && (
          <button class="btn btn-secondary btn-sm" onClick={onAdd}>
            <Plus size={14} /> תמונה <span class="muted">· {price}</span>
          </button>
        )}
      </div>
      <div class="strip">
        {!items.length && <div class="pane-empty">עוד אין כאן תמונות. תמונה מהשטח, צילום מסך או גרף — וכולם רואים אותה.</div>}
        {items.map((p) => (
          <StripItem key={p.id} p={p} />
        ))}
      </div>
    </>
  );
}

function StripItem({ p }: { p: Post }) {
  const open = () => (sheet.value = { type: "viewer", post: p });
  let host = "";
  try {
    host = p.link ? new URL(p.link).host.replace(/^www\./, "") : "";
  } catch {}
  return (
    <figure class={`strip-item ${p.pinned ? "pinned" : ""}`}>
      <button class="strip-img" onClick={open} aria-label={p.body || `תמונה מאת ${p.name}`}>
        <img src={mediaUrl(p.media!)} alt={p.body || ""} loading="lazy" decoding="async" />
      </button>
      {p.link && (
        <a class="strip-link" href={p.link} target="_blank" rel="noopener nofollow" title={p.link}>
          <LinkI size={12} /> <bdi dir="ltr">{host}</bdi>
        </a>
      )}
      <figcaption dir="auto">{p.body || p.name}</figcaption>
    </figure>
  );
}

function UploadDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isLink, setIsLink] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const s = bundle.value?.settings;
  const u = me.value!;
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const pick = (f: File | undefined) => {
    if (!f || !/^image\//.test(f.type)) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const linkOk = !isLink || /^https?:\/\/\S+\.\S+/.test(link.trim());
  return (
    <Dialog title="תמונה לרצועה" onClose={onClose}>
      {!preview ? (
        <button class="drop" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), pick(e.dataTransfer?.files?.[0]))}>
          <ImageI size={28} />
          <span class="drop-title">בחירת תמונה</span>
          <span class="drop-sub">JPEG, PNG או WebP · נדחסת במכשיר שלכם</span>
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
      <label class="field">
        <span>כיתוב (לא חובה)</span>
        <input class="input" dir="auto" maxLength={300} value={caption} onInput={(e) => setCaption(e.currentTarget.value)} placeholder="מה רואים בתמונה?" />
      </label>
      {s?.linkMedia !== false && (
        <label class="switch-row">
          <input type="checkbox" checked={isLink} onChange={(e) => setIsLink(e.currentTarget.checked)} />
          <span>
            <b>הפוך לקישור חי</b>
            <small>לחיצה על התמונה פותחת כתובת שתבחרו</small>
          </span>
        </label>
      )}
      {isLink && <input class="input" dir="ltr" type="url" value={link} onInput={(e) => setLink(e.currentTarget.value)} placeholder="https://…" />}
      <div class="summary">
        <span>{s ? `${s.retentionDays} ימים באוויר` : "באוויר לזמן קצוב"}</span>
        <span>{u.credits.media > 0 ? `מנכה אחת מתוך ${u.credits.media}` : s && s.freeMedia > 0 ? `${s.freeMedia} חינם, אחר כך מחבילה` : "דרושה חבילה"}</span>
      </div>
      <button
        class="btn btn-primary btn-block"
        disabled={!file || !linkOk || busy}
        onClick={async () => {
          setBusy(true);
          const ok = await uploadImage(file!, caption, isLink ? link.trim() : undefined);
          setBusy(false);
          if (ok) onClose();
        }}
      >
        {busy ? "מעלה…" : "פרסום"}
      </button>
      <button class="link" onClick={() => (sheet.value = { type: "mymedia", section: "store" })}>
        חבילות העלאה
      </button>
      <p class="fine">כל תמונה עוברת בדיקה אוטומטית לפני הפרסום.</p>
    </Dialog>
  );
}

// ---------- campus picker ----------
function Picker() {
  const t = tree.value;
  const cur = place.value;
  const [inst, setInst] = useState(cur?.inst || "");
  const [faculty, setFaculty] = useState(cur ? unslug(cur.faculty) : "");
  const [year, setYear] = useState(cur?.year || 1);
  useEffect(() => void loadTree(), []);
  const i = t?.institutions.find((x) => x.id === inst);
  const ok = !!inst && slug(faculty).length >= 2;
  return (
    <Dialog title="הפקולטה שלכם" onClose={() => (picker.value = false)} closable={!!cur}>
      {!t ? (
        <div class="muted pad">טוען…</div>
      ) : (
        <>
          <label class="field">
            <span>מוסד</span>
            <select class="input" value={inst} onChange={(e) => (setInst(e.currentTarget.value), setFaculty(""))}>
              <option value="">בחרו…</option>
              {t.institutions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {i && (
            <div class="field">
              <span>פקולטה</span>
              <div class="chips">
                {i.faculties.map((f) => (
                  <button key={f} class={`chip ${faculty === f ? "on" : ""}`} onClick={() => setFaculty(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <input class="input" dir="auto" value={faculty} maxLength={60} onInput={(e) => setFaculty(e.currentTarget.value)} placeholder="או כתבו פקולטה אחרת" />
            </div>
          )}
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
          <button class="btn btn-primary btn-block" disabled={!ok} onClick={() => openPlace({ inst, faculty: slug(faculty), year })}>
            לדף הפקולטה
          </button>
          <p class="fine">הדף של הפקולטה הוא כתובת קבועה. הכוכב שומר אותו במעקב, כדי שייפתח בלחיצה מכל מקום.</p>
        </>
      )}
    </Dialog>
  );
}

function Dialog({ title, children, onClose, closable = true }: { title: string; children: any; onClose: () => void; closable?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && closable && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [closable]);
  return (
    <div class="scrim mc-scrim" onClick={(e) => e.target === e.currentTarget && closable && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head">
          <span class="sheet-spacer" />
          <h2 class="sheet-title">{title}</h2>
          {closable ? (
            <button class="icon-btn" onClick={onClose} aria-label="סגירה">
              <X />
            </button>
          ) : (
            <span class="sheet-spacer" />
          )}
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

