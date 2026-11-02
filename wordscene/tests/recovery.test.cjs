const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../backup-local'),S=require('../state-guard'),C=require('../cloud-sync');
const valid=x=>S.valid(x,500),state=(n=0)=>({version:5,words:{mug:{started:true,trained:true,attempts:n}},session:null});
function setup(raw=JSON.stringify(state(1))){
 const map=new Map([['word-scenes-v5',raw],['wordscene-active-profile-v1','user:A']]);
 const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
 let user={uid:'A'},remote={exists:true,revision:1,payload:state(8)},reloads=0;
 const cloud={read:async()=>structuredClone(remote),write:async(payload,revision)=>{if(remote.revision!==revision)throw Error('race');remote={exists:true,revision:revision+1,payload:structuredClone(payload)};return {revision:remote.revision}}};
 const engine=C.create({storage,auth:{get currentUser(){return user}},cloud,validate:valid,canSync:uid=>storage.getItem('wordscene-active-profile-v1')==='user:'+uid,reload:()=>reloads++});
 const device=B.create({storage,validate:valid});
 return {storage,map,engine,device,cloud,remote:()=>remote,setRemote:x=>remote=x,setUser:x=>user=x,reloads:()=>reloads};
}
test('a replacement phone restores cloud progress in one confirmed operation and supports undo',async()=>{
 const h=setup(JSON.stringify({version:5,words:{},session:null})),before=h.storage.getItem('word-scenes-v5');
 const ticket=await h.engine.prepareRestore();await h.engine.restorePrepared(ticket);
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),state(8));assert.equal(h.reloads(),1);
 h.device.restore(h.device.rollback());assert.equal(h.storage.getItem('word-scenes-v5'),before);
});
for(const raw of ['{broken',JSON.stringify({...state(1),session:{part:'review',phase:'round',ids:[0],completed:[],errors:[],partErrors:[]}})])test('damaged active progress can be recovered without deleting its bytes: '+raw.slice(0,15),async()=>{
 const h=setup(raw);await h.engine.restorePrepared(await h.engine.prepareRestore());
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),state(8));
 assert.equal(JSON.parse(h.storage.getItem(h.device.damagedKey())).raw,raw);
});
test('a damaged active save can also be restored from a healthy file',()=>{
 const h=setup('{broken');const file={format:'wordscene-backup',version:1,progress:state(12)};
 h.device.restore(h.device.preview(JSON.stringify(file)));assert.equal(h.device.inspect().progress.words.mug.attempts,12);
});
test('recovery never replaces an existing healthy rollback with damaged bytes',()=>{
 const h=setup();h.device.restore(h.device.preview(JSON.stringify({format:'wordscene-backup',version:1,progress:state(2)})));
 const rollback=h.storage.getItem(h.device.rollbackKey());h.storage.setItem('word-scenes-v5','{broken');
 h.device.restore(h.device.preview(JSON.stringify({format:'wordscene-backup',version:1,progress:state(3)})));
 assert.equal(h.storage.getItem(h.device.rollbackKey()),rollback);h.device.restore(h.device.rollback());assert.deepEqual(h.device.inspect().progress,state(1));
});
test('downloaded archives expose both versions as normal restorable backups',()=>{
 const h=setup();const archive={format:'wordscene-conflict',version:1,uid:'A',versions:[{uid:'A',local:{progress:state(2)},cloud:{progress:state(7)}}]};
 const choices=h.device.candidates(JSON.stringify(archive));assert.equal(choices.length,2);
 h.device.restore(h.device.preview(JSON.stringify(choices[1].backup)));assert.deepEqual(h.device.inspect().progress,state(7));
});
test('a single damaged archive entry rejects the complete file before any replacement',()=>{
 const h=setup(),before=h.storage.getItem('word-scenes-v5');
 assert.throws(()=>h.device.candidates(JSON.stringify({format:'wordscene-conflict',version:1,versions:[{local:{progress:state()},cloud:{progress:{version:5,words:null}}}]})));
 assert.equal(h.storage.getItem('word-scenes-v5'),before);
});
test('changing account, local progress or remote revision invalidates a confirmed preview',async()=>{
 for(const kind of ['account','local','remote']){
  const h=setup(),ticket=await h.engine.prepareRestore();
  if(kind==='account')h.setUser({uid:'B'});
  if(kind==='local')h.storage.setItem('word-scenes-v5',JSON.stringify(state(22)));
  if(kind==='remote')h.setRemote({exists:true,revision:2,payload:state(23)});
  const before=h.storage.getItem('word-scenes-v5');await assert.rejects(h.engine.restorePrepared(ticket));assert.equal(h.storage.getItem('word-scenes-v5'),before);
 }
});
test('storage quota failure leaves the active save and cloud copy intact',async()=>{
 const h=setup(),ticket=await h.engine.prepareRestore(),before=h.storage.getItem('word-scenes-v5');h.storage.setItem=()=>{throw Error('quota')};
 await assert.rejects(h.engine.restorePrepared(ticket));assert.equal(h.storage.getItem('word-scenes-v5'),before);assert.deepEqual(h.remote().payload,state(8));
});
test('a failed active-key write is rolled back to the exact original bytes',()=>{
 const h=setup(),before=h.storage.getItem('word-scenes-v5'),ticket=h.device.preview(JSON.stringify({format:'wordscene-backup',version:1,progress:state(99)}));
 const set=h.storage.setItem;let fail=true;h.storage.setItem=(k,v)=>{if(k==='word-scenes-v5'&&fail){fail=false;throw Error('quota')}return set(k,v)};
 assert.throws(()=>h.device.restore(ticket));assert.equal(h.storage.getItem('word-scenes-v5'),before);
});
test('keeping the device version preserves the displaced cloud version without mandatory download',async()=>{
 const h=setup();await h.engine.keepPrepared(await h.engine.prepareRestore());
 assert.deepEqual(h.remote().payload,state(1));assert.deepEqual(h.engine.getConflictHistory('A')[0].cloud.progress,state(8));assert.equal(h.engine.enabled(),true);
});
test('repeated version conflicts retain at most three historical pairs',async()=>{
 const h=setup();
 for(let i=1;i<=20;i++){
  h.storage.setItem('word-scenes-v5',JSON.stringify(state(i)));h.setRemote({exists:true,revision:i,payload:state(i+100)});
  await h.engine.bootstrapBackup();
 }
 assert.equal(h.engine.getConflictHistory('A').length,3);
 assert.equal(h.storage.getItem('word-scenes-v5'),JSON.stringify(state(20)));
});
test('validation rejects impossible phase combinations and malformed queues before restore',()=>{
 const base={part:'review',phase:'test',ids:[0],completed:[],errors:[],partErrors:[],queue:[{i:0,dir:1}],pos:0};
 assert.equal(valid({...state(),session:base}),true);
 for(const session of [{...base,phase:'round'},{...base,phase:'learn',learnIndex:0},{...base,queue:[{i:499,dir:0}]},{...base,reviewProgress:{0:{first:null}}},{...base,part:'new',phase:'round',dir:0,round:1,history:[[],[]]}])assert.equal(valid({...state(),session}),false);
 assert.equal(valid({...state(),version:999}),false);
});
