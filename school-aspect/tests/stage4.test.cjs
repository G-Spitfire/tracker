'use strict';
const assert=require('node:assert/strict'),M=require('../model.js'),S=require('../staff.js');
let passed=0;const test=(name,fn)=>{fn();passed++};
const native={data:new Map(),fail:false,getItem(k){return this.data.get(k)??null},setItem(k,v){if(this.fail)throw Error('Quota');this.data.set(k,String(v))},removeItem(k){this.data.delete(k)}};
const storage=M.openStorage(native);
const refs={teacher:[{id:'a',name:'Анна'},{id:'b',name:'Елена'},{id:'c',name:'Мари'}],room:[{id:'r1',name:'Каб. 22'},{id:'r2',name:'Каб. 24'}]};
storage.setItem(M.REFS,JSON.stringify(refs));
const lesson=(id,more={})=>({id,cls:0,name:'Математика',teachers:['Анна','Мари'],room:'Каб. 22',start:540,end:580,group:'all',...more});
const day=(extras,events=[])=>({extras,events,edits:{},absences:{},resolutions:{}});
storage.setItem(M.STORE,JSON.stringify({
 '2026-11-23':day([lesson('ex-first'),lesson('ex-busy',{cls:1,teachers:['Елена'],room:'Каб. 24'})],[lesson('event-shared',{kind:'event',name:'Музей',classes:[0,1],teachers:['Анна','Мари'],start:700,end:760})]),
 '2026-11-24':day([lesson('ex-sub-a',{group:'a'}),lesson('ex-sub-b',{group:'b',teachers:['Анна'],room:'Каб. 24'})]),
 '2026-11-25':day([lesson('ex-already',{teachers:['Анна','Елена','Мари']})])
}));
const base=storage.document();
const period={staffId:'a',start:'2026-11-23',end:'2026-11-25',reason:''};
const replacement={staffId:'a',replacementId:'b',start:'2026-11-23',end:'2026-11-25'};
const find=doc=>S.findAssignments(doc,replacement);
const rowKey=(date,id)=>JSON.stringify([date,id]);
test('absence on one day, optional blank reason, exact unchanged assignments',()=>{
 const r=S.setAbsence(base,{...period,end:period.start}).document;assert.equal(r.days[period.start].absences.a,'');assert.deepEqual(r.days[period.start].entries,base.days[period.start].entries);assert.ok(!('a'in r.days['2026-11-24'].absences));
});
test('period expands inclusively and list collapses consecutive same-reason dates',()=>{
 const d=S.setAbsence(base,period).document;assert.equal(S.listAbsences(d).length,1);assert.deepEqual(S.listAbsences(d)[0],{...period,key:JSON.stringify(['a',period.start,period.end,''])});assert.ok('a'in d.days['2026-11-24'].absences);
});
test('absence across empty schedule dates remains available',()=>{
 const d=S.setAbsence(base,{...period,start:'2026-11-26',end:'2026-11-28'}).document;assert.equal(d.days['2026-11-27'].entries.length,0);assert.equal(d.days['2026-11-27'].absences.a,'');
});
test('edit removes only old marks, keeps other employee absences and all records',()=>{
 let d=S.setAbsence(base,period).document;d.days['2026-11-23'].absences.c='Отпуск';const previousKey=S.listAbsences(d).find(p=>p.staffId==='a').key;
 d=S.setAbsence(d,{...period,start:'2026-11-24',end:'2026-11-26',reason:'Болезнь',previousKey}).document;assert.ok(!('a'in d.days['2026-11-23'].absences));assert.equal(d.days['2026-11-23'].absences.c,'Отпуск');assert.deepEqual(d.days['2026-11-23'].entries,base.days['2026-11-23'].entries);assert.equal(d.days['2026-11-26'].absences.a,'Болезнь');
});
test('delete period never deletes schedule or other employee marks',()=>{
 const d=S.setAbsence(base,period).document;d.days['2026-11-24'].absences.c='';const p=S.listAbsences(d).find(p=>p.staffId==='a');const out=S.removeAbsence(d,p.key);assert.ok(!('a'in out.days['2026-11-24'].absences));assert.ok('c'in out.days['2026-11-24'].absences);assert.deepEqual(out.days['2026-11-24'].entries,base.days['2026-11-24'].entries);
});
test('overlap is reported and invalid dates/staff/obsolete edit rejected',()=>{
 const d=S.setAbsence(base,period).document;assert.equal(S.setAbsence(d,period).overwritten.length,3);assert.throws(()=>S.setAbsence(d,{...period,end:'2026-02-30'}));assert.throws(()=>S.setAbsence(d,{...period,staffId:'missing'}));assert.throws(()=>S.removeAbsence(d,'obsolete'));
});
test('find all five assignments across groups, event, subgroups and dates',()=>{
 const rows=find(base);assert.equal(rows.length,5);assert.equal(rows.filter(r=>r.entry.event).length,1);assert.equal(rows.filter(r=>r.entry.subgroup!=='all').length,2);assert.equal(rows[0].date,'2026-11-23');
});
test('only selected records changed and others untouched',()=>{
 const selectedKeys=[rowKey('2026-11-23','ex-first')],r=S.replace(base,{...replacement,selectedKeys});assert.equal(r.count,1);assert.deepEqual(r.document.days['2026-11-23'].entries[0].staffIds,['b','c']);assert.deepEqual(r.document.days['2026-11-24'],base.days['2026-11-24']);assert.deepEqual(r.document.days['2026-11-23'].entries[2],base.days['2026-11-23'].entries[2]);
});
test('shared event remains one multi-group entry, ID and escorts preserved',()=>{
 const r=S.replace(base,{...replacement,selectedKeys:[rowKey('2026-11-23','event-shared')]});const e=r.document.days['2026-11-23'].entries.find(e=>e.id==='event-shared');assert.deepEqual(e.staffIds,['b','c']);assert.equal(e.groupIds.length,2);assert.equal(r.document.days['2026-11-23'].entries.filter(e=>e.event).length,1);assert.deepEqual(r.document.catalogs,base.catalogs);
});
test('busy substitute and new simultaneous replacement assignments warned',()=>{
 const r=S.previewReplacement(base,replacement);assert.ok(r.rows.find(r=>r.entry.id==='ex-first').warnings.some(w=>w.includes('Пересечение')));assert.ok(r.rows.find(r=>r.entry.id==='ex-sub-a').warnings.some(w=>w.includes('Пересечение')));assert.ok(r.rows.find(r=>r.entry.id==='ex-sub-b').warnings.some(w=>w.includes('Пересечение')));
});
test('absent replacement warned even with blank reason; original marks retained',()=>{
 let d=S.setAbsence(base,period).document;d=S.setAbsence(d,{...period,staffId:'b',end:period.start}).document;const r=S.replace(d,replacement);assert.ok(r.rows[0].warnings.some(w=>w.includes('Отсутствует')));assert.deepEqual(r.document.days[period.start].absences,d.days[period.start].absences);
});
test('already assigned substitute is deduplicated without losing other staff',()=>{
 const r=S.replace(base,replacement);const row=r.rows.find(r=>r.entry.id==='ex-already');assert.ok(row.warnings.some(w=>w.includes('Уже назначен')));assert.deepEqual(r.document.days['2026-11-25'].entries[0].staffIds,['b','c']);M.validate(r.document);
});
test('warnings permit save, invalid identities/selection do not',()=>{
 assert.ok(S.replace(base,replacement).warningCount>0);assert.throws(()=>S.replace(base,{...replacement,replacementId:'a'}));assert.throws(()=>S.replace(base,{...replacement,selectedKeys:[]}));assert.throws(()=>S.replace(base,{...replacement,selectedKeys:['missing']}));assert.throws(()=>S.replace(base,{...replacement,replacementId:'missing'}));
});
test('one atomic write and one undo restores whole multi-day replacement',()=>{
 storage.replace(base);let writes=0;const save=native.setItem.bind(native);native.setItem=(...args)=>{writes++;save(...args)};storage.applySchedule(S.replace(storage.document(),replacement).document);assert.equal(writes,1);storage.undo();assert.deepEqual(storage.document(),base);native.setItem=save;
});
test('failed write leaves all source records unchanged',()=>{
 const before=native.getItem(M.KEY);native.fail=true;assert.throws(()=>storage.applySchedule(S.replace(storage.document(),replacement).document));native.fail=false;assert.equal(native.getItem(M.KEY),before);assert.deepEqual(storage.document(),base);
});
test('reopen keeps absences, replacements and resets undo; backup restores exact IDs',()=>{
 storage.applySchedule(S.replace(S.setAbsence(base,period).document,replacement).document);const saved=storage.document(),backup=storage.exportBackup();assert.deepEqual(M.openStorage(native).document(),saved);assert.equal(M.openStorage(native).canUndo(),false);storage.replace(M.encode({}));storage.restoreBackup(backup);assert.deepEqual(storage.document(),saved);
});
test('read-only and stale page cannot replace or change absences',()=>{
 const reader=M.openStorage(native,{guarded:true});reader.activate(false);const raw=native.getItem(M.KEY);assert.throws(()=>reader.applySchedule(S.setAbsence(reader.document(),{...period,reason:'New'}).document));assert.throws(()=>reader.applySchedule(S.replace(reader.document(),{...replacement,staffId:'b',replacementId:'a'}).document));assert.equal(native.getItem(M.KEY),raw);
});
test('standard UI warnings include absent secondary escort and post-replacement conflicts',()=>{
 const {boot}=require('./stage1.test.cjs');const d=S.setAbsence(base,{...period,staffId:'c'}).document;const mem={data:new Map([[M.KEY,M.serialize(d)]]),getItem(k){return this.data.get(k)??null},setItem(k,v){this.data.set(k,String(v))},removeItem(k){this.data.delete(k)}};const ui=boot(mem);ui.q.set({date:period.start});assert.equal(ui.q.unresolved().length,2);mem.data=new Map([[M.KEY,M.serialize(S.replace(base,replacement).document)]]);const after=boot(mem);after.q.set({date:period.start});assert.ok(after.q.conflictIds().size>0);
});
module.exports={passed};
