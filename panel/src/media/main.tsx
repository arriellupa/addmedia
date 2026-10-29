import { effect } from "@preact/signals";
import { render } from "preact";
import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/secular-one/400.css";
import "../styles.css";
import "./media.css";
import "./campus.css";
import { initAuth, me, page, setPage, setScope, say } from "../state";
import { api } from "../api";
import { MediaPage } from "./MediaPage";
import { goHome, loadFollows, loadStudent, loadTree, mode, openPlace, parseLocation, place, remember, student, pendingDoc } from "./state";

document.documentElement.dataset.theme = "light";

async function start() {
  await initAuth();
  const loc = parseLocation();
  // on a phone the page is the students' mirror: the campus, by faculty, year and lesson
  const phone = matchMedia("(max-width: 640px)").matches;
  if (loc.mode === "campus" || (!loc.url && phone)) {
    mode.value = "campus";
    loadTree();
    let saved: any = null;
    try {
      saved = JSON.parse(localStorage.getItem("am_last_place") || "null");
    } catch {}
    // /media/campus/doc/<id>: a document by its id alone (admin links, shares) — its place comes from the server
    const dm = location.pathname.match(/^\/media\/campus\/doc\/([A-Za-z0-9_-]{4,40})\/?$/);
    if (dm) {
      try {
        const r = await api.getDoc(dm[1]);
        pendingDoc.value = { id: r.doc.id, section: 1 };
        openPlace(r.doc.place, true);
      } catch (e: any) {
        say(e?.message || "המסמך לא נמצא.", "err");
        history.replaceState(null, "", "/media/campus");
      }
    } else if (loc.place) openPlace(loc.place, true);
    else if (saved?.inst && !me.value) openPlace(saved, true);
    else history.replaceState(null, "", "/media/campus"); // the home: «הדפים שלי», or the picker as the first screen
  } else if (loc.url) {
    setPage({ url: loc.url, title: loc.title || null });
    if (loc.url.match(/^https?:\/\/[^/]+\/?$/)) setScope("site");
  }
  loadFollows();
}

// the address bar follows the room, so every page has a shareable link and the back button works
effect(() => {
  const p = page.value;
  if (mode.value !== "center") return;
  if (!p) return;
  let path = `/media/?url=${encodeURIComponent(p.url)}`;
  try {
    const u = new URL(p.url);
    if ((u.pathname === "/" || !u.pathname) && !u.search) path = `/media/site/${u.host.replace(/^www\./, "")}`;
  } catch {}
  if (location.pathname + location.search !== path) history.replaceState(null, "", path);
});
effect(() => {
  me.value;
  loadFollows();
  student.value = undefined;
  if (me.value) loadStudent(true);
});
effect(() => {
  place.value;
  remember();
});
window.addEventListener("popstate", () => {
  const loc = parseLocation();
  if (loc.mode === "campus") {
    mode.value = "campus";
    if (loc.place) openPlace(loc.place, true);
    else goHome();
  } else {
    mode.value = "center";
    if (loc.url) setPage({ url: loc.url, title: loc.title || null });
    else setPage(null);
  }
});

render(<MediaPage />, document.getElementById("app")!);
start();
