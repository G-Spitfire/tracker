const assert=require('node:assert/strict');
const {test}=require('node:test');
const cloud=require('../cloud-firestore.js');
const guard=require('../state-guard.js');
const valid=x=>guard.valid(x,500);
const state={version:5,words:{},session:null};
function harness(){
 const saved=new Map();let user={uid:'test-user'};
 const auth={get currentUser(){return user}};
 const sdk={
  doc:(_db,...segments)=>segments.join('/'),
  getDoc:async(path)=>({exists:()=>saved.has(path),data:()=>saved.get(path)}),
  serverTimestamp:()=>({server:true}),
  runTransaction:async(_db,callback)=>callback({
   get:async(path)=>({exists:()=>saved.has(path),data:()=>saved.get(path)}),
   set:(path,value)=>{saved.set(path,value)}
  })
 };
 return {api:cloud.create({auth,db:{},sdk,validate:valid}),setUser:v=>{user=v},getSaved:(uid='test-user')=>saved.get(`users/${uid}/wordscene/state`)||null};
}
test('requires sign-in and preserves empty cloud',async()=>{
 const h=harness();h.setUser(null);await assert.rejects(h.api.read(),/Sign-in/);
 h.setUser({uid:'test-user'});assert.deepEqual(await h.api.read(),{exists:false,revision:0});
});
test('first upload and download',async()=>{
 const h=harness();assert.deepEqual(await h.api.write(state,0),{revision:1});
 assert.equal((await h.api.read()).revision,1);
 assert.deepEqual((await h.api.read()).payload,state);
});
test('conflict blocks overwrite',async()=>{
 const h=harness();await h.api.write(state,0);
 await assert.rejects(h.api.write(state,0),e=>e.code==='wordscene/conflict');
 assert.equal(h.getSaved().revision,1);
});
test('invalid payload never uploaded',async()=>{
 const h=harness();await assert.rejects(h.api.write({words:null},0),/Invalid local/);
 assert.equal(h.getSaved(),null);
});
test('rejects invalid UID',async()=>{
 const h=harness();h.setUser({uid:'../other'});await assert.rejects(h.api.read(),/Invalid UID/);
});

test('round-trips nested arrays without forbidden Firestore field names',async()=>{
 const h=harness();
 const nested={...state,words:{0:{times:{0:[[1,2],[3]],1:[]}}}};
 assert.equal(valid(nested),true);
 await h.api.write(nested,0);
 const saved=h.getSaved();
 assert.deepEqual(saved.payload.words['0'].times['0'][0],{wordsceneNestedArrayV1:[1,2]});
 assert.deepEqual((await h.api.read()).payload,nested);
});
test('preserves state after conflicting remote revision',async()=>{
 const h=harness();
 await h.api.write(state,0);
 await assert.rejects(h.api.write({...state,mode:'review'},0),e=>e.code==='wordscene/conflict');
 assert.deepEqual((await h.api.read()).payload,state);
});

test('rejects payloads before reaching the Firestore document-size limit',async()=>{
 const h=harness();
 const oversized={...state,extra:'x'.repeat(900*1024)};
 await assert.rejects(h.api.write(oversized,0),/safe Firestore document size/);
 assert.equal(h.getSaved(),null);
});

test('each authenticated UID reads and writes a separate document',async()=>{
 const h=harness();
 await h.api.write({...state,owner:'A'},0);
 h.setUser({uid:'second-user'});
 assert.deepEqual(await h.api.read(),{exists:false,revision:0});
 await h.api.write({...state,owner:'B'},0);
 assert.equal(h.getSaved('test-user').payload.owner,'A');
 assert.equal(h.getSaved('second-user').payload.owner,'B');
 h.setUser({uid:'test-user'});
 assert.equal((await h.api.read()).payload.owner,'A');
});
