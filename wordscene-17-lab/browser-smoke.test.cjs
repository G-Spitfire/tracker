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
 const window={WordSceneTopics:{topics:[],forWord:()=>[]},WordSceneContent:{cards:[],render:()=>'<svg></svg>'},confirm:()=>true};
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
 assert.match(b.root.html,/Учить новые слова[\s\S]*Выбери способ подбора[\s\S]*На сегодня всё повторено/);
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
 assert.match(b.root.html,/На сегодня всё повторено/);
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

test('one child can save name and age without creating an account',()=>{
 const b=boot({inputs:{childName:'Полина',childAge:'9'}});
 b.click('childProfile');
 assert.match(b.root.html,/Как тебя зовут/);
 assert.match(b.root.html,/Сколько тебе лет/);
 b.click('saveChild');
 const profile=JSON.parse(b.map.get('wordscene-17-lab-v1'));
 assert.equal(profile.child.name,'Полина');
 assert.equal(profile.child.age,9);
 assert.equal(profile.revision,1);
 assert.doesNotMatch(b.root.html,/Ребёнок 1|Ребёнок 2|Облако/);
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

test('Paper home hides level info and profile gear while retaining navigation',()=>{
 const b=boot();
 assert.doesNotMatch(b.root.html,/data-action="childProfile"|class="paper-info"/);
 assert.match(b.root.html,/Твой уровень/);
 assert.match(b.root.html,/data-action="progress"/);
 assert.match(b.root.html,/data-action="dictionary"/);
});
test('Paper word picker allows immediate decisions and optional translation reveal',()=>{
 const b=boot();b.click('sources');b.click('auto');
 assert.match(b.root.html,/Неизвестных:[\\s\\S]*0 из 10/);
 assert.match(b.root.html,/Просмотрено:[\\s\\S]*0 из 50/);
 assert.match(b.root.html,/Нажми, чтобы увидеть перевод/);
 assert.match(b.root.html,/data-action="known"/);
 assert.match(b.root.html,/data-action="unknown"/);
 assert.doesNotMatch(b.root.html,/progress-track|paper-shore|paper-sand/);
 b.click('known');
 assert.match(b.root.html,/Просмотрено:[\\s\\S]*1 из 50/);
 b.click('reveal');
 assert.doesNotMatch(b.root.html,/Нажми, чтобы увидеть перевод/);
 assert.match(b.root.html,/ws-picker-translation/);
 b.click('unknown');
 assert.match(b.root.html,/Неизвестных:[\\s\\S]*1 из 10/);
 b.click('stopSelection');
 assert.match(b.root.html,/Учить новые слова/);
 assert.equal(b.map.has('wordscene-17-lab-active-v1'),false);
});
