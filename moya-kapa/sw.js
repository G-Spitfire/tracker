// Bump this name whenever the application shell or illustrations change.
const CACHE='moya-kapa-v2-2-preview-20261113-1';
const ASSETS=['./','./index.html','./app.css','./app.js','./core.js','./db.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
const ART=['./art/bunny-heart.png','./art/girl-seaside.png','./art/bunnies-hug.png'];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(ASSETS);
    // A missing illustration must not prevent offline installation of the shell.
    await Promise.all(ART.map(async path=>{
      try{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response)}catch{}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('moya-kapa-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    // app.js reloads once on controllerchange; do not also navigate each client.
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Keep HTML, modules and styles from the same installed build, online or off.
    const cached=await cache.match(request,{ignoreSearch:true});
    if(cached)return cached;
    try{
      const response=await fetch(request);
      if(response.ok&&ART.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))await cache.put(request,response.clone());
      return response;
    }catch{
      if(request.mode==='navigate')return (await cache.match('./index.html'))||Response.error();
      return Response.error();
    }
  })());
});
