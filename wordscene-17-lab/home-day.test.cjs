const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function boot({active=false}={}){
 let now=new Date(2026,10,5,23,59,59).getTime(),html='',nodes=[],renders=0;
 const events={},intervals=[],data=new Map(),writes=[];
 const root={contains:()=>true,querySelector:()=>null,
  querySelectorAll:selector=>selector==='[data-action]'?nodes:[],
  get innerHTML(){return html},set innerHTML(value){html=value;renders++;nodes=[...value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>({dataset:{action:m[1].match(/data-action="([^"]+)"/)?.[1]},disabled:/\bdisabled\b/.test(m[1]),addEventListener(name,fn){if(name==='click')this.click=fn}}))}};
 const doc={hidden:false,getElementById:id=>id==='app'?root:null,addEventListener:(name,fn)=>events[name]=fn};
 const c=vm.createContext({console,Date:class extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}},
  document:doc,navigator:{},setInterval:fn=>intervals.push(fn),setTimeout:()=>1,clearTimeout:()=>{},
  localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);writes.push(key)},removeItem:key=>{data.delete(key);writes.push(key)}}});
 c.window=c;c.addEventListener=(name,fn)=>events[name]=fn;
 for(const file of ['engine.js','accounts.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),c);
 const E=c.WS17Engine,p=E.empty();p.words.mug={origin:'learned',schedule:{...E.newSchedule(now),nextDay:'2026-11-06'},history:[]};
 data.set('wordscene-17-lab-v1',JSON.stringify(p));
 if(active)data.set('wordscene-17-lab-active-v1',JSON.stringify(E.start(p,'new',['cat','dog','net'],[],now)));
 c.WS17_SEED=['mug','cat','dog','net'].map(en=>({en,ru:en}));
 vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),c);
 return {get html(){return html},get renders(){return renders},writes,
  tomorrow(){now+=2000},tick(){intervals.forEach(fn=>fn())},event(name,event={}){events[name]?.(event)},click(action){nodes.find(n=>n.dataset.action===action).click()},
  button(action){return nodes.find(n=>n.dataset.action===action)}};
}

const cases=[
 ['midnight updates due count and blocks new words',()=>{const a=boot();assert.equal(a.button('sources').disabled,false);a.tomorrow();a.tick();assert.equal(a.button('sources').disabled,true);assert.match(a.html,/Повторить сегодня: 1 слово/);assert.equal(a.writes.length,0)}],
 ['foreground refreshes without waiting for timer',()=>{const a=boot();a.tomorrow();a.event('visibilitychange');assert.equal(a.button('sources').disabled,true)}],
 ['restored page refreshes',()=>{const a=boot();a.tomorrow();a.event('pageshow',{persisted:true});assert.equal(a.button('sources').disabled,true)}],
 ['window focus refreshes',()=>{const a=boot();a.tomorrow();a.event('focus');assert.equal(a.button('sources').disabled,true)}],
 ['same day does not replace the home DOM',()=>{const a=boot(),n=a.renders;a.tick();a.event('focus');assert.equal(a.renders,n)}],
 ['new day does not leave profile form',()=>{const a=boot();a.click('childProfile');const before=a.html;a.tomorrow();a.tick();a.event('focus');a.event('visibilitychange');assert.equal(a.html,before)}],
 ['new day preserves an active learning session',()=>{const a=boot({active:true}),before=a.html,n=a.writes.length;a.tomorrow();a.tick();a.event('focus');assert.equal(a.html,before);assert.equal(a.writes.length,n)}]
];
const test=require('node:test');
for(const [name,check] of cases)test(name,check);
