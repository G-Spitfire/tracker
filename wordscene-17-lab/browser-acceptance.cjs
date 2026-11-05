'use strict';
const assert = require('node:assert/strict');
const { chromium, webkit, devices } = require('playwright');

const origin = process.env.WS17_TEST_ORIGIN || 'http://127.0.0.1:8765';
const url = origin + '/wordscene-17-lab/';

async function run(name, browserType, contextOptions) {
 const browser = await browserType.launch({headless:true});
 try {
  const context = await browser.newContext({ ...contextOptions, serviceWorkers:'allow' });
  const page = await context.newPage();
  const failures=[];
  page.on('pageerror',error=>failures.push(error.stack || String(error)));
  page.on('response',res=>{if(res.url().includes('/wordscene-17-lab/') && res.status() >= 400)failures.push('HTTP '+res.status()+' '+res.url())});
  await page.goto(url,{waitUntil:'load',timeout:60000});
  await page.locator('[data-action="sources"]').waitFor({timeout:30000});
  assert.equal(await page.locator('text=На сегодня всё повторено').count()>0,true);
  const resources=await page.evaluate(()=>({
   cardCount:window.WordSceneContent?.cards?.length,
   topics:window.WordSceneTopics?.topics?.length,
   scriptSrcs:[...document.scripts].map(s=>s.src)
  }));
  assert.ok(resources.cardCount > 100,'dictionary not loaded: '+JSON.stringify(resources));
  assert.ok(resources.topics > 1,'topics not loaded: '+JSON.stringify(resources));
  assert.ok(resources.scriptSrcs.every(x=>!x.includes('/wordscene/')),'legacy scripts remain');

  // Profile settings are intentionally hidden on the home screen.
  assert.equal(await page.locator('[data-action="childProfile"]').count(),0);

  // Manual learning is accessible with topic chips, without a separate topic flow.
  await page.locator('[data-action="sources"]').click();
  assert.equal(await page.locator('[data-action="themes"]').count(),0);
  await page.locator('[data-action="manual"]').click();
  assert.ok(await page.locator('[data-action^="manualTopic:"]').count()>1,'manual topic filters missing');
  assert.ok(await page.locator('[data-action="manualTab:search"]').count()===1,'search tab missing');
  const picks=page.locator('[data-action^="pick:"]:not([disabled])');
  assert.ok(await picks.count()>=3,'not enough selectable words');
  for(let i=0;i<3;i++)await picks.nth(i).click();
  await page.locator('[data-action="startManual"]').click();
  for(let i=0;i<3;i++)await page.locator('[data-action="learnNext"]').click();
  for(let i=0;i<18;i++)await page.locator('[data-action="yes"]').click();
  await page.getByText('Занятие завершено').waitFor();
  const stored=await page.evaluate(()=> {
   const id=localStorage.getItem('wordscene-17-lab-current-account-v1');
   const suffix=id==='child-1'||id==='child-2'?'-account-'+id:'';
   return JSON.parse(localStorage.getItem('wordscene-17-lab-v1'+suffix));
  });
  assert.equal(stored.sessions.length,1,'lesson not committed');
  assert.equal(stored.child.name||'', '', 'hidden settings should not change the profile');
  assert.equal(Object.keys(stored.words).length,3);
  assert.ok(stored.words[Object.keys(stored.words)[0]].initialAnswers.every(a=>!Object.hasOwn(a,'ms')),'response latency persisted');

  // Offline boot must come from installed service worker, not online fallback.
  await page.locator('[data-action="home"]').click();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForTimeout(1000);
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('[data-action="progress"]').waitFor({timeout:20000});
  await page.locator('[data-action="progress"]').click();
  await page.getByText('Мой словарь').waitFor();
  assert.ok(await page.getByText('Выучил в WordScene').count()>0,'offline progress missing');
  await context.setOffline(false);
  assert.deepEqual(failures,[],'browser errors '+JSON.stringify(failures));
  await context.close();
  process.stdout.write(name+': PASS, '+resources.cardCount+' cards, '+resources.topics+' topics; learning and offline reload\n');
 } finally {await browser.close();}
}
async function legacy(name,browserType,contextOptions) {
 const browser=await browserType.launch({headless:true});
 try {
  const ctx=await browser.newContext({...contextOptions});
  await ctx.addInitScript(()=>{
   const original={version:17,revision:4,level:'novice',words:{
    apple:{origin:'known',schedule:{stage:'daily',days:[],checks:[],interval:0,nextDay:'2099-01-01',masteredAt:null},history:[]}
   },sessions:[],levels:[],createdAt:1600000000000};
   if(!localStorage.getItem('wordscene-17-lab-current-account-v1')){
    localStorage.setItem('wordscene-17-lab-current-account-v1','child-2');
    localStorage.setItem('wordscene-17-lab-v1-account-child-2',JSON.stringify(original));
   }
  });
  const page=await ctx.newPage();
  await page.goto(url,{waitUntil:'load'});
  await page.locator('[data-action="progress"]').click();
  assert.ok(await page.getByText('Уже знал').count()>0);
  const saved=await page.evaluate(()=>({old:localStorage.getItem('wordscene-17-lab-v1-account-child-2'),newKey:localStorage.getItem('wordscene-17-lab-v1')}));
  assert.ok(saved.old,'legacy selected save missing');
  assert.equal(saved.newKey,null,'new empty save overwrote legacy profile');
  await ctx.close();
  process.stdout.write(name+': PASS legacy local save namespace\n');
 }finally{await browser.close();}
}
(async()=>{
 const targets=[
  ['Chromium desktop',chromium,{viewport:{width:1200,height:900}}],
  ['Chromium mobile',chromium,{...devices['iPhone 13'],isMobile:true}],
  ['WebKit mobile emulation',webkit,{...devices['iPhone 13']}]
 ];
 for(const [name,type,opts] of targets) {
  await run(name,type,opts);
  await legacy(name,type,opts);
 }
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
