'use strict';
const assert=require('node:assert/strict');
const M=require('../model.js');
let passed=0;const test=(name,fn)=>{fn();passed++};
const memory=()=>({data:new Map(),fail:false,getItem(k){return this.data.get(k)??null},setItem(k,v){if(this.fail)throw Error('QuotaExceededError');this.data.set(k,String(v))},removeItem(k){this.data.delete(k)}});
const native=memory(),s=M.openStorage(native);
const entry=(id='ex-one')=>({id,cls:0,name:'Тест',teachers:['Анна'],room:'Кабинет',start:540,end:580,group:'all'});
const day=extras=>({extras,events:[],edits:{},absences:{}});
const store=()=>JSON.parse(s.getItem(M.STORE));
test('create → backup → clear → restore → reopen preserves exact document and IDs',()=>{
 s.atomic(()=>s.setItem(M.STORE,JSON.stringify({'2026-01-01':day([entry()])})));
 const before=s.document(),backup=s.exportBackup();s.replace(M.encode({}));s.restoreBackup(backup);assert.deepEqual(M.openStorage(native).document(),before);
});
test('edit → undo restores whole document; undo has one level',()=>{
 const before=s.document();s.atomic(()=>{const x=store();x['2026-01-01'].extras[0].end=590;s.setItem(M.STORE,JSON.stringify(x))});assert.ok(s.canUndo());s.undo();assert.deepEqual(s.document(),before);assert.equal(s.canUndo(),false);
});
test('delete → undo; reload discards undo',()=>{
 s.atomic(()=>s.setItem(M.STORE,JSON.stringify({})));assert.equal(Object.keys(s.document().days).length,0);s.undo();assert.ok(s.document().days['2026-01-01']);assert.equal(M.openStorage(native).canUndo(),false);
});
test('composite writes commit once and undo as one operation',()=>{
 const before=s.document();let writes=0;const original=native.setItem.bind(native);native.setItem=(...args)=>{writes++;original(...args)};
 s.atomic(()=>{let x=store();x['2026-01-02']=day([entry('ex-two')]);s.setItem(M.STORE,JSON.stringify(x));x['2026-01-03']=day([entry('ex-three')]);s.setItem(M.STORE,JSON.stringify(x))});assert.equal(writes,1);s.undo();assert.deepEqual(s.document(),before);native.setItem=original;
});
test('quota failure leaves disk, memory and previous undo untouched',()=>{
 const before=s.document(),raw=native.getItem(M.KEY);native.fail=true;assert.throws(()=>s.atomic(()=>s.setItem(M.STORE,JSON.stringify({}))),/не сохранены/);native.fail=false;assert.equal(native.getItem(M.KEY),raw);assert.deepEqual(s.document(),before);
});
test('throw midway in compound operation leaves no partial write',()=>{
 const before=native.getItem(M.KEY);assert.throws(()=>s.atomic(()=>{s.setItem(M.STORE,JSON.stringify({}));throw Error('Interrupted')}));assert.equal(native.getItem(M.KEY),before);
});
test('malformed and incompatible backups rejected before replacement',()=>{
 const raw=native.getItem(M.KEY);for(const text of ['{','{}',JSON.stringify({format:'aspect-backup',version:99,document:s.document()})])assert.throws(()=>s.restoreBackup(text));assert.equal(native.getItem(M.KEY),raw);
});
test('bad dates, times, duplicate IDs, unknown resources and broken settings rejected',()=>{
 const original=JSON.parse(s.exportBackup()),raw=native.getItem(M.KEY);
 const mutations=[b=>b.document.days['2026-02-30']=b.document.days['2026-01-01'],b=>b.document.days['2026-01-01'].entries[0].end=500,b=>b.document.days['2026-01-01'].entries.push(b.document.days['2026-01-01'].entries[0]),b=>b.document.days['2026-01-01'].entries[0].staffIds=['missing'],b=>b.document.settings.school_week_config_v12={display:{start:'bad',end:'19:00'}}];
 for(const mutate of mutations){const copy=structuredClone(original);mutate(copy);assert.throws(()=>s.restoreBackup(JSON.stringify(copy)))}assert.equal(native.getItem(M.KEY),raw);
});
test('stale tab cannot write or undo over changes in another tab',()=>{
 const other=M.openStorage(native);s.atomic(()=>{const x=store();x['2026-01-01'].extras[0].end=585;s.setItem(M.STORE,JSON.stringify(x))});const latest=native.getItem(M.KEY);assert.throws(()=>other.atomic(()=>other.setItem(M.STORE,'{}')),/другой вкладке/);assert.throws(()=>other.undo());assert.equal(native.getItem(M.KEY),latest);
});
test('read-only tab can export but cannot change data',()=>{
 const reader=M.openStorage(native,{guarded:true});reader.activate(false);assert.equal(reader.canWrite(),false);assert.ok(reader.exportBackup().includes('aspect-backup'));assert.throws(()=>reader.atomic(()=>reader.setItem(M.STORE,'{}')),/вкладке/);
});
test('failed restore retains both data and prior undo',()=>{
 const raw=native.getItem(M.KEY);native.fail=true;const changed=JSON.parse(s.exportBackup());changed.document.days['2026-01-01'].entries[0].end++;assert.throws(()=>s.restoreBackup(JSON.stringify(changed)));native.fail=false;assert.equal(native.getItem(M.KEY),raw);
});
// One realistic school year: 260 weekdays, 6 groups, 8 activities a day.
const yearlyNative=memory(),yearly=M.openStorage(yearlyNative),year={};let date=new Date('2026-01-01T12:00:00Z');
for(let i=0;i<260;){if(date.getUTCDay()!==0&&date.getUTCDay()!==6){const key=date.toISOString().slice(0,10),extras=[];for(let group=0;group<6;group++)for(let slot=0;slot<8;slot++)extras.push({...entry('ex-'+group+'-'+slot),cls:group,start:480+slot*60,end:520+slot*60});year[key]=day(extras);i++}date.setUTCDate(date.getUTCDate()+1)}
let measurement;
test('year: 12,480 activities export/restore/edit/reopen with measured size',()=>{
 const start=Date.now();yearly.atomic(()=>yearly.setItem(M.STORE,JSON.stringify(year)));const backup=yearly.exportBackup();const before=yearly.document();yearly.replace(M.encode({}));yearly.restoreBackup(backup);assert.deepEqual(M.openStorage(yearlyNative).document(),before);const edited=JSON.parse(yearly.getItem(M.STORE));edited[Object.keys(edited)[0]].extras[0].end++;yearly.atomic(()=>yearly.setItem(M.STORE,JSON.stringify(edited)));assert.equal(M.openStorage(yearlyNative).document().days[Object.keys(edited)[0]].entries[0].end,521);
 const raw=yearlyNative.getItem(M.KEY);measurement={days:260,entries:12480,jsonUtf8Bytes:Buffer.byteLength(raw),localStorageUtf16Bytes:raw.length*2,backupUtf8Bytes:Buffer.byteLength(backup),elapsedMs:Date.now()-start};
});
module.exports={passed,measurement};
