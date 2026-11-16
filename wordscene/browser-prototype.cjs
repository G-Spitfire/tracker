'use strict';
// Run against a local static server; never uses the published site or its storage.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const ids=['mug','fist','moss','fence','puddle'];
const shots=process.env.WS17_SHOTS;
async function select(page,words){
 await page.locator('[data-action="sources"]').click();
 await page.locator('[data-action="manual"]').click();
 await page.locator('[data-action="manualTab:search"]').click();
 for(const id of words){await page.locator('#manual-search').fill(id);await page.locator('[data-action="pick:'+id+'"]').click();}
 await page.locator('[data-action="startManual"]').click();
}
(async()=>{
 for(const [name,type,width,height] of [['desktop',chromium,1440,900],['mobile',chromium,375,667],['iphone',webkit,390,844],['compact',chromium,320,568]]){
  const browser=await type.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto('http://127.0.0.1:8765/wordscene/');
   await select(page,ids);
   const profile=await page.evaluate(()=>localStorage.getItem('wordscene-17-lab-v1'));
   for(const [index,id] of ids.entries()){
    assert.equal(await page.locator('.ws-intro-word').innerText(),id);
    for(const selector of ['.ws-intro-translation','.ws-intro-cue','.ws-intro-scene','.ws-intro-art svg']){
     const el=page.locator(selector);assert.ok(await el.isVisible(),selector);
     if(name==='compact')await el.scrollIntoViewIfNeeded();
     const b=await el.boundingBox(),footer=await page.locator('.ws-paper-bottom').boundingBox();
     assert.ok(b.y>=0&&b.y+b.height<=footer.y+1,selector+' fits above actions');
    }
    assert.equal(await page.locator('[data-flip-card]').count(),0);
    const scene=await page.locator('.ws-intro-scene').innerText();
    assert.ok(scene.split(/\s+/).length>=8&&scene.split(/\s+/).length<=12);
    // Isolate OS speech services: verify the real button's dispatch and utterance.
    await page.evaluate(()=>{window.__spoken=[];Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(u){window.__spoken.push([u.text,u.lang]);}}});});
    await page.getByRole('button',{name:'Послушать '+id,exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.__spoken),[[id,'en-US']]);
    if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'after-'+name+'-'+id+'.png')});}
    if(index===0){
     // Simulate a pre-prototype checkpoint saved on the translation side.
     await page.evaluate(()=>{const key='wordscene-17-lab-active-v1',s=JSON.parse(localStorage.getItem(key));s.paperLearnFace=true;localStorage.setItem(key,JSON.stringify(s));});
     await page.reload();assert.equal(await page.locator('.ws-intro-word').innerText(),'mug');
     await page.evaluate(()=>document.documentElement.style.fontSize='200%');
     await page.locator('.ws-intro-scene').scrollIntoViewIfNeeded();
     const sceneBox=await page.locator('.ws-intro-scene').boundingBox(),bottom=await page.locator('.ws-paper-bottom').boundingBox();
     assert.ok(sceneBox.y>=0&&sceneBox.y+sceneBox.height<=bottom.y+1,'enlarged text remains reachable');
     const next=await page.locator('[data-action="learnNext"]').boundingBox();assert.ok(next.y+next.height<=height);
     await page.evaluate(()=>document.documentElement.style.fontSize='');
    }
    await page.locator('[data-action="learnNext"]').click();
   }
   assert.equal(await page.locator('.ws-paper-recall').count(),1);
   assert.equal(await page.locator('.ws-intro-cue').count(),0);
   assert.equal(await page.locator('.ws-paper-art').count(),0,'recall starts without image hints');
   await page.locator('[data-flip-card]').press('Enter');
   assert.equal(await page.locator('.ws-paper-sheet').getAttribute('aria-expanded'),'true');
   assert.equal(await page.evaluate(()=>localStorage.getItem('wordscene-17-lab-v1')),profile,'introduction and reveal never commit progress');
   await page.evaluate(()=>localStorage.clear());await page.reload();
   await select(page,['mug','rope','shovel']);
   await page.locator('[data-action="learnNext"]').click();
   assert.equal(await page.locator('.ws-intro-word').count(),0,'words outside five examples retain the existing layout');
   assert.equal(await page.locator('[data-flip-card]').count(),1);
   assert.deepEqual(errors,[]);
   console.log(name+': five cards, speech, reload, geometry and unchanged recall passed');
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
