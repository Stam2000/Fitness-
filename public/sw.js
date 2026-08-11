/*
 * Service worker — mode hors ligne.
 *
 * Stratégies par type de ressource :
 * - /_next/static/  : cache-first (assets hashés, immuables)
 * - /api/media/     : cache-first (fichiers nommés par hash de contenu),
 *                     sauf requêtes Range (vidéo) et fichiers volumineux
 * - autres /api/    : réseau uniquement (données et mutations)
 * - pages / RSC     : réseau d'abord, copie en cache en secours hors ligne
 *
 * Incrémenter VERSION invalide tous les caches au prochain déploiement.
 */
const VERSION = "v1";
const RUNTIME = `runtime-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const STATIC = `static-${VERSION}`;
const KEEP = [RUNTIME, MEDIA, STATIC];
const MAX_CACHED_MEDIA_BYTES = 8 * 1024 * 1024;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  const length = parseInt(response.headers.get("content-length") ?? "0", 10);
  if (response.ok && length < MAX_CACHED_MEDIA_BYTES) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    // Navigation vers une page jamais visitée : repli sur l'accueil en cache.
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    return new Response(
      "Hors ligne — cette page n'a pas encore été visitée.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/media/")) {
    // Les requêtes Range (lecture vidéo) passent en direct : un cache ne
    // sait pas répondre en 206 partiel.
    if (request.headers.has("range")) return;
    event.respondWith(cacheFirst(request, MEDIA));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  event.respondWith(networkFirst(request, RUNTIME));
});
