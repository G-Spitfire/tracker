const CACHE='wordscene-17-lab-cache-v45';
const ASSETS=['./','./index.html','./style.css','./style.css?v=paper-audit-45','./paper-lighthouse.svg','./app.js?v=45','./engine.js?v=22','./accounts.js?v=22','./seed.js','./legacy-art.js','./manifest.webmanifest','./content.js?v=21','./topics.js?v=21','./assets/mug-scene.png','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-180.png','./assets/icon-maskable-512.png','./assets/wordscene-lighthouse-icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wordscene-17-lab-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 if(url.origin!==self.location.origin)return;
 const refresh=e.request.mode==='navigate'||(url.pathname.includes('/wordscene-17-lab/')&&(['/style.css','/index.html','/app.js','/engine.js'].some(suffix=>url.pathname.endsWith(suffix))));
 if(refresh){
  e.respondWith(fetch(e.request).then(r=>{
   if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
   return r;
  }).catch(()=>caches.match(e.request)));
  return;
 }
 e.respondWith(caches.match(e.request).then(v=>v||fetch(e.request).then(r=>{
  if(r.ok&&url.pathname.includes('wordscene-17-lab/')){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
  return r;
 })));
});

