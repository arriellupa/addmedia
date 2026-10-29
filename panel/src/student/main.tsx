// AddStudent (addstudent.noaplate.com, /student/): the students' own light site. Same accounts and server as the
// media page; the campus's state and components are imported, the media page's behaviour is untouched.
import { effect } from "@preact/signals";
import { render } from "preact";
import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/secular-one/400.css";
import "../styles.css";
import "../media/media.css";
import "../media/campus.css";
import "./student.css";
import { initAuth, me } from "../state";
import { appBase, clearPlace, loadFollows, loadStudent, loadTree, mode, openPlace, parseLocation, place, remember, student } from "../media/state";
import { StudentApp } from "./StudentApp";

document.documentElement.dataset.theme = "light";
appBase.value = "/student";
mode.value = "campus";

async function start() {
  await initAuth();
  loadTree();
  const loc = parseLocation();
  if (loc.place) openPlace(loc.place, true);
  loadFollows();
}

// the follows and the student profile follow the PERSON, not every change of the user object (a password set,
// a name change): an open editor keeps its profile
let lastUid: string | null | undefined;
effect(() => {
  const uid = me.value?.id ?? null;
  if (uid === lastUid) return;
  lastUid = uid;
  loadFollows();
  student.value = undefined;
  if (uid) loadStudent(true);
});
effect(() => {
  place.value;
  remember();
});
window.addEventListener("popstate", () => {
  const loc = parseLocation();
  if (loc.place) openPlace(loc.place, true);
  else if (place.value) clearPlace();
});

render(<StudentApp />, document.getElementById("app")!);
start();
