const CACHE='leveli-v18-profile-personalization';
const FILES=['./','./index.html','./school-model.js','./manifest.webmanifest','./brand/mark.svg','./brand/app-icon.svg','./brand/app-icon-maskable.svg','./brand/app-icon-192.png','./brand/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('leveli-v')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never cache credentials, Firestore requests, or private API responses.
 if(event.request.method!=='GET'||!(url.origin===location.origin||url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/')))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(()=>caches.match(event.request).then(cached=>cached||(event.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
