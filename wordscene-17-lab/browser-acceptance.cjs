'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shots = path.join(__dirname,'audit-screenshots');
fs.mkdirSync(shots,{recursive:true});
const { chromium, webkit, devices } = require('playwright');
const { checkMemorization } = require('./browser-memorization.cjs');

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
  // On PRs the live site is still on main, so allow the previous published Paper version.
  // New Paper UI is asserted strictly on the branch's locally served app.
  if(process.env.WS17_TEST_ORIGIN){
   assert.ok(await page.getByText(/Отлично! Всё повторено|На сегодня всё повторено/).count()>0);
  }else{
   assert.equal(await page.getByText('Отлично! Всё повторено').count(),1);
   assert.equal(await page.locator('.paper-done').count(),1,'completed reviews should show a non-clickable success card');
   assert.equal(await page.locator('.paper-progress .ring-track').count(),3,'three progress rings');
   assert.ok((await page.locator('.paper-progress').innerText()).includes('За неделю:'));
  }
  const resources=await page.evaluate(()=>({
   cardCount:window.WordSceneContent?.cards?.length,
   topics:window.WordSceneTopics?.topics?.length,
   scriptSrcs:[...document.scripts].map(s=>s.src)
  }));
  assert.ok(resources.cardCount > 100,'dictionary not loaded: '+JSON.stringify(resources));
  assert.ok(resources.topics > 1,'topics not loaded: '+JSON.stringify(resources));
  assert.ok(resources.scriptSrcs.every(x=>!x.includes('/wordscene/')),'legacy scripts remain');

  // The retired profile editor is absent; historical stored fields remain intact.
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
  await page.locator('#manual-search').focus();
  assert.equal(await page.locator('.ws-manual-word-scroll .ws-manual-word').count(),0,'empty search should not show results');
  await snap('empty-focused-search');
  await page.locator('#manual-search').fill('pineapple');
  await page.waitForFunction(()=>document.querySelector('.ws-manual-scroll-note').hidden);
  assert.equal(await page.locator('[data-action="pick:pineapple"]').count(),1);
  await snap('short-search');
  // Search keeps one focused input during typing, without a second focus outline.
  const searchInput=page.locator('#manual-search');
  await searchInput.fill('apple');
  await page.waitForFunction(()=>document.querySelector('.ws-manual-list-head small')?.textContent?.includes('Найдено:'));
  assert.equal(await searchInput.evaluate(el=>document.activeElement===el),true,'search focus lost after typing');
  const frame=await page.locator('.ws-manual-search-wrap').evaluate(el=>({
   inputBorder:getComputedStyle(el.querySelector('input')).borderTopWidth,
   inputOutline:getComputedStyle(el.querySelector('input')).outlineStyle,
   containerBorder:getComputedStyle(el).borderTopWidth
  }));
  assert.equal(frame.inputBorder,'0px','input has a duplicate border');
  assert.equal(frame.inputOutline,'none','input has a second focus outline');
  assert.equal(frame.containerBorder,'1px','search container is missing its single frame');
  await snap('focused-search');
  // Keyboard geometry simulation: not a real iOS keyboard.
  const simulated=await page.evaluate(()=>{
   const viewport=window.visualViewport;
   if(!viewport)return {supported:false};
   try{
    Object.defineProperty(viewport,'height',{configurable:true,value:window.innerHeight-290});
    window.dispatchEvent(new Event('resize'));
    const panel=document.querySelector('.ws-manual');
    const bottom=document.querySelector('.ws-manual-start').getBoundingClientRect();
    const results=document.querySelector('.ws-manual-word-scroll').getBoundingClientRect();
    const active=panel.classList.contains('is-keyboard');
    delete viewport.height;
    window.dispatchEvent(new Event('resize'));
    return {supported:true,active,bottom:bottom.bottom,visible:window.innerHeight-290,resultsHeight:results.height,restored:!panel.classList.contains('is-keyboard')};
   }catch(error){try{delete viewport.height}catch{}return {supported:false,error:String(error)}}
  });
  if(simulated.supported){
   assert.equal(simulated.active,true,'keyboard class not activated by reduced visualViewport');
   assert.ok(simulated.bottom<=simulated.visible+5,'bottom action covered in simulated keyboard viewport '+JSON.stringify(simulated));
   assert.ok(simulated.resultsHeight>=0,'results layout invalid');
   assert.equal(simulated.restored,true,'normal layout not restored on keyboard close');
   assert.equal(await page.locator('.ws-manual').evaluate(el=>el.style.getPropertyValue('--ws-search-vh')),'','keyboard inline height must reset');
  }
  await searchInput.evaluate(el=>el.blur());

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
  assert.ok((await page.locator('.ws-manual-total').innerText()).includes('2 / 15'));
  assert.equal(await page.locator('[data-action="startManual"]').isDisabled(),true);
  await page.locator('[data-action="manualTopic:food"]').click();
  await page.locator('[data-action="pick:apple"]').click();
  assert.ok((await page.locator('.ws-manual-total').innerText()).includes('3 / 15'));
  assert.equal(await page.locator('[data-action="startManual"]').isEnabled(),true);
  await page.locator('[data-action="startManual"]').click();
  await checkMemorization(page,snap);
  for(let i=0;i<18;i++)await page.locator('[data-action="yes"]').click();
  await page.getByText('Занятие завершено').waitFor();
  const stored=await page.evaluate(()=> {
   const id=localStorage.getItem('wordscene-17-lab-current-account-v1');
   const suffix=id==='child-1'||id==='child-2'?'-account-'+id:'';
   return JSON.parse(localStorage.getItem('wordscene-17-lab-v1'+suffix));
  });
  assert.equal(stored.sessions.length,1,'lesson not committed');
  assert.equal(stored.child?.name||'', '', 'removing the editor must not change historical profile data');
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
