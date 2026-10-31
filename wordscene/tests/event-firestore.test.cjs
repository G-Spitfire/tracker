const assert=require('node:assert/strict');
const {test}=require('node:test');
const {create}=require('../event-firestore.js');
function harness(){
 const rows=new Map();let user={uid:'A'},stamp=0;
 const key=segments=>segments.join('/');
 const sdk={
  doc:(_db,...segments)=>key(segments),collection:(_db,...segments)=>({path:key(segments)}),
  getDoc:async path=>({exists:()=>rows.has(path),data:()=>rows.get(path)}),
  runTransaction:async(_db,fn)=>fn({get:async path=>({exists:()=>rows.has(path),data:()=>rows.get(path)}),set:(path,value)=>rows.set(path,value)}),
  serverTimestamp:()=>++stamp,documentId:()=>'$documentId',orderBy:field=>({type:'orderBy',field}),
  startAfter:(...values)=>({type:'startAfter',values}),limit:value=>({type:'limit',value}),
  query:(collection,...constraints)=>({collection,constraints}),
  getDocs:async spec=>{
   const all=[...rows.entries()].filter(([path])=>path.startsWith(spec.collection.path+'/')).map(([path,value])=>({id:path.split('/').at(-1),data:()=>value}));
   all.sort((a,b)=>a.data().receivedAt-b.data().receivedAt||a.id.localeCompare(b.id));
   const after=spec.constraints.find(x=>x.type==='startAfter')?.values;
   const filtered=after?all.filter(x=>x.data().receivedAt>after[0]||(x.data().receivedAt===after[0]&&x.id>after[1])):all;
   const size=spec.constraints.find(x=>x.type==='limit')?.value||200;
   return {docs:filtered.slice(0,size)};
  }
 };
 const auth={get currentUser(){return user}},transport=create({auth,db:{},sdk});
 return {transport,rows,setUser:value=>user=value};
}
const event=(eventId='e1',uid='A')=>({schemaVersion:2,eventId,uid,baselineId:'baseline-1',deviceId:'phone-1',wordId:'mug',kind:'answer',payload:{correct:true},createdAt:123});

test('publishes each event idempotently and acknowledges duplicate retries',async()=>{
 const h=harness(),one=event();
 assert.deepEqual(await h.transport.publish([one]),{acknowledged:['e1'],duplicates:[]});
 assert.deepEqual(await h.transport.publish([one]),{acknowledged:['e1'],duplicates:['e1']});
 assert.equal(h.rows.size,1);
});
test('refuses an event id reused with different data without overwriting the original',async()=>{
 const h=harness();await h.transport.publish([event()]);
 await assert.rejects(h.transport.publish([{...event(),payload:{correct:false}}]),e=>e.code==='wordscene/event-id-collision');
 assert.equal(h.rows.get('users/A/wordsceneEvents/e1').payload.correct,true);
});
test('rejects foreign, unsigned and malformed events before writing',async()=>{
 const h=harness();await assert.rejects(h.transport.publish([event('e1','B')]),/another account/);
 h.setUser(null);await assert.rejects(h.transport.publish([event()]),/Sign-in/);
 h.setUser({uid:'A'});await assert.rejects(h.transport.publish([{...event(),eventId:'bad/id'}]),/Invalid event ID/);
 assert.equal(h.rows.size,0);
});
test('reads events in stable server-receipt pages and validates account ownership',async()=>{
 const h=harness();await h.transport.publish([event('e1'),event('e2')]);
 const first=await h.transport.readPage();assert.equal(first.events.length,2);assert.equal(first.done,true);
 assert.equal(first.events[0].eventId,'e1');assert.equal(first.events[1].eventId,'e2');
 h.setUser({uid:'B'});assert.deepEqual((await h.transport.readPage()).events,[]);
});
test('refuses oversized events before writing',async()=>{
 const h=harness(),huge={...event(),payload:{note:'x'.repeat(70*1024)}};
 await assert.rejects(h.transport.publish([huge]),/safe Firestore size/);
 assert.equal(h.rows.size,0);
});
