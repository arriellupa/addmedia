import { effect } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { findUrl, host } from "./host";
import { GoBar } from "./ui/GoBar";
import { Copy, Lock, Refresh } from "./icons";
import { bundle, load, loadError, loading, page, presence, setPage, tab } from "./state";
import { BrandMark, Skeleton, Sponsored, Toast } from "./ui/Bits";
import { ChatView } from "./ui/Chat";
import { CommentsView } from "./ui/Comments";
import { Header, Tabs } from "./ui/Header";
import { MediaView } from "./ui/Media";
import { Sheets } from "./ui/Sheets";

effect(() => host.badge?.(presence.value));

export function App() {
  const p = page.value;
  const b = bundle.value;
  return (
    <div class={`app layout-${host.layout}`}>
      {!p ? (
        <NoPage />
      ) : (
        <>
          <Header />
          {b?.disabled ? (
            <Disabled reason={b.disabled} />
          ) : loadError.value && !b ? (
            <div class="state">
              <div class="empty-title">{loadError.value}</div>
              <button class="btn btn-secondary" onClick={() => load()}>
                <Refresh size={16} /> נסו שוב
              </button>
            </div>
          ) : !b && loading.value ? (
            <Skeleton />
          ) : b ? (
            <>
              <Intro />
              {b.ads.top && <Sponsored ad={b.ads.top} compact={host.layout === "bottom"} />}
              <Tabs />
              <main class="views" data-tab={tab.value}>
                {tab.value === "chat" && <ChatView />}
                {tab.value === "comments" && <CommentsView />}
                {tab.value === "media" && <MediaView />}
              </main>
            </>
          ) : null}
        </>
      )}
      <Sheets />
      <Toast />
    </div>
  );
}

function Intro() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    host.get("am_intro").then((v) => setShow(!v));
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    host.set("am_intro", "1");
  };
  return (
    <div class="intro" role="note">
      <div class="intro-title">כל דף באינטרנט הוא חדר</div>
      <div class="intro-sub">כאן מדברים עם מי שקורא איתכם, עכשיו. דף שקט נפתח על «כל האתר», שם האנשים; «הדף הזה» תמיד במרחק נגיעה.</div>
      <button class="link" onClick={close}>
        הבנתי
      </button>
    </div>
  );
}

function Disabled({ reason }: { reason: string }) {
  const text: Record<string, string> = {
    login: "בדפי התחברות ותשלום הפאנל כבוי, כדי לשמור על הפרטיות שלכם.",
    token: "הכתובת כוללת פרטי גישה אישיים, ולכן הפאנל כבוי בה.",
    private: "זו כתובת ברשת פנימית, ולכן הפאנל כבוי בה.",
    domain: "הפאנל כבוי באתר הזה — לבקשת בעל האתר, או כי זה אתר רגיש (בנק, בריאות, ממשל).",
  };
  return (
    <div class="state">
      <span class="state-ic">
        <Lock size={22} />
      </span>
      <div class="empty-title">AddMedia כבוי בדף הזה</div>
      <div class="empty-sub">{text[reason] || text.domain}</div>
    </div>
  );
}

function NoPage() {
  const [err, setErr] = useState<string | null>(null);
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!findUrl(t)) return setErr("בלוח אין קישור. העתיקו את כתובת הכתבה ונסו שוב.");
      setErr(null);
      history.replaceState(null, "", `${location.pathname}?url=${encodeURIComponent(findUrl(t)!)}`);
      setPage({ url: findUrl(t)! });
    } catch {
      setErr("הדפדפן לא איפשר לקרוא מהלוח. הדביקו את הקישור בשדה.");
    }
  };
  if (host.kind !== "web")
    return (
      <div class="state">
        <BrandMark />
        <div class="empty-title">פתחו אתר כלשהו</div>
        <div class="empty-sub">ברגע שתגלשו לכתבה, לסרטון או לכל דף אחר — תראו כאן מי עוד קורא אותו עכשיו.</div>
      </div>
    );
  return (
    <div class="state">
      <BrandMark />
      <div class="empty-title">על איזה דף מדברים?</div>
      <div class="empty-sub">הקלידו כתובת או חפשו בגוגל: הדף נפתח בחלון קריאה לצד AddMedia, והשיחה עליו כאן.</div>
      <div class="demo-url">
        <GoBar autoFocus />
      </div>
      {"clipboard" in navigator && "readText" in (navigator.clipboard || {}) && (
        <button class="btn btn-secondary paste-btn" onClick={paste}>
          <Copy size={18} /> הדבקת קישור מהלוח
        </button>
      )}
      {err && <div class="form-err">{err}</div>}
      <a class="fine" href="/mobile/">איך מוסיפים כפתור AddMedia לדפדפן בטלפון</a>
    </div>
  );
}
