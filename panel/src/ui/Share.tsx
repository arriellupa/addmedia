// «שיתוף»: the device's share sheet when there is one (phones), otherwise a copied link and a WhatsApp link.
import { useState } from "preact/hooks";
import { ShareI } from "../icons";
import { say } from "../state";

export async function shareLink(title: string, url: string, text?: string): Promise<void> {
  const abs = url.startsWith("http") ? url : location.origin + url;
  const nav = navigator as any;
  if (nav.share) {
    try {
      await nav.share({ title, text: text || title, url: abs });
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(abs);
    say("הקישור הועתק — אפשר להדביק בוואטסאפ של הכיתה.", "ok", { label: "וואטסאפ", run: () => window.open("https://wa.me/?text=" + encodeURIComponent(`${title}\n${abs}`), "_blank", "noopener") });
  } catch {
    window.open("https://wa.me/?text=" + encodeURIComponent(`${title}\n${abs}`), "_blank", "noopener");
  }
}

export function ShareButton({ title, url, text, label, cls = "icon-btn" }: { title: string; url: string; text?: string; label?: boolean; cls?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      class={cls + " share-btn"}
      title="שיתוף"
      aria-label="שיתוף"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await shareLink(title, url, text);
        setBusy(false);
      }}
    >
      <ShareI size={18} />
      {label && <span>שיתוף</span>}
    </button>
  );
}
