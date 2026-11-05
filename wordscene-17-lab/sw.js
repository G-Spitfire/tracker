const CACHE='wordscene-17-lab-cache-v18';
const ASSETS=['./','./index.html','./style.css','./style.css?v=shore-20261105','./paper-lighthouse.svg','./paper-leaves.svg','./paper-sand.svg','./paper-shore-base.svg','./app.js?v=18','./engine.js?v=18','./accounts.js','./sync.js','./cloud-firestore.js','./cloud-ui.mjs','./seed.js','./legacy-art.js','./manifest.webmanifest','../wordscene/content.js','../wordscene/topics.js','../wordscene/assets/mug-scene.png'];
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