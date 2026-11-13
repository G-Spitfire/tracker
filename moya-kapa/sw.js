// PWA update fix: network-first navigation and versioned offline assets.
const CACHE='moya-kapa-v2-1-update-20261113';
const ASSETS=['./','./index.html','./app.css','./app.js','./core.js','./db.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('moya-kapa-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    // Existing installed iOS PWA may still be displaying the old cached document.
    // Ask controlled windows to refresh once when this worker takes over.
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients)client.postMessage({type:'PWA_UPDATED',version:CACHE});
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  // Never intercept other apps in the shared GitHub Pages repository.
  if(!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok){const cache=await caches.open(CACHE);await cache.put('./index.html',response.clone());}
        return response;
      }catch{
        return (await caches.match('./index.html'))||Response.error();
      }
    })());
    return;
  }
  // Check for fresh application scripts/styles when online, use cache offline.
  if(/\.(?:js|css|webmanifest)$/.test(url.pathname)){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}
        return response;
      }catch{return (await caches.match(request))||Response.error();}
    })());
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
