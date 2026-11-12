const {test}=require('node:test'),assert=require('node:assert/strict');
const {connect}=require('../homework.js');
function fixture(){
 let auth,receive,fail;const writes=[],states=[],receivers=[];let closed=0;
 const api={auth:{},db:{},onAuthStateChanged(a,fn){auth=fn;return ()=>{}},doc:(db,...p)=>p,
 onSnapshot(ref,options,fn,error){receive=fn;receivers.push(fn);fail=error;return ()=>{closed++}},
 FieldPath:class{constructor(...parts){this.parts=parts}},async updateDoc(...args){writes.push(args)}};
 const connection=connect(api,{setState:s=>states.push(s)});
 return {connection,writes,states,oldEmit:d=>receivers[0]({exists:()=>true,data:()=>d,metadata:{}}),login:uid=>auth(uid?{uid}:null),emit:d=>receive({exists:()=>!!d,data:()=>d,metadata:{fromCache:false,hasPendingWrites:false}}),fail:()=>fail(Error()),closed:()=>closed};
}
const data={schemaVersion:1,syncedAt:new Date().toISOString(),items:{taskA:{date:'2026-11-13',subject:'Математика',text:'Синтетическое задание'}},progress:{taskA:true}};
test('source merges progress and writes only the selected boolean field',async()=>{
 const f=fixture();f.login('A');f.emit(data);assert.equal(f.states.at(-1).items[0].done,true);
 await f.connection.save('taskA',false);
 assert.deepEqual(f.writes[0][0],['schoolHomework','A']);
 assert.deepEqual(f.writes[0][1].parts,['progress','taskA']);assert.equal(f.writes[0][2],false);
 f.emit({...data,items:{...data.items,taskB:{date:'2026-11-14',subject:'Другой',text:'Новое'}}});
 assert.equal(f.states.at(-1).items[0].done,true);
});
test('switch and logout clear data and ignore delayed old account callbacks',async()=>{
 const f=fixture();f.login('A');f.emit(data);f.login('B');assert.equal(f.closed(),1);
 assert.equal(f.states.at(-1).status,'loading');f.oldEmit(data);assert.equal(f.states.at(-1).status,'loading');f.login(null);
 assert.equal(f.states.at(-1).status,'disconnected');f.emit(data);
 assert.equal(f.states.at(-1).status,'disconnected');await assert.rejects(()=>f.connection.save('taskA',true));
});
test('missing source is disconnected; errors never masquerade as empty homework',()=>{
 const f=fixture();f.login('A');f.emit(null);assert.equal(f.states.at(-1).status,'disconnected');
 f.fail();assert.equal(f.states.at(-1).status,'error');f.login('B');f.emit(data);f.fail();
 assert.equal(f.states.at(-1).status,'stale');
});
