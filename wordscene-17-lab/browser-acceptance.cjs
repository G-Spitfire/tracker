'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shots = path.join(__dirname,'audit-screenshots');
fs.mkdirSync(shots,{recursive:true});
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

  // Manual picker: real layout, conditional scroll affordances and cross-topic selections.
  await page.locator('[data-action="sources"]').click();
  await page.locator('[data-action="manual"]').click();
  const label=name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const snap=async suffix=>page.screenshot({path:path.join(shots,label+'-'+suffix+'.png')});
  await snap('topics');
  const wordList=page.locator('.ws-manual-word-scroll');
  const note=page.locator('.ws-manual-scroll-note');
  await page.waitForFunction(()=>{const el=document.querySelector('.ws-manual-word-scroll'),n=document.querySelector('.ws-manual-scroll-note');return n.hidden===(el.scrollHeight-el.clientHeight-el.scrollTop<=3)});
  if(await wordList.evaluate(el=>el.scrollHeight>el.clientHeight+3)){
   assert.equal(await note.isVisible(),true,'long list should advertise scrolling');
   await wordList.evaluate(el=>el.scrollTop=el.scrollHeight);
   await page.waitForFunction(()=>document.querySelector('.ws-manual-scroll-note').hidden);
   await snap('end-of-list');
   await wordList.evaluate(el=>el.scrollTop=0);
  }
  await page.locator('[data-action="manualAllTopics"]').click();
  await snap('all-topics');
  const travel=page.locator('[data-action="manualTopic:travel"]');
  await travel.click();
  await page.locator('[data-action="manualAllTopics"]').click();
  await page.waitForFunction(()=>{
   const parent=document.querySelector('.ws-manual-topics'),selected=parent?.querySelector('.is-active');
   if(!selected)return false;
   if(parent.scrollWidth<=parent.clientWidth+3)return true;
   const a=parent.getBoundingClientRect(),b=selected.getBoundingClientRect();
   return b.left>=a.left-2&&b.right<=a.right+2;
  });
  await page.locator('[data-action="manualTab:search"]').click();
  await page.locator('#manual-search').fill('pineapple');
  await page.waitForFunction(()=>document.querySelector('.ws-manual-scroll-note').hidden);
  assert.equal(await page.locator('[data-action="pick:pineapple"]').count(),1);
  await snap('short-search');
  await page.locator('[data-action="manualTab:topics"]').click();
  await page.locator('[data-action="manualTopic:food"]').click();
  await page.locator('[data-action="pick:apple"]').click();
  await page.locator('[data-action="manualTopic:animals"]').click();
  await page.locator('[data-action="pick:cat"]').click();
  await page.locator('[data-action="pick:dog"]').click();
  await page.locator('[data-action="manualSummary"]').click();
  await snap('three-selected');
  assert.ok(await page.getByText('Выбрано слов:').count()>0);
  await page.locator('[data-action="removeManual:apple"]').click();
  assert.ok((await page.locator('.ws-manual-total').innerText()).includes('2 / 10'));
  assert.equal(await page.locator('[data-action="startManual"]').isDisabled(),true);
  await page.locator('[data-action="manualTopic:food"]').click();
  await page.locator('[data-action="pick:apple"]').click();
  assert.ok((await page.locator('.ws-manual-total').innerText()).includes('3 / 10'));
  assert.equal(await page.locator('[data-action="startManual"]').isEnabled(),true);
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
  assert.equal(stored.child?.name||'', '', 'hidden settings should not change the profile');
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
  ['Chromium 390x844',chromium,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}],
  ['Chromium 320x568',chromium,{viewport:{width:320,height:568},isMobile:true,hasTouch:true}],
  ['WebKit 390x844',webkit,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}],
  ['WebKit 320x568',webkit,{viewport:{width:320,height:568},isMobile:true,hasTouch:true}]
 ];
 for(const [name,type,opts] of targets) {
  await run(name,type,opts);
  await legacy(name,type,opts);
 }
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
