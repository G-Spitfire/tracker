// Run: PW_MODULE=playwright CHROMIUM_PATH=/path/to/chromium node tests/browser.cjs
const {chromium}=require(process.env.PW_MODULE||'playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=process.env.SCREENSHOT_DIR;
let oldWorker=false;
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/moya-kapa/sw.js'&&oldWorker){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');return res.end(`const CACHE='moya-kapa-v2-1-update-20261113';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./app.js','./app.css','./core.js','./db.js'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));`)}
  if(!pathname.startsWith('/moya-kapa/')){res.writeHead(404);return res.end()}
  const file=path.resolve(root,'.'+pathname.slice('/moya-kapa'.length)+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  try{res.setHeader('Content-Type',({'html':'text/html','js':'text/javascript','css':'text/css','webmanifest':'application/manifest+json','png':'image/png'})[file.split('.').pop()]||'text/plain');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/moya-kapa/`;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
 const context=await browser.newContext({viewport:{width:375,height:667},timezoneId:'Europe/Moscow',isMobile:true,hasTouch:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-11-24T12:00:00+03:00')});
 await page.clock.pauseAt(new Date('2026-11-24T12:00:01+03:00'));
 page.setDefaultTimeout(10000);
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#goalLabel').textContent==='из 120 минут');
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.evaluate(async()=>{const db=await import('./db.js');await db.put('sessions',{id:'seed',type:'manual',date:'2026-11-24',seconds:1800})});
 await page.reload();await page.waitForFunction(()=>document.querySelector('#todayTime').textContent==='00:30:00');
 await page.locator('#toggle').click();await page.clock.fastForward(600000);
 await page.waitForFunction(()=>document.querySelector('#todayTime').textContent==='00:40:00');
 assert.match(await page.locator('#timerHint').textContent(),/00:10:00/);
 assert.equal(await page.locator('#progress').getAttribute('aria-valuenow'),'33');
 for(const [width,height] of [[375,667],[393,852],[430,932]]){
   await page.setViewportSize({width,height});
   const b=await page.locator('#toggle').boundingBox(),t=await page.locator('#timerHint').boundingBox();
   assert.ok(b.y+b.height<height&&t.y+t.height<height,`Timer and button fit ${width}`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({style:'#toast{visibility:hidden}',path:path.join(output,`today-${width}x${height}.png`)})}
 }
 await page.locator('#toggle').click();await page.waitForFunction(()=>document.querySelector('#toggle').textContent==='Надела капу');console.log('Timer saved');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#todayTime').textContent==='00:40:00');
 await page.locator('[data-night="all"]').click();await page.waitForFunction(()=>document.querySelector('[data-night="all"]').getAttribute('aria-pressed')==='true');
 await page.reload();await page.waitForFunction(()=>document.querySelector('[data-night="all"]').getAttribute('aria-pressed')==='true');
 await page.locator('#openHistory').click();await page.locator('[data-date="2026-11-24"]').click();assert.match(await page.locator('#selectedSummary').textContent(),/40 мин/);
 await page.locator('[data-date="2026-11-23"]').click();assert.match(await page.locator('#selectedSummary').textContent(),/ночь: носила/);
 for(const [width,height] of [[375,667],[393,852],[430,932]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(output)await page.screenshot({style:'#toast{visibility:hidden}',path:path.join(output,`history-${width}x${height}.png`)})}
 await page.locator('#page-history [data-back]').click();await page.locator('#openAwards').click();
 assert.equal(await page.locator('.award:not(.locked)').count(),1);
 for(const [width,height] of [[375,667],[393,852],[430,932]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(output)await page.screenshot({style:'#toast{visibility:hidden}',path:path.join(output,`awards-${width}x${height}.png`)})}
 await page.locator('#page-awards [data-back]').click();
 // Two concurrent stops must save the same active session only once.
 await page.evaluate(async()=>{const db=await import('./db.js');await db.put('meta',{key:'active',start:Date.now()-60000});await Promise.all([db.finishSession({id:'race-a',type:'timer',start:Date.now()-60000,end:Date.now()}),db.finishSession({id:'race-b',type:'timer',start:Date.now()-60000,end:Date.now()})]);const rows=await db.all('sessions');if(rows.filter(s=>s.id.startsWith('race-')).length!==1)throw Error('Duplicate session')});
 console.log('Atomic stop passed; checking offline');await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelector('#todayTime').textContent==='00:41:00');
 await page.locator('#toggle').click();await page.clock.fastForward(60000);await page.locator('#toggle').click();await page.waitForFunction(()=>document.querySelector('#toggle').textContent==='Надела капу');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#todayTime').textContent==='00:42:00');
 await context.setOffline(false);
 // Cross midnight: only today's portion enters today's ring.
 await page.clock.setFixedTime(new Date('2026-11-24T23:55:00+03:00'));await page.locator('#toggle').click();await page.clock.setFixedTime(new Date('2026-11-25T00:05:00+03:00'));await page.clock.runFor(1000);await page.waitForFunction(()=>document.querySelector('#todayTime').textContent==='00:05:00');assert.match(await page.locator('#timerHint').textContent(),/00:10:00/);
 // Before the start date the night control is hidden.
 await page.clock.setFixedTime(new Date('2026-11-23T12:00:00+03:00'));await page.clock.runFor(1000);assert.equal(await page.locator('#nightCard').isVisible(),false);
 assert.deepEqual(errors,[]);await context.close();
 // A 2.1 worker upgrades to 2.2, preserves data and removes only this app's old cache.
 console.log('Offline and midnight passed; checking upgrade');oldWorker=true;const ctx=await browser.newContext();const p=await ctx.newPage();await p.goto(url);await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await p.evaluate(async()=>{await caches.open('other-app-test');const db=await import('./db.js');await db.put('sessions',{id:'update',type:'manual',date:'2026-11-24',seconds:600});await db.put('meta',{key:'active',start:Date.now()})});
 oldWorker=false;const updatedPage=p.waitForEvent('load');await p.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));await updatedPage;
 await p.waitForFunction(async()=> (await caches.keys()).some(k=>k.includes('v2-2'))&&!(await caches.keys()).includes('moya-kapa-v2-1-update-20261113'));
 await p.waitForFunction(async()=>{const db=await import('./db.js');return !!(await db.get('sessions','update'))&&!!(await db.get('meta','active')).start});
 assert.ok(await p.evaluate(async()=>(await caches.keys()).includes('other-app-test')));
 await ctx.setOffline(true);await p.reload();await p.locator('#toggle').waitFor();await p.waitForFunction(()=>document.querySelector('#toggle').textContent==='Сняла капу');await ctx.close();
 console.log('PASS: three mobile layouts, daily/session totals, timer persistence, nights, history, awards, atomic stop, offline, midnight, 2.1→2.2 update with data preservation.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
