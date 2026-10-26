// AddMedia service worker: makes the panel installable (home screen, Android share sheet).
// Network first; when offline, the last panel shell is shown instead of the browser's error page.
const SHELL = "am-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.add("/panel/")).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate" || !new URL(e.request.url).pathname.startsWith("/panel")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) caches.open(SHELL).then((c) => c.put("/panel/", r.clone())).catch(() => {});
        return r;
      })
      .catch(() => caches.match("/panel/").then((r) => r || Response.error())),
  );
});
