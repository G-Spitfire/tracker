const assert=require('node:assert/strict');
const {test}=require('node:test');
const cloud=require('../cloud-firestore.js');
const guard=require('../state-guard.js');
const valid=x=>guard.valid(x,500);
const state={version:5,words:{},session:null};
function harness(){
 let saved=null,user={uid:'test-user'};
 const auth={get currentUser(){return user}};
 const sdk={
  doc:(_db,...segments)=>segments.join('/'),
  getDoc:async()=>({exists:()=>saved!==null,data:()=>saved}),
  serverTimestamp:()=>({server:true}),
  runTransaction:async(_db,callback)=>callback({
   get:async()=>({exists:()=>saved!==null,data:()=>saved}),
   set:(_ref,value)=>{saved=value}
  })
 };
 return {api:cloud.create({auth,db:{},sdk,validate:valid}),setUser:v=>{user=v},getSaved:()=>saved};
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
