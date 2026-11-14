// Serve a consistent, versioned offline shell; update it atomically on install.
const CACHE='moya-kapa-v2-3-2-20261114';
const ASSETS=['./','./index.html','./app.css','./app.js','./appearance.js','./icons.js','./core.js','./db.js','./initial-history.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('moya-kapa-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  try{return await fetch(request)}catch{
   if(request.mode==='navigate')return (await cache.match('./index.html'))||Response.error();
   return Response.error();
  }
 })());
});
