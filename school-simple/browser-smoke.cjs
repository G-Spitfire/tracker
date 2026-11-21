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
  const iconLibrary=await page.evaluate(()=>({
    navigation:typeof ico==='function' && ico('home').includes('<svg'),
    metrics:typeof kpiIcon==='function' && kpiIcon('average').includes('<svg'),
    illustrations:typeof homeworkIllustration==='function' && ['bag','cat','pencil','books'].every(n=>homeworkIllustration(n).includes('<svg'))
  }));
  assert.deepEqual(iconLibrary,{navigation:true,metrics:true,illustrations:true},'Shared SVG library loaded');
  await page.getByText('Средний балл',{exact:true}).waitFor();
  await page.locator('[data-action="tab"][data-value="grades"]').click();
  await page.getByText('Математика',{exact:true}).first().waitFor();
  await page.locator('[data-action="tab"][data-value="homework"]').click();
  await page.locator('[data-action="hw"][data-value="all"]').click();
  await page.getByText('Упражнение 5').waitFor();
  await page.locator('#profile').click();
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
