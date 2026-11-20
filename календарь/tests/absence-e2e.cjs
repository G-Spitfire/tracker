'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
const DATE='2026-12-10',URL='http://127.0.0.1:8765/календарь/index.html';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});const report={};
 const get=async store=>page.evaluate(async store=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('school-calendar-mvp');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const rows=await new Promise((ok,no)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});db.close();return rows},store);
 const seed=async()=>page.evaluate(async date=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('school-calendar-mvp');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});await new Promise((ok,no)=>{const tx=db.transaction(['employees','events'],'readwrite');for(const [id,name] of [['audit-a','Преподаватель А'],['audit-b','Преподаватель Б']])tx.objectStore('employees').put({id,name,displayName:name});tx.objectStore('events').put({id:'audit-lesson',type:'event',name:'Занятие аудита',date,start:'10:00',end:'11:00',classIds:['class-1'],employeeIds:['audit-a'],roomId:''});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close()},DATE);
 try{
  await page.goto(URL);await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');await seed();await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');
  await page.locator('#side-absence').click();await page.locator('#absence-staff').selectOption('audit-a');await page.locator('#absence-from').fill(DATE);await page.locator('#absence-to').fill(DATE);
  assert.equal(await page.locator('.absence-row').count(),1,'Affected event missing');
  await page.locator('.absence-row select').selectOption('audit-b');
  await page.locator('#absence-save').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Отсутствие сохранено'));
  let events=await get('events');assert.deepEqual(events.find(x=>x.id==='audit-lesson').employeeIds,['audit-b']);let absences=await get('absences');assert.equal(absences.length,1);report.replacement=true;
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');
  await page.locator('#side-absence').click();assert.equal(await page.locator('.saved-absence-row').count(),1);
  await page.locator('.saved-absence-row button').first().click();await page.locator('#absence-to').fill('2026-12-11');await page.locator('#absence-save').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Отсутствие сохранено'));
  absences=await get('absences');assert.equal(absences.length,1);assert.equal(absences[0].to,'2026-12-11');report.editAbsence=true;
  await page.locator('#side-absence').click();page.once('dialog',d=>d.accept());await page.locator('.saved-absence-row button').last().click();await page.waitForFunction(async()=>{const db=await new Promise(ok=>{const q=indexedDB.open('school-calendar-mvp');q.onsuccess=()=>ok(q.result)});const n=await new Promise(ok=>{const q=db.transaction('absences').objectStore('absences').count();q.onsuccess=()=>ok(q.result)});db.close();return n===0});
  assert.equal((await get('absences')).length,0);assert.deepEqual((await get('events')).find(x=>x.id==='audit-lesson').employeeIds,['audit-b']);report.deleteKeepsReplacement=true;
 }catch(e){report.failure=e.stack||String(e);throw e}finally{fs.writeFileSync(path.join(out,'absence-e2e-report.json'),JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
