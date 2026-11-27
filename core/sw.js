const PREFIX = "core-pwa:" + self.registration.scope + ":";
const CACHE = PREFIX + "1.1.0";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./logic.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
    .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    !e.request.url.startsWith(self.registration.scope)
  )
    return;
  e.respondWith(caches.open(CACHE).then(async c => {
    if (e.request.mode === "navigate") {
      return (await c.match("./index.html")) || fetch(e.request);
    }
    return (await c.match(e.request)) || fetch(e.request);
  }));
});
