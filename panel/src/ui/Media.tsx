import { API_BASE } from "../api";
import { Pin, Plus } from "../icons";
import { canPost, me, needAuth, retentionDays, sheet, visibleMedia } from "../state";

export const mediaUrl = (path: string) => API_BASE + path;

export function MediaView() {
  const items = visibleMedia.value;
  const add = () => needAuth(() => (sheet.value = { type: "mymedia", section: "create" }));
  return (
    <section class="view view-media">
      <div class="grid">
        {canPost.value && (
          <button class="tile tile-add" onClick={add}>
            <span class="tile-add-ic">
              <Plus size={22} />
            </span>
            <span>הוסיפו תמונה</span>
            {me.value && <span class="tile-add-n">{me.value.credits.media > 0 ? `נותרו ${me.value.credits.media}` : "מ-9.90 ₪"}</span>}
          </button>
        )}
        {items.map((p) => (
          <button key={p.id} class="tile" onClick={() => (sheet.value = { type: "viewer", post: p })} aria-label={p.body || `תמונה מאת ${p.name}`}>
            <img src={mediaUrl(p.media!)} alt={p.body || ""} loading="lazy" decoding="async" />
            {p.pinned && (
              <span class="tile-badge">
                <Pin size={11} />
              </span>
            )}
          </button>
        ))}
      </div>
      {!items.length && (
        <div class="empty">
          <div class="empty-title">עוד אין כאן תמונות</div>
          <div class="empty-sub">תמונה מהשטח, צילום מסך או גרף — הן מוצגות לכל מי שקורא את הדף, {retentionDays.value} ימים.</div>
        </div>
      )}
    </section>
  );
}
