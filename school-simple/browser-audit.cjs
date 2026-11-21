'use strict';
// Read-only browser audit: synthetic diary data only, no real account or credentials.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.SCHOOL_AUDIT_URL || 'http://127.0.0.1:8765/school-simple/index.html';
const OUT = path.resolve(process.env.SCHOOL_AUDIT_OUT || 'school-audit-results');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const sizes = [
  {name:'iphone-se', width:375, height:667},
  {name:'iphone-regular', width:390, height:844},
  {name:'iphone-large', width:430, height:932},
  {name:'small-320', width:320, height:568},
];
const fakeDiary = {
  schemaVersion:1, generatedAt:new Date().toISOString(),
  children:{
    polina:{
      marks:[{subjectId:'m',subject:'Математика',value:5,date:'2026-11-19',type:'Контрольная работа'}],
      lessons:[{subjectId:'m',subject:'Математика',from:'2026-11-19T09:00:00',tasks:[{name:'Упражнение 5'}]}],
      schedule:[{subjectId:'m',subject:'Математика',from:'2026-11-20T09:00:00'}]
    },
    matvey:{
      marks:[{subjectId:'r',subject:'Русский язык',value:4,date:'2026-11-19',type:'Урок'}],
      lessons:[],schedule:[]
    }
  }
};
function record(view, scenario, ok, details) {
  results.push({view,scenario,ok,details});
  console.log((ok?'PASS':'FAIL')+' '+view+' / '+scenario+(details?' — '+JSON.stringify(details):''));
}
async function geometry(page) {
  return page.evaluate(() => {
    const root=document.documentElement;
    const offenders=[...document.querySelectorAll('body *')].filter(el=>{
      if(el.closest('.sr-only'))return false;
      const st=getComputedStyle(el);
      if(st.position==='fixed' || st.position==='absolute' || st.visibility==='hidden' || st.display==='none')return false;
      const r=el.getBoundingClientRect();
      return r.width>0 && (r.left < -1 || r.right > innerWidth+1);
    }).slice(0,12).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,80),text:(el.textContent||'').trim().slice(0,35)}));
    const nav=document.querySelector('#nav')?.getBoundingClientRect();
    return {viewport:innerWidth,scrollWidth:root.scrollWidth,overflow:root.scrollWidth>innerWidth+1,offenders,
      nav:nav?{bottom:Math.round(nav.bottom),height:Math.round(nav.height)}:null};
  });
}
async function run() {
 const browser=await chromium.launch({headless:true});
 try {
  for(const size of sizes) {
   const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.route('**/school-sync-client.js',route=>route.fulfill({
     contentType:'application/javascript',
     body:'window.SchoolSync={readCached:async()=>null,sync:async()=>({source:"network",data:'+JSON.stringify(fakeDiary)+'})};'
   }));
   await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:'{"version":"1.32.7"}'}));
   const view=size.name;
   try {
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30000});
    await page.getByText('Средний балл',{exact:true}).waitFor({timeout:15000});
    for(const [scenario,tab] of [['home','home'],['grades','grades'],['schedule','schedule'],['homework','homework']]) {
      if(tab!=='home')await page.locator('[data-action="tab"][data-value="'+tab+'"]').click();
      const g=await geometry(page);
      record(view,scenario+' geometry',!g.overflow && !g.offenders.length,g);
      await page.screenshot({path:path.join(OUT,view+'-'+scenario+'.png'),fullPage:false});
    }
    // Cross-screen typography and density contract for the four school lists.
    const styles = {};
    await page.locator('[data-action="tab"][data-value="grades"]').click();
    styles.grades = await page.evaluate(() => {
      const subject=document.querySelector('.subject .row strong');
      const average=document.querySelector('.subject-average');
      const item=document.querySelector('.subject');
      const cs=el=>el?getComputedStyle(el):null;
      return {subject:subject?{size:cs(subject).fontSize,weight:cs(subject).fontWeight}:null,
        average:average?{size:cs(average).fontSize,weight:cs(average).fontWeight}:null,
        padding:item?cs(item).paddingTop:null};
    });
    await page.locator('[data-action="grades-view"][data-value="forecast"]').click();
    styles.forecast = await page.evaluate(() => {
      const subject=document.querySelector('.forecast-row strong');
      const result=document.querySelector('.forecast-result');
      const track=document.querySelector('.forecast-track');
      const item=document.querySelector('.forecast-item');
      const cs=el=>el?getComputedStyle(el):null;
      return {subject:subject?{size:cs(subject).fontSize,weight:cs(subject).fontWeight}:null,
        result:result?{size:cs(result).fontSize,weight:cs(result).fontWeight}:null,
        track:track?cs(track).height:null,
        padding:item?cs(item).paddingBottom:null};
    });
    const fg=await geometry(page);
    record(view,'forecast geometry',!fg.overflow&&!fg.offenders.length,fg);
    await page.screenshot({path:path.join(OUT,view+'-forecast.png'),fullPage:false});
    await page.locator('[data-action="tab"][data-value="homework"]').click();
    await page.locator('[data-action="hw"][data-value="all"]').click();
    styles.homework=await page.evaluate(()=>{
      const subject=document.querySelector('.task strong');
      const item=document.querySelector('.task');
      return {subject:subject?{size:getComputedStyle(subject).fontSize,weight:getComputedStyle(subject).fontWeight}:null,
        padding:item?getComputedStyle(item).paddingTop:null};
    });
    await page.locator('[data-action="tab"][data-value="schedule"]').click();
    styles.schedule=await page.evaluate(()=>{
      const subject=document.querySelector('.lesson strong');
      const item=document.querySelector('.lesson');
      return {subject:subject?{size:getComputedStyle(subject).fontSize,weight:getComputedStyle(subject).fontWeight}:null,
        padding:item?getComputedStyle(item).paddingTop:null};
    });
    const sameSubject=Object.values(styles).every(x=>x.subject?.size==='14px'&&x.subject?.weight==='600');
    const numbers=styles.grades.average?.size==='16px'&&styles.grades.average?.weight==='700'
      &&styles.forecast.result?.size==='16px'&&styles.forecast.result?.weight==='700';
    const density=styles.grades.padding==='7px'&&styles.forecast.padding==='8px'
      &&styles.homework.padding==='8px'&&styles.schedule.padding==='8px'
      &&styles.forecast.track==='3px';
    record(view,'cross-screen subject typography',sameSubject,styles);
    record(view,'grades and forecast numeric emphasis',numbers,styles);
    record(view,'list spacing and forecast indicator',density,styles);
    await page.locator('#profile').click();
    const p=await geometry(page);
    record(view,'profile geometry',!p.overflow && !p.offenders.length,p);
    const oldSyncBlock=await page.locator('.sync-meta').count();
    record(view,'profile sync information moved to dialog',oldSyncBlock===0,{oldSyncBlock});
    for(const theme of ['light','dark','system']) {
      await page.locator('[data-action="theme"][data-value="'+theme+'"]').click();
      record(view,'theme '+theme,(await page.locator('html').getAttribute('data-theme'))===theme);
    }
    for(const accent of ['#4c8bf5','#16a34a','#8b5cf6','#f97316','#ef4444','#ec4899']) {
      await page.locator('[data-action="accent"][data-value="'+accent+'"]').click();
      const current=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      record(view,'accent '+accent,current.toLowerCase()===accent);
    }
    await page.screenshot({path:path.join(OUT,view+'-profile.png'),fullPage:false});
    await page.locator('[data-action="child"][data-value="1"]').click();
    await page.locator('#profile').click();
    await page.locator('[data-action="tab"][data-value="grades"]').click();
    record(view,'child switching',await page.getByText('Русский язык',{exact:true}).first().isVisible());
    record(view,'uncaught JavaScript exceptions',errors.length===0,errors);
   }catch(e){record(view,'scenario execution',false,String(e.stack||e).slice(0,1200));}
   await context.close();
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
 const failed=results.filter(r=>!r.ok);
 console.log('Audit checks: '+results.length+', failures: '+failed.length);
 // Fail workflow on regressions; screenshots and JSON are uploaded even on failure.
 if(failed.length)process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1;});
