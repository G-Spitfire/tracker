'use strict';
const assert=require('node:assert/strict');

async function visibleAction(page,action){
 const box=await page.locator('[data-action="'+action+'"]').boundingBox();
 const viewport=page.viewportSize();
 assert.ok(box&&box.y>=0&&box.y+box.height<=viewport.height+1,action+' must remain visible: '+JSON.stringify(box));
 assert.ok(box.height>=44,action+' touch target must be at least 44px high');
}
async function checkMemorization(page,snap=async()=>{}){
 const savedProfile=await page.evaluate(()=>{
  const old=localStorage.getItem('wordscene-17-lab-current-account-v1');
  return localStorage.getItem('wordscene-17-lab-v1'+(['child-1','child-2'].includes(old)?'-account-'+old:''));
 });
 if(await page.locator('.ws-learn-v2').count()){
  for(let i=0;i<3;i++){
   await visibleAction(page,'learnNext');
   await visibleAction(page,'pause');await visibleAction(page,'cancel');
   assert.equal(await page.locator('[data-action="toggleArt"]').count(),0,'image-hiding controls removed');
   assert.equal(await page.locator('.learn .art').count(),1,'illustration must stay visible');
   assert.equal(await page.locator('.learn .scene').count(),1,'association must stay visible');
   assert.equal(await page.locator('.ws-learn-progress').getAttribute('aria-valuenow'),String(i+1));
   assert.equal(await page.locator('.ws-learn-progress').getAttribute('aria-valuemax'),'3');
   const word=page.locator('.learn h2'),current=await word.innerText();
   const bounds=await word.boundingBox(),viewport=page.viewportSize();
   assert.ok(bounds.y>=0&&bounds.y+bounds.height<=viewport.height,'new word visible at the top');
   await visibleAction(page,'say:'+current);
   await snap('learn-'+(i+1)+'-visible');
   await page.locator('.learn .scene').scrollIntoViewIfNeeded();
   const scene=await page.locator('.learn .scene').boundingBox(),card=await page.locator('.learn').boundingBox();
   assert.ok(scene.y>=card.y&&scene.y+scene.height<=card.y+card.height+1,'association reachable by scrolling');
   await visibleAction(page,'learnNext');await snap('learn-'+(i+1)+'-bottom');
   if(i===0){
    await page.locator('[data-action="pause"]').click();
    await visibleAction(page,'continue');await visibleAction(page,'cancel');
    await snap('learn-paused');
    await page.locator('[data-action="continue"]').click();
    assert.equal(await word.innerText(),current);
    assert.equal(await page.locator('.learn .art,.learn .scene').count(),2,'pausing must not hide illustration');
   }
   if(i===2)assert.match(await page.locator('[data-action="learnNext"]').innerText(),/Начать проверку/);
   await page.locator('[data-action="learnNext"]').click();
   if(i<2){
    assert.equal(await page.evaluate(()=>window.scrollY),0);
    assert.equal(await page.locator('.learn').evaluate(el=>el.scrollTop),0);
    assert.equal(await page.locator('.learn h2').evaluate(el=>document.activeElement===el),true);
   }
  }
  assert.ok(await page.locator('.ws-recall-v2').count()?await page.locator('[data-action="check"]').isVisible():await page.locator('[data-action="yes"]').isVisible(),'final word starts recall');
  assert.equal(await page.evaluate(()=>{
   const old=localStorage.getItem('wordscene-17-lab-current-account-v1');
   return localStorage.getItem('wordscene-17-lab-v1'+(['child-1','child-2'].includes(old)?'-account-'+old:''));
  }),savedProfile,'memorization must not commit progress');
  return;
 }
 for(let i=0;i<3;i++){
  await visibleAction(page,'toggleArt');await visibleAction(page,'learnNext');
  await visibleAction(page,'pause');await visibleAction(page,'cancel');
  const word=page.locator('.learn h2');
  const current=await word.innerText();
  const bounds=await word.boundingBox();
  assert.ok(bounds.y>=0&&bounds.y+bounds.height<=page.viewportSize().height,'new word must open visibly at the top');
  assert.equal(await page.locator('.learn .art').count(),1,'new word must restore its illustration');
  assert.equal(await page.locator('.learn .scene').count(),1,'new word must restore its association');
  await snap('learn-'+(i+1)+'-visible');
  await page.locator('.learn .scene').scrollIntoViewIfNeeded();
  const scene=await page.locator('.learn .scene').boundingBox(),card=await page.locator('.learn').boundingBox();
  assert.ok(scene.y>=card.y&&scene.y+scene.height<=card.y+card.height+1,'full association must be reachable by scrolling');
  await visibleAction(page,'learnNext');await snap('learn-'+(i+1)+'-bottom');
  if(i===0){
   await page.locator('[data-action="pause"]').click();
   await visibleAction(page,'continue');await visibleAction(page,'cancel');await snap('learn-paused');
   await page.locator('[data-action="continue"]').click();assert.equal(await word.innerText(),current);
   await visibleAction(page,'toggleArt');await visibleAction(page,'learnNext');
  }
  await page.locator('[data-action="toggleArt"]').click();
  assert.equal(await page.locator('.learn .art,.learn .scene').count(),0);
  assert.equal(await word.innerText(),current);
  assert.ok(await page.locator('.learn .translation').isVisible());
  assert.ok(await page.locator('[data-action^="say:"]').isVisible());
  await visibleAction(page,'learnNext');await snap('learn-'+(i+1)+'-hidden');
  if(i!==1){
   await page.locator('[data-action="toggleArt"]').click();
   assert.equal(await page.locator('.learn .art,.learn .scene').count(),2);
   // Simulate reading the bottom of a long card before advancing.
   await page.locator('.learn').evaluate(el=>{el.scrollTop=el.scrollHeight;window.scrollTo(0,document.documentElement.scrollHeight)});
  }
  if(i===2)assert.match(await page.locator('[data-action="learnNext"]').innerText(),/Начать проверку/);
  await page.locator('[data-action="learnNext"]').click();
  if(i<2){
   assert.equal(await page.evaluate(()=>window.scrollY),0,'outer scroll must reset on next word');
   assert.equal(await page.locator('.learn').evaluate(el=>el.scrollTop),0,'card scroll must reset on next word');
   assert.equal(await page.locator('.learn h2').evaluate(el=>document.activeElement===el),true,'new word must receive focus');
  }
 }
 assert.ok(await page.locator('[data-action="yes"]').isVisible(),'last card starts memory check');
 assert.equal(await page.evaluate(()=>{
  const old=localStorage.getItem('wordscene-17-lab-current-account-v1');
  return localStorage.getItem('wordscene-17-lab-v1'+(['child-1','child-2'].includes(old)?'-account-'+old:''));
 }),savedProfile,'memorization must not commit or change persistent progress');
}
module.exports={checkMemorization,visibleAction};

if(require.main===module){
 const {chromium,webkit}=require('playwright');
 const fs=require('node:fs'),path=require('node:path');
 const out=process.env.WS17_SCREENSHOTS||path.join(__dirname,'audit-screenshots');fs.mkdirSync(out,{recursive:true});
 (async()=>{
  for(const [name,type] of [['chromium',chromium],['webkit',webkit]])for(const [width,height] of [[390,844],[320,568]]){
   const browser=await type.launch({headless:true});
   try{
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.WS17_TEST_ORIGIN||'http://127.0.0.1:8765')+'/wordscene-17-lab/');
    await page.locator('[data-action="sources"]').click();await page.locator('[data-action="manual"]').click();
    for(const w of ['cake','apple','cheese'])await page.locator('[data-action="pick:'+w+'"]').click();
    await page.locator('[data-action="startManual"]').click();
    const failures=[];
    for(const [label,check] of [
     ['Paper',async()=>assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(253, 247, 237)')],
     ['Actions',async()=>{for(const action of (await page.locator('.ws-learn-v2').count()?['learnNext','pause','cancel']:['toggleArt','learnNext','pause','cancel']))await visibleAction(page,action)}],
     ['New card',async()=>{await page.locator('.learn').evaluate(el=>{el.scrollTop=el.scrollHeight;window.scrollTo(0,document.documentElement.scrollHeight)});await page.locator('[data-action="learnNext"]').click();assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.locator('.learn h2').evaluate(el=>document.activeElement===el),true)}]
    ]){try{await check();}catch(e){failures.push(label+': '+e.message)}}
    // Restart the temporary lesson for the complete three-word flow.
    page.once('dialog',d=>d.accept());await page.locator('[data-action="cancel"]').click();
    await page.locator('[data-action="sources"]').click();await page.locator('[data-action="manual"]').click();
    for(const w of ['cake','apple','cheese'])await page.locator('[data-action="pick:'+w+'"]').click();
    await page.locator('[data-action="startManual"]').click();
    if(!failures.length)await checkMemorization(page,s=>page.screenshot({path:path.join(out,name+'-'+width+'-'+s+'.png')}));
    assert.deepEqual(errors,[]);console.log(name,width,failures.length?failures.join('\n'):'PASS');
    if(failures.length)process.exitCode=1;
   }finally{await browser.close()}
  }
 })().catch(e=>{console.error(e);process.exitCode=1});
}
