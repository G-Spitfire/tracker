'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const M = require('../model.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {data, fail: false, getItem(k) { return data.get(k) ?? null; },
    setItem(k, v) { if (this.fail && k === M.KEY) throw Error('QuotaExceededError'); data.set(k, String(v)); },
    removeItem(k) { data.delete(k); }};
}
const A = 'teacher-anna', B = 'teacher-elena', C = 'teacher-mari';
const refs = {teacher: [{id:A,name:'Анна'}, {id:B,name:'Елена'}, {id:C,name:'Мари'}],room:[{id:'room-1',name:'Каб. 22'}, {id:'room-2',name:'Каб. 24'}]};
const directory = {version:20, subjects:[{id:'math',name:'Математика',type:'subject'},{id:'walk',name:'Прогулка',type:'routine'}],colors:{subject:'#cfe3f8',routine:'#ffe79b',event:'#ccebd9'}};
const entry = (overrides = {}) => ({id:'ex-test',cls:0,name:'Математика',teacher:'Анна',teachers:['Анна'],teacherId:A,teacherIds:[A],room:'Каб. 22',start:540,end:580,group:'all',...overrides});
const day = (extras = [], events = []) => ({edits:{},extras,events,absences:{},resolutions:{}});
const initial = store => ({[M.STORE]:JSON.stringify(store),[M.REFS]:JSON.stringify(refs),[M.DIRECTORY]:JSON.stringify(directory)});
const native = memory(initial({'2026-11-17':day([entry()])}));
let storage = M.openStorage(native);
const save = store => storage.setItem(M.STORE, JSON.stringify(store));
const read = () => JSON.parse(storage.getItem(M.STORE));
test('migration creates a versioned document with ID-only schedule links', () => {
  const doc=storage.document(), e=doc.days['2026-11-17'].entries[0];
  assert.equal(doc.schemaVersion,1); assert.deepEqual(e.staffIds,[A]);assert.deepEqual(e.groupIds,['group-0']);assert.equal(e.activityId,'math');assert.equal(e.roomId,'room-1');assert.ok(!('teachers' in e));assert.ok(!('teacher' in e));
});
test('И2: explicit replacement wins over stale IDs', () => {
  save({'2026-11-17':day([entry({teachers:['Елена'],teacher:'Елена'})])});
  assert.deepEqual(storage.document().days['2026-11-17'].entries[0].staffIds,[B]);
  storage=M.openStorage(native);assert.deepEqual(read()['2026-11-17'].extras[0].teachers,['Елена']);
});
test('И13: removing the first escort cannot resurrect it', () => {
  save({'2026-11-17':day([], [entry({id:'event-test',kind:'event',classes:[0,1],teachers:['Елена'],teacherIds:[A,B],teacher:'Анна'})])});
  assert.deepEqual(read()['2026-11-17'].events[0].teachers,['Елена']);
});
test('removing middle/last/all and changing the order preserves exact staff', () => {
  for (const teachers of [['Анна','Мари'],['Анна','Елена'],['Мари','Анна'],[]]) {
    save({'2026-11-17':day([entry({teachers,teacherIds:[A,B,C]})])});
    assert.deepEqual(read()['2026-11-17'].extras[0].teachers,teachers);
  }
});
test('same assignments supported for lesson, routine and shared event', () => {
  save({'2026-11-17':day([entry({teachers:['Анна','Елена']}),entry({id:'ex-walk',name:'Прогулка',teachers:['Елена','Мари']})], [entry({id:'event-all',kind:'event',classes:[0,1,2],teachers:['Анна','Мари']})])});
  const es=storage.document().days['2026-11-17'].entries;
  assert.deepEqual(es.map(e=>e.staffIds),[[A,B],[B,C],[A,C]]);assert.equal(es[1].typeId,'type-routine');assert.equal(es[2].groupIds.length,3);assert.equal(es.length,3);
});
test('catalog rename changes display without changing assignment IDs', () => {
  const next=structuredClone(refs);next.teacher[0].name='Анна Новая';storage.setItem(M.REFS,JSON.stringify(next));
  assert.equal(read()['2026-11-17'].extras[0].teachers[0],'Анна Новая');assert.equal(storage.document().days['2026-11-17'].entries[0].staffIds[0],A);
});
test('arbitrary past, future and weekend dates survive reopening', () => {
  const store={};for(const d of ['2016-01-01','2026-11-22','2036-12-31'])store[d]=day([entry({id:M.id()})]);
  save(store);storage=M.openStorage(native);assert.deepEqual(Object.keys(read()),Object.keys(store));
});
test('deleting one record leaves other dates and entries intact', () => {
  const store=read(), dates=Object.keys(store);store[dates[0]].extras=[];save(store);storage=M.openStorage(native);assert.equal(read()[dates[0]].extras.length,0);assert.equal(read()[dates[1]].extras.length,1);
});
test('failed storage write changes neither disk nor memory', () => {
  const before=native.getItem(M.KEY), doc=storage.document();native.fail=true;assert.throws(()=>save({}),/Quota/);native.fail=false;
  assert.equal(native.getItem(M.KEY),before);assert.deepEqual(storage.document(),doc);
});
test('invalid group, date, interval and duplicate IDs are rejected atomically', () => {
  const before=native.getItem(M.KEY);
  for(const value of [ {'2026-11-17':day([entry({cls:999})])}, {'2026-02-30':day([entry()])}, {'2026-11-17':day([entry({end:539})])}, {'2026-11-17':day([entry(),entry()])} ])assert.throws(()=>save(value));
  assert.equal(native.getItem(M.KEY),before);
});
test('unknown schema and dangling canonical staff link fail visibly', () => {
  assert.throws(()=>M.openStorage(memory({[M.KEY]:JSON.stringify({schemaVersion:99})})));
  const doc=storage.document();Object.values(doc.days)[1].entries[0].staffIds=['missing'];assert.throws(()=>M.validate(doc));
});
test('canonical document is authoritative after migration', () => {
  native.setItem(M.STORE,JSON.stringify({'2000-01-01':day([entry()])}));assert.ok(!M.openStorage(native).document().days['2000-01-01']);
});
test('new IDs are distinct even with the same timestamp', () => {
  assert.equal(new Set(Array.from({length:1000},()=>M.id())).size,1000);
});

// Execute the shipped UI script with a minimal DOM; a fresh VM is a page reload.
// The only instrumentation exposes closure functions; production files have no test hooks.
function boot(native) {
  const nodes=new Map(), selectors=new Map(), alerts=[], prompts=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',open:false,style:{setProperty(){}},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(t,f){this[t]=f},focus(){},showModal(){this.open=true},close(){this.open=false},setAttribute(){},closest(){return null},querySelectorAll(){return []},getBoundingClientRect(){return {height:500,width:1000,top:0}}});return nodes.get(id)};
  const ctx=vm.createContext({console,Date,JSON,Set,Map,AspectModel:M,structuredClone,window:{localStorage:native},document:{getElementById:node,querySelector:node,querySelectorAll:s=>selectors.get(s)||[],documentElement:node('root'),body:node('body')},alert:x=>alerts.push(x),confirm:()=>true,prompt:()=>prompts.shift()??null,Blob,URL,setTimeout,clearTimeout,location:{reload(){}}});
  let html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  let code=html.match(/<script>\s*([\s\S]*)<\/script>/)[1];
  code=code.replace(/\}\)\(\);\s*$/,`globalThis.qa={get:()=>({date,mode,draft,selected,store}),set:s=>{if('date'in s){date=s.date;base=baseForDate(date)}if('draft'in s)draft=s.draft;if('selected'in s)selected=s.selected;if('mode'in s)mode=s.mode},lessons,events,commit,editorLesson,eventEditor,shared,conflictIds,attachRefs,render};})();`);
  vm.runInContext(code,ctx);return {q:ctx.qa,node,selectors,alerts,prompts};
}
const uiNative=memory(initial({}));let ui=boot(uiNative);
function edit(record, mode='new-lesson') {ui.q.set({date:'2031-05-17',draft:record,selected:mode==='new-lesson'?null:record.id,mode});ui.q.editorLesson();}
test('UI create a multi-staff lesson and persist it', () => {
  edit(entry({teachers:['Анна','Елена']}));ui.node('save-lesson').onclick();assert.equal(ui.q.lessons().length,1);
  ui=boot(uiNative);ui.q.set({date:'2031-05-17'});assert.deepEqual(Array.from(ui.q.lessons()[0].teachers),['Анна','Елена']);
});
test('UI И2: checkbox replacement, save and reopen', () => {
  let x=ui.q.lessons()[0];const cb={dataset:{lessonTeacher:'Анна'},checked:false};ui.selectors.set('[data-lesson-teacher]',[cb]);edit(x,'lesson');cb.onchange();
  x=ui.q.get().draft;assert.deepEqual(Array.from(x.teachers),['Елена']);ui.node('save-lesson').onclick();ui=boot(uiNative);ui.q.set({date:'2031-05-17'});assert.deepEqual(Array.from(ui.q.lessons()[0].teachers),['Елена']);
});
test('UI edit exact minute and room, reopen', () => {
  edit({...ui.q.lessons()[0],end:587,room:'Каб. 24'},'lesson');ui.node('save-lesson').onclick();ui=boot(uiNative);ui.q.set({date:'2031-05-17'});assert.equal(ui.q.lessons()[0].end,587);assert.equal(ui.q.lessons()[0].room,'Каб. 24');
});
test('UI create shared event with three escorts', () => {
  ui.q.set({mode:'event',selected:null,draft:entry({id:'event-ui',kind:'event',classes:[0,1],teachers:['Анна','Елена','Мари'],start:700,end:740})});ui.q.eventEditor();ui.node('save-event').onclick();assert.equal(ui.q.events().length,1);
});
test('UI И13: uncheck first escort, save, reload and reopen', () => {
  const cb={dataset:{teacher:'Анна'},checked:false};ui.selectors.set('[data-teacher]',[cb]);ui.q.set({mode:'event',selected:'event-ui',draft:null});ui.q.eventEditor();cb.onchange();ui.node('save-event').onclick();
  ui=boot(uiNative);ui.q.set({date:'2031-05-17',mode:'event',selected:'event-ui'});ui.q.eventEditor();assert.deepEqual(Array.from(ui.q.events()[0].teachers),['Елена','Мари']);assert.match(ui.node('editor').innerHTML,/Мари/);
});
test('UI shared event is one record, not a self conflict', () => {
  assert.equal(ui.q.events().length,1);assert.equal(ui.q.events()[0].classes.length,2);assert.equal(ui.q.conflictIds().size,0);
});
test('UI routine permits several responsible staff', () => {
  edit(entry({id:'ex-routine',name:'Прогулка',teachers:['Анна','Мари'],start:800,end:830}));ui.node('save-lesson').onclick();ui=boot(uiNative);ui.q.set({date:'2031-05-17'});assert.deepEqual(Array.from(ui.q.lessons().find(x=>x.id==='ex-routine').teachers),['Анна','Мари']);
});
test('UI parallel action assigns the original to subgroup a and new one to b', () => {
  const original=ui.q.lessons()[0];edit(original,'lesson');ui.node('add-parallel').onclick();const all=ui.q.lessons();assert.equal(all.find(x=>x.id===original.id).group,'a');assert.equal(all.find(x=>x.id!==original.id&&x.start===original.start).group,'b');
});
test('parallel independent staff/rooms do not create class conflict; all staff checked', () => {
  const a=entry({group:'a',teachers:['Анна','Мари']}),b=entry({id:'ex-other',group:'b',teacher:'Елена',teachers:['Елена'],room:'Каб. 24'});
  assert.equal(ui.q.shared(a,b).sameClasses.length,0);assert.equal(ui.q.shared(a,b).sameTeachers.length,0);b.teachers=['Мари'];assert.equal(ui.q.shared(a,b).sameTeachers[0],'Мари');
});
test('UI failed save retains edited lesson draft', () => {
  const x=ui.q.lessons()[0];edit({...x,end:589},'lesson');uiNative.fail=true;ui.node('save-lesson').onclick();uiNative.fail=false;assert.equal(ui.q.get().draft.end,589);assert.ok(ui.alerts.some(x=>x.includes('НЕ сохранены')));
});
test('UI failed save retains event draft', () => {
  ui.q.set({mode:'event',selected:'event-ui',draft:{...ui.q.events()[0],end:745}});ui.q.eventEditor();uiNative.fail=true;ui.node('save-event').onclick();uiNative.fail=false;assert.equal(ui.q.get().draft.end,745);
});
test('UI delete event and lesson, reload without resurrecting records', () => {
  ui.q.set({draft:null,mode:'event',selected:'event-ui'});ui.q.eventEditor();ui.prompts.push('2');ui.node('delete-event').onclick();edit(ui.q.lessons().find(x=>x.id==='ex-test'),'lesson');ui.node('cancel-lesson').onclick();ui=boot(uiNative);ui.q.set({date:'2031-05-17'});assert.equal(ui.q.events().length,0);assert.ok(!ui.q.lessons().some(x=>x.id==='ex-test'));
});
console.log(JSON.stringify({passed,scope:'model + shipped UI handlers in isolated VM; no browser assertion implied'}));
test('UI replacement A→B→C updates all names and IDs after reload', () => {
  edit(entry({id:'ex-replace'}));ui.node('save-lesson').onclick();
  for (const chosen of ['Елена','Мари']) {
    let x=ui.q.lessons().find(x=>x.id==='ex-replace');
    for(const old of [...x.teachers]) {
      const cb={dataset:{lessonTeacher:old},checked:false};ui.selectors.set('[data-lesson-teacher]',[cb]);edit(x,'lesson');cb.onchange();x=ui.q.get().draft;
    }
    const cb={dataset:{lessonTeacher:chosen},checked:true};ui.selectors.set('[data-lesson-teacher]',[cb]);edit(x,'lesson');cb.onchange();ui.node('save-lesson').onclick();ui=boot(uiNative);ui.q.set({date:'2031-05-17'});
    const saved=ui.q.lessons().find(x=>x.id==='ex-replace');assert.deepEqual(Array.from(saved.teachers),[chosen]);assert.equal(saved.teacherId,chosen==='Елена'?B:C);
  }
});
test('fresh storage keeps distinct default activity colors',()=>{
 const c=M.openStorage(memory()).document().catalogs.types;assert.equal(new Set(c.map(x=>x.color)).size,3);
});
module.exports = {passed};
