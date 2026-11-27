'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve(process.env.HOLIDAY_OUT||'holiday-results');
fs.mkdirSync(out,{recursive:true});
const dates=['2026-11-30','2026-12-01','2026-12-15','2026-12-30','2026-12-31','2027-01-01'];
const subjects=['Математика','Русский язык','Литература','История','Английский язык'];
const child=shift=>({marks:Array.from({length:45},(_,i)=>({id:'test-'+shift+'-'+i,subjectId:'s'+i%5,subject:subjects[i%5],value:[4,5,5,4,5,3,5,4,5][(i+shift)%9],date:'2026-11-'+String(4+Math.floor(i/2)).padStart(2,'0'),type:i%3===0?'Домашняя работа':'Урок'})),lessons:Array.from({length:15},(_,i)=>({subjectId:'s'+i%5,subject:subjects[i%5],from:'2026-11-'+String(12+i).padStart(2,'0')+'T09:00:00',tasks:[]})),schedule:[]});
const makeDiary=date=>({schemaVersion:1,generatedAt:date+'T09:00:00+03:00',children:{polina:child(0),matvey:child(2)}});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  for(const [width,height] of [[375,667],[390,844],[320,568]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:3,isMobile:true,hasTouch:true,timezoneId:'Europe/Moscow',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1',serviceWorkers:'block'});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let date=dates[1];
   await page.route('**/school-sync-client.js',r=>r.fulfill({contentType:'application/javascript',body:`window.SchoolSync={readCached:async()=>null,sync:async()=>({source:'network',data:${JSON.stringify(makeDiary(date))}})};`}));
   async function load(day){date=day;await page.clock.setFixedTime(new Date(day+'T12:00:00+03:00'));await page.goto('http://127.0.0.1:8765/school-simple/index.html');await page.locator('.stats-grid').waitFor();await page.evaluate(()=>{kids[0].name='Ученица';kids[1].name='Ученик';render()});}
   for(const [i,day] of dates.entries()){
    await load(day);assert.equal(await page.locator('.stat-tile').count(),6);
    const holiday=page.locator('.holiday-ice');const expected=[null,'30','16','1','Ура!',null][i];
    if(expected===null){assert.equal(await holiday.count(),0);assert.match(await page.locator('.stat-tile').nth(2).innerText(),/Доля пятёрок/);}
    else{assert.equal(await page.locator('.stat-tile').nth(2).locator('.stat-value').innerText(),expected);if(i===4){assert.match(await holiday.innerText(),/Новый год сегодня!/);assert.ok(await holiday.evaluate(e=>e.querySelector('.stat-top').scrollHeight<=e.querySelector('.stat-top').clientHeight+1));}}
   }
   await load(dates[1]);
   for(const theme of ['light','dark']){
    await page.locator('#profile').click();await page.locator(`[data-action=theme][data-value=${theme}]`).click();await page.locator('#profile').click();
    const geometry=await page.evaluate(()=>{const tiles=[...document.querySelectorAll('.stat-tile')];const h=tiles[2].getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,same:tiles.every(t=>{const r=t.getBoundingClientRect();return Math.abs(r.width-h.width)<1&&Math.abs(r.height-h.height)<1}),contained:[...tiles[2].querySelectorAll('.stat-top,.stat-value,.stat-hint')].every(t=>{const r=t.getBoundingClientRect();return r.left>=h.left&&r.right<=h.right&&r.top>=h.top&&r.bottom<=h.bottom&&t.scrollWidth<=t.clientWidth+1}),animation:getComputedStyle(tiles[2],'::after').animationName};});
    assert.ok(geometry.scroll<=geometry.width&&geometry.same&&geometry.contained,JSON.stringify(geometry));assert.equal(geometry.animation,'ice-glint');
    assert.ok(await page.evaluate(()=>{const rest=()=>[...document.querySelectorAll('.stat-tile')].filter((_,i)=>i!==2).map(e=>e.outerHTML);const before=JSON.stringify(rest()),original=holidayInfo;try{holidayInfo=()=>null;render();return before===JSON.stringify(rest());}finally{holidayInfo=original;render();}}));
    await page.screenshot({path:path.join(out,`${width}-${theme}.png`),scale:'css'});
    if(width===375&&theme==='light'){
     await page.locator('.holiday-ice').screenshot({path:path.join(out,'holiday-card-enlarged.png')});
     if(process.env.HOLIDAY_RECORD){const frames=path.join(out,'frames');fs.mkdirSync(frames,{recursive:true});for(let i=0;i<25;i++){await page.locator('.holiday-ice').screenshot({path:path.join(frames,`frame-${String(i).padStart(2,'0')}.png`),scale:'css'});await page.waitForTimeout(150);}}
    }
    console.log('PASS',width,height,theme,geometry);
   }
   await page.locator('#profile').click();await page.locator('[data-action=child][data-value="1"]').click();await page.locator('[data-action=motion]').click();await page.locator('#profile').click();
   assert.equal(await page.locator('#title').innerText(),'Ученик');assert.equal(await page.locator('.holiday-ice').count(),1);assert.equal(await page.locator('.holiday-ice').evaluate(e=>getComputedStyle(e,'::after').animationName),'none');
   await page.locator('#profile').click();await page.locator('[data-action=motion]').click();await page.locator('#profile').click();await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.holiday-ice').evaluate(e=>getComputedStyle(e,'::after').animationName),'none');
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
