const test=require('node:test'),assert=require('node:assert/strict');
const E=require('./engine.js'),S=require('./sync.js'),F=require('./cloud-firestore.js');
const memory=()=>{const map=new Map();return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
function transport(){
 let payload=null,revision=0;
 return {read:async()=>payload?{exists:true,revision,payload:JSON.parse(JSON.stringify(payload))}:{exists:false,revision:0},
 write:async(_uid,p,expected)=>{if(expected!==revision){const e=Error('Revision conflict');e.code='wordscene17/conflict';throw e}revision++;payload=JSON.parse(JSON.stringify(p));return {revision}},
 force:p=>{payload=JSON.parse(JSON.stringify(p));revision++}};
}
test('initial upload and idempotent subsequent sync',async()=>{
 const storage=memory(),remote=transport();let p=E.empty();
 const sync=S.create({storage,uid:()=> 'child',local:()=>p,transport:remote,restore:async x=>p=x});
 assert.equal((await sync.sync()).status,'uploaded');assert.equal((await sync.sync()).status,'same');
});
test('pristine local account can restore existing cloud snapshot',async()=>{
 const storage=memory(),remote=transport(),cloud=E.empty();cloud.words.apple={origin:'known',schedule:E.newSchedule(Date.now())};cloud.revision++;
 await remote.write('child',cloud,0);let p=E.empty();
 const sync=S.create({storage,uid:()=> 'child',local:()=>p,transport:remote,restore:async x=>p=x});
 assert.equal((await sync.sync()).status,'restored');assert.ok(p.words.apple);
});
test('concurrent device edits are archived and never overwritten',async()=>{
 const storage=memory(),remote=transport();let p=E.empty();
 const sync=S.create({storage,uid:()=> 'child',local:()=>p,transport:remote,restore:async x=>p=x});
 await sync.sync();p.words.apple={origin:'known',schedule:E.newSchedule(Date.now())};p.revision++;
 const remoteState=E.empty();remoteState.words.cat={origin:'known',schedule:E.newSchedule(Date.now())};remoteState.revision++;
 remote.force(remoteState);
 assert.equal((await sync.sync()).status,'conflict');assert.ok(sync.getConflict().local.words.apple);assert.ok(sync.getConflict().cloud.payload.words.cat);
});
test('active unfinished sessions are never synchronized',async()=>{
 const storage=memory(),remote=transport();let p=E.empty();
 const sync=S.create({storage,uid:()=> 'child',local:()=>p,transport:remote,restore:async()=>{},active:()=>true});
 assert.equal((await sync.sync()).status,'session-active');assert.equal((await remote.read()).exists,false);
});
test('Firestore nested array codec preserves review data',()=>{
 const p={words:{apple:{history:[{answers:[{dir:1,ok:true},{dir:0,ok:false}]}]}},sessions:[{ids:['a','b']}]};
 assert.deepEqual(F.decode(F.encode(p)),p);
});
test('resolution requires matching snapshots and preserves the other copy',async()=>{
 const storage=memory(),remote=transport(),local=E.empty(),cloud=E.empty();
 local.words.apple={origin:'known'};
 cloud.words.cat={origin:'known'};
 remote.force(cloud);
 let p=local;
 const sync=S.create({storage,uid:()=> 'child',local:()=>p,transport:remote,restore:x=>p=x});
 assert.equal((await sync.sync()).status,'conflict');
 const stale=sync.getConflict();
 remote.force(cloud);
 assert.equal((await sync.sync('cloud',stale)).status,'local-changed');
 assert.ok(p.words.apple);
 assert.equal((await sync.sync()).status,'conflict');
 assert.equal((await sync.sync('cloud',sync.getConflict())).status,'restored');
 assert.ok(p.words.cat);
 assert.ok(sync.getConflict().local.words.apple);
});

test('explicit local resolution uses compare-and-set',async()=>{
 const storage=memory(),remote=transport(),local=E.empty(),cloud=E.empty();
 local.words.apple={origin:'known'};
 cloud.words.cat={origin:'known'};
 remote.force(cloud);
 const sync=S.create({storage,uid:()=> 'child',local:()=>local,transport:remote,restore:()=>assert.fail()});
 assert.equal((await sync.sync()).status,'conflict');
 assert.equal((await sync.sync('local',sync.getConflict())).status,'uploaded');
 assert.ok((await remote.read()).payload.words.apple);
 assert.ok(sync.getConflict().cloud.payload.words.cat);
});

test('Firestore transport uses the signed-in UID and isolated path',async()=>{
 globalThis.WS17Sync=S;
 const auth={currentUser:{uid:'child'}},payload=E.empty(),paths=[];
 let data;
 const snapshot=()=>({exists:()=>!!data,data:()=>data});
 const sdk={
  doc:(_db,...path)=>{paths.push(path);return path},
  getDocFromServer:async()=>snapshot(),
  runTransaction:async(_db,run)=>run({get:async()=>snapshot(),set:(_ref,value)=>{data=value}}),
  serverTimestamp:()=>0
 };
 const t=F.create({db:{},auth,sdk});
 assert.deepEqual(await t.read('child'),{exists:false,revision:0});
 assert.deepEqual(await t.write('child',payload,0),{revision:1});
 assert.deepEqual((await t.read('child')).payload,payload);
 await assert.rejects(t.write('child',payload,0),{code:'wordscene17/conflict'});
 await assert.rejects(t.read('other'),/Account switched/);
 assert.ok(paths.every(p=>p.join('/')==='users/child/wordscene17/state'));
 delete globalThis.WS17Sync;
});

test('Firestore reports a denied racing write as a conflict only if the revision moved',async()=>{
 globalThis.WS17Sync=S;
 try{
  const payload=E.empty();
  let revision=2;
  const denied=Object.assign(Error('Permission denied'),{code:'permission-denied'});
  const sdk={
   doc:()=>({}),
   getDocFromServer:async()=>({exists:()=>true,data:()=>({schemaVersion:17,revision,payload})}),
   runTransaction:async()=>{throw denied},
   serverTimestamp:()=>0
  };
  const t=F.create({db:{},auth:{currentUser:{uid:'child'}},sdk});
  await assert.rejects(t.write('child',payload,2),err=>err===denied);
  revision++;
  await assert.rejects(t.write('child',payload,2),{code:'wordscene17/conflict'});
 }finally{delete globalThis.WS17Sync}
});
