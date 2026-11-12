const assert=require('node:assert/strict');
const fs=require('node:fs');
module.exports=async function(page){
 await page.locator('.leveli-bottom-nav [data-go="homework"]').click();
 const status=page.locator('#homework-status'), rows=page.locator('.homework-row');
 assert.match(await status.innerText(),/не подключены/);
 assert.equal(await rows.count(),0);
 // Load the CommonJS view controller in this test page only. Production has no data source.
 await page.evaluate(source=>{
  const module={exports:{}};
  new Function('module',source)(module);
  window.__homeworkTest=module.exports.mount(document);
 },fs.readFileSync(require.resolve('../homework.js'),'utf8'));
 const update=state=>page.evaluate(state=>window.__homeworkTest.setState(state),state);
 for(const [state,message] of [['loading',/Загружаем/],['error',/Не удалось/],['disconnected',/не подключены/],['ready',/заданий нет/]]){
  await update({status:state,items:[]});assert.match(await status.innerText(),message);assert.equal(await rows.count(),0);
 }
 const items=[
  {id:'test-a',subject:'Математика',date:'2026-11-07',text:'Задание на сегодня',details:'Подробности задания'},
  {id:'test-b',subject:'Русский язык',date:'2026-11-08',text:'Задание на завтра',done:true},
 ];
 await update({status:'ready',items});
 assert.equal(await rows.count(),1);assert.match(await status.innerText(),/0 из 1/);
 assert.equal(await rows.locator('input[type="checkbox"]').count(),1);
 assert.equal(await rows.locator('p').isVisible(),false);
 await rows.locator('summary').press('Enter');assert.equal(await rows.locator('p').isVisible(),true);
 await rows.locator('input').check();assert.match(await status.innerText(),/1 из 1/);
 await page.locator('[data-homework-filter="tomorrow"]').click();assert.equal(await rows.locator('input').isChecked(),true);
 await page.locator('[data-homework-filter="all"]').click();assert.equal(await rows.count(),2);assert.match(await status.innerText(),/2 из 2/);
 assert.equal(await page.locator('#homework-list h2').count(),2);
 assert.equal(await page.locator('[data-page="homework"] input[type="date"]').count(),0);
 await page.locator('[data-homework-filter="today"]').click();
 await update({status:'stale',items});assert.match(await status.innerText(),/устарели/);assert.equal(await rows.count(),1);
 await rows.locator('input').check();assert.match(await status.innerText(),/устарели.*1 из 1/);
 await page.locator('[data-homework-filter="all"]').click();
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'outputs/leveli-homework.png',fullPage:true});
 await update({status:'disconnected'});
 await page.locator('.leveli-bottom-nav [data-go="home"]').click();
};
