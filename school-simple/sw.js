const CACHE_NAME = "school-shell-v1.33.16-grade-trends";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./analytics.js",
  "./manifest.webmanifest",
  "./version.json",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./brand-mark.svg",
  "./school-sync-client.js",
  "./assets/icons.js",
  "./assets/illustrations.js",
  "./assets/empty-states/pencil.png",
  "./assets/empty-states/dance.png",
  "./assets/empty-states/clay.png",
  "./assets/empty-states/tv.png",
  "./assets/empty-states/console.png",
  "./assets/empty-states/ball.png",
  "./assets/empty-states/phone.png",
  "./assets/empty-states/book.png",
  "./icons.html",
  "./caveman-run-light.webp",
  "./caveman-run-dark.webp"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("school-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/version.json")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put("./index.html", response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match("./index.html")) ||
          new Response("Приложение пока не открывалось онлайн. Подключитесь к интернету для первой загрузки.", {
            status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      }
    })());
    return;
  }

  if (url.pathname.includes("/data.enc.json")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Prefer fresh application assets; retain cached copies for offline use.
    // This also delivers fixes when a deployment keeps the same app version.
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
