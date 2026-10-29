import { useEffect } from "preact/hooks";
import { X } from "../icons";

export function Dialog({ title, children, onClose, closable = true, wide, cls = "" }: { title: string; children: any; onClose: () => void; closable?: boolean; wide?: boolean; cls?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && closable && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [closable]);
  return (
    <div class={`scrim mc-scrim ${cls}`} onClick={(e) => e.target === e.currentTarget && closable && onClose()}>
      <div class={`sheet ${wide ? "sheet-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
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
