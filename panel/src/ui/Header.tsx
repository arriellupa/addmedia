import { useEffect, useRef, useState } from "preact/hooks";
import { count } from "../fmt";
import { host } from "../host";
import { Cap, External, FileI, Globe, SideI, SplitI } from "../icons";
import { API_BASE } from "../api";

/** the campus page: the last faculty the reader opened there, or the picker */
async function lastPlace(): Promise<string> {
  const v = await host.get("am_last_place");
  try {
    const p = JSON.parse(v || "");
    if (p?.inst) return `/media/campus/${p.inst}/${p.faculty}/${p.year}${p.course ? "/" + p.course : ""}`;
  } catch {}
  return "/media/campus";
}
import { bundle, me, page, presence, scope, setScope, sheet, status, tab, visibleChat, type Tab } from "../state";
import { AttachButton } from "./Attach";
import { Avatar, LiveDot } from "./Bits";
import { GoBar, openReading } from "./GoBar";

/** The Clip — signature tab on the panel's top edge: live dot, who's here, recent faces. */
export function Clip() {
  const n = presence.value;
  const [pulse, setPulse] = useState(false);
  const prev = useRef(n);
  const last = useRef(0);
  useEffect(() => {
    if (n > prev.current && Date.now() - last.current > 4000) {
      last.current = Date.now();
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1700);
      prev.current = n;
      return () => clearTimeout(t);
    }
    prev.current = n;
  }, [n]);
  const faces: { id: string; name: string }[] = [];
  for (const m of [...visibleChat.value].reverse()) {
    if (!faces.some((f) => f.id === m.uid)) faces.push({ id: m.uid, name: m.name });
    if (faces.length === 3) break;
  }
  return (
    <div class="clip-row">
      <div class="clip" role="status" aria-label={`${n} אנשים כאן עכשיו`}>
        <LiveDot pulse={pulse} />
        <span class="num">{count(n)}</span>
        <span class="clip-l">כאן עכשיו</span>
        {faces.length > 0 && (
          <span class="clip-avs" aria-hidden="true">
            {faces.map((f) => (
              <Avatar key={f.id} id={f.id} name={f.name} size={20} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/** In the web panel the reading window follows the scope: «כל האתר» opens the site's home there, «הדף הזה» brings the page back. */
function goScope(s: "page" | "site") {
  const p = page.value;
  if (host.kind === "web" && p) {
    if (s === "site") {
      try {
        openReading(new URL(p.url).origin + "/");
      } catch {}
    } else if (scope.value !== "page") openReading(p.url);
  }
  setScope(s);
}

export function Header() {
  const p = page.value;
  const b = bundle.value;
  const [iconOk, setIconOk] = useState(true);
  useEffect(() => setIconOk(true), [p?.favicon]);
  const title = p?.title || b?.page.display || "";
  const u = me.value;
  const openMine = () => (sheet.value = u ? { type: "mymedia" } : { type: "signin", then: () => (sheet.value = { type: "mymedia" }) });
  return (
    <header class="head">
      {b && !b.disabled && <Clip />}
      <div class="head-in">
        <div class="head-row">
          <div class="page-id">
            <span class="fav-frame" aria-hidden="true">
              {p?.favicon && iconOk ? <img class="fav" src={p.favicon} alt="" width={18} height={18} onError={() => setIconOk(false)} /> : <Globe size={16} />}
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
          </div>
          <div class="head-actions">
            {host.kind === "web" && p && (
              <a class="icon-btn" href={p.url} target="_blank" rel="noopener" aria-label="פתיחת הכתבה" title="פתיחת הכתבה">
                <External />
              </a>
            )}
            {p && <AttachButton compact />}
            {host.kind !== "mobile" && (
              <button
                class="icon-btn campus-btn"
                aria-label="לגרסת הסטודנטים: סיכומים ומאמרים לפי פקולטה ושנה"
                title="לגרסת הסטודנטים"
                onClick={async () => {
                  const url = (API_BASE || "https://addmedia.noaplate.com") + (await lastPlace());
                  if (host.kind === "web") location.href = url; // the same tab: the campus is the same app
                  else host.open(url);
                }}
              >
                <Cap />
              </button>
            )}
            {host.kind === "extension" && host.setLayout && (
              <button
                class="icon-btn"
                aria-label={host.layout === "split" ? "חזרה לפאנל צד" : "מסך מפוצל: הדף למעלה, AddMedia למטה"}
                title={host.layout === "split" ? "חזרה לפאנל צד" : "מסך מפוצל"}
                onClick={() => host.setLayout!(host.layout === "split" ? "side" : "split")}
              >
                {host.layout === "split" ? <SideI /> : <SplitI />}
              </button>
            )}
            <button class={`me-btn ${u ? "" : "out"}`} onClick={openMine}>
              {u && <Avatar id={u.id} name={u.name} size={26} />}
              המדיה שלי
            </button>
          </div>
        </div>
        {host.kind === "web" && <GoBar compact />}
        {b && !b.disabled && (
          <div class="scope" role="tablist" aria-label="היקף השיחה">
            <button role="tab" aria-selected={scope.value === "page"} class={scope.value === "page" ? "on" : ""} title={host.kind === "web" ? "החדר של הדף הזה; חלון הקריאה חוזר אליו" : "החדר של הדף הזה"} onClick={() => goScope("page")}>
              <FileI size={15} /> הדף הזה
            </button>
            <button role="tab" aria-selected={scope.value === "site"} class={scope.value === "site" ? "on" : ""} title={host.kind === "web" ? "החדר של כל האתר; חלון הקריאה עובר לאתר" : "החדר של כל האתר"} onClick={() => goScope("site")}>
              <Globe size={15} /> כל <bdi dir="ltr">{b.page.site}</bdi>
              {scope.value === "page" && b.other.presence > 0 && (
                <span class="scope-n num">
                  <LiveDot /> {count(b.other.presence)}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
      {(status.value === "reconnecting" || status.value === "offline") && (
        <div class="conn" role="status">
          <span class="conn-line" />
          <span class="conn-pill">{status.value === "offline" ? "אין חיבור" : "מתחבר מחדש…"}</span>
        </div>
      )}
    </header>
  );
}

export function Tabs() {
  const b = bundle.value;
  const items: { id: Tab; label: string; n?: number; live?: boolean }[] = [
    { id: "chat", label: "שיחה חיה", live: presence.value > 1 },
    { id: "comments", label: "תגובות", n: b?.room.postCount },
    { id: "media", label: "מדיה", n: b?.room.mediaCount },
  ];
  const idx = items.findIndex((i) => i.id === tab.value);
  return (
    <div class="tabs-wrap">
      <nav class="tabs" role="tablist" aria-label="תצוגה" data-i={String(idx)} style={{ "--i": String(idx) }}>
        <span class="tab-ink" aria-hidden="true" />
        {items.map((i) => (
          <button
            key={i.id}
            role="tab"
            aria-selected={tab.value === i.id}
            class={`tab ${tab.value === i.id ? "on" : ""}`}
            onClick={() => {
              tab.value = i.id;
              host.haptic("select");
            }}
          >
            {i.live && <LiveDot />}
            {i.label}
            {!!i.n && <span class="tab-n num">{count(i.n)}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
