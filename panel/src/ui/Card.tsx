// The opening card: three points, discussion questions and «ask the page», so a quiet page still has something in it.
// The text of the page is read on the device only when the reader taps (extension), and only the short card is kept.
import { useEffect, useState } from "preact/hooks";
import { api, type PageCard } from "../api";
import { host } from "../host";
import { Chevron, Sparkles } from "../icons";
import { bundle, needAuth, page, seed, tab } from "../state";

const KEY = "am_card_open";

export function OpeningCard() {
  const p = page.value;
  const b = bundle.value;
  const on = b?.settings?.aiCards !== false;
  const [card, setCard] = useState<PageCard | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<{ q: string; a: string } | null>(null);
  const canRead = !!host.pageText;

  useEffect(() => {
    setCard(undefined);
    setErr("");
    setAns(null);
    if (!p || !on) return;
    let dead = false;
    api
      .getCard(p)
      .then((r) => !dead && setCard(r.card))
      .catch(() => !dead && setCard(null));
    return () => {
      dead = true;
    };
  }, [p?.url, on]);

  useEffect(() => {
    host.get(KEY).then((v) => setOpen(v === null ? null : v === "1"));
  }, []);

  if (!p || !on || card === undefined) return null;
  const quiet = !b || b.room.postCount + b.room.mediaCount < 5;
  const isOpen = open ?? (quiet && host.layout !== "split" && host.layout !== "bottom");
  const toggle = () => {
    setOpen(!isOpen);
    host.set(KEY, !isOpen ? "1" : "0").catch(() => {});
  };

  const make = () =>
    needAuth(async () => {
      if (busy) return;
      setBusy(true);
      setErr("");
      try {
        const text = await host.pageText!();
        if (text.length < 400) setErr("אין בדף מספיק טקסט לסיכום.");
        else setCard((await api.makeCard(p, text)).card);
      } catch (e: any) {
        setErr(e?.message || "היצירה נכשלה. נסו שוב.");
      }
      setBusy(false);
    });

  const ask = () =>
    needAuth(async () => {
      const question = q.trim();
      if (question.length < 3 || busy) return;
      setBusy(true);
      setErr("");
      try {
        const text = await host.pageText!();
        if (text.length < 200) setErr("אין בדף מספיק טקסט.");
        else setAns({ q: question, a: (await api.askPage(p, question, text)).answer });
      } catch (e: any) {
        setErr(e?.message || "התשובה נכשלה. נסו שוב.");
      }
      setBusy(false);
    });

  if (!card) {
    if (!canRead) return null;
    return (
      <section class="ocard ocard-empty" aria-label="סיכום אוטומטי">
        <div class="oc-head">
          <span class="oc-pill">
            <Sparkles size={12} /> אוטומטי
          </span>
          <strong class="oc-title">אף אחד עוד לא כתב כאן</strong>
        </div>
        <p class="oc-note">אפשר ליצור סיכום קצר ושאלות לדיון. הטקסט של הדף נשלח לעיבוד פעם אחת, ונשמר רק התקציר.</p>
        <button class="btn btn-primary" disabled={busy} onClick={make}>
          {busy ? "יוצר…" : "צרו סיכום ושאלות"}
        </button>
        {err && (
          <div class="oc-err" role="status">
            {err}
          </div>
        )}
      </section>
    );
  }

  return (
    <section class="ocard" aria-label="סיכום אוטומטי">
      <button class="oc-head oc-toggle" aria-expanded={isOpen} onClick={toggle}>
        <span class="oc-pill">
          <Sparkles size={12} /> נוצר אוטומטית
        </span>
        <strong class="oc-title">בקצרה על הדף</strong>
        <span class={isOpen ? "oc-chev up" : "oc-chev"} aria-hidden="true">
          <Chevron size={18} />
        </span>
      </button>
      {isOpen && (
        <div class="oc-body">
          <ul class="oc-points" dir="auto">
            {card.summary.map((s) => (
              <li>{s}</li>
            ))}
          </ul>
          <div class="oc-qs" role="group" aria-label="שאלות לדיון">
            {card.questions.map((s) => (
              <button
                class="oc-q"
                onClick={() => {
                  seed.value = s;
                  tab.value = "comments";
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {canRead && (
            <form
              class="oc-ask"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <input class="oc-in" value={q} placeholder="שאל את הדף…" aria-label="שאלה על הדף" maxLength={200} onInput={(e) => setQ(e.currentTarget.value)} />
              <button class="btn btn-secondary" type="submit" disabled={busy || q.trim().length < 3}>
                {busy ? "…" : "שאל"}
              </button>
            </form>
          )}
          {ans && (
            <div class="oc-ans" role="status">
              <div class="oc-ans-q">{ans.q}</div>
              <div dir="auto">{ans.a}</div>
            </div>
          )}
          {err && (
            <div class="oc-err" role="status">
              {err}
            </div>
          )}
          <div class="oc-foot">נוצר על ידי AI ועלול לטעות. הדיון באחריות הקוראים.</div>
        </div>
      )}
    </section>
  );
}
