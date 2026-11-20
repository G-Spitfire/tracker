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
  for(const width of [1280,1440]){
   const page=await browser.newPage({viewport:{width,height:800}});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.goto('file://'+html,{waitUntil:'load'});
   await page.screenshot({path:path.join(out,'calendar-'+width+'.png'),fullPage:true});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…',{timeout:10000});
   const visible=await page.locator('body').isVisible();
   const db=await page.evaluate(async()=>{const list=await indexedDB.databases();return list.map(x=>x.name)});
   await page.locator('#side-new').click();
   const editorOpened=await page.locator('#editor').evaluate(el=>el.open);
   await page.locator('#cancel').click();
   const editorClosed=await page.locator('#editor').evaluate(el=>!el.open);
   await page.locator('#side-absence').click();
   const absenceOpened=await page.locator('#absence-dialog').evaluate(el=>el.open);
   await page.locator('#absence-cancel').click();
   const absenceClosed=await page.locator('#absence-dialog').evaluate(el=>!el.open);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   results.push({width,visible,overflow,db,editorOpened,editorClosed,absenceOpened,absenceClosed,errors});
   await page.close();
  }
 } finally {await browser.close();}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
 if(results.some(x=>!x.visible||x.overflow||!x.db.length||!x.editorOpened||!x.editorClosed||!x.absenceOpened||!x.absenceClosed||x.errors.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
