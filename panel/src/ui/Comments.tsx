import { Fragment } from "preact";
import { useState } from "preact/hooks";
import type { Post } from "../api";
import { ago, count, left } from "../fmt";
import { Heart, More, Pin, Reply, X } from "../icons";
import { bundle, canPost, loadMorePosts, me, needAuth, postsNext, replyTo, retentionDays, scope, scopeNames, sheet, sort, setSort, submitPost, toggleLike, visiblePosts } from "../state";
import { RefCard } from "./Attach";
import { Avatar, Sponsored } from "./Bits";

export function CommentsView() {
  const all = visiblePosts.value;
  const ids = new Set(all.map((p) => p.id));
  const top = all.filter((p) => !p.parentId || !ids.has(p.parentId));
  const kids = new Map<string, Post[]>();
  for (const p of all) if (p.parentId && ids.has(p.parentId)) kids.set(p.parentId, [...(kids.get(p.parentId) || []), p]);
  const feed = bundle.value?.ads.feed ?? [];

  return (
    <section class="view view-comments">
      <div class="list-head">
        <div class="seg" role="tablist" aria-label="מיון">
          <button role="tab" aria-selected={sort.value === "new"} class={sort.value === "new" ? "on" : ""} onClick={() => setSort("new")}>חדשות</button>
          <button role="tab" aria-selected={sort.value === "top"} class={sort.value === "top" ? "on" : ""} onClick={() => setSort("top")}>מובילות</button>
        </div>
      </div>
      <div class="cards">
        {!top.length && (
          <div class="empty">
            <div class="empty-title">עוד אין תגובות</div>
            <div class="empty-sub">התגובה הראשונה נשארת כאן {retentionDays.value} ימים, וכל מי שיקרא את הדף יראה אותה.</div>
          </div>
        )}
        {top.map((p, i) => (
          <Fragment key={p.id}>
            <Card p={p} replies={kids.get(p.id) || []} />
            {i === 3 && feed[0] && <Sponsored ad={feed[0]} />}
            {i === 11 && feed[1] && <Sponsored ad={feed[1]} />}
          </Fragment>
        ))}
        {postsNext.value && (
          <button class="btn btn-secondary btn-sm more-btn" onClick={() => loadMorePosts()}>
            עוד תגובות
          </button>
        )}
      </div>
      <PostComposer />
    </section>
  );
}

function Card({ p, replies }: { p: Post; replies: Post[] }) {
  const [open, setOpen] = useState(replies.length <= 2);
  return (
    <article class={`card ${p.pinned ? "is-pinned" : ""}`}>
      <CardBody p={p} />
      {replies.length > 0 && (
        <div class="thread">
          {(open ? replies : replies.slice(0, 1)).map((r) => (
            <CardBody key={r.id} p={r} reply />
          ))}
          {!open && (
            <button class="link thread-more" onClick={() => setOpen(true)}>
              הצג עוד {replies.length - 1} תגובות
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function CardBody({ p, reply }: { p: Post; reply?: boolean }) {
  return (
    <div class={`cb ${reply ? "cb-reply" : ""}`}>
      <Avatar id={p.uid} name={p.name} size={reply ? 24 : 32} />
      <div class="cb-main">
        <div class="cb-meta">
          <bdi class="cb-name">{p.name}</bdi>
          <span class="cb-time">{ago(p.ts)}</span>
          {p.pinned && (
            <span class="badge badge-pin">
              <Pin size={11} /> נעוץ · {left(p.expiresAt)}
            </span>
          )}
        </div>
        {p.kind === "ref" ? (
          <RefCard p={p} />
        ) : (
          <div class="cb-text" dir="auto">
            {p.body}
          </div>
        )}
        <div class="cb-actions">
          <button class={`act ${p.liked ? "liked" : ""}`} aria-pressed={p.liked} aria-label={p.liked ? "ביטול לייק" : "לייק"} onClick={() => toggleLike(p)}>
            <Heart size={16} fill={p.liked} />
            {p.likes > 0 && <span class="num">{count(p.likes)}</span>}
          </button>
          {!reply && (
            <button class="act" onClick={() => needAuth(() => (replyTo.value = p))}>
              <Reply size={16} /> השב
            </button>
          )}
          <button class="act act-more" aria-label="פעולות" onClick={() => (sheet.value = { type: "menu", itemType: "post", item: p })}>
            <More size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PostComposer() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canPost.value) return <div class="composer-off">התגובות כבויות בדף הזה לבקשת בעל האתר.</div>;
  const r = replyTo.value;
  const submit = () =>
    needAuth(async () => {
      if (text.trim().length < 2 || busy) return;
      setBusy(true);
      if (await submitPost(text)) setText("");
      setBusy(false);
    });
  return (
    <div class="composer">
      {r ? (
        <div class="reply-chip">
          <Reply size={14} /> בתגובה ל<bdi>{r.name}</bdi>
          <button class="icon-btn" aria-label="ביטול תגובה" onClick={() => (replyTo.value = null)}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div class="composer-to">
          תגובה על: <strong>{scopeNames.value[scope.value]}</strong> · נשמרת {retentionDays.value} ימים
        </div>
      )}
      <div class="composer-row">
        <textarea
          class="input"
          rows={1}
          dir="auto"
          maxLength={2000}
          placeholder={me.value ? "מה דעתכם?" : "התחברו כדי להגיב…"}
          value={text}
          aria-label="תגובה"
          onFocus={(e) => !me.value?.termsAccepted && (e.currentTarget.blur(), needAuth(() => {}))}
          onInput={(e) => {
            const el = e.currentTarget;
            setText(el.value);
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 140) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <button class="btn btn-primary btn-sm composer-post" disabled={text.trim().length < 2 || busy} onClick={submit}>
          {busy ? "מפרסם…" : "פרסום"}
        </button>
      </div>
    </div>
  );
}
