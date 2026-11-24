'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/school-sync-client.js',route=>route.fulfill({
    contentType:'application/javascript',
    body:`window.SchoolSync={readCached:async()=>null,sync:async()=>({source:'network',data:{
      schemaVersion:1,generatedAt:new Date().toISOString(),children:{
        polina:{marks:[{subjectId:'m',subject:'Математика',value:5,date:'2026-11-19',type:'Урок'}],lessons:[{subjectId:'m',subject:'Математика',from:'2026-11-19T09:00:00',tasks:[{name:'Упражнение 5'}]}],schedule:[{subjectId:'m',subject:'Математика',from:'2026-11-20T09:00:00'}]},
        matvey:{marks:[{subjectId:'r',subject:'Русский язык',value:4,date:'2026-11-19',type:'Урок'}],lessons:[],schedule:[]}
      }}})};`
  }));
  await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:'{"version":"1.33.6"}'}));
  await page.goto('http://127.0.0.1:8765/school-simple/index.html?v=1336',{waitUntil:'load'});
  await page.getByText('Средний балл',{exact:true}).waitFor();
  const streak=await page.evaluate(()=>{
    const previous=state.quarter;state.quarter='2';
    try{
      const lesson=d=>({from:d+'T09:00:00'});
      const kid={lessons:['2026-11-19','2026-11-20','2026-11-21'].map(lesson),schedule:['2026-11-21','2026-11-23','2026-11-24','2026-11-25'].map(lesson),subjects:[{grades:[{date:'2026-11-19',value:3},{date:'2026-11-20',value:5}]}]};
      const saturday=completedCleanStreak(kid,'2026-11-22');
      const tuesday=completedCleanStreak(kid,'2026-11-24');
      kid.subjects[0].grades.push({date:'2026-11-21',value:2});
      const backdated=completedCleanStreak(kid,'2026-11-24');
      return {saturday,tuesday,backdated};
    }finally{state.quarter=previous}
  });
  assert.deepEqual(streak,{saturday:2,tuesday:3,backdated:1},'Completed school day streak, schedule union, deduplication, no grades, weekend, today and backdated grade');
  const iconLibrary=await page.evaluate(()=>({
    navigation:typeof ico==='function' && ico('home').includes('<svg'),
    metrics:typeof kpiIcon==='function' && kpiIcon('average').includes('<svg')
  }));
  assert.deepEqual(iconLibrary,{navigation:true,metrics:true},'Shared icon libraries loaded');
   assert.equal(await page.locator('#notice-indicator').count(),1,'Notification indicator appears on home');
   await page.locator('#notice-indicator').click();
   await page.getByText('За сегодня и вчера событий нет').waitFor();
   await page.locator('[data-action="close-detail"]').click();
  await page.getByText('Средний балл',{exact:true}).waitFor();
  // Late grade: discovered today, lesson dated earlier; old marks must not be flagged.
  const gradeDots=await page.evaluate(()=>{
   const subject=kids[0].subjects.find(s=>s.name==='Математика');
   const existing=subject.grades[0];
   const before=recentGradeNoticeIds(0).has(gradeNoticeId(0,subject.name,existing));
   const late={...existing,id:'late-grade-test-987',date:'2026-11-12',value:4};
   subject.grades.push(late);
   noticeTrack();
   const lateMarked=recentGradeNoticeIds(0).has(gradeNoticeId(0,subject.name,late));
   const existingMarked=recentGradeNoticeIds(0).has(gradeNoticeId(0,subject.name,existing));
   return {before,lateMarked,existingMarked};
  });
  assert.equal(gradeDots.before,false,'Historical grade not marked as new');
  assert.equal(gradeDots.lateMarked,true,'Backdated newly discovered grade marked as new');
  assert.equal(gradeDots.existingMarked,false,'Old grade remains unmarked');
  await page.locator('[data-action="tab"][data-value="grades"]').click();
  await page.getByText('Математика',{exact:true}).first().waitFor();
  assert.equal(await page.locator('.mark.new').count(),1,'Only newly discovered backdated grade has new sticker');
  await page.locator('[data-action="tab"][data-value="homework"]').click();
  await page.locator('[data-action="hw"][data-value="all"]').click();
  await page.getByText('Упражнение 5').waitFor();
  await page.locator('#profile').click();
  assert.ok(await page.locator('#profile svg path').count()>0,'Profile close icon must be visible');
  await page.locator('[data-action="child"][data-value="1"]').click();
  await page.locator('#profile').click();
  await page.locator('[data-action="tab"][data-value="grades"]').click();
  await page.getByText('Русский язык',{exact:true}).first().waitFor();
  assert.deepEqual(errors,[],'No uncaught browser exceptions');
  console.log('School browser smoke: navigation, grades, homework, child switching passed');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1});
