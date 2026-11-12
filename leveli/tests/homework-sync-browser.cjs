// Two independent browser contexts share an entirely synthetic Firestore transport.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const taskA='a'.repeat(64),taskB='b'.repeat(64);
const school={schemaVersion:1,syncedAt:'2026-11-12T12:00:00+03:00',items:{[taskA]:{date:'2026-11-12',subject:'Математика',text:'Синтетическое задание <script>alert(1)</script>'},[taskB]:{date:'2026-11-13',subject:'Русский язык',text:'Задание на завтра'}},progress:{}};
// Historic rows remain in cloud; view filtering must not delete their checks.
const historic='c'.repeat(64),attachment='e'.repeat(64);
school.items[historic]={date:'2026-09-01',subject:'Архив',text:'Старое задание'};school.progress[historic]=true;
// A normalized uploader omits absent homework before it reaches the cloud.
school.items[attachment]={date:'2026-11-13',subject:'Вложение',text:'Задание во вложении'};school.progress[attachment]=true;
const cloud={A:structuredClone(school),B:{...structuredClone(school),items:{[taskB]:{date:'2026-11-12',subject:'История',text:'Другой аккаунт'}}}};
const auth=`export const getAuth=()=>window.__auth;export const browserLocalPersistence={};export const setPersistence=async()=>{};
export function onAuthStateChanged(a,fn){window.__authListeners.push(fn);queueMicrotask(()=>fn(a.currentUser));return ()=>{}};
export async function signInWithEmailAndPassword(){};export async function signOut(){window.__switchUser(null)}`;
const store=`export const getFirestore=()=>({});export const doc=(db,...parts)=>parts;
export class FieldPath{constructor(...parts){this.parts=parts}}
export function onSnapshot(ref,options,fn,error){const receive=data=>fn({exists:()=>!!data,data:()=>data,metadata:{fromCache:window.__offlineHomework,hasPendingWrites:false}});const listener=e=>{if(e.detail.uid===ref[1])receive(e.detail.data)};window.addEventListener('synthetic-homework',listener);window.__readHomework(ref[1]).then(receive);window.__failHomework=error;return ()=>window.removeEventListener('synthetic-homework',listener)}
export async function updateDoc(ref,field,value){if(window.__denyWrites)throw Error('permission-denied');return window.__writeHomework(ref[1],field.parts[1],value)}
export async function getDocFromServer(ref){if(ref[0]==='profiles')return {exists:()=>true,data:()=>({name:'Тестовый ученик'})};return {exists:()=>true,data:()=>({schemaVersion:1,source:'petersburgedu',grades:[]})}}`;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{})});
 const pages=[],errors=[];
 const publish=async uid=>{await Promise.all(pages.map(p=>p.evaluate(({uid,data})=>window.dispatchEvent(new CustomEvent('synthetic-homework',{detail:{uid,data}})),{uid,data:cloud[uid]})))};
 try{
  console.log('Opening synthetic devices');
  for(let i=0;i<2;i++){
   const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await ctx.addInitScript(()=>{
    if(navigator.serviceWorker)navigator.serviceWorker.register=async()=>{};
    window.__auth={currentUser:{uid:sessionStorage.getItem('synthetic-user')||'A'}};window.__authListeners=[];
    window.__switchUser=uid=>{window.__auth.currentUser=uid?{uid}:null;sessionStorage.setItem('synthetic-user',uid||'');for(const fn of window.__authListeners)fn(window.__auth.currentUser)};
   });
   await ctx.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',body:r.request().url().endsWith('firebase-app.js')?'export const initializeApp=()=>({})':r.request().url().endsWith('firebase-auth.js')?auth:store}));
   await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());await ctx.route('https://fonts.gstatic.com/**',r=>r.abort());
   const page=await ctx.newPage();pages.push(page);page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.exposeFunction('__readHomework',uid=>structuredClone(cloud[uid]));
   await page.exposeFunction('__writeHomework',async(uid,id,done)=>{cloud[uid].progress[id]=done;await publish(uid)});
   await page.clock.setFixedTime(new Date('2026-11-12T12:00:00+03:00'));
   await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:8765')+'/leveli/');
   await page.waitForFunction(()=>document.querySelector('#homework-status').textContent.includes('0 из 1'),null,{timeout:10000});
   await page.locator('.leveli-bottom-nav [data-go="homework"]').click();
  }
  console.log('Both devices loaded');
  const [a,b]=pages,check=p=>p.locator('.homework-row input').first();
  assert.equal(await a.locator('#homework-list script').count(),0,'task text is never HTML');
  console.log('Checking cross-device save');await check(a).check();await b.waitForFunction(()=>document.querySelector('.homework-row input').checked);
  await a.reload();await a.waitForFunction(()=>document.querySelector('.homework-row input')?.checked);
  await a.locator('.leveli-bottom-nav [data-go="homework"]').click();assert.equal(await check(a).isChecked(),true);
  cloud.A.items[taskA].text='Обновлённое синтетическое задание';await publish('A');assert.equal(await check(a).isChecked(),true);
  await check(b).uncheck();await a.waitForFunction(()=>!document.querySelector('.homework-row input').checked);
  await a.evaluate(()=>window.__denyWrites=true);await check(a).click();
  await a.waitForFunction(()=>document.querySelector('#homework-status').textContent.includes('Не удалось сохранить'));
  assert.equal(await check(a).isChecked(),false);assert.equal(cloud.A.progress[taskA],false);
  await a.evaluate(()=>{window.__denyWrites=false;window.__switchUser('B')});
  await a.waitForFunction(()=>document.querySelector('#homework-list').textContent.includes('История'));
  assert.equal(await check(a).isChecked(),false);await a.locator('.leveli-bottom-nav [data-go="homework"]').click();await check(a).check();assert.equal(cloud.A.progress[taskA],false);
  await a.evaluate(()=>window.__switchUser('A'));await a.waitForFunction(()=>document.querySelector('#homework-list').textContent.includes('Математика'));
  assert.equal(await check(a).isChecked(),false);await a.locator('.leveli-bottom-nav [data-go="homework"]').click();
  await a.locator('[data-homework-filter="tomorrow"]').click();assert.match(await a.locator('#homework-list').innerText(),/Русский/);assert.match(await a.locator('#homework-list').innerText(),/Вложение/);
  await a.locator('[data-homework-filter="all"]').click();assert.equal(await a.locator('.homework-row').count(),3);assert.equal(cloud.A.progress[historic],true);assert.equal(cloud.A.progress[attachment],true);assert.doesNotMatch(await a.locator('#homework-list').innerText(),/Архив|Нет домашки/);
  assert.equal(await a.locator('#homework-date').count(),0);
  await a.locator('[data-homework-filter="all"]').click();
  await a.evaluate(()=>window.__failHomework(Error('offline')));assert.match(await a.locator('#homework-status').innerText(),/устарели/);
  fs.mkdirSync('outputs',{recursive:true});
  for(const width of [320,390,1280]){
   await a.setViewportSize({width,height:844});assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await a.screenshot({path:`outputs/homework-sync-${width}.png`,fullPage:true});
  }
  await a.evaluate(()=>window.__switchUser(null));assert.equal(await a.locator('.homework-row').count(),0);
  assert.deepEqual(errors,[]);console.log('Homework: two devices, reload, ingestion, account isolation, rejected write, filters, offline, 320/390/1280px PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
