const CACHE_PREFIX='forma-tracker-';
const CACHE=CACHE_PREFIX+'v19-forma-v2-offline';
const FILES=['./','./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  const scopePath=new URL('./',self.registration.scope).pathname;
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(scopePath))return;
  event.respondWith(
    fetch(request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
      }
      return response;
    }).catch(async()=>{
      const cached=await caches.match(request);
      if(cached)return cached;
      if(request.mode==='navigate')return caches.match(new URL('./index.html',self.registration.scope));
      return Response.error();
    })
  );
});
