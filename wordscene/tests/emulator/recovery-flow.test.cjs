const {test}=require('node:test');
const assert=require('node:assert/strict');
const sdk=require('firebase/firestore');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const fs=require('node:fs'),path=require('node:path');
const Transport=require('../../cloud-firestore'),Sync=require('../../cloud-sync'),Backups=require('../../backup-local'),Guard=require('../../state-guard');
const valid=x=>Guard.valid(x,500);
test('real Firestore transport: backup, replacement device, damaged save and cross-account denial',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-wordscene-backup-rules',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'firestore.rules'),'utf8')}});
 try{
  const uid='recovery-test-child',auth={currentUser:{uid}},db=env.authenticatedContext(uid).firestore();
  const cloud=Transport.create({auth,db,sdk,validate:valid});
  const empty={version:5,words:{},session:null},learned={version:5,words:{cat:{trained:true,started:true,attempts:18,errors:1}},session:null};
  function device(raw){const values=new Map([['word-scenes-v5',raw],['wordscene-active-profile-v1','user:'+uid]]);const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};return {storage,engine:Sync.create({auth,cloud,storage,validate:valid}),backup:Backups.create({storage,validate:valid})}}
  const first=device(JSON.stringify(empty));assert.equal((await first.engine.bootstrapBackup()).status,'pushed');
  first.storage.setItem('word-scenes-v5',JSON.stringify(learned));assert.equal((await first.engine.syncOnce()).status,'pushed');
  const phone=device(JSON.stringify(empty));assert.equal((await phone.engine.bootstrapBackup()).status,'restore-available');
  await phone.engine.restorePrepared(await phone.engine.prepareRestore());assert.deepEqual(phone.backup.inspect().progress,learned);
  phone.backup.restore(phone.backup.rollback());assert.deepEqual(phone.backup.inspect().progress,empty);
  const damaged=device('{broken');await damaged.engine.restorePrepared(await damaged.engine.prepareRestore());assert.deepEqual(damaged.backup.inspect().progress,learned);assert.equal(JSON.parse(damaged.storage.getItem(damaged.backup.damagedKey())).raw,'{broken');
  const stranger=env.authenticatedContext('unrelated-child').firestore();await assertFails(sdk.getDoc(sdk.doc(stranger,'users',uid,'wordscene','state')));
 }finally{await env.cleanup()}
});
