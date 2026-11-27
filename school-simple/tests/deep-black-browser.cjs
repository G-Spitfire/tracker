const {chromium}=require('playwright');
const fs=require('fs');
const cp=require('child_process');
const path=require('path');
const assert=require('node:assert/strict');
const out=path.resolve(process.env.DEEP_BLACK_OUT||'deep-black-acceptance');fs.mkdirSync(out,{recursive:true});
const names=['Математика','Русский язык','Литература','История','Английский язык','Биология'];
const dates=['2026-11-05','2026-11-09','2026-11-13','2026-11-16','2026-11-20','2026-11-23','2026-11-26','2026-11-27'];
const make=(shift)=>({marks:names.flatMap((subject,i)=>dates.map((date,j)=>({id:`${shift}-${i}-${j}`,subjectId:'s'+i,subject,date,value:[5,4,3,5,4,2,5,4][(i+j+shift)%8],type:j%3===0?'Контрольная работа':'Урок'}))),lessons:names.map((subject,i)=>({subjectId:'s'+i,subject,from:`2026-11-27T${String(9+i).padStart(2,'0')}:00:00`,tasks:[{name:'Повторить параграф 12, выполнить упражнения 5 и 6'}]})),schedule:['2026-11-27','2026-11-30','2026-12-01','2026-12-02'].flatMap(date=>names.map((subject,i)=>({subjectId:'s'+i,subject,from:`${date}T${String(9+i).padStart(2,'0')}:00:00`,topic:'Повторение материала и практические задания'})))});
const diary={schemaVersion:1,generatedAt:'2026-11-27T12:00:00+03:00',children:{polina:make(0),matvey:make(1)}};
(async()=>{const browser=await chromium.launch({headless:true});const results=[];
for(const baseline of process.env.SCHOOL_LIGHT_BASELINE?[false,true]:[false]){
const c=await browser.newContext({viewport:{width:375,height:667},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'Europe/Moscow',serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1'});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.clock.setFixedTime(new Date('2026-11-27T12:00:00+03:00'));
await p.route('**/school-sync-client.js',r=>r.fulfill({contentType:'application/javascript',body:`window.SchoolSync={readCached:async()=>null,sync:async()=>({source:'network',data:${JSON.stringify(diary)}})}`}));
if(baseline)for(const file of ['index.html','styles.css'])await p.route('**/school-simple/'+file,r=>r.fulfill({contentType:file.endsWith('css')?'text/css':'text/html',body:cp.execFileSync('git',['show',process.env.SCHOOL_LIGHT_BASELINE+':school-simple/'+file])}));
await p.goto('http://127.0.0.1:8765/school-simple/index.html');await p.waitForFunction(()=>dataSource==='live');
await p.evaluate(()=>{kids[0].name='Ученица';kids[1].name='Ученик';state.motion=false;state.quarter='2';state.date='2026-11-27';render()});
const shot=async(name)=>{await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});};
for(const theme of baseline?['light']:['dark','light']){
await p.evaluate(t=>{state.theme=t;render()},theme);
for(const [tab,mode] of [['home','line'],['home','ring'],['grades','grades'],['grades','forecast'],['schedule',''],['homework','week'],['profile','']]){
await p.evaluate(({tab,mode})=>{state.tab=tab;if(tab==='home')state.chart=mode;if(tab==='grades')state.gradesView=mode;if(tab==='homework')state.hw=mode;render()},{tab,mode});
const suffix=tab+(mode?'-'+mode:'');const n=(baseline?'baseline-':theme+'-')+suffix;await shot(n);
if(baseline){assert.ok(fs.readFileSync(path.join(out,n+'.png')).equals(fs.readFileSync(path.join(out,'light-'+suffix+'.png'))),'Light screenshot differs: '+suffix);results.push({name:n,pixelIdentical:true});}
if(!baseline){const geometry=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bg:getComputedStyle(document.body).backgroundColor,tile:document.querySelector('.stat-tile:not([data-risk])')?getComputedStyle(document.querySelector('.stat-tile:not([data-risk])')).backgroundColor:null}));assert.equal(geometry.width,375);assert.ok(geometry.scrollWidth<=375);if(theme==='dark'){assert.equal(geometry.bg,'rgb(0, 0, 0)');if(geometry.tile)assert.equal(geometry.tile,'rgb(23, 23, 23)');}results.push({name:n,...geometry});}
}
if(!baseline){await p.evaluate(()=>{state.tab='grades';state.gradesView='grades';render()});await p.locator('.subject .mark').first().click();await shot(theme+'-grade-dialog');await p.evaluate(()=>document.querySelector('.detail-overlay').click());await p.locator('[data-action=tab][data-value=home]').click();await p.locator('#notice-indicator').click();await shot(theme+'-notice-dialog');await p.evaluate(()=>document.querySelector('.detail-overlay').click());await p.locator('#sync-indicator').click();await shot(theme+'-sync-dialog');await p.evaluate(()=>document.querySelector('.detail-overlay').click());}
}
if(!baseline){await p.clock.setFixedTime(new Date('2026-12-01T12:00:00+03:00'));await p.reload();await p.waitForFunction(()=>dataSource==='live');for(const theme of ['dark','light']){await p.evaluate(t=>{state.theme=t;state.motion=false;state.tab='home';state.chart='line';kids[0].name='Ученица';render()},theme);await shot(theme+'-holiday');}results.push({errors});}
assert.deepEqual(errors,[]);await c.close();}await browser.close();fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(results,null,2));console.log(results);})().catch(e=>{console.error(e);process.exit(1)});
