// Stroke icons (24px grid). Paths follow the open-source Feather/Lucide sets (MIT/ISC licenses).
import type { JSX } from "preact";

type P = { size?: number; class?: string; title?: string; fill?: boolean };

function I(paths: JSX.Element, { size = 20, class: cls = "", title, fill }: P, mirror = false) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={`ic${mirror ? " mirror" : ""} ${cls}`}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {paths}
    </svg>
  );
}

export const Send = (p: P) => I(<><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" /></>, p, true);
export const ImageI = (p: P) => I(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>, p);
export const Heart = (p: P) => I(<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />, p);
export const Reply = (p: P) => I(<><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>, p, true);
export const More = (p: P) => I(<><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>, p);
export const Flag = (p: P) => I(<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>, p);
export const X = (p: P) => I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, p);
export const Chevron = (p: P) => I(<path d="m6 9 6 6 6-6" />, p);
export const Back = (p: P) => I(<path d="m9 18 6-6-6-6" />, p);
export const Users = (p: P) => I(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>, p);
export const Lock = (p: P) => I(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, p);
export const Pin = (p: P) => I(<><path d="M12 17v5" /><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></>, p);
export const Plus = (p: P) => I(<><path d="M12 5v14" /><path d="M5 12h14" /></>, p);
export const Globe = (p: P) => I(<><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" /></>, p);
export const FileI = (p: P) => I(<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h6" /></>, p);
export const SplitI = (p: P) => I(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 13h18" /></>, p);
export const SideI = (p: P) => I(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>, p);
export const Check = (p: P) => I(<path d="M20 6 9 17l-5-5" />, p);
export const Clock = (p: P) => I(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>, p);
export const Alert = (p: P) => I(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>, p);
export const Info = (p: P) => I(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>, p);
export const Trash = (p: P) => I(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, p);
export const Shield = (p: P) => I(<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />, p);
export const LogOut = (p: P) => I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>, p, true);
export const ArrowDown = (p: P) => I(<><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>, p);
export const Sparkles = (p: P) => I(<><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></>, p);
export const Mail = (p: P) => I(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>, p);
export const Copy = (p: P) => I(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, p);
export const Ban = (p: P) => I(<><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>, p);
export const Refresh = (p: P) => I(<><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>, p);
export const Wifi = (p: P) => I(<><path d="M12 20h.01" /><path d="M2 8.8a15 15 0 0 1 20 0" /><path d="M5 12.9a10 10 0 0 1 14 0" /><path d="M8.5 16.4a5 5 0 0 1 7 0" /></>, p);
export const External = (p: P) => I(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>, p, true);
export const Search = (p: P) => I(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, p);
