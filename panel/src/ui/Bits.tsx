import { useEffect, useState } from "preact/hooks";
import { API_BASE, type Ad, type CenterAd as CenterAdT } from "../api";
import { count, hue, initials } from "../fmt";
import { host } from "../host";
import { Info, X } from "../icons";
import { bundle, sheet, toast } from "../state";

export function Avatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  return (
    <span class="avatar" style={{ "--h": String(hue(id)), width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function LiveDot({ pulse }: { pulse?: boolean }) {
  return <span class={`live-dot ${pulse ? "pulse" : ""}`} aria-hidden="true" />;
}

/** Line art built on the Clip motif: the page (top slab), the layer (bottom slab), the clip holding them. */
export function ClipArt({ size = 104 }: { size?: number }) {
  return (
    <svg class="empty-art" width={size} height={Math.round(size * 0.7)} viewBox="0 0 104 72" fill="none" aria-hidden="true">
      <rect x="10" y="4" width="84" height="34" rx="8" stroke="currentColor" stroke-width="1.75" />
      <path d="M22 16h40M22 24h28" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
      <path d="M6 44a6 6 0 0 1 6-6h28c3 0 4 4 6 4h12c2 0 3-4 6-4h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6Z" fill="var(--c-accent-tint)" stroke="currentColor" stroke-width="1.75" />
      <circle cx="52" cy="40" r="3" fill="var(--c-accent)" />
      <path d="M18 56h30" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    </svg>
  );
}

export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <svg class="brand-mark" width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      {/* InThePage mark: a page on the violet layer, and someone in it */}
      <rect x="8" y="8" width="112" height="112" rx="30" fill="#5B2EF0" />
      <path d="M38 26h36l18 18v52a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z" fill="#fff" />
      <path d="M74 26v12a6 6 0 0 0 6 6h12z" fill="#D9CFFF" />
      <rect x="42" y="50" width="30" height="6" rx="3" fill="#D9CFFF" />
      <rect x="42" y="62" width="22" height="6" rx="3" fill="#D9CFFF" />
      <path d="M86 70a20 20 0 1 1-11.4 36.4L64 110l3.6-10.6A20 20 0 0 1 86 70z" fill="#FF7A2F" stroke="#5B2EF0" stroke-width="5" stroke-linejoin="round" />
      <circle cx="79" cy="90" r="3" fill="#fff" />
      <circle cx="87" cy="90" r="3" fill="#fff" />
      <circle cx="95" cy="90" r="3" fill="#fff" />
    </svg>
  );
}

/** skeletons appear only if loading lasts more than 200ms */
export function Skeleton({ rows = 5 }: { rows?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);
  if (!show) return <div class="skel-wrap" />;
  return (
    <div class="skel-wrap" aria-busy="true" aria-label="טוען">
      {Array.from({ length: rows }, (_, i) => (
        <div class="skel-row" key={i}>
          <span class="skel skel-av" />
          <span class="skel-lines">
            <span class="skel" style={{ width: `${30 + ((i * 17) % 25)}%` }} />
            <span class="skel" style={{ width: `${55 + ((i * 23) % 40)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class={`toast ${t.kind === "err" ? "toast-err" : ""}`} role={t.kind === "err" ? "alert" : "status"}>
      <span>{t.text}</span>
      {t.action && (
        <button
          class="toast-act"
          onClick={() => {
            t.action!.run();
            toast.value = null;
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

export function Sponsored({ ad, compact }: { ad: Ad; compact?: boolean }) {
  const [why, setWhy] = useState(false);
  return (
    <div class={`ad ${compact ? "ad-compact" : ""}`}>
      <a
        class="ad-main"
        href={API_BASE + ad.href}
        target="_blank"
        rel="noopener sponsored"
        onClick={(e) => {
          if (host.kind !== "web") {
            e.preventDefault();
            host.open(API_BASE + ad.href);
          }
        }}
      >
        {ad.image && !compact && <img class="ad-img" src={ad.image} alt="" loading="lazy" decoding="async" />}
        <span class="ad-text">
          <span class="ad-top">
            <span class="badge badge-sponsored">ממומן</span>
            <bdi class="ad-adv">{ad.advertiser}</bdi>
          </span>
          <span class="ad-title">{ad.title}</span>
          {ad.body && !compact && <span class="ad-body">{ad.body}</span>}
        </span>
      </a>
      <button class="icon-btn ad-why" aria-label="למה אני רואה את זה" onClick={() => setWhy(!why)}>
        {why ? <X size={16} /> : <Info size={16} />}
      </button>
      {why && <div class="ad-why-pop">המודעה מוצגת לפי האתר שבו אתם גולשים, לא לפי מידע אישי עליכם. InThePage לא קשורה לאתר המוצג.</div>}
    </div>
  );
}

export function SheetFrame({ title, children, onBack, wide }: { title: string; children: any; onBack?: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    host.expand?.(true);
    return () => {
      window.removeEventListener("keydown", k);
      host.expand?.(false);
    };
  }, []);
  const close = () => (sheet.value = null);
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class={`sheet ${wide ? "sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-grab" aria-hidden="true" />
        <header class="sheet-head">
          {onBack ? (
            <button class="icon-btn" onClick={onBack} aria-label="חזרה">
              <span class="ic-back">→</span>
            </button>
          ) : (
            <span class="sheet-spacer" />
          )}
          <h2 class="sheet-title">{title}</h2>
          <button class="icon-btn" onClick={close} aria-label="סגירה">
            <X size={20} />
          </button>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** the operator's window in the middle (admin: «פרסום מרכזי»): a mint card with a fixed «ממומן» label, never mixed into the chat */
export function CenterAd({ ad }: { ad: CenterAdT }) {
  const inner = (
    <>
      {ad.image && <img class="cad-img" src={ad.image} alt="" loading="lazy" decoding="async" />}
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
    <a
      class="cad"
      href={ad.url}
      target="_blank"
      rel="noopener sponsored"
      onClick={(e) => {
        if (host.kind !== "web") {
          e.preventDefault();
          host.open(ad.url!);
        }
      }}
    >
      {inner}
    </a>
  ) : (
    <div class="cad">{inner}</div>
  );
}

/** the site's owner: their pinned message, and an open note that the room is managed by them */
export function OwnerCard() {
  const o = bundle.value?.owner;
  if (!o) return null;
  return (
    <section class="owner-card" aria-label="בעל האתר">
      <div class="owner-head">
        <span class="badge badge-owner">✓ בעל האתר</span>
        <span class="owner-note">החדר בניהול בעל האתר, לפי כללי הקהילה של InThePage</span>
      </div>
      {o.welcome && (
        <p class="owner-welcome" dir="auto">
          {o.welcome}
        </p>
      )}
      {o.isMe && (
        <a class="owner-manage" href={`${API_BASE || "https://inthepage.com"}/owner/`} target="_blank" rel="noopener">
          ניהול החדר
        </a>
      )}
    </section>
  );
}
