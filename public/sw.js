// Service worker : garde l'appli disponible hors connexion et met en cache les images.
const VERSION = "v4";
const SHELL = ["/", "/app.js", "/style.css", "/stores.js", "/manifest.webmanifest", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("shell-" + VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // toujours en direct
  if (url.pathname === "/img") return; // images : cache HTTP du navigateur (30 jours)
  // appli : réseau d'abord (pour avoir les mises à jour), cache si hors ligne
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open("shell-" + VERSION).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
