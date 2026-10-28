import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ChatMsg } from "../api";
import { clock, count } from "../fmt";
import { ArrowDown, Clock, More, Plus, Refresh, Send } from "../icons";
import { bundle, canPost, me, needAuth, presence, retryChat, scope, scopeNames, sendChat, setScope, sheet, slow, slowUntil, visibleChat } from "../state";
import { Avatar, ClipArt, LiveDot } from "./Bits";

const GROUP_MS = 2 * 60_000;
const MAX = 500;

export function ChatView() {
  const list = visibleChat.value;
  const box = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const lastLen = useRef(list.length);
  const seen = useRef(new Set<string>(list.map((m) => m.cid || m.id)));
  const dense = presence.value >= 10;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const added = list.length - lastLen.current;
    lastLen.current = list.length;
    const mine = list.at(-1)?.uid === me.value?.id;
    if (atEnd || mine) el.scrollTop = el.scrollHeight;
    else if (added > 0) setUnseen((n) => n + added);
  }, [list.length]);

  // stay pinned to the newest message while fonts, banners or the keyboard change the layout
  const endRef = useRef(true);
  endRef.current = atEnd;
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (endRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = box.current!;
    const end = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAtEnd(end);
    if (end) setUnseen(0);
  };
  const jump = () => {
    box.current!.scrollTo({ top: box.current!.scrollHeight, behavior: "smooth" });
    setUnseen(0);
  };

  return (
    <section class="view view-chat">
      {slow.value && <div class="banner">מצב איטי · הודעה כל 10 שנ׳ — יש כאן הרבה אנשים</div>}
      <div class={`msgs ${dense ? "dense" : ""}`} ref={box} onScroll={onScroll} role="log" aria-label="שיחה חיה" aria-live={dense ? "off" : "polite"}>
        {!list.length && <ChatEmpty />}
        {list.map((m, i) => {
          const prev = list[i - 1];
          const grouped = !!prev && prev.uid === m.uid && m.ts - prev.ts < GROUP_MS;
          const key = m.cid || m.id;
          const fresh = !seen.current.has(key);
          if (fresh) seen.current.add(key);
          return <Msg key={key} m={m} grouped={grouped} anim={fresh && atEnd} />;
        })}
      </div>
      {unseen > 0 && (
        <button class="new-pill" onClick={jump}>
          <ArrowDown size={14} /> <span class="num">{count(unseen)}</span> הודעות חדשות
        </button>
      )}
      <ChatComposer />
    </section>
  );
}

function ChatEmpty() {
  const b = bundle.value;
  const other = b?.other;
  if (scope.value === "page" && other && (other.presence > 0 || other.chat.length > 0)) {
    return (
      <div class="empty">
        <div class="empty-card">
          <ClipArt />
          <div class="empty-title">אתם הראשונים כאן</div>
          <div class="empty-sub">כתבו את ההודעה הראשונה על הדף הזה — כל מי שיגיע אחריכם יראה אותה.</div>
        </div>
        <div class="site-peek">
          <div class="site-peek-head">
            <LiveDot /> בינתיים בכל <bdi dir="ltr">{b!.page.site}</bdi> · <span class="num">{count(other.presence)}</span> עכשיו
          </div>
          {other.chat.map((m) => (
            <div class="peek-msg" key={m.id}>
              <bdi class="peek-name">{m.name}</bdi> <span dir="auto">{m.body}</span>
            </div>
          ))}
          <button class="btn btn-secondary btn-sm" onClick={() => setScope("site")}>
            הצטרפו לשיחה על האתר
          </button>
        </div>
      </div>
    );
  }
  return (
    <div class="empty">
      <ClipArt />
      <div class="empty-title">{scope.value === "site" ? "השיחה על האתר עוד שקטה" : "עוד אין כאן אף אחד"}</div>
      <div class="empty-sub">{scope.value === "site" ? "כל מי שגולש עכשיו באתר הזה יראה את מה שתכתבו." : "כתבו את ההודעה הראשונה בדף הזה — כל מי שיגיע אחריכם יראה אותה."}</div>
    </div>
  );
}

function Msg({ m, grouped, anim }: { m: ChatMsg; grouped: boolean; anim: boolean }) {
  const mine = m.uid === me.value?.id;
  const openMenu = () => !m.pending && !m.failed && (sheet.value = { type: "menu", itemType: "chat", item: m });
  let press: ReturnType<typeof setTimeout> | null = null;
  return (
    <div
      class={`msg ${grouped ? "grouped" : ""} ${mine ? "mine" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""} ${anim ? "anim" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu();
      }}
      onTouchStart={() => (press = setTimeout(openMenu, 450))}
      onTouchEnd={() => press && clearTimeout(press)}
      onTouchMove={() => press && clearTimeout(press)}
    >
      {!grouped && !mine && <Avatar id={m.uid} name={m.name} />}
      <div class="msg-main">
        {!grouped && !mine && (
          <div class="msg-meta">
            <bdi class="msg-name">{m.name}</bdi>
            <time class="msg-time num">{clock(m.ts)}</time>
          </div>
        )}
        <div class="msg-body" dir="auto">
          {m.body}
        </div>
        {mine && !m.failed && (
          <span class="msg-stamp num">
            {m.pending ? (
              <>
                <Clock size={11} /> שולח…
              </>
            ) : (
              clock(m.ts)
            )}
          </span>
        )}
        {m.failed && (
          <div class="msg-fail">
            {m.failed}
            {!/פוגעני|איומים|פרטי|קישורים/.test(m.failed) && (
              <button class="link" onClick={() => retryChat(m)}>
                <Refresh size={12} /> נסו שוב
              </button>
            )}
          </div>
        )}
      </div>
      {!m.pending && !m.failed && !mine && (
        <button class="icon-btn msg-more" aria-label="פעולות" onClick={openMenu}>
          <More size={16} />
        </button>
      )}
    </div>
  );
}

function ChatComposer() {
  const [text, setText] = useState("");
  const [now, setNow] = useState(Date.now());
  const ref = useRef<HTMLTextAreaElement>(null);
  const wait = Math.max(0, slowUntil.value - now);
  useEffect(() => {
    if (!wait) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [wait > 0]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "TEXTAREA" && tag !== "INPUT") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  if (!canPost.value) return <div class="composer-off">השיחה כבויה בדף הזה לבקשת בעל האתר.</div>;
  const submit = () => {
    if (!text.trim() || wait) return;
    needAuth(() => {
      if (sendChat(text)) {
        setText("");
        setNow(Date.now());
        if (ref.current) ref.current.style.height = "";
      }
    });
  };
  return (
    <div class="composer">
      <div class="composer-to">
        נשלח אל: <strong>{scopeNames.value[scope.value]}</strong>
      </div>
      <div class="composer-row">
        <button class="composer-plus" aria-label="המדיה שלי — הוספת תמונה" onClick={() => needAuth(() => (sheet.value = { type: "mymedia", section: "create" }))}>
          <Plus size={20} />
        </button>
        <textarea
          ref={ref}
          class="input"
          rows={1}
          dir="auto"
          maxLength={MAX}
          placeholder={me.value ? "כתבו משהו לכל מי שכאן…" : "התחברו כדי לכתוב…"}
          value={text}
          enterkeyhint="send"
          aria-label="הודעה"
          onFocus={() => !me.value?.termsAccepted && needAuth(() => ref.current?.focus())}
          onInput={(e) => {
            const el = e.currentTarget;
            setText(el.value);
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {text.length >= MAX * 0.8 && <span class="counter num">{MAX - text.length}</span>}
        <button class={`send ${wait ? "waiting" : ""}`} aria-label={wait ? `אפשר לשלוח בעוד ${Math.ceil(wait / 1000)} שניות` : "שליחה"} disabled={!text.trim() || !!wait} onClick={submit}>
          {wait ? <span class="num">{Math.ceil(wait / 1000)}</span> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}
