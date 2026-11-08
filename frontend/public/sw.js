/**
 * Campus Bites offline service worker.
 *
 * Once a student has opened the site once while online, the service worker
 * keeps the app shell available if they come back with no connection. The app
 * then renders its offline Ludo overlay instead of Chrome's error page.
 *
 * API traffic is never cached: orders and auth must stay live.
 */

const CACHE_NAME = "campus-bites-shell-v1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/logo.png",
  "/og-image.png",
  "/robots.txt",
  "/sitemap.xml",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);

      // The HTML names the hashed JS/CSS bundles. Cache those too so the app
      // can actually boot on a later offline visit, not just render splash HTML.
      const html = await (await fetch("/index.html")).text();
      const bundleUrls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
        (match) => match[1]
      );
      if (bundleUrls.length) await cache.addAll(bundleUrls);

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
    )
  );
});
