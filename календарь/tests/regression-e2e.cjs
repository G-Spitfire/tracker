'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}}),report={};
 const dbRows=store=>page.evaluate(async store=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('school-calendar-mvp');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const rows=await new Promise((ok,no)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});db.close();return rows},store);
 const seed=()=>page.evaluate(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('school-calendar-mvp');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});await new Promise((ok,no)=>{const tx=db.transaction(['events','employees'],'readwrite');tx.objectStore('employees').put({id:'audit-person',name:'Аудит',displayName:'Аудит',archived:false});tx.objectStore('events').put({id:'audit-existing',name:'Первое занятие',type:'event',date:'2026-12-09',start:'10:00',end:'11:00',classIds:[],employeeIds:['audit-person'],roomId:''});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close()});
 try{
  await page.goto('http://127.0.0.1:8765/календарь/index.html');await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');await seed();await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');
  await page.locator('#side-new').click();await page.locator('[data-kind="event"]').click();await page.locator('#event-name').fill('Второе занятие');await page.locator('#event-date').fill('2026-12-09');await page.locator('#event-start').fill('10:30');await page.locator('#event-more-toggle').click();await page.locator('#event-end').fill('11:30');
  await page.locator('#employee-picker-toggle').click();assert.equal(await page.locator('#employee-picker-toggle').getAttribute('aria-expanded'),'true');await page.locator('#event-employees input[type="checkbox"]').first().check();assert.match(await page.locator('#employee-picker-toggle').textContent(),/Аудит/);
  page.once('dialog',d=>d.dismiss());await page.locator('.conflict-event-link').first().click();assert.equal(await page.locator('#event-name').inputValue(),'Второе занятие');report.conflictNavigationCancel=true;
  page.once('dialog',d=>d.dismiss());await page.locator('#event-form button[type="submit"]').click();await page.waitForTimeout(300);
  assert.equal((await dbRows('events')).length,1,'Conflicting event was saved despite cancellation');report.conflictCancel=true;
  page.once('dialog',d=>d.accept());await page.locator('#event-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Событие сохранено');assert.equal((await dbRows('events')).length,2);report.conflictOverride=true;
  const second=(await dbRows('events')).find(x=>x.name==='Второе занятие');await page.evaluate(id=>openEditor(cache.events.find(e=>e.id===id)),second.id);await page.locator('#event-name').fill('Отредактированное занятие');await page.locator('#event-start').fill('12:00');await page.locator('#event-more-toggle').click();await page.locator('#event-end').fill('13:00');await page.locator('#event-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Событие сохранено');assert.equal((await dbRows('events')).find(x=>x.id===second.id).name,'Отредактированное занятие');report.edit=true;
  await page.locator('#data-nav').click();const promise=page.waitForEvent('download');await page.locator('#export').click();const download=await promise;const file=path.join(out,'restore-fixture.json');await download.saveAs(file);
  await page.evaluate(async id=>{const db=await new Promise(ok=>{const r=indexedDB.open('school-calendar-mvp');r.onsuccess=()=>ok(r.result)});await new Promise(ok=>{const tx=db.transaction('events','readwrite');tx.objectStore('events').delete(id);tx.oncomplete=ok});db.close()},second.id);
  assert.equal((await dbRows('events')).length,1);
  await page.locator('#settings-import-nav').click();page.once('dialog',d=>d.accept());await page.locator('#import').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Резервная копия восстановлена');
  assert.equal((await dbRows('events')).length,2);report.restore=true;
  const original=await dbRows('events');const valid=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const mutate of [x=>x.data.events.push({...x.data.events[0]}),x=>x.data.events[0].start='99:00',x=>x.data.events[0].employeeIds=['missing-id']]){
   const invalid=JSON.parse(JSON.stringify(valid));mutate(invalid);
   const result=await page.evaluate(async raw=>{try{await restore(new File([JSON.stringify(raw)],'invalid.json'));return 'accepted'}catch(e){return e.message}},invalid);
   assert.match(result,/Неверная резервная копия/);assert.deepEqual(await dbRows('events'),original);
  }report.invalidBackupRejected=true;

  await page.evaluate(async()=>{await put('absences',{id:'copy-absence',employeeId:'audit-person',from:'2026-12-16',to:'2026-12-16'});selectedDate='2026-12-09';showView('schedule');await refresh()});
  const dialogs=[];const cancelCopy=async d=>{dialogs.push(d.message());if(dialogs.length===1)await d.accept();else await d.dismiss()};page.on('dialog',cancelCopy);await page.locator('#side-copy').click();await page.waitForTimeout(200);page.off('dialog',cancelCopy);assert.equal(dialogs.length,2);assert.match(dialogs[1],/отсутствует/);assert.deepEqual(await dbRows('events'),original);report.copyAbsenceCancel=true;
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await put('events',{id:'png-group-'+i,name:'Подгруппа тест '+i,type:'lesson',subgroup:i===1?'2':'1',date:'2026-12-09',start:'09:00',end:'09:40',classIds:['class-1'],employeeIds:['audit-person'],roomId:''});await refresh()});
  const png=await page.evaluate(()=>{const calls=[],rects=[];const proto=CanvasRenderingContext2D.prototype,fill=proto.fillText,rect=proto.fillRect,click=HTMLAnchorElement.prototype.click;proto.fillText=function(t,...args){calls.push(String(t));return fill.call(this,t,...args)};proto.fillRect=function(x,y,w,h){if(this.fillStyle==='#e9f2ff')rects.push({x,y,w,h});return rect.call(this,x,y,w,h)};HTMLAnchorElement.prototype.click=function(){};try{exportPNG()}finally{proto.fillText=fill;proto.fillRect=rect;HTMLAnchorElement.prototype.click=click}return {calls,rects}});
  assert.equal(png.rects.length,3);assert.ok(png.calls.includes('09:00–09:40'));assert.ok(png.calls.includes('Аудит'));for(let i=1;i<png.rects.length;i++)assert.ok(png.rects[i].y>=png.rects[i-1].y+png.rects[i-1].h);report.pngSubgroups=true;
 }catch(e){report.failure=e.stack||String(e);throw e}finally{fs.writeFileSync(path.join(out,'regression-e2e-report.json'),JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
