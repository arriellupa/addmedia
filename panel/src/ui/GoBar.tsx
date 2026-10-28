// The address-and-search bar of the web panel: a link opens the page in the reading window (a second tab, which on an
// iPad sits beside the panel in Split View) and the panel moves to that page's room; words become a Google search there.
import { useState } from "preact/hooks";
import { findUrl, host } from "../host";
import { Globe, Search } from "../icons";
import { setPage } from "../state";

const WIN = "addmedia-reading";
const asUrl = (raw: string): string | null => {
  const t = raw.trim();
  if (!t) return null;
  const u = findUrl(t);
  if (u && t.startsWith(u)) return u;
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t)) return "https://" + t;
  return null;
};

export function openReading(url: string) {
  // one reading window, reused: on an iPad in Split View it stays beside the panel
  const w = window.open(url, WIN);
  if (!w) host.open(url);
}

export function go(raw: string): "page" | "search" | null {
  const u = asUrl(raw);
  if (u) {
    openReading(u);
    history.replaceState(null, "", `${location.pathname}?url=${encodeURIComponent(u)}`);
    setPage({ url: u });
    return "page";
  }
  const q = raw.trim();
  if (!q) return null;
  openReading("https://www.google.com/search?q=" + encodeURIComponent(q));
  return "search";
}

export function GoBar({ compact, autoFocus }: { compact?: boolean; autoFocus?: boolean }) {
  const [v, setV] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const submit = (e: Event) => {
    e.preventDefault();
    const r = go(v);
    if (r === "search") setNote("תוצאות החיפוש נפתחו בחלון הקריאה. בחרו שם דף, ושתפו אותו ל-AddMedia או הדביקו את הקישור כאן.");
    else if (r === "page") {
      setNote(null);
      setV("");
    }
  };
  return (
    <form class={`gobar ${compact ? "compact" : ""}`} onSubmit={submit} role="search" aria-label="כתובת או חיפוש">
      <span class="gobar-ic" aria-hidden="true">
        {asUrl(v) ? <Globe size={16} /> : <Search size={16} />}
      </span>
      <input
        class="input"
        type="text"
        inputMode="url"
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        placeholder="כתובת של דף, או חיפוש בגוגל"
        aria-label="כתובת של דף, או חיפוש בגוגל"
        value={v}
        onInput={(e) => setV(e.currentTarget.value)}
        autoFocus={autoFocus}
      />
      <button class="btn btn-secondary btn-sm" type="submit" disabled={!v.trim()}>
        {asUrl(v) ? "פתיחה" : "חיפוש"}
      </button>
      {note && (
        <div class="gobar-note" role="status">
          {note}
        </div>
      )}
    </form>
  );
}
