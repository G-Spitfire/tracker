'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shots = path.join(__dirname,'audit-screenshots');
fs.mkdirSync(shots,{recursive:true});
const { chromium, webkit, devices } = require('playwright');
const { checkMemorization } = require('./browser-memorization.cjs');

const origin = process.env.WS17_TEST_ORIGIN || 'http://127.0.0.1:8765';
const url = origin + '/wordscene/';

async function run(name, browserType, contextOptions) {
 const browser = await browserType.launch({headless:true});
 try {
  const context = await browser.newContext({ ...contextOptions, serviceWorkers:'allow' });
  const page = await context.newPage();
  const failures=[];
  page.on('pageerror',error=>failures.push(error.stack || String(error)));
  page.on('response',res=>{if(res.url().includes('/wordscene/') && res.status() >= 400)failures.push('HTTP '+res.status()+' '+res.url())});
  await page.goto(url,{waitUntil:'load',timeout:60000});
  await page.locator('[data-action="sources"]').waitFor({timeout:30000});
  // On PRs the live site is still on main, so allow the previous published Paper version.
  // New Paper UI is asserted strictly on the branch's locally served app.
  if(process.env.WS17_TEST_ORIGIN){
   assert.ok(await page.getByText(/Твоё обучение начинается!|Отлично! Всё повторено|На сегодня всё повторено/).count()>0);
  }else{
   assert.equal(await page.getByText('Твоё обучение начинается!').count(),1,'a new user should see the welcome state');
   assert.equal(await page.locator('.paper-welcome').count(),1,'new user should see a non-clickable welcome card');
   assert.equal(await page.locator('.paper-done').count(),0,'new user must not see the completed reviews state');
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

  // New brand icon assets must decode in desktop and iPhone-like browser viewports.
  if(await page.locator('link[rel="apple-touch-icon"]').count()){
   const validIcons=await page.evaluate(async()=>{
    const paths=['./assets/icon-180.png','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-512.png'];
    return Promise.all(paths.map(async src=>{
     const img=new Image();img.src=src;
     try{await img.decode();return {src,width:img.naturalWidth,height:img.naturalHeight}}catch(e){return {src,error:String(e)}}
    }));
   });
   for(const icon of validIcons){
    assert.ok(!icon.error,'branded app icon must decode '+JSON.stringify(icon));
    assert.equal(icon.width,icon.height,'app icons must be square: '+icon.src);
   }
   assert.ok(await page.locator('link[rel="icon"][type="image/svg+xml"]').count()>0,'branded SVG favicon is linked');
  }

  // The retired profile editor is absent; historical stored fields remain intact.
  assert.equal(await page.locator('[data-action="childProfile"]').count(),0);

  // Manual picker: real layout, conditional scroll affordances and cross-topic selections.
  await page.locator('[data-action="sources"]').click();
  await page.locator('[data-action="manual"]').click();
  const label=name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const snap=async suffix=>page.screenshot({path:path.join(shots,label+'-'+suffix+'.png')});
  await snap('topics');
  const wordList=page.locator('.ws-manual-word-scroll');
  const singleScroll=await page.locator('.ws-manual-v3').count()>0;
  if(singleScroll){
   const geometry=await page.evaluate(()=>{
    const page=document.querySelector('.ws-manual-page'),list=document.querySelector('.ws-manual-word-scroll'),topics=document.querySelector('.ws-manual-topics'),footer=document.querySelector('.ws-manual-bottom');
    return {pageScrollable:page.scrollHeight>page.clientHeight+5,pageOverflow:getComputedStyle(page).overflowY,listOverflow:getComputedStyle(list).overflowY,topicsOverflow:getComputedStyle(topics).overflowY,footerBottom:footer.getBoundingClientRect().bottom,viewport:innerHeight,initialTopics:topics.children.length};
   });
   assert.equal(geometry.pageOverflow,'auto','page owns the only vocabulary scroll');
   assert.equal(geometry.listOverflow,'visible','words should not scroll independently');
   assert.equal(geometry.topicsOverflow,'visible','topics should not scroll independently');
   assert.equal(geometry.initialTopics,3,'collapsed topics show only one row');
   assert.equal(await page.locator('.ws-manual-topics .ws-topic-icon').count(),3,'topic tiles use SVG icons');
   assert.ok(Math.abs(geometry.footerBottom-geometry.viewport)<=10,'pinned action footer must stay at bottom: '+JSON.stringify(geometry));
   await page.locator('.ws-manual-page').evaluate(el=>el.scrollTop=el.scrollHeight);
   await snap('end-of-list');
   assert.ok(await page.locator('[data-action="startManual"]').isVisible(),'bottom action stays visible when page scrolls');
   await page.locator('.ws-manual-page').evaluate(el=>el.scrollTop=0);
   await page.locator('[data-action="manualAllTopics"]').click();
   assert.ok(await page.locator('.ws-manual-topics .ws-manual-topic').count()>3,'all topics expand into one page');
   assert.equal(await page.locator('.ws-manual-topics .ws-topic-icon').count(),resources.topics,'all dictionary topics use SVG icons');
   assert.equal(await page.locator('.ws-manual-topics').evaluate(el=>getComputedStyle(el).overflowY),'visible');
   await snap('all-topics');
   await page.locator('[data-action="manualTopic:travel"]').click();
   assert.equal(await page.locator('.ws-manual-topics .ws-manual-topic').count(),3,'choice collapses topics');
   assert.ok(await page.locator('.ws-manual-topics .is-active').count()===1);
   assert.match(await page.locator('.ws-manual-topics .ws-manual-topic').first().innerText(),/путешеств/i);
  }else{
   const note=page.locator('.ws-manual-scroll-note');
   await page.waitForFunction(()=>{const el=document.querySelector('.ws-manual-word-scroll'),n=document.querySelector('.ws-manual-scroll-note');return n.hidden===(el.scrollHeight-el.clientHeight-el.scrollTop<=3)});
   if(await wordList.evaluate(el=>el.scrollHeight>el.clientHeight+3)){
    assert.equal(await note.isVisible(),true);
    await wordList.evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.waitForFunction(()=>document.querySelector('.ws-manual-scroll-note').hidden);
    await snap('end-of-list');
    await wordList.evaluate(el=>el.scrollTop=0);
   }
   await page.locator('[data-action="manualAllTopics"]').click();
   await snap('all-topics');
   await page.locator('[data-action="manualTopic:travel"]').click();
   await page.locator('[data-action="manualAllTopics"]').click();
   await page.waitForFunction(()=>{
    const parent=document.querySelector('.ws-manual-topics'),selected=parent?.querySelector('.is-active');
    if(!selected)return false;
    if(parent.scrollWidth<=parent.clientWidth+3)return true;
    const a=parent.getBoundingClientRect(),b=selected.getBoundingClientRect();
    return b.left>=a.left-2&&b.right<=a.right+2;
   });
  }
  await page.locator('[data-action="manualTab:search"]').click();
  await page.locator('#manual-search').focus();
  assert.equal(await page.locator('.ws-manual-word-scroll .ws-manual-word').count(),0,'empty search should not show results');
  await snap('empty-focused-search');
  await page.locator('#manual-search').fill('pineapple');
  if(!singleScroll)await page.waitForFunction(()=>document.querySelector('.ws-manual-scroll-note').hidden);
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
  if(await page.locator('.ws-selected-sheet').count()){
   const selectedSheet=page.locator('.ws-selected-sheet'),selectedList=page.locator('.ws-selected-list');
   assert.equal(await selectedSheet.getAttribute('aria-modal'),'true','selected words open in modal bottom sheet');
   const height=await selectedSheet.evaluate(el=>el.getBoundingClientRect().height);
   const viewport=page.viewportSize();
   assert.ok(height>=viewport.height*.72&&height<=viewport.height*.85,'sheet must be about 75-80% of viewport: '+height+' / '+viewport.height);
   assert.equal(await selectedList.evaluate(el=>getComputedStyle(el).overflowY),'auto');
   assert.equal(await page.locator('.ws-manual-page').getAttribute('inert'),'','background list is inert when sheet is open');
   assert.ok(await page.locator('.ws-selected-done').isVisible(),'Done button always visible');
   await snap('selection-sheet');
  }
  await snap('three-selected');
  assert.ok(await page.getByText('Выбрано слов:').count()>0);
  await page.locator('[data-action="removeManual:apple"]').click();
  if(await page.locator('.ws-selected-sheet').count()){
   assert.equal(await page.locator('.ws-selected-row').count(),2);
   await page.locator('[data-action="manualSummaryClose"]').last().click();
   assert.equal(await page.locator('.ws-selected-sheet').count(),0);
  }
  assert.match(await page.locator('.ws-manual-total').innerText(),/2 \/ (?:10|15)/);
  assert.equal(await page.locator('[data-action="startManual"]').isDisabled(),true);
  await page.locator('[data-action="manualTopic:food"]').click();
  await page.locator('[data-action="pick:apple"]').click();
  assert.match(await page.locator('.ws-manual-total').innerText(),/3 \/ (?:10|15)/);
  assert.equal(await page.locator('[data-action="startManual"]').isEnabled(),true);
  await page.locator('[data-action="startManual"]').click();
  await checkMemorization(page,snap);
  if(await page.locator('.ws-paper-recall').count()){
   const measure=()=>page.evaluate(()=>{
    const box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};
    return {sheet:box('.ws-paper-stage'),dream:box('.ws-paper-dream'),grades:box('.ws-paper-decisions'),minors:box('.ws-paper-minors'),main:box('.ws-paper-page'),viewport:innerHeight};
   });
   const compare=(a,b,label)=>{
    for(const type of ['sheet','grades','minors'])for(const k of ['x','y','width','height'])
     assert.ok(Math.abs(a[type][k]-b[type][k])<=2,label+' moved '+type+'.'+k+': '+JSON.stringify([a[type],b[type]]));
   };
   const original=await measure();
   assert.ok(original.sheet.height>=150,'paper too short');
   assert.ok(original.sheet.y+original.sheet.height<=original.dream.y+3,'dream belongs outside paper');
   assert.ok(original.dream.y+original.dream.height<=original.grades.y+2,'buttons belong below dream');
   assert.ok(Math.abs(original.main.y+original.main.height-original.viewport)<12,'study fills viewport');
   const grades=await page.locator('.ws-paper-decisions button').evaluateAll(items=>items.map(e=>({h:e.getBoundingClientRect().height,r:parseFloat(getComputedStyle(e).borderTopLeftRadius)})));
   assert.equal(grades.length,2);
   grades.forEach(g=>{assert.ok(g.h>=63);assert.ok(Math.abs(g.r-21)<=1)});
   assert.equal(await page.locator('.ws-paper-face-back[aria-hidden="true"]').count(),1);
   assert.equal(await page.locator('.ws-paper-dream .ws-paper-art').count(),0);
   assert.equal(await page.locator('[data-action="help"]').count(),0);
   await page.locator('[data-flip-card]').click({position:{x:20,y:20}});
   assert.equal(await page.locator('.ws-paper-face-back[aria-hidden="false"]').count(),1);
   compare(original,await measure(),'flip');
   await snap('paper-recall-translation');
   assert.ok(await page.locator('.ws-paper-face-back .ws-paper-sound').evaluate(e=>e.getBoundingClientRect().height)>=44,'English sound target');
   await page.locator('[data-action="help"]').click();
   assert.equal(await page.locator('.ws-paper-dream .ws-paper-art').count(),1);
   assert.equal(await page.locator('.ws-paper-sheet .ws-paper-art').count(),0);
   compare(original,await measure(),'open imagination');
   await snap('paper-recall-imagination');
   await page.locator('[data-action="help"]').click();
   await page.locator('[data-flip-card]').click({position:{x:20,y:20}});
   assert.equal(await page.locator('.ws-paper-face:not(.ws-paper-face-back)[aria-hidden="false"]').count(),1);
   compare(original,await measure(),'return to front');
   await page.reload();
   // The deployed version can still pause on reload until this PR ships.
   const legacyResume=page.locator('.ws-paper-pause [data-action="continue"]');
   if(process.env.WS17_TEST_ORIGIN&&await legacyResume.isVisible())await legacyResume.click();
   await page.locator('[data-action="no"]').waitFor();
   compare(original,await measure(),'restore after reload');
   await page.locator('[data-action="no"]').click();
   assert.equal(await page.locator('.ws-paper-face-back[aria-hidden="false"]').count(),1);
   assert.equal(await page.locator('[data-action="yes"]').count(),0);
   assert.equal(await page.locator('[data-action="advance"]').count(),1);
   compare(original,await measure(),'correction');
   await snap('paper-recall-correction');
   await page.locator('[data-action="advance"]').click();
   let guard=0;
   while(await page.locator('.ws-paper-recall').count()){
    if(++guard>80)throw new Error('paper recall did not finish');
    await page.locator('[data-action="yes"]').click();
   }
  }else if(await page.locator('.ws-recall-v4').count()){
   const measure=()=>page.evaluate(()=>{
    const selectors=['.ws-recall-decisions','.ws-recall-session-actions'];
    const bounds=selectors.map(selector=>{
     const r=document.querySelector(selector)?.getBoundingClientRect();
     return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
    });
    const card=document.querySelector('.ws-recall-card').getBoundingClientRect();
    const root=document.querySelector('.ws-recall-v4').getBoundingClientRect();
    return {bounds,card:{top:card.top,bottom:card.bottom,height:card.height},root:{bottom:root.bottom},viewport:innerHeight};
   });
   const checkPositions=(before,after,label)=>{
    for(let i=0;i<before.bounds.length;i++)for(const k of ['x','y','width','height']){
     assert.ok(Math.abs(before.bounds[i][k]-after.bounds[i][k])<=2,label+' changed '+k+' for control '+i+': '+JSON.stringify([before.bounds[i],after.bounds[i]]));
    }
   };
   const before=await measure();
   assert.ok(before.card.height>=156,'compact recall card needs usable height');
   assert.ok(before.card.height<=Math.min(.45*before.viewport,361),'recall card should stay compact');
   assert.ok(Math.abs(before.root.bottom-before.viewport)<3,'recall should fill viewport');
   const grades=await page.locator('.ws-recall-decisions button').evaluateAll(els=>els.map(el=>({
    height:el.getBoundingClientRect().height,radius:parseFloat(getComputedStyle(el).borderTopLeftRadius)
   })));
   assert.equal(grades.length,2);
   grades.forEach(g=>{assert.ok(g.height>=63,'63px grading buttons');assert.ok(Math.abs(g.radius-21)<1,'21px grading radius')});
   assert.ok(await page.locator('[data-action="yes"]').isVisible());
   assert.ok(await page.locator('[data-action="no"]').isVisible());
   assert.equal(await page.locator('.ws-recall-face-back[aria-hidden="true"]').count(),1);
   assert.equal(await page.locator('[data-action="help"]:not([inert] *)').count(),0);
   const sound=await page.locator('.ws-recall-pronunciation').first().evaluate(el=>{
    const r=el.getBoundingClientRect(),btn=el.querySelector('button').getBoundingClientRect();
    return {height:btn.height,inside:btn.top>=r.top-1&&btn.bottom<=r.bottom+1};
   });
   assert.ok(sound.height>=44&&sound.inside,'inline sound with 44px touch target');
   await page.locator('[data-flip-card]').click({position:{x:20,y:20}});
   assert.equal(await page.locator('.ws-recall-face-back[aria-hidden="false"]').count(),1,'tap opens translation');
   checkPositions(before,await measure(),'show translation');
   await snap('recall-optional-translation');
   await page.locator('[data-action="help"]').click();
   assert.ok(await page.locator('.ws-recall-clue-art').count()>0,'association and image appear only after translation');
   checkPositions(before,await measure(),'show association');
   await snap('recall-association');
   await page.locator('[data-action="help"]').click();
   await page.locator('[data-flip-card]').click({position:{x:20,y:20}});
   assert.equal(await page.locator('.ws-recall-face-front[aria-hidden="false"]').count(),1,'tap returns front');
   checkPositions(before,await measure(),'hide translation');
   await page.locator('[data-action="pause"]').click();
   const continueStyle=await page.locator('.ws-recall-session-actions > .primary').evaluate(el=>({
    text:el.textContent.trim(),background:getComputedStyle(el).backgroundImage
   }));
   assert.equal(continueStyle.text,'Продолжить');
   assert.ok(continueStyle.background.includes('linear-gradient'),'Continue is Paper blue');
   await page.locator('[data-action="continue"]').click();
   checkPositions(before,await measure(),'resume');
   await page.locator('[data-action="no"]').click();
   assert.equal(await page.locator('.ws-recall-face-back[aria-hidden="false"]').count(),1,'failure reveals back');
   assert.equal(await page.locator('[data-action="yes"]').count(),0,'cannot score again after error');
   assert.equal(await page.locator('[data-action="advance"]').count(),1,'next replaces scoring buttons');
   checkPositions(before,await measure(),'failure');
   await snap('recall-corrective-answer');
   await page.locator('[data-action="advance"]').click();
   let guard=0;
   while(await page.locator('.ws-recall-v4').count()){
    if(++guard>80)throw new Error('recall loop did not complete');
    await page.locator('[data-action="yes"]').click();
   }
  }else if(await page.locator('.ws-recall-v2').count()){
   assert.equal(await page.locator('[data-action="yes"]').count(),0,'no self-scoring before reveal');
   assert.equal(await page.locator('[data-action="check"]').count(),1);
   await page.locator('[data-action="recallHint"]').click();
   assert.ok(await page.locator('.ws-recall-clue').count()>0,'hint available');
   await page.locator('[data-action="recallHint"]').click();
   await snap('recall-question');
   await page.locator('[data-action="check"]').click();
   assert.equal(await page.locator('.ws-recall-answer').count(),1);
   await snap('recall-answer');
   await page.locator('[data-action="help"]').click();
   assert.ok(await page.locator('.ws-recall-clue-art').count()>0);
   await snap('recall-association');
   await page.locator('[data-action="checkedYes"]').click();
   for(let i=1;i<18;i++){
    await page.locator('[data-action="check"]').click();
    await page.locator('[data-action="checkedYes"]').click();
   }
  }else{
   for(let i=0;i<18;i++)await page.locator('[data-action="yes"]').click();
  }
  await page.getByText('Занятие завершено').waitFor();
  assert.equal(await page.locator('.ws-result-page').count(),1,'approved Paper results screen must be used');
  assert.equal(await page.locator('.ws-result-total').count(),2,'two visually dominant metrics');
  assert.equal(await page.locator('.ws-result-metrics > div').count(),2,'two additional mandatory metrics');
  assert.equal(await page.locator('.ws-result-quality-track[role="progressbar"]').count(),1,'verified success percentage track');
  assert.equal(await page.locator('.ws-result-level').count(),1,'actual level progress');
  assert.equal(await page.locator('.ws-result-next').count(),1,'next steps');
  assert.equal(await page.locator('.ws-result-no-hard').count(),1,'zero hard words does not show empty disclosure');
  assert.equal(await page.locator('[data-action="practice"]').count(),0,'new lesson cannot offer voluntary practice');
  const resultGeometry=await page.evaluate(()=>{
   const find=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};
   return {page:find('.ws-result-page'),footer:find('.ws-result-actions'),scroll:find('.ws-result-scroll'),button:find('.ws-result-home'),viewport:innerHeight};
  });
  assert.ok(resultGeometry.button.height>=63,'results primary button must be at least 63px');
  assert.ok(Math.abs(resultGeometry.page.bottom-resultGeometry.viewport)<=12,'results page must fit viewport');
  assert.ok(resultGeometry.footer.bottom<=resultGeometry.viewport+2,'result actions cannot leave viewport');
  assert.ok(resultGeometry.scroll.bottom<=resultGeometry.footer.top+2,'result scroll must end above fixed actions');
  await snap('final-results');

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
   assert.ok(await page.getByText('Как хорошо я помню слова').count()>0,'quality section missing');
   assert.ok(await page.getByText('Пока нет проверок за этот период').count()>0,'quality empty state missing');
   assert.equal(await page.locator('.ws-progress-explanation').count(),1,'methodology disclosure missing');
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
  ['WebKit 375x667',webkit,{viewport:{width:375,height:667},isMobile:true,hasTouch:true}],
  ['WebKit 320x568',webkit,{viewport:{width:320,height:568},isMobile:true,hasTouch:true}]
 ];
 for(const [name,type,opts] of targets) {
  await run(name,type,opts);
  await legacy(name,type,opts);
 }
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
