'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const sizes=[320,375,393,430];
const marks=Array.from({length:35},(_,i)=>({subjectId:'s'+i,subject:'Предмет '+i,value:4,date:'2026-11-19',type:'Урок'}));
const diary={schemaVersion:1,generatedAt:new Date().toISOString(),children:{polina:{marks,lessons:[],schedule:[]},matvey:{marks,lessons:[],schedule:[]}}};
let failures=0;
async function check(label,condition,details=''){console.log((condition?'PASS':'FAIL')+' '+label+' '+details);if(!condition)failures++;}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of sizes){
   const context=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/school-sync-client.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SchoolSync={readCached:async()=>({data:'+JSON.stringify(diary)+'}),sync:async()=>({source:"network",data:'+JSON.stringify(diary)+'})};'}));
   await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:'{"version":"1.32.6"}'}));
   await page.goto('http://127.0.0.1:8765/school-simple/index.html');
   await page.locator('[data-action="tab"][data-value="grades"]').click();
   await page.waitForTimeout(100);
   await page.evaluate(()=>{window.__navBefore=document.querySelector('#nav').firstElementChild;window.scrollTo(0,document.documentElement.scrollHeight)});
   const before=await page.evaluate(()=>window.scrollY);
   await page.evaluate(()=>render({preserveScroll:true}));
   const after=await page.evaluate(()=>window.scrollY);
   check(width+' preserve scroll',before>100&&Math.abs(after-before)<3,'before='+before+' after='+after);
   check(width+' nav identity',await page.evaluate(()=>window.__navBefore===document.querySelector('#nav').firstElementChild));
   await page.locator('[data-action="tab"][data-value="schedule"]').click();
   const top=await page.evaluate(()=>window.scrollY);
   check(width+' navigation starts at top',top<3,'scroll='+top);
   for(const tab of ['home','grades','schedule','homework']){
    await page.locator('[data-action="tab"][data-value="'+tab+'"]').click();
    const geometry=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,navHeight:document.querySelector('#nav').getBoundingClientRect().height}));
    check(width+' '+tab+' no horizontal overflow',geometry.scrollWidth<=geometry.viewport+1,JSON.stringify(geometry));
   }
   await page.locator('#profile').click();
   const profileGeometry=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
   check(width+' profile no horizontal overflow',profileGeometry.scrollWidth<=profileGeometry.viewport+1,JSON.stringify(profileGeometry));
   const oldSyncBlock=await page.locator('.sync-meta').count();
   check(width+' profile sync information moved to dialog',oldSyncBlock===0,'oldSyncBlock='+oldSyncBlock);
   await page.locator('[data-action="theme"][data-value="dark"]').click();
   await page.locator('[data-action="accent"][data-value="#ef4444"]').click();
   await page.reload();
   await page.locator('#profile').click();
   const settings=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()}));
   check(width+' theme survives reload',settings.theme==='dark',JSON.stringify(settings));
   check(width+' accent survives reload',settings.accent==='#ef4444',JSON.stringify(settings));
   check(width+' JavaScript exceptions',errors.length===0,JSON.stringify(errors));
   // Visual evidence: five screens, two themes, all four mobile widths.
   const screenshotDir=path.join(process.cwd(),'school-ui-screenshots');
   fs.mkdirSync(screenshotDir,{recursive:true});
   for(const theme of ['light','dark']){
    for(const tab of ['home','grades','schedule','homework','profile']){
     await page.evaluate(({theme,tab})=>{state.theme=theme;setTab(tab);render();window.scrollTo(0,0);},{theme,tab});
     await page.screenshot({path:path.join(screenshotDir,width+'-'+theme+'-'+tab+'.png'),fullPage:true,animations:'disabled'});
    }
   }
   await page.evaluate(()=>{state.child=0;state.quarter=currentQuarter();state.gradesView='grades';state.testsOnly=false;state.twosOnly=false;kids[0].subjects=[{name:'Test',grades:[{value:2,test:true,date:iso(TODAY)},{value:2,test:false,date:iso(TODAY)},{value:5,test:true,date:iso(TODAY)}]}];setTab('grades');render();});
   const count=()=>page.locator('.subject .mark').count();
   check(width+' all marks',await count()===3);
   await page.locator('#tests-toggle').check();
   check(width+' control filter',await count()===2);
   await page.locator('#twos-toggle').check();
   check(width+' combined filters',await count()===1);
   await page.locator('#tests-toggle').uncheck();
   check(width+' twos filter',await count()===2);
   check(width+' unchanged average',(await page.locator('.subject-average').innerText())==='3,00');
   const compact=await page.evaluate(()=>{const a=document.querySelector('#tests-toggle').getBoundingClientRect(),b=document.querySelector('#twos-toggle').getBoundingClientRect();return a.y===b.y&&a.width===16&&b.width===16});
   check(width+' compact filters',compact);
   await context.close();
  }
  // Notification regression: late grade, first snapshot, duplicate, read, per-child, two-day window.
  const noticeContext=await browser.newContext({viewport:{width:375,height:844},serviceWorkers:'block'});
  try{
   const page=await noticeContext.newPage();
   const initial={...diary,children:{polina:{...diary.children.polina,marks:[]},matvey:{...diary.children.matvey,marks:[]}}};
   await page.route('**/school-sync-client.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SchoolSync={readCached:async()=>null,sync:async()=>({source:"network",data:'+JSON.stringify(initial)+'})};'}));
   await page.goto('http://127.0.0.1:8765/school-simple/index.html');
   await page.waitForFunction(()=>dataSource==='live');
   const result=await page.evaluate(()=>{
    const initial=noticeData().events.length===0;
    kids[0].subjects=[{name:'Математика',grades:[{id:12345,date:'2026-11-19',value:5,type:'Домашняя работа'}]}];
    noticeTrack();const first=noticeData().events.length===1;
    noticeTrack();const noDuplicate=noticeData().events.length===1;
    const e=noticeData().events[0],late=e?.grade.date==='2026-11-19'&&e.day===iso(TODAY);
    const polina=noticeList().length===1;state.child=1;const matvey=noticeList().length===0;state.child=0;
    noticeOpen(e.id);const read=noticeData().events[0].read===true;
    kids[0].subjects=[];noticeTrack();kids[0].subjects=[{name:'Математика',grades:[{id:12345,date:'2026-11-19',value:5,type:'Домашняя работа'}]}];noticeTrack();
    const rediscovered=noticeData().events.length===1;
    return {initial,first,noDuplicate,late,polina,matvey,read,rediscovered};
   });
   for(const [name,passed] of Object.entries(result))check('notice '+name,passed);
  }finally{await noticeContext.close();}
  // Exercise the actual service worker cache, rather than the mocked UI-only mode.
  const offlineContext=await browser.newContext({viewport:{width:375,height:844},serviceWorkers:'allow'});
  try{
   const offlinePage=await offlineContext.newPage(),offlineErrors=[];
   offlinePage.on('pageerror',e=>offlineErrors.push(e.message));
   await offlinePage.goto('http://127.0.0.1:8765/school-simple/index.html');
   // Service worker activation may trigger a page navigation; Playwright's waitForFunction retries across navigations.
   await offlinePage.waitForFunction(()=>navigator.serviceWorker.ready.then(()=>true),null,{timeout:15000});
   await offlinePage.waitForTimeout(500);
   // Seed a synthetic snapshot in the real IndexedDB store to verify offline diary rendering.
   await offlinePage.evaluate(async sample=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('school-diary-private',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({data:sample,savedAt:new Date().toISOString()},'latest-snapshot');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close();
   },diary);
   await offlineContext.setOffline(true);
   await offlinePage.reload({waitUntil:'domcontentloaded'});
   check('offline shell reload',await offlinePage.title()==='Школа');
   await offlinePage.waitForFunction(()=>typeof dataSource!=='undefined'&&dataSource==='cached',{timeout:10000});
   const cachedState=await offlinePage.evaluate(()=>({source:dataSource,subjects:kids[0].subjects.length}));
   check('offline IndexedDB diary available',cachedState.source==='cached'&&cachedState.subjects>0,JSON.stringify(cachedState));
   await offlineContext.setOffline(false);
   await offlinePage.route('**/school-data/data.enc.json*',route=>route.fulfill({status:503,contentType:'text/plain',body:'Temporary unavailable'}));
   await offlinePage.evaluate(()=>loadDiarySnapshot());
   await offlinePage.waitForFunction(()=>Boolean(syncWarning));
   const fallback=await offlinePage.evaluate(()=>({source:dataSource,subjects:kids[0].subjects.length,warning:syncWarning}));
   check('failed online sync preserves cached diary',fallback.source==='cached'&&fallback.subjects>0&&Boolean(fallback.warning),JSON.stringify(fallback));
   // Simulate a successful sync response after the failed network request.
   // This validates the app's recovery/render path, not remote encryption or transport.
   await offlinePage.evaluate(async sample=>{
    window.SchoolSync.sync=async()=>({source:'network',data:sample});
    await loadDiarySnapshot();
   },diary);
   const recovered=await offlinePage.evaluate(()=>({source:dataSource,subjects:kids[0].subjects.length,warning:syncWarning}));
   check('successful resync restores live status',recovered.source==='live'&&!recovered.warning,JSON.stringify(recovered));
   check('successful resync retains diary content',recovered.subjects>0,JSON.stringify(recovered));
   await offlinePage.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
   await offlinePage.waitForTimeout(200);
   check('resume events cause no JavaScript exceptions',offlineErrors.length===0,JSON.stringify(offlineErrors));
   check('offline shell no JavaScript exceptions',offlineErrors.length===0,JSON.stringify(offlineErrors));
  }finally{await offlineContext.close();}
 }finally{await browser.close();}
 console.log('Failures: '+failures);
 if(failures)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
