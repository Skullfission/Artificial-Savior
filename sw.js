// Artificial Savior — offline service worker.
// Cache-first strategy: all assets are pre-cached on install so the game plays fully offline after first visit.

const CACHE = "artificial-savior-v21";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.webmanifest",
  "./privacy.html",
  "./content/level1.json",
  "./content/sprites.json",
  "./audio/Artificial Savior.mp3",
  "./Ship art/MK 1 ship.png",
  "./Ship art/MK 2 ship.png",
  "./Ship art/MK 3 ship.png",
  "./Ship art/Dragon Ship.png",
  "./Ship art/Scourge Semi-Boss.png",
  "./Ship art/Harbinger - Final Boss.png",
  "./Ship art/MK 2 small gun.png",
  "./Ship art/MK 2 large gun.png",
  "./Ship art/MK 2 Laser.png",
  "./Ship art/MK 2 Missle.png",
  "./icons/icon-48.png",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-192.png",
  "./icons/icon-256.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll would bail on any single failure; add tolerantly.
    await Promise.all(ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res);
      } catch (_) { /* swallow missing asset so install succeeds */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      // Refresh in background for next load.
      fetch(req).then(res => {
        if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && new URL(req.url).origin === self.location.origin) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    } catch (_) {
      // Offline fallback — try cached index for navigations.
      if (req.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});
