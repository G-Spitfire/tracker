const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(__dirname,'artifacts');
fs.mkdirSync(out,{recursive:true});
const html=path.join(root,'index.html');
if(!fs.existsSync(html))throw new Error('Calendar application missing: календарь/index.html; upload version 0.11.2 before running audit');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 try {
  for(const width of [1280,1366,1440]){
   const page=await browser.newPage({viewport:{width,height:800}});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.goto('http://127.0.0.1:8765/календарь/index.html',{waitUntil:'load'});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…',null,{timeout:10000});
   await page.screenshot({path:path.join(out,'calendar-'+width+'.png'),fullPage:true});
   const visible=await page.locator('body').isVisible();
   const db=await page.evaluate(async()=>{const list=await indexedDB.databases();return list.map(x=>x.name)});
   await page.locator('#side-new').click();
   const editorOpened=await page.locator('#editor').evaluate(el=>el.open);
   await page.locator('#cancel').click();
   const editorClosed=await page.locator('#editor').evaluate(el=>!el.open);
   await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('school-calendar-mvp');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});const stores=[...db.objectStoreNames];if(!stores.includes('employees'))throw Error('Missing employees store');await new Promise((resolve,reject)=>{const tx=db.transaction('employees','readwrite');tx.objectStore('employees').put({id:'audit-staff',name:'Тестовый сотрудник',displayName:'Тестовый',archived:false});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()});
   await page.reload({waitUntil:'load'});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');
   await page.locator('#side-absence').click();
   const absenceOpened=await page.locator('#absence-dialog').evaluate(el=>el.open);
   const absenceContentFits=await page.locator('#absence-dialog').evaluate(el=>{const d=el.getBoundingClientRect(),inner=el.querySelector('.absence-dialog')?.getBoundingClientRect();return !!inner&&inner.left>=d.left-1&&inner.right<=d.right+1&&d.left>=0&&d.right<=innerWidth+1});
   await page.screenshot({path:path.join(out,'absence-'+width+'.png')});
   await page.locator('#absence-cancel').click();
   const absenceClosed=await page.locator('#absence-dialog').evaluate(el=>!el.open);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   const layout=await page.evaluate(()=>({gridWidth:document.querySelector('#grid').getBoundingClientRect().width,viewportWidth:innerWidth,brandVisible:!!document.querySelector('.aspect-brand'),brandAccessible:document.querySelector('.aspect-brand')?.getAttribute('aria-label')==='ASPECT Educational Centre'}));
   await page.locator('#side-new').click();
   const editorFits=await page.locator('#editor').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1});
   await page.screenshot({path:path.join(out,'editor-'+width+'.png')});
   await page.locator('#cancel').click();
   results.push({width,visible,overflow,db,editorOpened,editorClosed,absenceOpened,absenceClosed,absenceContentFits,editorFits,layout,errors});
   await page.close();
  }
 } finally {await browser.close();}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
 if(results.some(x=>!x.visible||x.overflow||!x.db.length||!x.editorOpened||!x.editorClosed||!x.absenceOpened||!x.absenceClosed||!x.absenceContentFits||!x.editorFits||!x.layout.brandVisible||!x.layout.brandAccessible||x.errors.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
