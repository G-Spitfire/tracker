const assert=require('node:assert/strict');
const {test}=require('node:test');
const sync=require('../cloud-sync.js');
const stateGuard=require('../state-guard.js');
const valid=x=>stateGuard.valid(x,500);
const start={version:5,words:{},session:null};
function harness(){
 let user={uid:'A'},remote=null,reloadCount=0;
 const values=new Map([['word-scenes-v5',JSON.stringify(start)]]);
 const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const auth={get currentUser(){return user}};
 const cloud={
  async read(){if(!user)throw Error('Sign-in required');return remote?structuredClone({exists:true,...remote}):{exists:false,revision:0}},
  async write(payload,expected){if(!user)throw Error('Sign-in required');const revision=remote?.revision||0;if(revision!==expected){const e=Error('conflict');e.code='wordscene/conflict';throw e}remote={revision:revision+1,payload:structuredClone(payload)};return {revision:revision+1}}
 };
 const engine=sync.create({auth,cloud,storage,validate:valid,now:()=>123456,reload:()=>reloadCount++});
 return {engine,storage,cloud,setUser:u=>user=u,getRemote:()=>structuredClone(remote),reloads:()=>reloadCount};
}
test('local-first change uploads and updates its revision baseline',async()=>{
 const h=harness();await h.cloud.write(start,0);await h.engine.enable();
 const changed={...start,mode:'review'};h.storage.setItem('word-scenes-v5',JSON.stringify(changed));
 assert.deepEqual(await h.engine.syncOnce(),{status:'pushed',revision:2});
 assert.deepEqual(h.getRemote().payload,changed);
});
test('remote-only change is pulled after saving a local recovery copy',async()=>{
 const h=harness();await h.cloud.write(start,0);await h.engine.enable();
 await h.cloud.write({...start,mode:'review'},1);
 assert.deepEqual(await h.engine.syncOnce(),{status:'pulled',revision:2});
 assert.equal(JSON.parse(h.storage.getItem('word-scenes-v5')).mode,'review');
 assert.equal(h.storage.getItem('word-scenes-v5-before-auto-cloud-123456'),JSON.stringify(start));
 assert.equal(h.reloads(),1);
});
test('two-device conflict keeps both snapshots and pauses automatic writes',async()=>{
 const h=harness();await h.cloud.write(start,0);await h.engine.enable();
 const local={...start,localChange:true},remote={...start,remoteChange:true};
 h.storage.setItem('word-scenes-v5',JSON.stringify(local));await h.cloud.write(remote,1);
 assert.deepEqual(await h.engine.syncOnce(),{status:'conflict',revision:2});
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),local);
 assert.deepEqual(h.getRemote().payload,remote);
 const conflict=await h.engine.exportConflict();
 assert.deepEqual(conflict.local.progress,local);assert.deepEqual(conflict.cloud.progress,remote);
 assert.equal((await h.engine.resolve('local')).status,'kept-local');
 assert.deepEqual(h.getRemote().payload,local);
 assert.equal(h.engine.enabled(),true);
});
test('conflict resolution refuses stale backup if local or cloud changes',async()=>{
 const h=harness();await h.cloud.write(start,0);await h.engine.enable();
 h.storage.setItem('word-scenes-v5',JSON.stringify({...start,localChange:true}));
 await h.cloud.write({...start,remoteChange:true},1);await h.engine.syncOnce();await h.engine.exportConflict();
 h.storage.setItem('word-scenes-v5',JSON.stringify({...start,localChange:true,lateChange:true}));
 await assert.rejects(h.engine.resolve('local'),/изменились после скачивания/);
});
test('transaction race captures both copies for the conflict screen',async()=>{
 const h=harness();await h.cloud.write(start,0);await h.engine.enable();
 const local={...start,localChange:true},remote={...start,remoteChange:true};
 h.storage.setItem('word-scenes-v5',JSON.stringify(local));
 const write=h.cloud.write;
 let race=true;
 h.cloud.write=async(payload,revision)=>{if(race){race=false;await write(remote,revision)}return write(payload,revision)};
 assert.deepEqual(await h.engine.syncOnce(),{status:'conflict',revision:2});
 const capture=await h.engine.exportConflict();assert.deepEqual(capture.local.progress,local);assert.deepEqual(capture.cloud.progress,remote);
});
test('offline failure preserves the local save and retry settings',async()=>{
 const h=harness();await h.cloud.write(start,0);await h.engine.enable();
 h.cloud.read=async()=>{throw Error('offline')};
 const local={...start,offlineChange:true};h.storage.setItem('word-scenes-v5',JSON.stringify(local));
 await assert.rejects(h.engine.syncOnce(),/offline/);
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),local);
 assert.equal(h.engine.enabled(),true);
});
test('account switch cannot push another account local state',async()=>{
 const h=harness();await h.cloud.write(start,0);await h.engine.enable();
 h.setUser({uid:'B'});h.storage.setItem('word-scenes-v5',JSON.stringify({...start,changed:true}));
 assert.deepEqual(await h.engine.syncOnce(),{status:'idle'});
 assert.equal(h.getRemote().revision,1);
});
test('active session defers remote snapshot application',async()=>{
 const h=harness();
 const session={version:5,words:{},session:{part:'new',phase:'learn',ids:[0],completed:[],errors:[],partErrors:[],learnIndex:0}};
 h.storage.setItem('word-scenes-v5',JSON.stringify(session));await h.cloud.write(session,0);await h.engine.enable();
 await h.cloud.write({...start,mode:'review'},1);
 h.storage.setItem('word-scenes-v5',JSON.stringify(session));
 assert.deepEqual(await h.engine.syncOnce(),{status:'deferred'});
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),session);
});
