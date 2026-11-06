const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
function boot(options={}){
 const map=options.map||new Map();let failProfileWrite=false;
 const storage={getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{if(failProfileWrite&&k==='wordscene-17-lab-v1')throw Error('Quota exceeded');map.set(k,v)},removeItem:k=>map.delete(k)};
 const root={
  html:'',listeners:{},set innerHTML(s){this.html=s;this.listeners={}},get innerHTML(){return this.html},
  querySelectorAll(q){
   if(q!=='[data-action]')return [];
   const hits=[...this.html.matchAll(/data-action="([^"]+)"/g)];
   return hits.map(hit=>{const el={dataset:{action:hit[1]},addEventListener:(event,cb)=>{el.click=cb}};this.listeners[hit[1]]=el;return el});
  },pauseTime:{},querySelector(q){return q==='#pause-time'&&this.html.includes('id="pause-time"')?this.pauseTime:null}
 };
 let now=options.now??Date.now(),tick;
 class TestDate extends Date{static now(){return now}}
 const window={WordSceneTopics:options.topics||{topics:[],forWord:()=>[]},WordSceneContent:{cards:[],render:()=>'<svg></svg>'},confirm:()=>true};
 const doc={getElementById:id=>id==='childName'||id==='childAge'?{value:options.inputs?.[id]??''}:root,createElement:()=>({setAttribute(){},hidden:true}),body:{append(){}}};
 const context={window,document:doc,localStorage:storage,navigator:{},setInterval:cb=>{tick=cb},setTimeout:()=>0,clearTimeout:()=>{},Date:TestDate,Math,console};
 vm.createContext(context);
 const mod={exports:{}};vm.runInNewContext(file('engine.js'),Object.assign(context,{module:mod,exports:mod.exports}));window.WS17Engine=mod.exports;
 vm.runInContext(file('seed.js'),context);vm.runInContext(file('legacy-art.js'),Object.assign(context,{WordSceneContent:window.WordSceneContent}));
 delete context.module;delete context.exports;vm.runInContext(file('accounts.js'),context);window.WS17Accounts=context.WS17Accounts;vm.runInContext(file('app.js'),context);
 function click(action){const el=root.listeners[action];assert.ok(el,'Missing action '+action+'; available '+Object.keys(root.listeners).join(','));el.click()}
 return {click,root,map,window,now:()=>now,advanceTime:ms=>{now+=ms;tick()},setFailProfileWrite:v=>{failProfileWrite=v}};
}
test('automatic 10 word selection -> memorization -> 3 two-way passes -> atomic result',()=>{
 const b=boot();b.click('sources');b.click('auto');
 for(let i=0;i<10;i++){b.click('reveal');b.click('unknown')}
 for(let i=0;i<10;i++)b.click('learnNext');
 for(let i=0;i<60;i++)b.click('yes');
 const data=JSON.parse(b.map.get('wordscene-17-lab-v1'));
 assert.equal(data.sessions.length,1);assert.equal(Object.keys(data.words).length,10);
 assert.match(b.root.html,/Занятие завершено/);
});
test('approved memorization UI keeps illustration visible, progress and unchanged recall help',()=>{
 const b=boot();b.click('sources');b.click('manual');
 b.click('pick:apple');b.click('pick:cake');b.click('pick:cheese');b.click('startManual');
 assert.match(b.root.html,/class="ws-learn ws-learn-v2"/);
 assert.match(b.root.html,/Прогресс запоминания/);
 assert.match(b.root.html,/aria-valuenow="1"/);
 assert.match(b.root.html,/class="art"/);
 assert.match(b.root.html,/class="scene"/);
 assert.match(b.root.html,/data-action="say:apple"/);
 assert.doesNotMatch(b.root.html,/data-action="toggleArt"|Представить без картинки|Показать ассоциацию/);
 b.click('pause');assert.match(b.root.html,/data-action="continue"/);
 b.click('continue');assert.match(b.root.html,/class="art"/);
 b.click('learnNext');assert.match(b.root.html,/aria-valuenow="2"/);
 b.click('learnNext');assert.match(b.root.html,/aria-valuenow="3"/);
 assert.match(b.root.html,/Начать проверку/);
 b.click('learnNext');
 assert.match(b.root.html,/data-action="check"/);
 b.click('check');
 assert.match(b.root.html,/data-action="help"/);
});

test('confirmed cancellation keeps persistent profile clean',()=>{
 const b=boot();b.click('sources');b.click('auto');
 for(let i=0;i<10;i++){b.click('reveal');b.click('unknown')}
 b.click('cancel');
 const saved=JSON.parse(b.map.get('wordscene-17-lab-v1'));
 assert.deepEqual(Object.keys(saved.words),[]);assert.equal(saved.sessions.length,0);
 assert.equal(b.map.get('wordscene-17-lab-active-v1'),undefined);
});

test('failed final profile write does not falsely display completion',()=>{
 const b=boot();b.click('sources');b.click('auto');
 for(let i=0;i<10;i++){b.click('reveal');b.click('unknown')}
 for(let i=0;i<10;i++)b.click('learnNext');
 for(let i=0;i<59;i++)b.click('yes');
 b.setFailProfileWrite(true);b.click('yes');
 const data=JSON.parse(b.map.get('wordscene-17-lab-v1'));
 assert.equal(data.sessions.length,0);
 assert.doesNotMatch(b.root.html,/Занятие завершено/);
 assert.match(b.root.html,/сохранение заблокировано/i);
});

test('pause displays a countdown without extending the saved deadline',()=>{
 const b=boot();b.click('sources');b.click('auto');
 for(let i=0;i<10;i++){b.click('reveal');b.click('unknown')}
 b.click('pause');
 assert.match(b.root.html,/Осталось 30:00/);
 const active='wordscene-17-lab-active-v1';
 const checkpoint=b.map.get(active);
 b.advanceTime(29999);
 assert.equal(b.root.pauseTime.textContent,'Осталось 29:31');
 assert.equal(b.map.get(active),checkpoint);
 b.advanceTime(30*60000-29999);
 assert.equal(b.map.has(active),false);
 assert.doesNotMatch(b.root.html,/Незавершённое занятие/);
});

test('Paper shows real totals with new words first and the reason inside the locked button',()=>{
 const b=boot();
 assert.match(b.root.html,/Учить новые слова[\s\S]*Выбери способ подбора[\s\S]*Отлично! Всё повторено/);
 assert.match(b.root.html,/class="paper-rings"/);
 assert.doesNotMatch(b.root.html,/Добавить 10|Тренировка написания/);
});

test('reload restores the same card before the deadline without moving it',()=>{
 const b=boot();
 b.click('sources');b.click('auto');
 for(let i=0;i<10;i++){b.click('reveal');b.click('unknown')}
 b.click('learnNext');b.click('pause');
 const key='wordscene-17-lab-active-v1', saved=b.map.get(key);
 const restored=boot({map:b.map,now:b.now()+29*60000});
 assert.match(restored.root.html,/Запоминание · 2 \/ 10/);
 assert.equal(b.map.get(key),saved);
 const expired=boot({map:b.map,now:b.now()+30*60000});
 assert.match(expired.root.html,/Учить новые слова/);
 assert.equal(b.map.has(key),false);
});

test('mandatory review unlocks voluntary practice for final errors without changing saved progress',()=>{
 const initial=boot(),E=initial.window.WS17Engine,id=initial.window.WS17_SEED[0].en;
 const profile=E.empty(),key='wordscene-17-lab-v1';
 profile.words[id]={origin:'learned',schedule:E.newSchedule(initial.now()-2*86400000),history:[]};
 initial.map.set(key,JSON.stringify(profile));
 const b=boot({map:initial.map,now:initial.now()});
 assert.match(b.root.html,/Сначала повтори слова/);
 assert.doesNotMatch(b.root.html,/Выбери способ подбора/);
 b.click('review');
 for(let i=0;i<4;i++){b.click('no');b.click('advance');b.click('yes')}
 const saved=b.map.get(key);
 b.click('home');
 assert.match(b.root.html,/Повторить ещё раз[\s\S]*Если хочешь, потренируй ещё 1 трудное слово/);
 b.click('practice');
 for(let i=0;i<4;i++){b.click('no');b.click('advance');b.click('yes')}
 b.click('yes');b.click('yes');
 assert.equal(b.map.get(key),saved);
 assert.equal(b.map.has('wordscene-17-lab-active-v1'),false);
 b.click('home');
 assert.match(b.root.html,/Отлично! Всё повторено/);
 assert.doesNotMatch(b.root.html,/Повторить ещё раз/);
});

test('My Progress retains aggregates and periods without detailed lesson history',()=>{
 const fresh=boot(),E=fresh.window.WS17Engine,p=E.empty();
 const base=Date.now()-11*86400000;
 for(let i=0;i<12;i++){
  p.sessions.push({id:'demo-'+i,mode:'new',ids:['word'+i],at:base+i*86400000,successful:1,extraWords:0,hard:0});
  p.words['word'+i]={origin:'learned',firstLearnedAt:base+i*86400000,schedule:E.newSchedule(base+i*86400000),history:[]};
 }
 fresh.map.set('wordscene-17-lab-v1',JSON.stringify(p));
 const b=boot({map:fresh.map});
 b.click('progress');
 assert.match(b.root.html,/Знакомых слов/);
 assert.match(b.root.html,/Сколько слов я выучил/);
 assert.match(b.root.html,/Как хорошо я помню слова/);
 assert.match(b.root.html,/Пока нет проверок за этот период/);
 assert.doesNotMatch(b.root.html,/Мои занятия|progress-session|Показать ещё/);
 b.click('progressRange:all');
 b.click('qualityRange:all');
 assert.match(b.root.html,/class="progress-line"/);
});

test('profile controls are absent without altering stored data',()=>{
 const b=boot();
 assert.doesNotMatch(b.root.html,/data-action="childProfile"/);
 assert.equal(b.map.has('wordscene-17-lab-v1'),false);
 b.click('progress');
 assert.match(b.root.html,/Мой словарь/);
});
test('legacy selected child data is reused without creating an empty local save',()=>{
 const m=new Map(),E=boot().window.WS17Engine,p=E.empty();
 p.words.apple={origin:'known',schedule:E.newSchedule(Date.now()),history:[]};
 m.set('wordscene-17-lab-current-account-v1','child-2');
 m.set('wordscene-17-lab-v1-account-child-2',JSON.stringify(p));
 const b=boot({map:m});
 b.click('progress');
 assert.match(b.root.html,/1 из/);
 assert.equal(m.has('wordscene-17-lab-v1'),false);
 assert.doesNotMatch(b.root.html,/Ребёнок 1|Ребёнок 2|Переключить профиль/);
});

test('Paper home has no profile gear and retains navigation',()=>{
 const b=boot();
 assert.doesNotMatch(b.root.html,/data-action="childProfile"|class="paper-info"/);
 assert.match(b.root.html,/Твой уровень/);
 assert.match(b.root.html,/data-action="progress"/);
 assert.match(b.root.html,/data-action="dictionary"/);
});
test('Paper picker v2 keeps aligned counters, approved button order and two-way card reveal',()=>{
 const b=boot();b.click('sources');b.click('auto');
 assert.match(b.root.html,/class="ws-picker ws-picker-v2"/);
 assert.match(b.root.html,/Знаю<strong>0<\/strong>/);
 assert.match(b.root.html,/Изучить<strong>0<\/strong>/);
 assert.match(b.root.html,/0\/50/);
 assert.ok(b.root.html.indexOf('data-action="known"')<b.root.html.indexOf('data-action="unknown"'));
 assert.doesNotMatch(b.root.html,/Завершить подбор|ws-picker-exit/);
 assert.match(b.root.html,/Нажми на карточку, чтобы увидеть перевод/);
 b.click('reveal');
 assert.match(b.root.html,/aria-pressed="true"/);
 assert.match(b.root.html,/ws-picker-translation/);
 b.click('reveal');
 assert.match(b.root.html,/aria-pressed="false"/);
 assert.doesNotMatch(b.root.html,/ws-picker-translation/);
 b.click('known');
 assert.match(b.root.html,/Знаю<strong>1<\/strong>/);
 assert.match(b.root.html,/1\/50/);
 b.click('unknown');
 assert.match(b.root.html,/Изучить<strong>1<\/strong>/);
 assert.match(b.root.html,/2\/50/);
 b.click('stopSelection');
 assert.match(b.root.html,/Учить новые слова/);
 assert.equal(b.map.has('wordscene-17-lab-active-v1'),false);
 const saved=JSON.parse(b.map.get('wordscene-17-lab-v1'));
 assert.equal(Object.values(saved.words).filter(w=>w.origin==='known').length,1);
 assert.equal(Object.values(saved.words).filter(w=>w.origin==='learned').length,0);
});

test('Paper picker v2 uses mobile 44px touch targets, 63px choices and scoped styles',()=>{
 const css=file('style.css');
 assert.match(css,/\.ws-picker-v2 \.ws-picker-back\{width:44px;height:44px/);
 assert.match(css,/\.ws-picker-v2 \.ws-picker-speak\{min-width:48px;min-height:48px/);
 assert.match(css,/\.ws-picker-v2 \.ws-picker-choices button\{min-height:63px/);
 assert.match(css,/@media\(max-height:700px\)/);
 assert.match(css,/\.ws-picker-v2 \.ws-picker-card\{min-height:0;flex:1/);
});
test('manual selection keeps cross-topic picks and search is independent of topic',()=>{
 const topics={topics:[{id:'food',name:'Еда и напитки'},{id:'animals',name:'Животные'}],forWord:id=>id==='apple'?['food']:['animals']};
 const b=boot({topics});
 b.click('sources');b.click('manual');
 assert.match(b.root.html,/Выбор слов/);
 assert.match(b.root.html,/Начать изучение \(0 слов\)/);
 assert.match(b.root.html,/data-action="manualTab:search"/);
 b.click('pick:apple');
 assert.match(b.root.html,/Выбрано слов:[\s\S]*1 \/ 15/);
 b.click('manualTab:search');
 assert.match(b.root.html,/Поиск по всему словарю/);
 assert.match(b.root.html,/Выбрано слов:[\s\S]*1 \/ 15/);
 b.click('manualTab:topics');
 b.click('manualTopic:animals');
 assert.match(b.root.html,/Животные/);
 assert.match(b.root.html,/Выбрано слов:[\s\S]*1 \/ 15/);
 b.click('pick:cat');b.click('pick:dog');
 assert.match(b.root.html,/Выбрано слов:[\s\S]*3 \/ 15/);
 assert.match(b.root.html,/data-action="startManual"[^>]*>/);
 b.click('manualTopic:food');
 assert.match(b.root.html,/aria-pressed="true"/);
 b.click('startManual');
 assert.match(b.root.html,/Запоминание/);
});

test('manual UI Kit v2 keeps the approved hierarchy, scoped controls and progress meter',()=>{
 const topics={topics:[{id:'food',name:'Еда и напитки'},{id:'animals',name:'Животные'}],forWord:id=>id==='apple'?['food']:['animals']};
 const b=boot({topics});b.click('sources');b.click('manual');
 assert.match(b.root.html,/class="ws-manual ws-manual-v2"/);
 assert.match(b.root.html,/Ручной подбор/);
 assert.match(b.root.html,/По темам/);
 assert.match(b.root.html,/Поиск/);
 assert.match(b.root.html,/aria-label="Выбрано слов"/);
 assert.match(b.root.html,/aria-valuenow="0"/);
 assert.match(b.root.html,/Нажми на слово, чтобы выбрать/);
 assert.match(b.root.html,/Начать изучение \(0 слов\)/);
 b.click('pick:apple');
 assert.match(b.root.html,/aria-valuenow="1"/);
 assert.match(b.root.html,/Выбрано слов:[\s\S]*1 \/ 15/);
 b.click('manualSummary');
 assert.match(b.root.html,/data-action="removeManual:apple"/);
 b.click('manualTab:search');
 assert.match(b.root.html,/aria-valuenow="1"/);
 b.click('manualTab:topics');
 assert.match(b.root.html,/data-action="removeManual:apple"/);
 const css=file('style.css');
 assert.match(css,/\.ws-manual-v2 \.ws-manual-topic\{/);
 assert.match(css,/\.ws-manual-v2 \.ws-manual-audio\{min-width:44px;min-height:44px/);
 assert.match(css,/\.ws-manual-v2 \.ws-manual-start\{min-height:63px/);
});

test('mobile Paper selection layout keeps visible scrolling cues and shared controls',()=>{
 const css=file('style.css');
 assert.match(css,/\.ws-manual-scroll-note/);
 assert.match(css,/\.ws-manual-word-scroll\{[^}]*overflow-y:auto/);
 assert.match(css,/@media\(max-height:650px\)/);
 assert.match(css,/\.ws-manual-topics\{display:flex/);
 assert.match(css,/\.ws-picker-hint\{color:#304f71\}/);
 assert.match(css,/\.ws-picker-exit\{color:#3c5574\}/);
 const b=boot();b.click('sources');b.click('manual');
 assert.match(b.root.html,/Прокрути список/);
 assert.match(b.root.html,/role="region" aria-label="Список слов"/);
});

test('selection summary removes cross-topic words and updates total and lesson button',()=>{
 const topics={topics:[{id:'food',name:'Еда и напитки'},{id:'animals',name:'Животные'}],forWord:id=>id==='apple'?['food']:['animals']};
 const b=boot({topics});b.click('sources');b.click('manual');
 b.click('pick:apple');b.click('manualTopic:animals');b.click('pick:cat');b.click('pick:dog');
 assert.match(b.root.html,/Выбрано слов:[\s\S]*3 \/ 15/);
 assert.match(b.root.html,/Начать изучение \(3 слова\)/);
 b.click('manualSummary');
 assert.match(b.root.html,/aria-label="Выбранные слова"/);
 assert.match(b.root.html,/data-action="removeManual:apple"/);
 assert.match(b.root.html,/data-action="removeManual:cat"/);
 b.click('removeManual:apple');
 assert.match(b.root.html,/Выбрано слов:[\s\S]*2 \/ 15/);
 assert.match(b.root.html,/Начать изучение \(2 слова\)/);
 assert.doesNotMatch(b.root.html,/data-action="removeManual:apple"/);
 assert.match(b.root.html,/data-action="removeManual:dog"/);
});
test('scroll hints are initially hidden until actual overflow is measured',()=>{
 const b=boot();b.click('sources');b.click('manual');
 assert.match(b.root.html,/class="ws-manual-scroll-note" aria-hidden="true" hidden/);
 assert.match(b.root.html,/class="ws-manual-topics-note" aria-hidden="true" hidden/);
});


test('Paper weekly goal counts only completed new-word lessons for Monday-Sunday and does not cap the display',()=>{
 const at=new Date(2026,10,6,12).getTime(),earlier=new Date(2026,9,30,12).getTime(),monday=new Date(2026,10,2,12).getTime();
 const p=boot({now:at}).window.WS17Engine.empty();
 function session(i,date,ids){
  p.sessions.push({id:'weekly-test-'+i,mode:'new',at:date,ids,successful:ids.length});
  for(const id of ids)p.words[id]={origin:'learned',schedule:{...boot({now:at}).window.WS17Engine.newSchedule(date),nextDay:'2099-01-01'},history:[]};
 }
 session(1,monday,Array.from({length:20},(_,i)=>'mon-'+i));
 session(2,at,Array.from({length:13},(_,i)=>'fri-'+i));
 session(3,earlier,['previous-week']);
 const known='known-earlier';p.words[known]={origin:'known',schedule:boot({now:at}).window.WS17Engine.newSchedule(at),history:[]};
 const map=new Map([['wordscene-17-lab-v1',JSON.stringify(p)]]);
 const b=boot({map,now:at});
 assert.match(b.root.html,/За неделю:<\/dt><dd>33 из 30/);
 assert.match(b.root.html,/class="ring-fill weekly"/);
 assert.match(b.root.html,/--ring-value:100/);
 const nextWeek=boot({map,now:new Date(2026,10,9,12).getTime()});
 assert.match(nextWeek.root.html,/За неделю:<\/dt><dd>0 из 30/);
 assert.equal(nextWeek.map.get('wordscene-17-lab-v1'),map.get('wordscene-17-lab-v1'));
});

test('Paper uses an informational success card, simplified level, and no plus for enabled learning',()=>{
 const b=boot();
 assert.match(b.root.html,/class="paper-done" role="status"/);
 assert.doesNotMatch(b.root.html,/data-action="review"/);
 assert.match(b.root.html,/class="paper-level-help"/);
 assert.match(b.root.html,/Как перейти на уровень «Опытный»/);
 assert.doesNotMatch(b.root.html,/paper-icon-plus/);
 assert.match(b.root.html,/class="paper-action paper-sources"/);
 const css=file('style.css');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.paper-done-mark/);
 assert.match(css,/\.paper-rings \.ring-fill/);
});

test('mandatory due review keeps new-word button locked and never shows the all-done card',()=>{
 const at=new Date(2026,10,6,12).getTime(),E=boot({now:at}).window.WS17Engine,p=E.empty();
 p.words.apple={origin:'learned',schedule:E.newSchedule(at-2*86400000),history:[]};
 const b=boot({now:at,map:new Map([['wordscene-17-lab-v1',JSON.stringify(p)]])});
 assert.match(b.root.html,/paper-action paper-sources" disabled/);
 assert.match(b.root.html,/paper-icon-lock/);
 assert.match(b.root.html,/Повторить сегодня: 1 слово/);
 assert.doesNotMatch(b.root.html,/class="paper-done"/);
});


test('Paper level card displays confirmed sessions, recall success and only reveals rules on demand',()=>{
 const b=boot();
 assert.ok(b.root.html.includes('Твой уровень'));
 assert.ok(b.root.html.includes('Новичок'));
 assert.ok(b.root.html.includes('<strong>0</strong><span>из 3</span>'));
 assert.ok(b.root.html.includes('<strong>—</strong><span>цель 80%</span>'));
 assert.ok(b.root.html.includes('Следующий уровень — <strong>Опытный</strong>'));
 assert.ok(b.root.html.includes('<details class="paper-level-help"><summary>Подробнее'));
 assert.ok(!b.root.html.includes('class="paper-target"'));
 const css=file('style.css');
 assert.ok(css.includes('.paper-level-stats{display:grid;grid-template-columns:1fr 1fr'));
 assert.ok(css.includes('.paper-actions{--ws-home-action-height:78px;grid-auto-rows:minmax(var(--ws-home-action-height),1fr)}'));
});
test('Paper level metrics use only confirmed relevant lessons, not all reviews',()=>{
 const seed=boot(),E=seed.window.WS17Engine,p=E.empty(),at=new Date(2026,10,6,12).getTime();
 for(let k=0;k<2;k++){
  const lessonAt=at-(k+5)*86400000,reviewAt=at-(k+3)*86400000;
  const ids=Array.from({length:10},(_,i)=>'level-'+k+'-'+i);
  p.sessions.push({id:'learn-'+k,mode:'new',at:lessonAt,ids,successful:8});
  ids.forEach((id,i)=>p.words[id]={origin:'learned',schedule:{...E.newSchedule(lessonAt),nextDay:'2099-01-01'},history:[{at:reviewAt,ok:i<8}]});
 }
 const map=new Map([['wordscene-17-lab-v1',JSON.stringify(p)]]);
 const b=boot({map,now:at});
 assert.ok(b.root.html.includes('<strong>2</strong><span>из 3</span>'));
 assert.ok(b.root.html.includes('<strong>80%</strong><span>цель 80%</span>'));
 assert.ok(b.root.html.includes('class="reached" style="width:80%"'));
 assert.equal(b.map.get('wordscene-17-lab-v1'),JSON.stringify(p));
});

test('Paper main actions keep 78px minimum and success text has approved accessible contrast',()=>{
 const b=boot(),css=file('style.css');
 assert.match(b.root.html,/class="paper-actions"/);
 assert.match(b.root.html,/class="paper-done" role="status"/);
 assert.ok(css.includes('--ws-home-action-height:78px'));
 assert.ok(css.includes('.paper-actions>.paper-action,.paper-actions>.paper-done{height:100%;min-height:var(--ws-home-action-height)}'));
 assert.ok(css.includes('.paper-actions .paper-done strong{color:#174f29}'));
 assert.ok(css.includes('.paper-actions .paper-done small{color:#285d38;font-size:14px;font-weight:500}'));
 assert.match(css,/\.paper button:not\(:disabled\):active[^\n]*scale\(\.975\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
