const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const fixtures={A:{schemaVersion:1,source:'petersburgedu',grades:[5,5,5,4,4,4].map((value,i)=>({id:'a'+i,subject:'Математика',value:String(value),date:`2026-10-${10+i}`,type:'Устный ответ',quarter:1})).concat([{id:'f',subject:'Русский язык',value:'5',date:'2026-10-20',type:'Четвертная',quarter:1},{id:'c',subject:'Русский язык',value:'4',date:'2026-10-15',type:'Итоговая контрольная работа',weight:2,quarter:1},{id:'n',subject:'Русский язык',value:'неизвестная',valueCode:'2',date:'2026-10-14',quarter:1}])},B:{schemaVersion:1,source:'petersburgedu',grades:[{id:'b1',subject:'История',value:'3',date:'31.10.2026',type:'Ответ',quarter:1}]}};
const authMock=`export const getAuth=()=>window.__auth;export const browserLocalPersistence={};export const setPersistence=async()=>{};export function onAuthStateChanged(a,fn){window.__listeners.push(fn);setTimeout(()=>fn(a.currentUser),0);return ()=>{}}export async function signInWithEmailAndPassword(a,email){window.__switchUser(email.startsWith('b')?'B':'A')}export async function signOut(){window.__switchUser(null)}`;
const storeMock=`export const getFirestore=()=>({});export const doc=(db,...parts)=>parts;export const serverTimestamp=()=>0;export const runTransaction=async(db,fn)=>fn({get:async path=>({exists:()=>!!JSON.parse(sessionStorage.getItem('cloud:'+path.join('/'))||'null'),data:()=>JSON.parse(sessionStorage.getItem('cloud:'+path.join('/')))}),set:(path,value)=>sessionStorage.setItem('cloud:'+path.join('/'),JSON.stringify(value))});export async function getDocFromServer(path){if(window.__offline)throw Error('offline');const [kind,uid]=path;if(kind==='profiles')return {exists:()=>true,data:()=>({name:uid==='A'?'Полина':'Матвей'})};if(kind==='schoolGrades')return {exists:()=>true,data:()=>window.__fixtures[uid]};const value=JSON.parse(sessionStorage.getItem('cloud:'+path.join('/'))||'null');return {exists:()=>!!value,data:()=>value};}export const getDoc=getDocFromServer;`;
fs.mkdirSync('outputs',{recursive:true});fs.mkdirSync('work',{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_BINARY?{executablePath:process.env.BROWSER_BINARY}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
 await context.addInitScript(({fixtures})=>{window.__fixtures=fixtures;window.__auth={currentUser:JSON.parse(sessionStorage.getItem('test-user')||'null')};window.__listeners=[];window.__switchUser=uid=>{window.__auth.currentUser=uid?{uid,email:uid==='A'?'a@example.test':'b@example.test'}:null;sessionStorage.setItem('test-user',JSON.stringify(window.__auth.currentUser));for(const fn of window.__listeners)fn(window.__auth.currentUser)}},{fixtures});
 await context.route('https://www.gstatic.com/firebasejs/**',route=>{const url=route.request().url();route.fulfill({contentType:'text/javascript',body:url.endsWith('firebase-app.js')?'export const initializeApp=(c,n)=>({name:n})':url.endsWith('firebase-auth.js')?authMock:storeMock})});
 await context.route('https://fonts.googleapis.com/**',route=>route.abort());await context.route('https://fonts.gstatic.com/**',route=>route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:8765')+'/leveli/');await page.waitForFunction(()=>window.leveliFirebase);
 assert.equal(await page.locator('[data-tab]').count(),0);
 assert.equal(await page.locator('[data-page="home"]').isVisible(),true);
 assert.equal(await page.locator('.school-header .brand-lockup img').getAttribute('src'),'./brand/mark.svg');
 assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'./manifest.webmanifest');
 assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),'./brand/apple-touch-icon.png');
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('[data-page="profile"]').isVisible(),true);
 await page.locator('.b3-home-btn').click();
 assert.equal(await page.locator('[data-page="home"]').isVisible(),true);
 await page.evaluate(()=>window.__switchUser('A'));await page.waitForFunction(()=>document.querySelector('#school-period').options.length>=4);
 assert.equal(await page.locator('#home-greeting').innerText(),'Привет, Полина!');
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('.b3-hero').isVisible(),true);
 assert.equal(await page.locator('.b3-tiles .b3-tile').count(),4);
 assert.ok((await page.locator('.b3-avatar-stand').evaluate(el=>el.getBoundingClientRect().top < el.closest('.b3-hero').getBoundingClientRect().top)),'avatar rises above card');
 await page.locator('[data-b3-panel="accent"]').click();
 await page.getByRole('button',{name:'Розовый',exact:true}).click();
 await page.locator('#b3-panel-close').click();
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),'#f18bc9');
 await page.locator('[data-b3-panel="theme"]').click();
 await page.getByRole('button',{name:'Светлая'}).click();
 await page.locator('#b3-panel-close').click();
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'light');
 await page.locator('[data-b3-panel="avatar"]').first().click();
 await page.getByRole('button',{name:'Наушники с ушками',exact:true}).click();
 assert.equal(await page.locator('#profile-avatar-display').getAttribute('data-avatar-index'),'0');
 assert.equal(await page.locator('#profile-avatar-display .avatar-illustration').count(),1);
 assert.equal(await page.locator('#personal-avatar-options .personal-avatar-option').count(),10);
 assert.equal(await page.locator('#personal-avatar-options .avatar-gallery-label').count(),2);
 const avatarAtlas=await page.request.get((process.env.TEST_BASE_URL||'http://127.0.0.1:8765')+'/leveli/avatars/portraits-atlas.webp');
 assert.equal(avatarAtlas.status(),200);
 assert.match(avatarAtlas.headers()['content-type']||'',/image\/webp/);
 assert.equal(await page.locator('#personal-avatar-options [data-avatar-index="0"] .avatar-illustration').count(),1);
 // Until new binary cutout assets are published, the old atlas must remain a complete fallback.
 await page.waitForTimeout(300);
 assert.equal(await page.locator('#profile-avatar-display .avatar-illustration').count(),1);
 const cutoutAvailable=await page.request.get((process.env.TEST_BASE_URL||'http://127.0.0.1:8765')+'/leveli/avatars/cutouts/avatar-01.webp');
 if(cutoutAvailable.ok())assert.equal(await page.locator('#profile-avatar-display .cutout-ready').count(),1);
 else assert.equal(await page.locator('#profile-avatar-display .cutout-ready').count(),0);
 await page.locator('#b3-panel-close').click();
 await page.locator('[data-b3-panel="icons"]').click();
 await page.getByRole('button',{name:/Вариант 2/}).last().click();
 assert.equal(await page.locator('.settings-button img.leveli-pack-settings').getAttribute('src'),'./icons/cats/settings.svg');
 assert.equal(await page.locator('.forecast-card img.leveli-pack-heading').getAttribute('src'),'./icons/cats/chart.svg');
 await page.locator('#b3-panel-close').click();
 await page.locator('[data-b3-panel="birthday"]').click();
 await page.locator('#profile-birthday').fill('2017-09-08');
 assert.match(await page.locator('#profile-age').innerText(),/Возраст: \d+/);
 const avatarFile={name:'my-avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRLkAAAAASUVORK5CYII=','base64')};
 await page.locator('#b3-panel-close').click();
 await page.locator('[data-b3-panel="avatar"]').first().click();
 await page.locator('#profile-avatar-file').setInputFiles(avatarFile);
 await page.locator('#profile-avatar-display img.profile-avatar-custom').waitFor({state:'visible'});
 assert.match(await page.locator('#profile-avatar-display img').getAttribute('src'),/^data:image\/webp;base64,/);

 assert.equal(await page.locator('html').getAttribute('data-leveli-pack'),'cats');
 await page.locator('#b3-panel-close').click();
 await page.locator('.b3-home-btn').click();
 assert.equal(await page.locator('#school-subjects').count(),1);

 assert.equal(await page.locator('#school-period').inputValue(),'2026-2');
 assert.equal(await page.locator('#school-subjects .subject-row').count(),0);
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
 await page.locator('[data-b3-panel="accent"]').click();
 // All five personalized accent palettes must reach the chart SVG and selected controls.
 const accents=[
  ['Фиолетовый','#a882ff','#55416e','#ab7aff'],
  ['Розовый','#f18bc9','#70435e','#f18bc9'],
  ['Синий','#68adff','#3b5375','#68adff'],
  ['Жёлтый','#f4c75f','#69582f','#f4c75f'],
  ['Мятный','#69d9bd','#365f55','#69d9bd']
 ];
 for(const [label,accent,track,glow] of accents){
  await page.getByRole('button',{name:label,exact:true}).click();
  // Wait for the agreed 160ms color transition before inspecting computed borders.
  await page.waitForTimeout(220);
  const state=await page.evaluate(()=>({
   accent:document.documentElement.style.getPropertyValue('--leveli-accent'),
   track:document.querySelector('#school-donut circle[data-accent-track="true"]')?.getAttribute('stroke'),
   line:document.querySelector('#school-trend polyline[filter="url(#leveli-line-glow)"]')?.getAttribute('stroke'),
   grade:document.querySelector('#school-donut circle[stroke="#6ee6ae"]')?.getAttribute('stroke'),
   pressed:getComputedStyle(document.querySelector('#school-period-buttons button[aria-pressed="true"]')).borderTopColor,
   borderToken:getComputedStyle(document.documentElement).getPropertyValue('--leveli-accent-border').trim()
  }));
  assert.equal(state.accent,accent);
  assert.equal(state.track,track);
  assert.equal(state.line,glow);
  assert.equal(state.grade,'#6ee6ae','semantic fifth-grade segment must not change');
  assert.equal(state.pressed,'rgb('+[parseInt(state.borderToken.slice(1,3),16),parseInt(state.borderToken.slice(3,5),16),parseInt(state.borderToken.slice(5,7),16)].join(', ')+')');
 }
 await page.getByRole('button',{name:'Розовый',exact:true}).click();
 await page.locator('#b3-panel-close').click();
 await page.locator('.b3-home-btn').click();
 await page.waitForFunction(()=>document.querySelector('#school-subjects').textContent.includes('Математика'));
 assert.equal(await page.locator('#school-overall').innerText(),'4,25');
 const mathRow=page.locator('#school-subjects .subject-row').filter({hasText:'Математика'});
 assert.match(await mathRow.innerText(),/Математика[\s\S]*6 оценок[\s\S]*4,50[\s\S]*4[\s\S]*прогноз/);
 assert.equal(await mathRow.locator('.subject-row__grade strong').innerText(),'4');
 assert.match(await mathRow.locator('.subject-row__dynamics').innerText(),/−?0,50|-0,50/);
 const russianRow=page.locator('#school-subjects .subject-row').filter({hasText:'Русский язык'});
 assert.match(await russianRow.innerText(),/Русский язык[\s\S]*1 оценка[\s\S]*4,00[\s\S]*5[\s\S]*итог/);
 assert.equal(await russianRow.locator('.official-box').innerText(),'5');
 assert.equal(await page.locator('.double-donut .donut-panel').count(),2);
 assert.equal(await page.locator('.donut-unit').first().innerText(),'Количество предметов');
 assert.equal(await page.locator('.donut-unit').last().innerText(),'Количество оценок');
 assert.equal(await page.locator('#school-donut circle[role="button"]').count(),2);
 await page.locator('#school-forecast-legend .legend-item').filter({hasText:'Оценка 5'}).click();
 assert.equal(await page.locator('#school-donut circle[data-accent-selection="true"]').count(),1);
 assert.equal(await page.locator('#school-donut circle[data-accent-selection="true"]').getAttribute('stroke'),'#f18bc9');
 assert.equal(await page.locator('#school-subjects .subject-row').count(),1);
 assert.match(await page.locator('#school-subjects').innerText(),/Русский язык/);
 await page.locator('#school-forecast-legend .legend-item').filter({hasText:'Оценка 5'}).click();
 await page.locator('#school-subjects .subject-row').filter({hasText:'Математика'}).click();
 assert.equal(await page.locator('#school-subject-detail .detail-hero-score').innerText(),'4');
 assert.equal(await page.locator('#school-subject-detail .detail-trend-pill').innerText(),'↘ Последние оценки стали ниже');
 assert.equal(await page.locator('#school-subject-detail .detail-kpi').innerText(), 'Средний балл\n4,50\nПолучено оценок\n6');
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
 await page.getByRole('button',{name:'Средний балл',exact:true}).click();
 assert.equal(await page.locator('#school-subject-detail .detail-chart-scroll polyline[filter="url(#leveli-subject-line-glow)"]').count(),1);
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
 await page.getByRole('button',{name:'← К предметам'}).click();
 assert.equal(await page.locator('.school-header').isVisible(),true);
 await page.locator('#school-subjects .subject-row').filter({hasText:'Русский язык'}).click();
 assert.equal(await page.locator('#school-subject-detail .grade-entry__weight').count(),1);
 assert.equal(await page.locator('#school-subject-detail .grade-entry__weight').innerText(),'Вес ×2');
 await page.getByRole('button',{name:'← К предметам'}).click();
 await page.screenshot({path:'outputs/leveli-school.png',fullPage:true});
 await page.evaluate(()=>window.__switchUser('B'));await page.waitForFunction(()=>document.querySelector('#school-period').options.length>=4);
 assert.equal(await page.locator('#home-greeting').innerText(),'Привет, Матвей!');
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'dark');
 assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),'#a882ff');
 assert.equal(await page.locator('#home-birthday-greeting').isVisible(),false);
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('#profile-avatar-display img').count(),0);
 await page.locator('.b3-home-btn').click();

 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 await page.locator('[data-b3-panel="accent"]').click();
 await page.getByRole('button',{name:'Синий'}).click();
 await page.locator('#b3-panel-close').click();
 await page.locator('[data-b3-panel="avatar"]').first().click();
 await page.getByRole('button',{name:'Наушники',exact:true}).click();
 assert.equal(await page.locator('#profile-avatar-display').getAttribute('data-avatar-index'),'5');
 assert.equal(await page.locator('#profile-avatar-display .avatar-illustration').count(),1);
 assert.equal(await page.locator('#personal-avatar-options [data-avatar-index="5"][aria-pressed="true"]').count(),1);
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
 assert.match(await page.locator('#school-subjects').innerText(),/История[\s\S]*3,00/);
 await page.evaluate(()=>window.__switchUser('A'));
 assert.equal(await page.locator('html').getAttribute('data-leveli-theme'),'light');
 assert.equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--leveli-accent')),'#f18bc9');
 await page.getByRole('button',{name:'Профиль и настройки'}).click();
 assert.equal(await page.locator('#profile-avatar-display img.profile-avatar-custom').count(),1);
 assert.equal(await page.locator('#profile-birthday').inputValue(),'2017-09-08');
 // DS v2: the four B3 tile icons are real consistent 24px line SVGs (not font glyphs).
 assert.equal(await page.locator('.b3-tiles .b3-tile-icon svg').count(),4);
 const iconStyle=await page.locator('.b3-tile-icon svg').first().evaluate(el=>({
  width:getComputedStyle(el).width,height:getComputedStyle(el).height,stroke:getComputedStyle(el).strokeWidth
 }));
 assert.equal(iconStyle.width,'24px');assert.equal(iconStyle.height,'24px');assert.equal(iconStyle.stroke,'2px');
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  const state=await page.evaluate(()=>({
   doc:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth,
   size:document.querySelector('.b3-home-btn').getBoundingClientRect().width,
   tileCount:[...document.querySelectorAll('.b3-tile')].filter(el=>el.getBoundingClientRect().width>=140).length
  }));
  assert.ok(state.doc<=state.viewport+1,'B3 must not scroll horizontally at '+width+'px');
  assert.ok(state.size>=44,'back action hit area must be at least 44px');
  assert.equal(state.tileCount,4,'all quick-setting tiles remain readable on '+width+'px screen');
 }
 await page.locator('[data-b3-panel="theme"]').click();
 assert.equal(await page.locator('#b3-panel-overlay').isVisible(),true);
 assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).overflow),'hidden');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#b3-panel-overlay').isVisible(),false);
 assert.equal(await page.locator('[data-b3-panel="theme"]').evaluate(el=>document.activeElement===el),true);
 await page.setViewportSize({width:390,height:844});
 await page.locator('.b3-home-btn').click();
 await page.evaluate(()=>window.__switchUser(null));assert.equal(await page.locator('#school-results').isVisible(),false);assert.equal(await page.locator('#school-subjects').innerText(),'');
 await page.screenshot({path:'outputs/leveli-home.png',fullPage:true});
 assert.deepEqual(errors,[]);fs.writeFileSync('work/browser-result.json',JSON.stringify({passed:true,checks:['one school home','profile navigation','exact school forecast','official final','decline warning','A/B isolation','offline cached grades','logout clear'],errors},null,2));
 await browser.close();console.log('Browser integration: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
