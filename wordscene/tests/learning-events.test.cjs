const assert=require('node:assert/strict');
const {test}=require('node:test');
const {create:makeOutbox}=require('../event-outbox.js');
const {create:makeLedger}=require('../event-ledger.js');
const {create:makeRecorder}=require('../learning-events.js');
function harness(){
 const values=new Map();let profile='guest',seq=0;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const active=()=>profile==='guest'?'guest':profile.slice(5),outbox=makeOutbox({storage,uid:active,deviceId:()=>storage.getItem('wordscene-v2-device-id')||'missing',baselineId:()=>`base-${profile}`,makeId:()=>`random-${++seq}`,now:()=>123});
 const ledger=makeLedger({storage,profile:active});
 const recorder=makeRecorder({storage,outbox,ledger,profile:()=>profile,makeId:()=>`device-${++seq}`});
 return {storage,outbox,ledger,recorder,setProfile:x=>profile=x};
}
test('records only profile-local confirmed actions and can safely retry the same action',()=>{
 const h=harness(),action={kind:'answer',wordId:'mug',sessionId:'lesson-1',actionId:'new-test-0',payload:{correct:true}};
 const first=h.recorder.record(action),again=h.recorder.record(action);
 assert.deepEqual(again,first);assert.equal(h.outbox.list().length,1);assert.equal(h.ledger.list().length,1);assert.equal(first.uid,'guest');
 assert.equal(first.deviceId,h.recorder.deviceId());
 h.outbox.acknowledge([first.eventId]);assert.deepEqual(h.recorder.record(action),first);assert.equal(h.outbox.list().length,0);
});
test('account switch routes new events to a separate outbox without moving prior events',()=>{
 const h=harness();h.recorder.record({kind:'answer',wordId:'mug',sessionId:'one',actionId:'answer',payload:{correct:true}});
 h.setProfile('user:uid-A');h.recorder.record({kind:'answer',wordId:'book',sessionId:'two',actionId:'answer',payload:{correct:false}});
 assert.equal(h.outbox.list().length,1);assert.equal(h.outbox.list()[0].uid,'uid-A');
 h.setProfile('guest');assert.equal(h.outbox.list().length,1);assert.equal(h.outbox.list()[0].wordId,'mug');assert.equal(h.ledger.list().length,1);
});
