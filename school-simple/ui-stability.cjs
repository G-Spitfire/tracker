'use strict';
const {chromium}=require('playwright');
const sizes=[320,375,390,430];
const marks=Array.from({length:35},(_,i)=>({subjectId:'s'+i,subject:'Предмет '+i,value:4,date:'2026-11-19',type:'Урок'}));
const diary={schemaVersion:1,generatedAt:new Date().toISOString(),children:{polina:{marks,lessons:[],schedule:[]},matvey:{marks,lessons:[],schedule:[]}}};
let failures=0;
async function check(label,condition,details=''){console.log((condition?'PASS':'FAIL')+' '+label+' '+details);if(!condition)failures++;}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of sizes){
   const context=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/school-sync-client.js',route=>route.fulfill({contentType:'application/javascript',body:'window.SchoolSync={readCached:async()=>({data:'+JSON.stringify(diary)+'}),sync:async()=>({source:"network",data:'+JSON.stringify(diary)+'})};'}));
   await page.route('**/version.json*',route=>route.fulfill({contentType:'application/json',body:'{"version":"1.32.6"}'}));
   await page.goto('http://127.0.0.1:8765/school-simple/index.html');
   await page.locator('[data-action="tab"][data-value="grades"]').click();
   await page.waitForTimeout(100);
   await page.evaluate(()=>{window.__navBefore=document.querySelector('#nav').firstElementChild;window.scrollTo(0,document.documentElement.scrollHeight)});
   const before=await page.evaluate(()=>window.scrollY);
   await page.evaluate(()=>render({preserveScroll:true}));
   const after=await page.evaluate(()=>window.scrollY);
   check(width+' preserve scroll',before>100&&Math.abs(after-before)<3,'before='+before+' after='+after);
   check(width+' nav identity',await page.evaluate(()=>window.__navBefore===document.querySelector('#nav').firstElementChild));
   await page.locator('[data-action="tab"][data-value="schedule"]').click();
   const top=await page.evaluate(()=>window.scrollY);
   check(width+' navigation starts at top',top<3,'scroll='+top);
   check(width+' JavaScript exceptions',errors.length===0,JSON.stringify(errors));
   await context.close();
  }
 }finally{await browser.close();}
 console.log('Failures: '+failures);
 if(failures)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
