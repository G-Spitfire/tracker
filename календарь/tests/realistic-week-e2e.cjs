'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
const URL='http://127.0.0.1:8765/календарь/index.html';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const report={};const errors=[];
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1366,height:800}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(URL);await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');
  const fixture=await page.evaluate(async()=>{
   const db=await new Promise((ok,no)=>{const r=indexedDB.open('school-calendar-mvp');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
   const classes=Array.from({length:6},(_,i)=>({id:'class-'+(i+1),name:'Класс '+(i+1),order:i+1}));
   const employees=Array.from({length:12},(_,i)=>({id:'staff-'+(i+1),name:'Преподаватель '+(i+1),displayName:'Педагог '+(i+1),archived:false}));
   const rooms=Array.from({length:8},(_,i)=>({id:'room-'+(i+1),name:'Кабинет '+(i+1),archived:false}));
   const subjects=[{id:'subject-1',name:'Математика',archived:false}];
   const breaks=[{id:'break-1',name:'Перерыв',archived:false}];
   const events=[];const days=['2026-12-07','2026-12-08','2026-12-09','2026-12-10','2026-12-11'];
   for(const [d,date] of days.entries())for(let c=0;c<6;c++){
    const classId=classes[c].id,staffId=employees[c].id,roomId=rooms[c].id;
    events.push({id:'lesson-'+d+'-'+c,type:'lesson',subjectId:'subject-1',name:'Математика — работа с задачами и подробное обсуждение решений',date,start:'09:00',end:'10:00',classIds:[classId],employeeIds:[staffId],roomId});
    events.push({id:'break-'+d+'-'+c,type:'break',breakId:'break-1',name:'Перерыв',date,start:'10:00',end:'10:20',classIds:[classId],employeeIds:[staffId],roomId:''});
    events.push({id:'walk-'+d+'-'+c,type:'event',name:'Прогулка и активные игры',date,start:'11:00',end:'12:00',classIds:[classId],employeeIds:[staffId],roomId:''});
   }
   events.push({id:'shared',type:'event',name:'Общешкольная встреча и презентация проектов',date:days[2],start:'13:00',end:'14:00',classIds:classes.map(x=>x.id),employeeIds:['staff-7','staff-8'],roomId:'room-7'});
   events.push({id:'meeting',type:'meeting',name:'Совещание педагогов',date:days[1],start:'15:00',end:'16:00',classIds:[],employeeIds:['staff-7','staff-8','staff-9'],roomId:'room-8'});
   events.push({id:'conflict',type:'event',name:'Конфликтное занятие',date:days[2],start:'09:20',end:'09:50',classIds:['class-2'],employeeIds:['staff-1'],roomId:'room-1'});
   const absences=[{id:'absence-1',employeeId:'staff-3',from:days[1],to:days[3]}];
   const data={classes,employees,rooms,subjects,breaks,events,absences};
   await new Promise((ok,no)=>{const tx=db.transaction(Object.keys(data),'readwrite');for(const [store,records] of Object.entries(data))for(const record of records)tx.objectStore(store).put(record);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});
   db.close();return {events:events.length,classes:classes.length,employees:employees.length,days:days.length};
  });
  report.fixture=fixture;
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');
  await page.evaluate(async()=>{selectedDate='2026-12-09';await render()});
  await page.screenshot({path:path.join(out,'realistic-day-1366.png'),fullPage:true});
  const result=await page.evaluate(()=>{
   const dayEvents=cache.events.filter(e=>e.date==='2026-12-09');
   const conflict=cache.events.find(e=>e.id==='conflict');
   const absent=cache.events.find(e=>e.id==='lesson-2-2');
   return {total:cache.events.length,dayEvents:dayEvents.length,classes:cache.classes.length,staff:cache.employees.length,conflictMessages:conflictMessages(conflict),absenceMessages:conflictMessages(absent),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(result.total,fixture.events);assert.equal(result.classes,6);assert.equal(result.staff,12);
  assert.ok(result.conflictMessages.some(x=>x.includes('Сотрудники')),'Staff conflict missing');
  assert.ok(result.conflictMessages.some(x=>x.includes('Помещение')),'Room conflict missing');
  assert.ok(result.absenceMessages.some(x=>x.includes('отсутствует')),'Absence warning missing');
  assert.equal(result.overflow,false,'Horizontal overflow');
  report.render=result;
  const dl=page.waitForEvent('download');await page.locator('#side-png').click();const png=await dl;const dest=path.join(out,'realistic-day.png');await png.saveAs(dest);
  const bytes=fs.readFileSync(dest);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  report.png={bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status')?.textContent!=='Загрузка…');
  assert.equal(await page.evaluate(()=>cache.events.length),fixture.events,'Data lost after reload');
  report.persistence=true;
  await page.locator('#data-nav').click();
  const backupWait=page.waitForEvent('download');await page.locator('#export').click();
  const backup=await backupWait;const backupPath=path.join(out,'realistic-week-backup.json');await backup.saveAs(backupPath);
  const original=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  const stores=['classes','employees','rooms','subjects','breaks','events','absences'];
  for(const store of stores)assert.ok(Array.isArray(original.data[store]),'Missing backup store '+store);
  assert.equal(original.data.events.length,fixture.events);
  const before=Object.fromEntries(stores.map(store=>[store,original.data[store].length]));
  await page.evaluate(async()=>{
   const db=await new Promise(ok=>{const q=indexedDB.open('school-calendar-mvp');q.onsuccess=()=>ok(q.result)});
   await new Promise((ok,no)=>{const tx=db.transaction(['events','employees'],'readwrite');tx.objectStore('events').clear();tx.objectStore('employees').clear();tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close();
  });
  await page.locator('#settings-import-nav').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#import').setInputFiles(backupPath);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='Резервная копия восстановлена');
  const restored=await page.evaluate(async stores=>{
   const db=await new Promise(ok=>{const q=indexedDB.open('school-calendar-mvp');q.onsuccess=()=>ok(q.result)});
   const result={};for(const store of stores)result[store]=await new Promise((ok,no)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
   db.close();return result;
  },stores);
  for(const store of stores){
   assert.equal(restored[store].length,before[store],'Restore count mismatch: '+store);
   const sorted=a=>[...a].sort((x,y)=>x.id.localeCompare(y.id));
   assert.deepEqual(sorted(restored[store]),sorted(original.data[store]),'Restore content mismatch: '+store);
  }
  report.jsonRoundTrip={stores:before,bytes:fs.statSync(backupPath).size,exactContent:true};
  assert.deepEqual(errors,[]);report.errors=errors;
 }catch(e){report.failure=e.stack||String(e);throw e}
 finally{fs.writeFileSync(path.join(out,'realistic-week-report.json'),JSON.stringify(report,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
