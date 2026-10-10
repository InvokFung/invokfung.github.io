/*
 * Keeps the home page working offline. Only the home page and its own files are handled, always
 * network first, so an online visit never sees a stale copy. Everything else on the site (the
 * blog, the project apps) is left alone.
 */
const CACHE = "home-v1";
const MINE = (url) =>
  url.origin === location.origin && (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/portfolio/"));
const FONTS = (url) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  )
);
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || !(MINE(url) || FONTS(url)) || url.pathname.includes("/media/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("/") : Response.error())))
  );
});
