'use strict';
// Read-only browser audit: synthetic diary data only, no real account or credentials.
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.SCHOOL_AUDIT_URL || 'http://127.0.0.1:8765/school-simple/index.html';
const OUT = path.resolve(process.env.SCHOOL_AUDIT_OUT || 'school-audit-results');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const sizes = [
  {name:'iphone-se', width:375, height:667},
  {name:'iphone-regular', width:393, height:852},
  {name:'iphone-large', width:402, height:874},
  {name:'small-320', width:320, height:568},
];
const fakeDiary = {
  schemaVersion:1, generatedAt:new Date().toISOString(),
  children:{
    polina:{
      marks:[{subjectId:'m',subject:'Математика',value:5,date:'2026-11-19',type:'Контрольная работа'}],
      lessons:[{subjectId:'m',subject:'Математика',from:'2026-11-19T09:00:00',tasks:[{name:'Упражнение 5'}]}],
      schedule:[{subjectId:'m',subject:'Математика',from:'2026-11-20T09:00:00',topic:'Решение задач на движение и вычисление расстояния с подробным разбором'}, {subjectId:'r',subject:'Русский язык',from:'2026-11-20T10:00:00',topic:'Правописание сложных слов'}]
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
 const browser=await (process.env.SCHOOL_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
 try {
  for(const size of sizes) {
   const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   await page.route('**/school-sync-client.js',route=>route.fulfill({
     contentType:'application/javascript',
     body:'window.__syncCalls=0;window.SchoolSync={readCached:async()=>null,sync:async()=>{window.__syncCalls++;return {source:"network",data:'+JSON.stringify(fakeDiary)+'}}};'
   }));
   await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:'{"version":"1.33.52"}'}));
   const view=size.name;
   try {
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30000});
    await page.getByText('Средний балл',{exact:true}).waitFor({timeout:15000});
    // Compare the actual application with synthetic data, not generated mockups.
    await page.evaluate(()=>{state.motion=false;state.quarter='2';state.date='2026-11-20';render()});
    for(const theme of ['light','dark']){
      for(const accent of ['#4c8bf5','#16a34a','#8b5cf6','#f97316','#ef4444','#ec4899']){
        for(const tab of ['home','grades','schedule','homework','profile']){
          await page.evaluate(({theme,accent,tab})=>{state.theme=theme;state.accent=accent;state.tab=tab;render();window.scrollTo(0,0)},{theme,accent,tab});
          const rects=()=>page.evaluate(()=>[...document.querySelectorAll('.head,#nav,#main,#main *')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));
          await page.evaluate(()=>document.documentElement.dataset.premium='off');
          const before=await rects();
          if(accent==='#ec4899')await page.screenshot({path:path.join(OUT,view+'-'+theme+'-'+tab+'-current.png')});
          await page.evaluate(()=>document.documentElement.dataset.premium='on');
          const after=await rects();
          record(view,'premium geometry '+theme+' '+accent+' '+tab,JSON.stringify(before)===JSON.stringify(after));
          if(tab==='home'){
            const paints=await page.evaluate(()=>[...document.querySelectorAll('.stat-tile')].map(e=>({bg:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow})));
            record(view,'premium tiles '+theme+' '+accent,paints.length===6&&paints.every(p=>p.shadow!=='none')&&paints[0].bg!==paints[2].bg,paints);
          }
          if(accent==='#ec4899')await page.screenshot({path:path.join(OUT,view+'-'+theme+'-'+tab+'-premium.png')});
        }
      }
    }
    await page.evaluate(()=>{saveSetting('school-premium-preview','off');state.motion=true;state.theme='light';state.accent='#4c8bf5';state.tab='home';render()});
    const initialCalls=await page.evaluate(()=>window.__syncCalls);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    record(view,'resume within five minutes skips fetch',await page.evaluate(()=>window.__syncCalls)===initialCalls);
    await page.evaluate(()=>{lastDiaryAttempt=Date.now()-DIARY_REFRESH_MS-1;window.dispatchEvent(new Event('focus'))});
    await page.waitForFunction(n=>window.__syncCalls===n+1,initialCalls);
    await page.waitForFunction(()=>!syncInProgress);
    record(view,'resume after five minutes fetches once',await page.evaluate(()=>window.__syncCalls)===initialCalls+1);
    const syncRegression=await page.evaluate(async()=>{
      const original=window.SchoolSync.sync;
      const oldError=syncError;
      syncError=true;render();
      const errorPriority=syncIndicatorState()==='error';
      syncError=oldError;
      let finish;
      window.SchoolSync.sync=()=>new Promise(resolve=>{finish=resolve});
      const pending=loadDiarySnapshot(true);
      while(!finish)await new Promise(resolve=>setTimeout(resolve,10));
      closeModal(document.querySelector('.detail-overlay'));
      finish({source:'cache',data:{"schemaVersion":1,"children":{"polina":{"marks":[],"lessons":[],"schedule":[]},"matvey":{"marks":[],"lessons":[],"schedule":[]}}},warning:'Тестовая ошибка'});
      await pending;
      await new Promise(resolve=>setTimeout(resolve,180));
      const noReopen=!document.querySelector('.detail-overlay'),warningPriority=syncIndicatorState()==='error';
      window.SchoolSync.sync=original;
      await loadDiarySnapshot();
      return {errorPriority,noReopen,warningPriority};
    });
    record(view,'sync warning priority and dismissed dialog',Object.values(syncRegression).every(Boolean),syncRegression);
    for(const [scenario,tab] of [['home','home'],['grades','grades'],['schedule','schedule'],['homework','homework']]) {
      if(tab!=='home')await page.locator('[data-action="tab"][data-value="'+tab+'"]').click();
      if(tab==='home'){
        await page.evaluate(()=>{window.__brandNode=document.querySelector('#brand-mark img');window.__bellNode=document.querySelector('#notice-indicator svg');window.__kpiNode=document.querySelector('.stat-value');render();});
        record(view,'unchanged graph does not replay',await page.locator('.motion-line').count()===0);
        await page.locator('[data-action="chart"][data-value="ring"]').click();
        await page.locator('[data-action="chart"][data-value="line"]').click();
        record(view,'line chart stays static',await page.locator('.motion-line,.motion-area').count()===0);
        record(view,'header and KPI nodes survive chart switching',await page.evaluate(()=>window.__brandNode===document.querySelector('#brand-mark img')&&window.__bellNode===document.querySelector('#notice-indicator svg')&&window.__kpiNode===document.querySelector('.stat-value')));
        record(view,'native tap highlight disabled',await page.locator('#nav button').first().evaluate(el=>getComputedStyle(el).webkitTapHighlightColor==='rgba(0, 0, 0, 0)'));
        await page.evaluate(()=>{motionPending.add(state.child);render();render();});
        record(view,'bell animation survives repeated render',await page.locator('#notice-indicator svg.motion-bell').count()===1);
        record(view,'KPI animation duration 800 ms',await page.evaluate(()=>motionAfterRender.toString().includes('(t-start)/800')));
        await page.waitForTimeout(500);
        await page.locator('[data-action="tab"][data-value="grades"]').click();
        await page.locator('[data-action="tab"][data-value="home"]').click();
        record(view,'return home does not replay unchanged graph',await page.locator('.motion-line').count()===0);
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.evaluate(()=>render());
        record(view,'reduced motion disables graph effect',await page.locator('.motion-line').count()===0);
        await page.emulateMedia({reducedMotion:'no-preference'});
        const graph=await page.locator('.home-line').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return {ratio:r.width/p.width,width:r.width,parent:p.width}});
        record(view,'line chart fills available width',graph.ratio>=0.94,graph);
        const compact=await page.evaluate(()=>{const g=document.querySelector('.stats-grid'),s=document.querySelector('.home-switch .seg'),v=document.querySelector('.home-visual');return {edge:Math.round(g.getBoundingClientRect().left),gap:parseFloat(getComputedStyle(g).gap),height:Math.round(s.getBoundingClientRect().height),chartGap:Math.round(v.getBoundingClientRect().top-s.getBoundingClientRect().bottom)}});record(view,'compact home geometry',compact.edge===6&&compact.gap===6&&compact.height===32&&compact.chartGap===4,compact);
      }
      if(tab==='grades'){record(view,'grade filters in header',await page.locator('#header-filters #tests-toggle').count()===1&&await page.locator('.grades-column-header').count()===1);}
      if(tab==='schedule'){
        await page.evaluate(()=>{state.date='2026-11-20';render();});
        const layout=await page.evaluate(()=>{
          const cards=[...document.querySelectorAll('.lesson')];
          const main=document.querySelector('main');
          return {count:cards.length,allDirect:cards.every(el=>el.parentElement===main),widths:cards.map(el=>Math.round(el.getBoundingClientRect().width))};
        });
        record(view,'schedule lessons are independent full-width rows',layout.count>=2&&layout.allDirect&&layout.widths.every(w=>w>=size.width-55),layout);
      }
      const header=await page.evaluate(()=>({gap:parseFloat(getComputedStyle(document.querySelector('.head')).marginBottom),targets:[...document.querySelectorAll('.head .icon,.schedule-arrows .icon')].map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]})}));record(view,scenario+' header targets and gap',header.gap===8&&header.targets.every(([w,h])=>w>=44&&h>=44),header);
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
    const indicator=page.locator('#notice-indicator');
     record(view,'notice indicator present',await indicator.count()===1);
     await indicator.click();
     record(view,'notice dialog opens',await page.locator('.detail-overlay').count()===1);
     // Long notification lists must scroll independently of their action button.
     const modalLayout=await page.evaluate(()=>{
      const box=document.querySelector('.notice-overlay .detail-box'),body=box?.querySelector('.modal-body'),actions=box?.querySelector('.modal-actions'),nav=document.querySelector('.bottom'),overlay=document.querySelector('.notice-overlay');
      if(!box||!body||!actions||!nav)return null;
      body.insertAdjacentHTML('beforeend',Array.from({length:36},(_,i)=>'<div class="notice-item"><span class="mark">5</span><div class="notice-grade-text"><strong>Математика '+i+'</strong><small>Контрольная работа</small></div></div>').join(''));
      const b=box.getBoundingClientRect(),x=body.getBoundingClientRect(),a=actions.getBoundingClientRect();
      return {overlayAboveNav:+getComputedStyle(overlay).zIndex>+getComputedStyle(nav).zIndex,heightLimited:b.height<=innerHeight*0.8+1,buttonVisible:a.bottom<=innerHeight&&a.top>=b.top,scrollsList:body.scrollHeight>body.clientHeight,inside:a.top>=x.bottom-1};
     });
     record(view,'long notice modal scroll and button accessible',!!modalLayout&&Object.values(modalLayout).every(Boolean),modalLayout);
     await page.locator('[data-action="notice-read"]').click();
     await page.locator('#profile').click();
    await page.evaluate(()=>openModal('Тест','Тест','<button data-action="close-detail">Закрыть</button>'));
    record(view,'modal and backdrop opening synchronized',await page.evaluate(()=>['.detail-box','.detail-overlay'].every(sel=>getComputedStyle(document.querySelector(sel)).animationDuration==='0.2s')));
    await page.waitForTimeout(220);
    await page.evaluate(()=>closeModal(document.querySelector('.detail-overlay')));
    record(view,'modal and backdrop closing synchronized',await page.evaluate(()=>['.detail-box','.detail-overlay'].every(sel=>getComputedStyle(document.querySelector(sel)).animationDuration==='0.15s')));
    await page.locator('.detail-overlay').waitFor({state:'detached'});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>openModal('Тест','Тест','<button data-action="close-detail">Закрыть</button>'));
    record(view,'reduced motion disables modal and backdrop',await page.evaluate(()=>['.detail-box','.detail-overlay'].every(sel=>getComputedStyle(document.querySelector(sel)).animationName==='none')));
    await page.evaluate(()=>closeModal(document.querySelector('.detail-overlay')));
    await page.emulateMedia({reducedMotion:'no-preference'});
    const motionSwitch=page.locator('[data-action="motion"]');
    record(view,'motion enabled by default',await motionSwitch.getAttribute('aria-checked')==='true');
    await motionSwitch.click();
    record(view,'motion disabled and persisted',await page.evaluate(()=>!motionAllowed()&&document.documentElement.dataset.motion==='off'&&readSetting('school-motion','on')==='off'));
    await page.locator('#profile').click();
    await page.locator('[data-action="chart"][data-value="ring"]').click();
    await page.locator('[data-action="chart"][data-value="line"]').click();
    record(view,'disabled graph stays static',await page.locator('.motion-line').count()===0);
    await page.locator('#notice-indicator').click();
    record(view,'disabled modal and backdrop stay static',await page.evaluate(()=>['.detail-box','.detail-overlay'].every(sel=>getComputedStyle(document.querySelector(sel)).animationName==='none')));
    await page.locator('[data-action="notice-read"]').click();
    await page.locator('#profile').click();
    await motionSwitch.click();
    record(view,'motion re-enabled',await motionSwitch.getAttribute('aria-checked')==='true');
    const p=await geometry(page);
    record(view,'profile geometry',!p.overflow && !p.offenders.length,p);
    await page.locator('[data-action="quarter"][data-value="1"]').click();
    record(view,'quarter one selected',await page.locator('[data-action="quarter"][data-value="1"]').evaluate(e=>e.classList.contains('active')));
    await page.locator('#profile').click();
    await page.locator('[data-action="tab"][data-value="grades"]').click();
    record(view,'quarter one excludes quarter two grades',await page.getByText('Математика',{exact:true}).count()===0);
    await page.locator('#profile').click();
    await page.locator('[data-action="quarter"][data-value="2"]').click();
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
    for(const theme of ['light','dark']){await page.locator('[data-action="theme"][data-value="'+theme+'"]').click();for(const accent of ['#4c8bf5','#16a34a','#8b5cf6','#f97316','#ef4444','#ec4899']){await page.locator('[data-action="accent"][data-value="'+accent+'"]').click();const contrast=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement),l=h=>{h=h.trim();if(h.length===4)h='#'+[...h.slice(1)].map(x=>x+x).join('');return h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0)},r=(a,b)=>(Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);return {text:r(s.getPropertyValue('--accent-text'),s.getPropertyValue('--surface')),fill:r(s.getPropertyValue('--accent-fill'),s.getPropertyValue('--accent-on'))}});record(view,theme+' contrast '+accent,contrast.text>=4.5&&contrast.fill>=4.5,contrast)}}
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
