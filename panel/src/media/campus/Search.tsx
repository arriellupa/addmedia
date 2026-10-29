// Search in the course: one field over titles and text (/v1/campus/search); results grouped מסמכים / סעיפים,
// a section hit opens the reader at that section. On the phone the same thing lives in a sheet.
import { useEffect, useRef, useState } from "preact/hooks";
import { SearchHit, api } from "../../api";
import { Search as SearchI, X } from "../../icons";
import { Dialog } from "../Dialog";
import { KIND_HE, openDoc, place, searchOpen, showPaywall, unslug } from "../state";

function useSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const pl = place.value;
    const t = q.trim();
    if (!pl || t.length < 2) {
      setHits(null);
      setErr(null);
      return;
    }
    const n = ++seq.current;
    setBusy(true);
    const h = setTimeout(async () => {
      try {
        const r = await api.campusSearch(pl, t);
        if (seq.current === n) (setHits(r.hits), setErr(null));
      } catch (e: any) {
        if (seq.current !== n) return;
        if (e?.status === 402) showPaywall(e);
        setErr(e?.message || "החיפוש נכשל.");
        setHits([]);
      } finally {
        if (seq.current === n) setBusy(false);
      }
    }, 260);
    return () => clearTimeout(h);
  }, [q, place.value]);
  return { q, setQ, hits, busy, err };
}

function Results({ hits, busy, err, q, onPick }: { hits: SearchHit[] | null; busy: boolean; err: string | null; q: string; onPick?: () => void }) {
  if (q.trim().length < 2) return null;
  if (busy && !hits) return <div class="cp-sr-empty">מחפש…</div>;
  if (err) return <div class="cp-sr-empty">{err}</div>;
  if (!hits) return null;
  const docsHits = hits.filter((h) => !h.section);
  const secHits = hits.filter((h) => !!h.section);
  if (!hits.length) return <div class="cp-sr-empty">לא נמצא «{q.trim()}» בכותרות או בטקסט של הקורס.</div>;
  const pick = (h: SearchHit) => (openDoc(h.doc, h.section || 1), onPick?.());
  return (
    <div class="cp-sr">
      {docsHits.length > 0 && (
        <section class="cp-sr-group">
          <div class="cp-sr-title">מסמכים</div>
          {docsHits.map((h) => (
            <button key={h.doc.id} class="cp-sr-hit" onClick={() => pick(h)}>
              <span class={`doc-kind ${h.doc.kind}`}>{KIND_HE[h.doc.kind]}</span>
              <span class="cp-sr-main">
                <span class="cp-sr-doc" dir="auto">
                  {h.doc.title}
                </span>
                <span class="cp-sr-sub">
                  {h.doc.name}
                  {h.doc.place.course && !place.value?.course ? ` · ${unslug(h.doc.place.course)}` : ""}
                </span>
              </span>
            </button>
          ))}
        </section>
      )}
      {secHits.length > 0 && (
        <section class="cp-sr-group">
          <div class="cp-sr-title">סעיפים</div>
          {secHits.map((h, i) => (
            <button key={h.doc.id + ":" + h.section + i} class="cp-sr-hit" onClick={() => pick(h)}>
              <span class="cp-sr-sec num">§{h.section}</span>
              <span class="cp-sr-main">
                <span class="cp-sr-doc" dir="auto">
                  {h.doc.title}
                  {h.doc.sections?.find((s) => s.i === h.section)?.heading && <span class="cp-sr-heading"> · {h.doc.sections.find((s) => s.i === h.section)!.heading}</span>}
                </span>
                <span class="cp-sr-snip" dir="auto">
                  <Mark text={h.snippet} q={q} />
                </span>
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function Mark({ text, q }: { text: string; q: string }) {
  const t = q.trim();
  const i = text.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + t.length)}</mark>
      {text.slice(i + t.length)}
    </>
  );
}

export function SearchBox() {
  const s = useSearch();
  const [focus, setFocus] = useState(false);
  const open = focus && s.q.trim().length >= 2;
  return (
    <div class={`cp-search ${open ? "open" : ""}`}>
      <div class="cp-search-row">
        <SearchI size={16} class="cp-search-ic" />
        <input class="cp-search-in" dir="auto" value={s.q} placeholder={place.value?.course ? "חיפוש בכותרות ובטקסט של הקורס…" : "חיפוש בכל הסיכומים של השנה…"} onInput={(e) => s.setQ(e.currentTarget.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} aria-label="חיפוש בקורס" />
        {s.q && (
          <button class="icon-btn sm" onClick={() => s.setQ("")} aria-label="ניקוי">
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div class="cp-search-pop" onMouseDown={(e) => e.preventDefault()}>
          <Results {...s} />
        </div>
      )}
    </div>
  );
}

export function SearchSheet({ onClose }: { onClose: () => void }) {
  const s = useSearch();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => void ref.current?.focus(), []);
  return (
    <Dialog title="חיפוש בקורס" onClose={onClose} cls="cp-search-sheet">
      <div class="cp-search-row in-sheet">
        <SearchI size={16} class="cp-search-ic" />
        <input ref={ref} class="cp-search-in" dir="auto" value={s.q} placeholder="מילה, מושג, שם מרצה…" onInput={(e) => s.setQ(e.currentTarget.value)} aria-label="חיפוש" />
      </div>
      <Results {...s} onPick={() => (searchOpen.value = false)} />
      {s.q.trim().length < 2 && <p class="fine">החיפוש עובר על הכותרות ועל הטקסט המלא של הסיכומים. תוצאה מסעיף פותחת את המסמך בדיוק שם.</p>}
    </Dialog>
  );
}
