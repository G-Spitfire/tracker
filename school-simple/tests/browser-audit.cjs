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
   await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:'{"version":"1.33.6"}'}));
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
    // Forecast is a distinct grades view: verify it at every supported viewport.
    await page.locator('[data-action="tab"][data-value="grades"]').click();
    await page.locator('[data-action="grades-view"][data-value="forecast"]').click();
    const forecastGeometry=await geometry(page);
    record(view,'forecast geometry',!forecastGeometry.overflow && !forecastGeometry.offenders.length,forecastGeometry);
    await page.screenshot({path:path.join(OUT,view+'-forecast.png'),fullPage:false});
    // Homework illustrations were intentionally removed from the UI.
    await page.locator('[data-action="tab"][data-value="homework"]').click();
    const illustrations=await page.locator('.homework-doodle').count();
    record(view,'homework uses no illustrations',illustrations===0,{illustrations});
    await page.locator('[data-action="tab"][data-value="home"]').click();
    const updates=page.locator('.updates-panel');
    record(view,'recent updates initially present',await updates.count()===1);
    await page.locator('[data-action="toggle-updates"]').click();
    record(view,'recent updates expandable',(await page.locator('[data-action="toggle-updates"]').getAttribute('aria-expanded'))==='true');
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
