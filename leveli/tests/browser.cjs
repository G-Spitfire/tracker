const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const fixtures={A:{schemaVersion:1,source:'petersburgedu',grades:[5,5,5,4,4,4].map((value,i)=>({id:'a'+i,subject:'Математика',value:String(value),date:`2026-10-${10+i}`,type:'Устный ответ',quarter:1})).concat([{id:'f',subject:'Русский язык',value:'5',date:'2026-10-20',type:'Четвертная',quarter:1},{id:'c',subject:'Русский язык',value:'4',date:'2026-10-15',type:'Итоговая контрольная работа',weight:2,quarter:1},{id:'n',subject:'Русский язык',value:'неизвестная',valueCode:'2',date:'2026-10-14',quarter:1}])},B:{schemaVersion:1,source:'petersburgedu',grades:[{id:'b1',subject:'История',value:'3',date:'31.10.2026',type:'Ответ',quarter:1}]}};
const testTime=new Date(2026,10,7,12).getTime();
fixtures.A.syncedAt=new Date(testTime-3600000).toISOString();
const authMock=`export const getAuth=()=>window.__auth;export const browserLocalPersistence={};export const setPersistence=async()=>{};export function onAuthStateChanged(a,fn){window.__listeners.push(fn);setTimeout(()=>fn(a.currentUser),Number(sessionStorage.getItem('auth-delay')||0));return ()=>{}}export async function signInWithEmailAndPassword(a,email){window.__switchUser(email.startsWith('b')?'B':'A')}export async function signOut(){window.__switchUser(null)}`;
const storeMock=`export const getFirestore=()=>({});export const doc=(db,...parts)=>parts;export const serverTimestamp=()=>0;export const runTransaction=async(db,fn)=>fn({get:async path=>({exists:()=>!!JSON.parse(sessionStorage.getItem('cloud:'+path.join('/'))||'null'),data:()=>JSON.parse(sessionStorage.getItem('cloud:'+path.join('/')))}),set:(path,value)=>sessionStorage.setItem('cloud:'+path.join('/'),JSON.stringify(value))});export async function getDocFromServer(path){if(window.__offline)throw Error('offline');const [kind,uid]=path;if(kind==='profiles')return {exists:()=>true,data:()=>({name:uid==='A'?'Полина':'Матвей'})};if(kind==='schoolGrades')return {exists:()=>true,data:()=>window.__fixtures[uid]};const value=JSON.parse(sessionStorage.getItem('cloud:'+path.join('/'))||'null');return {exists:()=>!!value,data:()=>value};}export const getDoc=getDocFromServer;`;
fs.mkdirSync('outputs',{recursive:true});fs.mkdirSync('work',{recursive:true});
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 // Keep Firebase module requests under the test routes, including after reload.
 await context.addInitScript(()=>{if(navigator.serviceWorker)navigator.serviceWorker.register=async()=>{};if(!sessionStorage.getItem('startup-checked')){sessionStorage.setItem('auth-delay','400');sessionStorage.setItem('startup-checked','yes')}});
 await context.addInitScript(({fixtures})=>{window.__fixtures=fixtures;window.__auth={currentUser:JSON.parse(sessionStorage.getItem('test-user')||'null')};window.__listeners=[];window.__switchUser=uid=>{window.__auth.currentUser=uid?{uid,email:uid==='A'?'a@example.test':'b@example.test'}:null;sessionStorage.setItem('test-user',JSON.stringify(window.__auth.currentUser));for(const fn of window.__listeners)fn(window.__auth.currentUser)}},{fixtures});
 await context.route('https://www.gstatic.com/firebasejs/**',route=>{const url=route.request().url();route.fulfill({contentType:'text/javascript',body:url.endsWith('firebase-app.js')?'export const initializeApp=(c,n)=>({name:n})':url.endsWith('firebase-auth.js')?authMock:storeMock})});
 await context.route('https://fonts.googleapis.com/**',route=>route.abort());await context.route('https://fonts.gstatic.com/**',route=>route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(testTime);
 await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:8765')+'/leveli/');await page.waitForFunction(()=>window.leveliFirebase);
 // While the initial Firebase session is unresolved, the login is never visible.
 assert.equal(await page.locator('#leveli-startup').isVisible(),true,'splash displays during slow auth resolution');
 assert.equal(await page.locator('#school-login').isVisible(),false,'login must not flash during auth restoration');
 assert.equal(await page.locator('#school-results').isVisible(),false);
 assert.equal(await page.locator('.leveli-bottom-nav').isVisible(),false);
 assert.equal(await page.locator('#leveli-startup img').getAttribute('src'),'./brand/mark.svg','approved logo asset');
 assert.equal(await page.locator('#leveli-startup .leveli-startup-subtitle').textContent(),'Твои школьные результаты');
 await page.waitForFunction(()=>document.documentElement.dataset.leveliAuthReady==='true');
 assert.equal(await page.locator('#leveli-startup').isVisible(),false);
 assert.equal(await page.locator('#school-login').isVisible(),true,'guest sees login only after auth resolves');
 await page.evaluate(()=>sessionStorage.removeItem('auth-delay'));
 assert.equal(await page.locator('[data-tab]').count(),0);
 assert.equal(await page.locator('[data-page="home"]').isVisible(),true);
 const orientationHelp=await page.locator('#school-guide').textContent();
 assert.match(orientationHelp,/0–1 оценке/,'help must state when trend is unavailable');
 assert.match(orientationHelp,/2–5/,'help must describe short-window trend');
 assert.match(orientationHelp,/6 и более/,'help must describe three-grade windows');
 assert.doesNotMatch(orientationHelp,/средним за всю выбранную четверть/,'retired formula must not return');
 assert.equal(await page.locator('.school-header .brand-lockup img').getAttribute('src'),'./brand/mark.svg');
 assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'./manifest.webmanifest');
 assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),'./brand/apple-touch-icon.png');
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('[data-page="profile"]').isVisible(),true);
 assert.equal(await page.locator('.b3-header h1').innerText(),'Настройки');
 assert.equal(await page.locator('.b3-header p').count(),0,'redundant personal-space subtitle removed');
 assert.equal(await page.locator('.b3-home-btn').innerText(),'Назад');
 const navStyle=await page.locator('.b3-home-btn').evaluate(el=>({
  height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderTopLeftRadius,
  fontSize:getComputedStyle(el).fontSize,iconSize:getComputedStyle(el.querySelector('svg')).width
 }));
 assert.equal(navStyle.height,44);assert.equal(navStyle.radius,'12px');
 assert.equal(navStyle.fontSize,'13px');assert.equal(navStyle.iconSize,'20px');

 await page.locator('.b3-home-btn').click();
 assert.equal(await page.locator('[data-page="home"]').isVisible(),true);
 await page.evaluate(()=>{
  localStorage.setItem('leveli-personal-v1-A',JSON.stringify({pack:'cats',accent:'mint',avatar:1,avatarRevision:2}));
  localStorage.setItem('leveli-personal-v1-B',JSON.stringify({pack:'sports',avatar:0,avatarRevision:2}));
  window.__switchUser('A');
 });await page.waitForFunction(()=>document.querySelector('#school-period').options.length>=4);
 const story=page.locator('#weekly-story');
 await story.waitFor();
 const storyStyle=await story.evaluate(el=>{
  const heading=el.querySelector('h2'),next=el.querySelector('#story-next');
  const active=el.querySelector('[aria-current="step"]');
  return {heading:getComputedStyle(heading).fontSize,progress:getComputedStyle(active,'::before').backgroundColor,
   action:getComputedStyle(next).borderTopColor,background:getComputedStyle(el).backgroundColor,
   page:getComputedStyle(document.body).backgroundColor};
 });
 assert.equal(storyStyle.heading,'26px','story uses the Leveli screen title scale');
 assert.equal(storyStyle.progress,storyStyle.action,'progress and button use the selected Leveli accent');
 assert.equal(storyStyle.background,storyStyle.page,'story uses the app background');
 assert.ok(await story.evaluate(el=>el.querySelector('.story-actions').getBoundingClientRect().top-
  el.querySelector('.story-main').getBoundingClientRect().bottom<=16),'controls stay close to the card');
 const assertFullHeight=async()=>assert.ok(await story.evaluate(el=>{
  const footer=el.querySelector('.story-actions').getBoundingClientRect();
  return el.getBoundingClientRect().bottom-footer.bottom<=24;
 }),'story content extends to the bottom controls');
 const cardFrame=()=>story.locator('.story-main').evaluate(card=>{
  const {top,bottom}=card.getBoundingClientRect(),style=getComputedStyle(card);
  return {top,bottom,padding:style.padding,border:style.borderTopWidth,background:style.backgroundColor};
 });
 const overviewFrame=await cardFrame();
 await assertFullHeight();
 const bars=story.locator('.story-meter i');
 assert.equal(await bars.first().evaluate(el=>el.style.width),'40%');
 assert.equal(await bars.last().evaluate(el=>el.style.width),'100%');

 assert.equal(await page.locator('#story-before').innerText(),'2');
 assert.equal(await page.locator('#story-after').innerText(),'5');
 await page.locator('#story-next').click();
 assert.equal(await page.locator('#weekly-story-title').innerText(),'Сколько пятёрок?');
 assert.equal(await page.locator('#story-before').innerText(),'2');
 assert.equal(await page.locator('#story-after').innerText(),'1');
 assert.equal(await page.locator('#story-change').innerText(),'−1');
 assert.ok(await page.locator('#story-after').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=72));
 assert.deepEqual(await cardFrame(),overviewFrame,'count slides share the same card frame');
 assert.equal(await page.locator('#story-label-before').innerText(),'5 октября – 11 октября');
 assert.equal(await page.locator('#story-label-after').innerText(),'12 октября – 18 октября');
 await assertFullHeight();
 await page.setViewportSize({width:320,height:844});
 const narrowFivesFrame=await cardFrame();
 await page.locator('#story-prev').click();
 assert.deepEqual(await cardFrame(),narrowFivesFrame,'count slides stay aligned on a narrow phone without web fonts');
 await page.locator('#story-next').click();
 await page.setViewportSize({width:390,height:844});
 await page.keyboard.press('Escape');
 await page.reload();
 await story.waitFor();
 assert.equal(await page.locator('#story-progress [aria-current="step"]').getAttribute('aria-label'),'Экран 2 из 5');
 await page.evaluate(()=>localStorage.setItem('leveli-weekly-v1-A',JSON.stringify({'2026-1:2026-10-12':4})));
 await page.reload();
 await story.waitFor();
 assert.equal(await page.locator('#weekly-story-title').innerText(),'Главное за неделю','saved fifth step resumes at the summary');
 assert.equal(await page.locator('#story-next').innerText(),'Закрыть');
 await page.locator('#story-next').click();
 assert.equal(await page.locator('#home-greeting').innerText(),'Привет, Полина!');
 assert.deepEqual(await page.locator('#school-overview > article h2').allTextContents(),[
  'Моя успеваемость','Как у меня дела?'
 ]);
 // A fixed bottom tab bar with separate Subjects and placeholder Outcomes screens.
 const nav=page.locator('.leveli-bottom-nav');
 const navButton=tab=>nav.locator('[data-go="'+tab+'"]');
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  const rect=await nav.evaluate(el=>{const r=el.getBoundingClientRect();return {bottom:r.bottom,width:r.width,scroll:document.documentElement.scrollWidth,viewport:innerWidth}});
  assert.ok(Math.abs(rect.bottom-844)<=1,'navigation pinned to bottom at '+width);
  assert.equal(rect.width,width,'navigation width at '+width);
  assert.ok(rect.scroll<=rect.viewport+1,'no horizontal overflow at '+width);
  for(const button of await nav.locator('button').all()){const b=await button.boundingBox();assert.ok(b.width>=44&&b.height>=44,'tab hit area at '+width)}
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await navButton('home').getAttribute('aria-current'),'page');
 assert.equal(await page.locator('[data-page="home"] .subjects-card').count(),0);
 await navButton('subjects').click();
 assert.equal(await page.locator('[data-page="subjects"]').isVisible(),true);
 assert.equal(await navButton('subjects').getAttribute('aria-current'),'page');
 await navButton('outcomes').click();
 assert.equal(await page.locator('#outcomes-title').innerText(),'Итоги');
 assert.equal(await page.locator('#outcomes-weeks .weekly-release').count(),2);
 assert.match(await page.locator('#outcomes-weeks .weekly-release').first().innerText(),/Просмотрено/);
 assert.equal(await page.locator('.subjects-card').isVisible(),false);
 assert.equal(await page.locator('#outcomes-tab-weeks').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#outcomes-quarters').isVisible(),false);
 await page.locator('#outcomes-tab-quarters').click();
 assert.equal(await page.locator('#outcomes-tab-quarters').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#outcomes-weeks').isVisible(),false);
 assert.equal(await page.locator('#outcomes-quarter-title').innerText(),'Итоги I четверти');
 assert.equal(await page.locator('#outcomes-quarter-year').innerText(),'2026/27');
 assert.deepEqual(await page.locator('.outcomes-quarter-row .outcomes-subject-name').allTextContents(),['Русский язык'],'only explicit quarter marks, not tests or forecasts');
 assert.deepEqual(await page.locator('.outcomes-quarter-row .outcomes-quarter-grade').allTextContents(),['5']);
 assert.equal(await page.locator('#outcomes-quarter-buttons button:disabled').count(),3,'future and current quarters cannot be selected');
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  const fit=await page.evaluate(()=>({
   scroll:document.documentElement.scrollWidth,viewport:innerWidth,
   tabHeights:[...document.querySelectorAll('.outcomes-switch button,.outcomes-quarter-buttons button')].map(b=>b.getBoundingClientRect().height),
   menuBottom:document.querySelector('.leveli-bottom-nav').getBoundingClientRect().bottom
  }));
  assert.ok(fit.scroll<=fit.viewport+1,'outcomes fit at '+width);
  assert.ok(fit.tabHeights.every(h=>h>=44),'outcomes touch targets at '+width);
  assert.ok(Math.abs(fit.menuBottom-844)<=1,'bottom menu pinned at '+width);
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'outputs/leveli-outcomes-quarters.png',fullPage:true});
 await page.locator('#outcomes-tab-weeks').click();
 await page.screenshot({path:'outputs/leveli-outcomes-weeks.png',fullPage:true});
 // Open an archived issue and inspect its four slides.
 await page.locator('#outcomes-weeks .weekly-release').first().click();
 assert.equal(await story.isVisible(),true);
 assert.equal(await page.locator('#story-progress button').count(),5);
 assert.equal(await page.locator('#story-before').innerText(),'2');
 await page.locator('#story-next').click();
 assert.equal(await page.locator('#story-after').innerText(),'1');
 await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('#story-change').innerText(),'−0,75');
 const quarterChart=page.locator('#story-quarter-chart');
 assert.equal(await quarterChart.isVisible(),true);
 assert.equal(await quarterChart.locator('rect').count(),2,'one bar per nonempty quarter week up to this release');
 assert.match(await quarterChart.getByRole('img').getAttribute('aria-label'),/5,00.*4,25/);
 assert.deepEqual(await cardFrame(),overviewFrame);
 await assertFullHeight();
 await page.locator('#story-prev').click();
 assert.equal(await page.locator('#story-after').innerText(),'1');
 await page.locator('#story-progress button').nth(3).click();
 assert.equal(await page.locator('#story-comparison').isVisible(),false);
 assert.equal(await page.locator('#story-next').innerText(),'Дальше');
 assert.match(await page.locator('#story-subjects').innerText(),/Математика[\s\S]*5,00.*4,50/);
 const subjectScore=page.locator('#story-subjects li').first();
 assert.ok(await subjectScore.locator('strong').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=28));
 assert.equal(await subjectScore.locator('.story-subject-delta').innerText(),'−0,50');
 assert.deepEqual(await cardFrame(),overviewFrame);
 await assertFullHeight();
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  await page.locator('#story-progress button').nth(0).click();
  const frame=await cardFrame();
  for(const step of [2,3,4]){
   await page.locator('#story-progress button').nth(step).click();
   assert.deepEqual(await cardFrame(),frame,'story card aligns at '+width+' on step '+(step+1));
   const dimensions=await story.evaluate(el=>({
    width:el.getBoundingClientRect().width,scroll:el.scrollWidth,window:innerWidth,
    close:el.querySelector('#story-close').getBoundingClientRect().width,
    progress:el.querySelector('#story-progress button').getBoundingClientRect().height
   }));
   assert.equal(dimensions.width,width,'fullscreen story at '+width);
   assert.ok(dimensions.scroll<=width+1,'story fits at '+width+' on step '+(step+1));
   assert.ok(dimensions.close>=44&&dimensions.progress>=44,'story hit targets at '+width);
  }
 }
 assert.equal(await page.locator('#story-next').innerText(),'Закрыть');
 assert.equal(await page.locator('#story-change').innerText(),'Есть над чем поработать');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'outputs/leveli-weekly-story.png'});
 await page.keyboard.press('Escape');
 assert.equal(await story.isVisible(),false,'Escape closes story dialog');
 assert.equal(await page.locator('#outcomes-weeks').isVisible(),true);
 assert.equal(await page.locator('#outcomes-quarter-grades .outcomes-quarter-row').count(),1,'weekly story did not change official grades');
 // A correction refreshes the archive without making a finished issue new.
 const latest=page.locator('#weekly-archive .weekly-release').first();
 const correctMark=value=>page.evaluate(value=>new Promise(resolve=>{
  const observer=new MutationObserver(()=>{observer.disconnect();resolve()});
  observer.observe(document.getElementById('weekly-archive'),{childList:true});
  window.__fixtures.A.grades[0].value=value;
  document.getElementById('school-refresh').click();
 }),value);
 await correctMark('4');
 assert.equal(await story.isVisible(),false);
 assert.match(await latest.innerText(),/Просмотрено/);
 await latest.click();
 await page.locator('#story-next').click();
 assert.equal(await page.locator('#story-before').innerText(),'1','archived comparison reflects corrected mark');
 assert.equal(await page.locator('#story-after').innerText(),'1');
 await page.keyboard.press('Escape');
 await correctMark('5');
 await page.locator('#outcomes-tab-quarters').click();
 await page.goBack();
 assert.equal(await page.locator('[data-page="subjects"]').isVisible(),true);
 await navButton('home').click();
 const freshness=page.locator('#school-freshness');
 await page.waitForFunction(()=>document.querySelector('#school-freshness').dataset.state==='ok');
 assert.match(await freshness.innerText(),/Оценки по состоянию на/);
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('.b3-hero').isVisible(),true);
 assert.equal(await page.locator('.b3-tiles .b3-tile:visible').count(),2);
 assert.equal(await page.locator('[data-b3-panel="icons"],#personal-pack-options').count(),0);
 assert.equal(await page.locator('html').getAttribute('data-leveli-pack'),null);
 assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),'#69d9bd');
 assert.equal(await page.locator('#profile-avatar-display').getAttribute('data-avatar-index'),'0');
 assert.equal(await page.locator('#profile-avatar-display').textContent(),'');
 assert.equal(await page.locator('.b3-avatar-stand').isVisible(),false,'profile without an avatar reserves no portrait space');
 await page.locator('[data-b3-panel="accent"]').click();
 await page.getByRole('button',{name:'Розовый',exact:true}).click();
 await page.locator('#b3-panel-close').click();
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),'#f18bc9');
 assert.equal(await page.locator('[data-b3-panel="theme"]').isVisible(),false,'theme selection hidden');
 await page.emulateMedia({colorScheme:'light'});
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark','system light mode must not change app theme');
 await page.locator('[data-b3-panel="avatar"]').first().click();
 await page.getByRole('button',{name:'Полина — Котёнок',exact:true}).click();
 assert.equal(await page.locator('#profile-avatar-display').getAttribute('data-avatar-index'),'2');
 assert.equal(await page.locator('#profile-avatar-display .avatar-illustration').count(),1);

 assert.equal(await page.locator('#personal-avatar-options .personal-avatar-option').count(),15);
 assert.deepEqual(await page.locator('#personal-avatar-options h4').allTextContents(),['Полина']);
 await page.locator('#personal-avatar-options img').evaluateAll(images=>Promise.all(images.map(img=>{img.loading='eager';return img.decode()})));
 assert.equal(await page.locator('#personal-avatar-options img').count(),15);
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.locator('.b3-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 }
 await page.screenshot({path:'outputs/leveli-avatar-gallery.png',fullPage:true});
 for(const name of ['polina','matvey']){
  const response=await page.request.get((process.env.TEST_BASE_URL||'http://127.0.0.1:8765')+'/leveli/avatars/leveli-'+name+'-3d.webp');
  assert.equal(response.status(),404);
 }
 await page.waitForFunction(()=>document.querySelector('#profile-avatar-display img')?.naturalHeight>=500);
 // The enlarged portrait rests at the lower edge, but rises above the top.
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  const layout=await page.evaluate(()=>{
   const card=document.querySelector('.b3-hero').getBoundingClientRect();
   const stand=document.querySelector('.b3-avatar-stand').getBoundingClientRect();
   const image=document.querySelector('.b3-avatar-stand .avatar-illustration').getBoundingClientRect();
   const copy=document.querySelector('.b3-profile-copy').getBoundingClientRect();
   const name=document.querySelector('#profile-name').getBoundingClientRect();
   const button=document.querySelector('.b3-change-avatar').getBoundingClientRect();
   const frame=getComputedStyle(document.querySelector('.b3-hero'),'::after');
   const imageStyle=getComputedStyle(document.querySelector('.b3-avatar-stand .avatar-illustration'));
   return {cardTop:card.top,cardBottom:card.bottom,standTop:stand.top,standBottom:stand.bottom,
    imageTop:image.top,imageBottom:image.bottom,avatarRight:Math.min(image.right,stand.right),copyLeft:copy.left,
    nameLeft:name.left,buttonLeft:button.left,frameContent:frame.content,
    frameBorder:frame.borderBottomStyle,frameZ:frame.zIndex,
    imageMask:imageStyle.maskImage,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  assert.ok(layout.standTop<layout.cardTop-18,'portrait rises above card at '+width);
  assert.ok(Math.abs(layout.standBottom-layout.cardBottom)<=2,'portrait rests at lower border at '+width);
  assert.ok(layout.imageBottom<=layout.cardBottom+2,'portrait stays above lower border at '+width);
  assert.ok(layout.avatarRight<=layout.copyLeft+2,'portrait stays clear of profile copy at '+width);
  assert.ok(layout.nameLeft>=layout.copyLeft-1&&layout.buttonLeft>=layout.copyLeft-1,'text and button stay in right track at '+width);
  assert.equal(layout.frameContent,'""','front border overlay is present at '+width);
  assert.equal(layout.frameBorder,'solid','lower border is rendered at '+width);
  assert.equal(layout.frameZ,'3','lower border renders above portrait at '+width);
  assert.equal(layout.imageMask,'none','portrait bottom must not fade out');
  assert.ok(layout.bodyWidth<=layout.viewport+1,'no horizontal overflow at '+width);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#b3-panel-close').click();
 await page.screenshot({path:'outputs/leveli-polina-settings.png',fullPage:true});
 await page.locator('[data-b3-panel="birthday"]').click();
 await page.locator('#profile-birthday').fill('2017-09-08');
 assert.match(await page.locator('#profile-age').innerText(),/Возраст: \d+/);
 const avatarFile={name:'my-avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRLkAAAAASUVORK5CYII=','base64')};
 await page.locator('#b3-panel-close').click();
 await page.locator('[data-b3-panel="avatar"]').first().click();
 await page.locator('#profile-avatar-file').setInputFiles(avatarFile);
 await page.locator('#profile-avatar-display img.profile-avatar-custom').waitFor({state:'visible'});
 assert.match(await page.locator('#profile-avatar-display img').getAttribute('src'),/^data:image\/(webp|png);base64,/);

 assert.equal(await page.locator('html').getAttribute('data-leveli-pack'),null);
 await page.locator('#b3-panel-close').click();
 await page.locator('.b3-home-btn').click();
 assert.equal(await page.locator('#school-subjects').count(),1);

 assert.equal(await page.locator('#school-period').inputValue(),'2026-2');
 assert.equal(await page.locator('#school-subjects .subject-row').count(),0);
 assert.equal(await page.locator('#school-trend-change').textContent(),'');
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 await page.locator('[data-b3-panel="quarter"]').click();
 await page.getByRole('button',{name:'1 четверть'}).click();
 assert.equal(await page.locator('#school-period').inputValue(),'2026-1');
 assert.equal(await page.locator('#school-period-buttons button[aria-pressed="true"]').innerText(),'1 четверть');
 await page.getByRole('button',{name:/3 четверть/}).click();
 assert.match(await page.locator('#school-period-notice').innerText(),/3 четверть ещё не наступила/);
 assert.equal(await page.locator('#school-period').inputValue(),'2026-1');
 await page.getByRole('button',{name:/4 четверть/}).click();
 assert.match(await page.locator('#school-period-notice').innerText(),/4 четверть ещё не наступила/);
 await page.getByRole('button',{name:'2 четверть'}).click();
 assert.equal(await page.locator('#school-period').inputValue(),'2026-2');
 assert.equal(await page.locator('#school-period-notice').isVisible(),false);
 await page.getByRole('button',{name:'1 четверть'}).click();
 assert.equal(await page.locator('#school-period-buttons button[aria-pressed="true"]').innerText(),'1 четверть');
 await page.locator('#b3-panel-close').click();
 const colors=['#a882ff','#f18bc9','#68adff','#f4c75f','#69d9bd'];
 const names=['Фиолетовый','Розовый','Синий','Жёлтый','Мятный'];
 await page.locator('[data-b3-panel="accent"]').click();
 for(const [i,label] of names.entries()){
  await page.getByRole('button',{name:label,exact:true}).click();
  assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),colors[i]);
  assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 }
 await page.locator('#b3-panel-close').click();
 await page.emulateMedia({colorScheme:'light'});
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 await page.locator('[data-b3-panel="accent"]').click();
 await page.getByRole('button',{name:'Розовый',exact:true}).click();
 await page.locator('#b3-panel-close').click();
 await page.locator('.b3-home-btn').click();
 await page.waitForFunction(()=>document.querySelector('#school-subjects').textContent.includes('Математика'));
 assert.equal(await page.locator('#school-overall').innerText(),'4,25');
 await navButton('subjects').click();
 const mathRow=page.locator('#school-subjects .subject-row').filter({hasText:'Математика'});
 assert.match(await mathRow.innerText(),/Математика[\s\S]*6 оценок[\s\S]*4,50[\s\S]*4[\s\S]*прогноз/);
 assert.equal(await mathRow.locator('.subject-row__grade strong').innerText(),'4');
 assert.match(await mathRow.locator('.subject-row__dynamics').innerText(),/−?1,00|-1,00/);
 await mathRow.locator('.grade-delta').click();
 assert.match(await page.locator('#leveli-trend-dialog').innerText(),/Предыдущие оценки[\s\S]*Последние оценки/);
 await page.getByRole('button',{name:'Понятно'}).click();
 const russianRow=page.locator('#school-subjects .subject-row').filter({hasText:'Русский язык'});
 assert.match(await russianRow.innerText(),/Русский язык[\s\S]*1 оценка[\s\S]*4,00[\s\S]*5[\s\S]*итог/);
 assert.equal(await russianRow.locator('.official-box').innerText(),'5');
 assert.equal(await russianRow.locator('.grade-delta').textContent(),'—');
 assert.equal(await mathRow.locator('.grade-delta').textContent(),'↘ −1,00');
 await navButton('home').click();
 assert.equal(await page.locator('.double-donut .donut-panel').count(),2);
 assert.equal(await page.locator('.donut-unit').first().innerText(),'Количество предметов');
 assert.equal(await page.locator('.donut-unit').last().innerText(),'Количество оценок');
 assert.equal(await page.locator('#school-donut circle[role="button"]').count(),0);
 const guide=page.getByRole('button',{name:'Как читать оценки'});
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  const rows=await page.locator('#school-forecast-legend button').evaluateAll(buttons=>buttons.map(b=>{
   const box=b.getBoundingClientRect();return {label:b.querySelector('.legend-label').textContent,x:box.x,y:box.y,w:box.width,h:box.height,overflow:b.scrollWidth>b.clientWidth+1};
  }));
  assert.deepEqual(rows.map(row=>row.label),['Оценка 5','Оценка 4']);
  assert.equal(rows[0].x,rows[1].x);
  assert.ok(rows[1].y-rows[0].y<=36,'grade filters are closely spaced at '+width+'px');
  assert.ok(rows.every(row=>row.h>=36&&row.w>=44&&!row.overflow),'grade filters remain readable and tappable');
 }
 await page.setViewportSize({width:390,height:844});
 await guide.press('Enter');
 assert.equal(await page.locator('#school-guide').isVisible(),true);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#school-guide').isVisible(),false);
 assert.ok(await guide.evaluate(el=>document.activeElement===el));
 await page.getByRole('button',{name:/^Оценка 5\s*1$/}).click();
 assert.equal(await page.locator('#school-donut circle[data-accent-selection="true"]').count(),1);
 assert.equal(await page.locator('#school-donut circle[data-accent-selection="true"]').evaluate(el=>el.style.stroke),'var(--leveli-accent)');
 assert.equal(await page.locator('#school-subjects .subject-row').count(),1);
 assert.match(await page.locator('#school-subjects').innerText(),/Русский язык/);
 assert.equal(await page.locator('[data-page="subjects"]').isVisible(),true);
 await navButton('home').click();
 await page.getByRole('button',{name:/^Оценка 5\s*1$/}).click();
 await page.locator('#school-subjects .subject-row').filter({hasText:'Математика'}).click();
 assert.equal(await page.locator('#school-subject-detail .detail-hero-score').innerText(),'4');
 const forecast=page.locator('#school-subject-detail .detail-hero');
 assert.ok(await forecast.evaluate(el=>{
  const label=el.querySelector('.detail-hero-label').getBoundingClientRect();
  const score=el.querySelector('.detail-hero-score').getBoundingClientRect();
  return score.left>=label.right&&score.top<label.bottom&&el.getBoundingClientRect().height<130;
 }), 'quarter forecast is compact with its grade on the right');
 assert.equal(await page.locator('#school-subject-detail .detail-back').innerText(),'Назад');
 assert.equal(await page.locator('#school-subject-detail .detail-period').count(),1);
 const headers=await page.evaluate(()=>{
  const back=document.querySelector('.detail-back'),title=document.querySelector('.detail-title'),period=document.querySelector('.detail-period');
  const one=back.getBoundingClientRect(),two=title.getBoundingClientRect(),three=period.getBoundingClientRect();
  const style=getComputedStyle(back);
  return {height:one.height,radius:style.borderTopLeftRadius,font:style.fontSize,svg:getComputedStyle(back.querySelector('svg')).width,
    sameRow:Math.abs((one.top+one.height/2)-(two.top+two.height/2))<25,periodBelow:three.top>=Math.max(one.bottom,two.bottom)-1}
 });
 assert.equal(headers.height,44);assert.equal(headers.radius,'12px');
 assert.equal(headers.font,'13px');assert.equal(headers.svg,'20px');
 assert.ok(headers.sameRow,'subject title and back action share a row');
 assert.ok(headers.periodBelow,'quarter pill is below subject header row');

 assert.match(await page.locator('#school-subject-detail .detail-trend-pill').innerText(),/↘.*1,00.*Как посчитано/);
  await page.locator('#school-subject-detail .detail-trend-pill').click();
  assert.equal(await page.locator('#leveli-trend-dialog').isVisible(),true);
  assert.match(await page.locator('#leveli-trend-dialog').innerText(),/Предыдущие оценки[\s\S]*Последние оценки[\s\S]*Изменение/);
  await page.getByRole('button',{name:'Понятно'}).click();
  assert.equal(await page.locator('#leveli-trend-dialog').isVisible(),false);
 assert.equal(await page.locator('#school-subject-detail .detail-kpi').count(),0);
 assert.equal(await page.locator('.school-header').isVisible(),false);
 await page.evaluate(()=>document.getElementById('school-refresh').click());
 await page.waitForTimeout(350);
 assert.equal(await page.locator('#school-subject-detail').isVisible(),true);
 assert.match(await page.locator('#school-subject-detail .detail-goal-main').innerText(),/Ещё 2 пятёрки до прогноза 5/);
 await page.getByRole('button',{name:'Оценки',exact:true}).click();
 assert.ok((await page.locator('#school-subject-detail .detail-chart-scroll rect').count())<=12);
 assert.match(await page.locator('#school-subject-detail .detail-chart-caption').innerText(),/Последние|Показаны все/);
 assert.ok((await page.locator('#school-subject-detail .detail-chart-scroll text[font-weight="800"]').count())<=6);
 assert.ok((await page.locator('#school-subject-detail .detail-chart-scroll rect[fill^="url(#leveli-subject-grade-"]').count())<=6);
 assert.ok((await page.locator('#school-subject-detail .detail-chart-scroll rect[filter="url(#leveli-subject-bar-glow)"]').count())<=6);
 const chartScrollBefore=await page.evaluate(()=>window.scrollY);
 await page.getByRole('button',{name:'Средний балл',exact:true}).click();
 const chartScrollAfter=await page.evaluate(()=>window.scrollY);
 assert.ok(Math.abs(chartScrollAfter-chartScrollBefore)<=2,'switching chart mode must not jump the page');
 assert.equal(await page.locator('#school-subject-detail .detail-chart-scroll polyline[filter="url(#leveli-subject-line-glow)"]').count(),1);
 assert.equal(await page.locator('#school-subject-detail .detail-chart-scroll text[font-weight="800"]').last().textContent(),'4,50','average label at last chart point');
 assert.equal(await page.locator('#school-subject-detail .detail-toggle').first().locator('button').count(),2,'chart mode controls stay mounted');
 const fit=await page.locator('#school-subject-detail .detail-chart-scroll').evaluate(el=>{
   const svg=el.querySelector('svg');
   return {chart:svg.getBoundingClientRect().width,container:el.clientWidth,scroll:el.scrollWidth};
 });
 assert.ok(fit.chart<=fit.container+1,'average line must fit the visible chart');
 assert.ok(fit.scroll<=fit.container+1,'average line must not scroll horizontally');
 assert.equal(await page.locator('#school-subject-detail .detail-header .detail-period').innerText(),'I четверть');
 assert.ok((await page.locator('#school-subject-detail').evaluate(el=>el.scrollWidth<=el.clientWidth+1)),'subject detail must not overflow phone viewport');
 await page.getByRole('button',{name:'Контрольные'}).click();
 assert.match(await page.locator('#school-subject-detail').innerText(),/Нет оценок этого типа/);
 await page.getByRole('button',{name:'Назад к предметам'}).click();
 assert.equal(await page.locator('[data-page="subjects"]').isVisible(),true);
 await page.locator('#school-subjects .subject-row').filter({hasText:'Русский язык'}).click();
 assert.equal(await page.locator('#school-subject-detail .detail-hero-score').innerText(),'5');
 assert.equal(await page.locator('#school-subject-detail .detail-goal').count(),0);
 assert.equal(await page.locator('#school-subject-detail .grade-entry__weight').count(),1);
 assert.equal(await page.locator('#school-subject-detail .grade-entry__weight').innerText(),'Вес ×2');
 await page.getByRole('button',{name:'Назад к предметам'}).click();
 await page.screenshot({path:'outputs/leveli-subjects.png',fullPage:true});
 await navButton('home').click();
 await page.evaluate(()=>window.__switchUser('B'));await page.waitForFunction(()=>document.querySelector('#school-period').options.length>=4);
 await story.waitFor();
 assert.equal(await page.locator('#story-comparison').isVisible(),false,'first week of this account has no comparison');
 await page.locator('#story-next').click();
 assert.equal(await page.locator('#story-comparison .story-before').isVisible(),false);
 assert.equal(await page.locator('#story-after').innerText(),'0');
 await page.locator('#story-progress button').last().click();
 await page.locator('#story-next').click();
 assert.equal(await page.locator('#home-greeting').innerText(),'Привет, Матвей!');
 await navButton('outcomes').click();
 await page.locator('#outcomes-tab-quarters').click();
 assert.equal(await page.locator('.outcomes-quarter-row').count(),0,'switching accounts clears previous child quarter results');
 assert.match(await page.locator('#outcomes-quarter-grades').innerText(),/Официальные оценки/);
 await navButton('home').click();
 const unknownFreshness=freshness.getByText('Время обновления оценок неизвестно',{exact:true});
 await unknownFreshness.waitFor();
 assert.equal(await freshness.getAttribute('data-state'),'unknown');
 const refreshProfileB=timestamp=>page.evaluate(syncedAt=>{
  window.__fixtures.B.syncedAt=syncedAt;
  document.getElementById('school-refresh').click();
 },timestamp);
 const profileBTimestamp=new Date(testTime-7200000).toISOString();
 await refreshProfileB(profileBTimestamp);
 await page.waitForFunction(()=>document.querySelector('#school-freshness').dataset.state==='ok');
 const profileBFreshness=await freshness.locator('.sync-copy').innerText();
 assert.match(profileBFreshness,/Оценки по состоянию на/);
 await refreshProfileB(new Date(testTime+3600000).toISOString());
 await unknownFreshness.waitFor({timeout:5000});
 await refreshProfileB(profileBTimestamp);
 await page.waitForFunction(()=>document.querySelector('#school-freshness').dataset.state==='ok');
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),'#a882ff');
 assert.equal(await page.locator('#home-birthday-greeting').isVisible(),false);
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('#profile-avatar-display img.profile-avatar-custom').count(),0);
 assert.equal(await page.locator('#profile-avatar-display').getAttribute('data-avatar-index'),'0');
 assert.equal(await page.locator('#profile-avatar-display').textContent(),'');
 await page.screenshot({path:'outputs/leveli-matvey-settings.png',fullPage:true});
 await page.locator('.b3-home-btn').click();

 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 await page.locator('[data-b3-panel="accent"]').click();
 await page.getByRole('button',{name:'Синий'}).click();
 await page.locator('#b3-panel-close').click();
 await page.locator('[data-b3-panel="avatar"]').first().click();
 await page.getByRole('button',{name:'Матвей — Футбол',exact:true}).click();
 assert.equal(await page.locator('#profile-avatar-display').getAttribute('data-avatar-index'),'10');
 assert.equal(await page.locator('#profile-avatar-display .avatar-illustration').count(),1);
 assert.equal(await page.locator('#personal-avatar-options [data-avatar-index="10"][aria-pressed="true"]').count(),1);
 await page.locator('#b3-panel-close').click();
 await page.locator('.b3-home-btn').click();

 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 await page.locator('[data-b3-panel="quarter"]').click();
 await page.getByRole('button',{name:'1 четверть'}).click();
 await page.locator('#b3-panel-close').click();
 await page.locator('.b3-home-btn').click();
 await page.waitForFunction(()=>document.querySelector('#school-subjects').textContent.includes('История'));
 assert.equal(await page.locator('#school-subject-count').innerText(),'1 предмет');
 assert.equal(await page.locator('#school-trend .trend-sparse').count(),1);
 assert.equal(await page.locator('.orient-grid').isVisible(),false);
 assert.doesNotMatch(await page.locator('#school-subjects').innerText(),/Математика/);
 assert.equal(await page.locator('#school-subject-detail').isVisible(),false);
 await page.evaluate(()=>{window.__offline=true});
 await page.evaluate(()=>document.getElementById('school-refresh').click());
 await page.waitForFunction(()=>document.querySelector('#school-status').textContent.includes('Firebase временно недоступен'));
 assert.doesNotMatch(await page.locator('#school-status').innerText(),/проверяем/i);
 assert.equal(await freshness.getAttribute('data-state'),'unknown');
 assert.match(await freshness.innerText(),/Оценки по состоянию на/);
 assert.equal(await freshness.locator('.sync-copy').innerText(),profileBFreshness);
 assert.match(await page.locator('#school-subjects').innerText(),/История[\s\S]*3,00/);
 await page.evaluate(()=>window.__switchUser('A'));
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),'#f18bc9');
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('#profile-avatar-display img.profile-avatar-custom').count(),1);
 assert.equal(await page.locator('#profile-birthday').inputValue(),'2017-09-08');
 // DS v2: the B3 tile icons are real consistent 24px line SVGs (not font glyphs).
 assert.equal(await page.locator('.b3-tiles .b3-tile-icon svg').count(),3);
 const iconStyle=await page.locator('.b3-tile-icon svg').first().evaluate(el=>({
  width:getComputedStyle(el).width,height:getComputedStyle(el).height
 }));
 assert.equal(iconStyle.width,'24px');assert.equal(iconStyle.height,'24px');
 assert.equal(await page.locator('.b3-home-btn svg').count(),1,'Back navigation uses consistent SVG icon');
 assert.equal(await page.locator('.help-btn,[data-help],#profile-gender').count(),0);
 assert.equal(await page.locator('.b3-extra button svg').count(),2,'settings detail actions use SVG chevrons');
 for(const selector of ['.b3-extra button svg']){
  const geometry=await page.locator(selector).first().evaluate(el=>{
   const st=getComputedStyle(el);return {w:st.width,h:st.height,stroke:st.strokeWidth}
  });
  assert.deepEqual(geometry,{w:'20px',h:'20px',stroke:'2px'},'functional icon system '+selector);
 }

 assert.equal(await page.locator('#b3-panel-close svg').count(),1,'Dialog close uses consistent SVG icon');
 for(const selector of ['.b3-home-btn svg','#b3-panel-close svg']){
  const style=await page.locator(selector).evaluate(el=>({w:getComputedStyle(el).width,h:getComputedStyle(el).height,stroke:getComputedStyle(el).strokeWidth}));
  const expected=selector==='.b3-home-btn svg'?'20px':'24px';assert.equal(style.w,expected);assert.equal(style.h,expected);assert.equal(style.stroke,'2px');
 }

 // Design-kit typography on the main dashboard must use shared tokens.
 const typeAudit=await page.evaluate(()=>{
  const root=getComputedStyle(document.documentElement),font=sel=>getComputedStyle(document.querySelector(sel)).fontSize;
  return {screenToken:root.getPropertyValue('--ds-font-screen').trim(),cardToken:root.getPropertyValue('--ds-font-card').trim(),screen:font('.school-header h1'),cards:['.forecast-card .card-heading h2','.trend-card .card-heading h2','.subjects-card h2','.orient-heading h2'].map(font)};
 });
 assert.equal(typeAudit.screen,typeAudit.screenToken,'dashboard screen heading follows design-kit');
 for(const size of typeAudit.cards)assert.equal(size,typeAudit.cardToken,'dashboard card headings follow design-kit');

 // Consolidated CSS must preserve key card, navigation, and theme contracts.
 const cascadeAudit=await page.evaluate(()=>{
  const root=document.documentElement,old=root.dataset.leveliTheme,out=[];
  const home=document.querySelector('[data-page="home"]'),wasHidden=home.hidden;
  // WebKit may report cached styles for display:none subtrees.
  home.hidden=false;
  for(const theme of ['dark','light']){
   root.dataset.leveliTheme=theme;
   const read=selector=>{const element=document.querySelector(selector),style=getComputedStyle(element);return {radius:style.borderTopLeftRadius,background:style.backgroundColor,minHeight:style.minHeight,color:style.color}};
   out.push({theme,card:read('.card'),tile:read('.b3-tile'),back:read('.leveli-back-btn'),extra:read('.b3-extra'),dashboard:['.forecast-card','.trend-card','.subjects-card'].map(selector=>({background:read(selector).background,padding:getComputedStyle(document.querySelector(selector)).paddingTop})),donut:read('.donut-panel')});
  }
  root.dataset.leveliTheme=old;
  home.hidden=wasHidden;
  return out;
 });
 for(const state of cascadeAudit){
  assert.equal(state.card.radius,'20px','cards retain DS 20px radius in '+state.theme);
  assert.equal(state.tile.radius,'15px','B3 tile retains inner radius in '+state.theme);
  assert.equal(state.back.radius,'12px','back navigation retains DS 12px radius');
  assert.equal(state.back.minHeight,'44px','navigation hit targets remain 44px');
  assert.notEqual(state.tile.background,'rgba(0, 0, 0, 0)','tiles remain visible in '+state.theme);
  for(const panel of state.dashboard){
   assert.equal(panel.background,state.card.background,'dashboard surfaces match shared card surface in '+state.theme);
   assert.equal(panel.padding,'16px','dashboard card spacing follows 16px token at 390px in '+state.theme);
  }
  assert.equal(state.donut.radius,'15px','inner chart surfaces use 15px radius in '+state.theme);
  assert.equal(state.donut.background,state.theme==='light'?'rgb(243, 238, 251)':'rgb(37, 32, 61)','inner chart surface follows theme in '+state.theme);
 }
 assert.notEqual(cascadeAudit[0].card.background,cascadeAudit[1].card.background,'light/dark card surfaces must remain distinct');
 // Visual baseline checks: text/background contrast in both themes (WCAG 4.5:1 normal text).
 const themeAudit=await page.evaluate(()=>{
  const root=document.documentElement,old=root.dataset.leveliTheme;
  const channels=color=>{const m=color.match(/rgba?\(([^)]+)\)/);return m?m[1].split(',').slice(0,3).map(x=>Number(x.trim())/255):null};
  const lum=color=>{const vals=channels(color);if(!vals)return NaN;return vals.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)};
  const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const out=[];
  for(const theme of ['dark','light']){
   root.dataset.leveliTheme=theme;
   const tile=document.querySelector('.b3-tile');
   const text=tile.querySelector('strong'),sub=tile.querySelector('small'),section=document.querySelector('.b3-section-label');
   const bg=getComputedStyle(tile).backgroundColor;
   const pageBg=getComputedStyle(document.body).backgroundColor;
   out.push({theme,headline:contrast(getComputedStyle(text).color,bg),subtitle:contrast(getComputedStyle(sub).color,bg),section:contrast(getComputedStyle(section).color,pageBg)});
  }
  root.dataset.leveliTheme=old;
  return out
 });
 for(const metrics of themeAudit)for(const key of ['headline','subtitle','section']){
  assert.ok(metrics[key]>=4.5,'contrast '+key+' '+metrics.theme+' must be at least 4.5:1; got '+metrics[key]);
 }
 const hits=await page.locator('.b3-home-btn,.b3-change-avatar,.b3-tile,.b3-extra button').evaluateAll(items=>items.filter(el=>el.getClientRects().length>0).map(el=>({name:el.textContent.trim(),w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
 for(const hit of hits)assert.ok(hit.w>=44&&hit.h>=44,'accessible control '+hit.name+' is smaller than 44px');
 for(const width of [320,360,390,430,1280]){
  await page.setViewportSize({width,height:844});
  const state=await page.evaluate(()=>({
   doc:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth,
   size:document.querySelector('.b3-home-btn').getBoundingClientRect().width,
   tileCount:[...document.querySelectorAll('.b3-tile')].filter(el=>el.getBoundingClientRect().width>=140).length
  }));
  assert.ok(state.doc<=state.viewport+1,'B3 must not scroll horizontally at '+width+'px');
  assert.ok(state.size>=44,'back action hit area must be at least 44px');
  assert.equal(await page.locator('.b3-home-btn').innerText(),'Назад');
  assert.equal(await page.locator('.b3-header h1').innerText(),'Настройки');

  await page.locator('[data-b3-panel="accent"]').click();
  const hitAreas=await page.locator('#personal-accent-options button').evaluateAll(items=>items.map(el=>[el.offsetWidth,el.offsetHeight]));
  assert.ok(hitAreas.every(([w,h])=>w>=44&&h>=44),'accent controls have a 44px hit area at '+width);
  await page.locator('#b3-panel-close').click();
  assert.equal(state.tileCount,2,'all visible quick-setting tiles remain readable on '+width+'px screen');
  const cardPadding=await page.locator('.forecast-card').evaluate(el=>getComputedStyle(el).paddingTop);
  assert.equal(cardPadding,width<=360?'12px':'16px','dashboard spacing follows responsive token at '+width+'px');
  const tileLayout=await page.locator('.b3-tile').first().evaluate(el=>{
   const icon=el.querySelector('.b3-tile-icon'),svg=icon?.querySelector('svg'),label=el.querySelector('strong');
   const i=icon?.getBoundingClientRect(),t=label?.getBoundingClientRect(),v=svg?.getBoundingClientRect();
   return {display:getComputedStyle(el).display,iconRight:i?.right,labelLeft:t?.left,svgWidth:v?.width,svgHeight:v?.height};
  });
  assert.equal(tileLayout.display,'grid','quick settings use compact grid layout at '+width+'px');
  assert.ok(tileLayout.iconRight<=tileLayout.labelLeft+1,'settings icon remains left of its label at '+width+'px');
  assert.equal(tileLayout.svgWidth,24,'settings icon artwork width at '+width+'px');
  assert.equal(tileLayout.svgHeight,24,'settings icon artwork height at '+width+'px');
 }
 await page.locator('[data-b3-panel="accent"]').click();
 assert.equal(await page.locator('#b3-panel-overlay').isVisible(),true);
 assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).overflow),'hidden');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#b3-panel-overlay').isVisible(),false);
 assert.equal(await page.locator('[data-b3-panel="accent"]').evaluate(el=>document.activeElement===el),true);
 await page.setViewportSize({width:390,height:844});
 await page.locator('.b3-home-btn').click();
 await page.evaluate(()=>window.__switchUser(null));assert.equal(await page.locator('.outcomes-quarter-row').count(),0,'logout clears quarter result');assert.equal(await page.locator('#school-results').isVisible(),false);assert.equal(await page.locator('#school-subjects').innerText(),'');
 assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('cloud:'))),false);
 await page.evaluate(()=>window.__switchUser('A'));
 await page.evaluate(()=>sessionStorage.setItem('auth-delay','400'));
 await page.reload();
 await page.waitForFunction(()=>window.leveliFirebase);
 assert.equal(await page.locator('#leveli-startup').isVisible(),true,'saved session shows splash while restoring');
 assert.equal(await page.locator('#school-login').isVisible(),false,'login never flashes for returning pupil');
 await page.waitForFunction(()=>document.querySelector('#home-greeting').textContent==='Привет, Полина!');
 assert.equal(await page.locator('#leveli-startup').isVisible(),false);
 assert.equal(await page.locator('#school-results').isVisible(),true);
 await page.evaluate(()=>sessionStorage.removeItem('auth-delay'));
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 assert.equal(await page.locator('html').getAttribute('data-leveli-pack'),null);
 assert.equal(await page.locator('#profile-avatar-display img.profile-avatar-custom').count(),1);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('leveli-personal-v1-A')).pack),undefined);
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  const hit=await guide.boundingBox();
  assert.ok(hit.width>=44&&hit.height>=44);
  await guide.press('Enter');
  assert.ok(await page.locator('#school-guide').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.getByRole('button',{name:'Понятно',exact:true}).click();
  assert.equal(await page.locator('#school-guide').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'outputs/leveli-home.png',fullPage:true});
 // Compare the same synthetic quarter on mobile and desktop.
 const marks=(subject,values,weights=[])=>values.map((value,i)=>({
  id:subject+i,subject,value,weight:weights[i],date:'2026-11-0'+(5+i),quarter:2,type:'Ответ'
 }));
 const official={id:'final',subject:'Физика',value:5,date:'2026-11-07',quarter:2,type:'Четвертная'};
 const physics=marks('Физика',[4,4,4]);
 const empty=page.locator('#school-orient-empty');
 const detail=page.locator('#school-subject-detail');
 const row=name=>page.locator('#school-subjects .subject-row').filter({hasText:name});
 const refresh=grades=>page.evaluate(grades=>{
  window.__fixtures.A.grades=grades;
  document.getElementById('school-refresh').click();
 },grades);
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 await page.locator('[data-b3-panel="quarter"]').click();
 await page.getByRole('button',{name:'2 четверть'}).click();
 await page.locator('#b3-panel-close').click();
 await page.locator('.b3-home-btn').click();
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:844});
  await page.evaluate(()=>localStorage.setItem('leveli-daily-average-A-2026-2',JSON.stringify({'2026-11-06':4.25})));
  await refresh([...physics,official]);
  await empty.filter({hasText:'Четвертные итоги выставлены'}).waitFor();
  assert.equal(await page.locator('#school-trend-change').textContent(),'Ко вчерашнему среднему −0,25');
  assert.equal(await page.locator('.orient-grid').isVisible(),false);
  assert.equal(await page.locator('.forecast-card .card-heading h2 svg,.trend-card .card-heading h2 svg,.orient-heading h2 svg').count(),0);
  assert.equal(await page.locator('#leveli-line-glow feGaussianBlur').getAttribute('stdDeviation'),'3');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await navButton('subjects').click();
  await row('Физика').click();
  assert.equal(await detail.locator('.detail-hero-label').textContent(),'Официальная оценка за четверть');
  assert.equal(await detail.locator('.detail-goal').count(),0);
  assert.equal(await detail.locator('.detail-trend-pill').textContent(),'0,00 · Как посчитано?');
  await detail.locator('.detail-back').click();
  await navButton('home').click();
  await refresh([...physics,official,...marks('Геометрия',[4])]);
  await empty.filter({hasText:'По части предметов уже выставлены итоги'}).waitFor();
  await refresh([
   ...physics,
   ...marks('Геометрия',[5,4,4],[499,501,1]),
   ...marks('Химия',[5,4,4],[1,999,1])
  ]);
  await empty.filter({hasText:'Сейчас нет предметов'}).waitFor();
  await navButton('subjects').click();
  const small=row('Геометрия').locator('.grade-delta');
  assert.equal(await small.textContent(),'−0,50');
  assert.match(await small.getAttribute('class'),/\bflat\b/);
  assert.equal(await row('Химия').locator('.grade-delta').textContent(),'0,00');
  await small.click();
  assert.match(await page.locator('.trend-explain-result').textContent(),/= −0,50$/);
  await page.getByRole('button',{name:'Понятно'}).click();
  await row('Геометрия').click();
  assert.equal(await detail.locator('.detail-trend-pill').textContent(),'−0,50 · Как посчитано?');
  assert.equal(await detail.locator('.detail-goal').isVisible(),true);
  assert.equal(await detail.locator('.detail-goal').evaluate(el=>getComputedStyle(el).backgroundColor),await detail.locator('.detail-goal').evaluate(el=>{
   const probe=document.createElement('span');probe.style.backgroundColor='var(--ds-surface-inner)';
   el.append(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;
  }));
  await detail.locator('.detail-back').click();
  await navButton('home').click();
 }
 const lowSubjects=[
  ...marks('Физика',[4,4,4]),
  ...marks('Биология',[5,5,5]),
  ...marks('Химия',[3,3,3]),
  ...marks('Геометрия',[2,2,2]),
  {...official,subject:'Геометрия',value:2}
 ];
 await refresh(lowSubjects);
 await navButton('subjects').click();
 await row('Биология').waitFor();
 await navButton('home').click();
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  const legends=await page.locator('.forecast-legend').evaluateAll(legends=>legends.map(legend=>[...legend.children].map(item=>({
   label:item.querySelector('.legend-label').textContent,
   height:item.getBoundingClientRect().height
  }))));
  for(const legend of legends){
   assert.equal(legend.length,4);
   assert.ok(legend.every(item=>/^Оценка [2-5]$/.test(item.label)&&item.height>=28&&item.height<=30));
  }
  const score=name=>row(name).locator('.subject-row__grade strong');
  const color=locator=>locator.evaluate(el=>getComputedStyle(el).color);
  assert.equal(await score('Геометрия').getAttribute('class'),'official-box');
  assert.equal(await score('Химия').getAttribute('class'),null);
  assert.equal(await color(score('Геометрия')),'rgb(255, 143, 161)');
  assert.equal(await color(score('Химия')),'rgb(246, 192, 120)');
  assert.notEqual(await color(score('Физика')),await color(score('Химия')));
 }
 await page.getByRole('button',{name:/^Оценка 2\s*1$/}).click();
 assert.equal(await page.locator('[data-page="subjects"]').isVisible(),true);
 assert.equal(await page.locator('.subject-row').count(),1);
 assert.match(await page.locator('.subject-row').textContent(),/Геометрия/);
 await navButton('home').click();
 await page.getByRole('button',{name:/^Оценка 2\s*1$/}).click();
 await navButton('home').click();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 await page.getByRole('button',{name:/^(Выбрать|Изменить) аватар$/}).click();
 const dance=page.getByRole('button',{name:'Полина — Танцы'});
 await dance.press('Enter');
 assert.equal(await dance.getAttribute('aria-pressed'),'true');
 assert.ok(await dance.evaluate(el=>document.activeElement===el));
 assert.match(await page.locator('#profile-avatar-display img').getAttribute('src'),/polina-dance\.webp$/);
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#profile-avatar-display img')?.src.endsWith('polina-dance.webp'));
 await page.evaluate(()=>window.__switchUser('B'));
 await page.waitForFunction(()=>document.querySelector('#profile-avatar-display img')?.src.endsWith('matvey-football.webp'));
 assert.deepEqual(errors,[]);fs.writeFileSync('work/browser-result.json',JSON.stringify({passed:true,checks:['one school home','profile navigation','exact school forecast','official final','decline warning','A/B isolation','offline cached grades','logout clear'],errors},null,2));
 await browser.close();console.log('Browser integration: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
