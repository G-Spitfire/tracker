'use strict';
const assert=require('node:assert/strict'),M=require('../model.js'),C=require('../copy.js');
let passed=0;const test=(name,fn)=>{fn();passed++};
function memory(){return {data:new Map(),fail:false,getItem(k){return this.data.get(k)??null},setItem(k,v){if(this.fail)throw Error('Quota');this.data.set(k,String(v))},removeItem(k){this.data.delete(k)}}}
const native=memory(),s=M.openStorage(native);
const lesson=(id,over={})=>({id,cls:0,name:'Математика',teacher:'Анна',teachers:['Анна','Елена'],room:'Каб. 22',start:540,end:580,group:'all',...over});
const day=(extras=[],events=[],absences={})=>({edits:{},extras,events,absences,resolutions:{}});
s.setItem(M.DIRECTORY,JSON.stringify({subjects:[{id:'math',name:'Математика',type:'subject'},{id:'walk',name:'Прогулка',type:'routine'}],colors:{}}));
s.setItem(M.STORE,JSON.stringify({
 '2026-11-16':day([lesson('ex-a',{group:'a'}),lesson('ex-b',{group:'b',teachers:['Мари'],room:'Каб. 24'}),lesson('ex-walk',{name:'Прогулка',start:600,end:620})],[{id:'event-source',kind:'event',classes:[0,1],name:'Музей',teachers:['Анна','Елена'],room:'Библиотека',start:700,end:760}]),
 '2026-11-18':day([lesson('ex-wed')]),
 '2026-11-23':day([lesson('ex-existing')]),
 '2026-11-24':day([lesson('ex-keep-tue')])
}));
const base=s.document(),anna=base.catalogs.staff.find(x=>x.name==='Анна').id;
base.days['2026-11-16'].absences[anna]='Болезнь источника';base.days['2026-11-23'].absences[anna]='Отпуск цели';s.replace(base);
const opt={source:'2026-11-16',target:'2026-11-23',period:'day',mode:'replace'};
const result=mode=>C.apply(base,{...opt,mode:mode||'replace'});
test('ordinary day copies all four live records',()=>{const r=result();assert.equal(r.plan.add,4);assert.equal(r.document.days[opt.target].entries.length,4)});
test('actual assignments and remaining parameters survive exactly',()=>{const next=result().document.days[opt.target].entries;for(const [i,x]of next.entries()){const source=base.days[opt.source].entries[i];assert.deepEqual(x.staffIds,source.staffIds);assert.equal(x.roomId,source.roomId);assert.equal(x.start,source.start);assert.equal(x.end,source.end);assert.equal(x.activityId,source.activityId)}});
test('shared event remains one entry with all groups and escorts',()=>{const es=result().document.days[opt.target].entries.filter(e=>e.event);assert.equal(es.length,1);assert.equal(es[0].groupIds.length,2);assert.equal(es[0].staffIds.length,2)});
test('subgroups and routine types survive',()=>{const es=result().document.days[opt.target].entries;assert.deepEqual(es.slice(0,2).map(e=>e.subgroup),['a','b']);assert.equal(es[2].typeId,'type-routine')});
test('replace removes old lessons and old events',()=>{const d=structuredClone(base);d.days[opt.target].entries.push({...d.days[opt.source].entries[3],id:'old-event'});const r=C.apply(d,opt);assert.equal(r.plan.replace,2);assert.ok(!r.document.days[opt.target].entries.some(e=>['ex-existing','old-event'].includes(e.id)))});
test('merge keeps existing records and appends all source kinds',()=>{const r=result('merge');assert.equal(r.document.days[opt.target].entries.length,5);assert.equal(r.document.days[opt.target].entries[0].id,'ex-existing')});
test('week preserves weekday alignment and skips empty source days',()=>{const r=C.apply(base,{...opt,period:'week'});assert.deepEqual(r.plan.days.map(d=>d.target),['2026-11-23','2026-11-25']);assert.equal(r.document.days['2026-11-24'].entries[0].id,'ex-keep-tue');assert.equal(r.document.days['2026-11-25'].entries.length,1)});
test('empty source day never clears target',()=>{assert.equal(C.preview(base,{...opt,source:'2026-11-17',target:'2026-11-24'}).add,0);assert.throws(()=>C.apply(base,{...opt,source:'2026-11-17',target:'2026-11-24'}));assert.equal(base.days['2026-11-24'].entries.length,1)});
test('target absences retained; source absences not copied; warnings counted',()=>{const r=result();assert.deepEqual(r.document.days[opt.target].absences,base.days[opt.target].absences);assert.equal(r.document.days[opt.target].absences[anna],'Отпуск цели');assert.equal(r.plan.absenceWarnings,3)});
test('IDs are unique, references valid, original document unchanged',()=>{const before=JSON.stringify(base),r=result();const ids=Object.values(r.document.days).flatMap(d=>d.entries.map(e=>e.id));assert.equal(new Set(ids).size,ids.length);assert.equal(JSON.stringify(base),before);M.validate(r.document)});
test('repeat is detected after reopen; merge still has additive semantics',()=>{const first=result('merge').document;s.replace(first);const reopened=M.openStorage(native);const p=C.preview(reopened.document(),{...opt,mode:'merge'});assert.equal(p.repeats,4);const second=C.apply(reopened.document(),{...opt,mode:'merge'});assert.equal(second.document.days[opt.target].entries.length,9)});
test('whole week can be undone by one action; reload discards undo',()=>{s.replace(base);s.applySchedule(C.apply(s.document(),{...opt,period:'week'}).document);assert.ok(s.canUndo());s.undo();assert.deepEqual(s.document(),base);assert.equal(M.openStorage(native).canUndo(),false)});
test('failed write has no partial week; read-only tab cannot copy',()=>{const before=native.getItem(M.KEY);native.fail=true;assert.throws(()=>s.applySchedule(C.apply(s.document(),{...opt,period:'week'}).document));native.fail=false;assert.equal(native.getItem(M.KEY),before);assert.deepEqual(s.document(),base);const reader=M.openStorage(native,{guarded:true});reader.activate(false);assert.throws(()=>reader.applySchedule(result().document));assert.equal(native.getItem(M.KEY),before)});
test('saved result reopens with its full shared event and absences',()=>{s.applySchedule(result().document);const reopened=M.openStorage(native).document();assert.equal(reopened.days[opt.target].entries.length,4);assert.deepEqual(reopened.days[opt.target].absences,base.days[opt.target].absences)});
test('same source/target is rejected and invalid options do not change storage',()=>{assert.throws(()=>C.preview(base,{...opt,target:opt.source}));assert.throws(()=>C.preview(base,{...opt,source:'2026-02-30'}))});
test('standard conflict and absence warnings include copied entries',()=>{
 const {boot}=require('./stage1.test.cjs');const doc=result('merge').document;doc.days[opt.target].absences[anna]='';const data=memory();data.setItem(M.KEY,M.serialize(doc));const ui=boot(data);ui.q.set({date:opt.target});assert.ok(ui.q.conflictIds().size>0);assert.equal(ui.q.get().store[opt.target].absences[anna],'');
});
module.exports={passed};
