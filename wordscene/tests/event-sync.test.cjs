const assert=require('node:assert/strict');
const {test}=require('node:test');
const reducer=require('../event-reducer.js').create({
 review:require('../review-engine.js'),habit:require('../habit-engine.js'),validate:x=>require('../state-guard.js').valid(x,500)
});
const {create}=require('../event-sync.js');
const baseline={version:5,words:{},reviewCycle:[],session:null,mode:'new',habit:{version:1,since:'2026-01-01',days:{}}};
function event(id,deviceId,correct,uid='A') {return {schemaVersion:2,eventId:id,uid,baselineId:'seed-1',deviceId,wordId:'mug',kind:'answer',payload:{direction:1,correct,easy:true,elapsedSeconds:null},createdAt:100}}
function setup(){
 const cloud=new Map();let serverTime=0,online=true;let user='A';
 const transport={
  async publish(events){if(!online)throw Error('offline');const ack=[],duplicates=[];for(const e of events){if(e.uid!==user)throw Error('wrong user');const old=cloud.get(e.eventId);if(old){if(JSON.stringify(old.event)!==JSON.stringify(e))throw Error('collision');duplicates.push(e.eventId)}else cloud.set(e.eventId,{event:structuredClone(e),receivedAt:++serverTime});ack.push(e.eventId)}return {acknowledged:ack,duplicates}},
  async readPage(cursor=null){if(!online)throw Error('offline');const rows=[...cloud.values()].sort((a,b)=>a.receivedAt-b.receivedAt||a.event.eventId.localeCompare(b.event.eventId));const after=cursor?rows.filter(x=>x.receivedAt>cursor.receivedAt||(x.receivedAt===cursor.receivedAt&&x.event.eventId>cursor.eventId)):rows;const selected=after.slice(0,200);return {events:selected.map(x=>structuredClone(x.event)),nextCursor:selected.length?{receivedAt:selected.at(-1).receivedAt,eventId:selected.at(-1).event.eventId}:null,done:selected.length<200}},
  setOnline:value=>online=value,setUser:value=>user=value,cloud
 };
 function device(uid,deviceId,session){
  let profile=`user:${uid}`;const values=new Map([['word-scenes-v5',JSON.stringify({...baseline,session})]]),queue=[];
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const outbox={list:()=>structuredClone(queue),acknowledge:ids=>{for(let i=queue.length-1;i>=0;i--)if(ids.includes(queue[i].eventId))queue.splice(i,1);return ids.length},queue};
  const baselines={inspect:id=>id===uid?{baselineId:'seed-1',baseline:structuredClone(baseline)}:null};
  const auth={get currentUser(){return {uid}}};
  const ledgerRows=new Map(),ledger={merge:events=>{for(const e of events)if(!ledgerRows.has(e.eventId))ledgerRows.set(e.eventId,structuredClone(e));return [...ledgerRows.values()]},list:()=>[...ledgerRows.values()]};
  return {storage,outbox,ledger,setProfile:x=>profile=x,engine:create({auth,profile:()=>profile,outbox,ledger,transport,baselines,reducer,storage,validate:x=>require('../state-guard.js').valid(x,500),now:()=>queue.length+1}),getState:()=>JSON.parse(storage.getItem('word-scenes-v5'))};
 }
 return {transport,device};
}
test('two devices converge on the same deterministic merged progress and keep local sessions',async()=>{
 const h=setup(),a=h.device('A','phone-A',{part:'new',phase:'learn',ids:[0],completed:[],errors:[],partErrors:[],learnIndex:0}),b=h.device('A','tablet-B',{part:'new',phase:'learn',ids:[1],completed:[],errors:[],partErrors:[],learnIndex:0});
 a.outbox.queue.push(event('evt-a','phone-A',true));b.outbox.queue.push(event('evt-b','tablet-B',false));
 assert.equal((await a.engine.syncOnce()).status,'applied');assert.equal((await b.engine.syncOnce()).status,'applied');
 assert.equal(a.getState().words.mug.attempts,1);assert.equal(b.getState().words.mug.attempts,2);
 assert.equal((await a.engine.syncOnce()).status,'applied');
 assert.equal(a.getState().words.mug.attempts,2);assert.deepEqual(a.getState().words.mug,b.getState().words.mug);
 assert.equal(a.getState().session.ids[0],0);assert.equal(b.getState().session.ids[0],1);
 assert.equal(a.outbox.list().length,0);assert.equal(b.outbox.list().length,0);
});
test('offline attempts preserve local progress and leave outbox events for retry',async()=>{
 const h=setup(),a=h.device('A','phone-A',null),original=a.storage.getItem('word-scenes-v5');a.outbox.queue.push(event('evt-a','phone-A',true));h.transport.setOnline(false);
 await assert.rejects(a.engine.syncOnce(),/offline/);assert.equal(a.storage.getItem('word-scenes-v5'),original);assert.equal(a.outbox.list().length,1);
 h.transport.setOnline(true);assert.equal((await a.engine.syncOnce()).status,'applied');assert.equal(a.getState().words.mug.attempts,1);assert.equal(a.outbox.list().length,0);
});
test('retries safely when the server accepted an upload but the response was lost',async()=>{
 const h=setup(),a=h.device('A','phone-A',null),original=a.storage.getItem('word-scenes-v5');a.outbox.queue.push(event('evt-a','phone-A',true));
 const publish=h.transport.publish;let loseResponse=true;h.transport.publish=async events=>{const result=await publish(events);if(loseResponse){loseResponse=false;throw Error('response lost')}return result};
 await assert.rejects(a.engine.syncOnce(),/response lost/);assert.equal(h.transport.cloud.size,1);assert.equal(a.storage.getItem('word-scenes-v5'),original);assert.equal(a.outbox.list().length,1);
 assert.equal((await a.engine.syncOnce()).status,'applied');assert.equal(a.getState().words.mug.attempts,1);assert.equal(a.outbox.list().length,0);
});
test('account switch during upload never applies or acknowledges events to the new profile',async()=>{
 const h=setup(),a=h.device('A','phone-A',null),original=a.storage.getItem('word-scenes-v5');a.outbox.queue.push(event('evt-a','phone-A',true));
 const publish=h.transport.publish;h.transport.publish=async events=>{const result=await publish(events);a.setProfile('user:B');return result};
 assert.deepEqual(await a.engine.syncOnce(),{status:'account-changed'});assert.equal(a.storage.getItem('word-scenes-v5'),original);assert.equal(a.outbox.list().length,1);
});
test('baseline mismatch blocks automatic application and retains queued events',async()=>{
 const h=setup(),a=h.device('A','phone-A',null);a.outbox.queue.push({...event('evt-a','phone-A',true),baselineId:'different-seed'});
 assert.deepEqual(await a.engine.syncOnce(),{status:'baseline-mismatch'});assert.equal(a.outbox.list().length,1);assert.equal(a.getState().words.mug,undefined);
});
