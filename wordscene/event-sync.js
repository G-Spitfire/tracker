/* Isolated event sync coordinator. Not loaded by the child app. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function create({auth,profile,outbox,ledger,transport,baselines,reducer,storage,validate,stateKey='word-scenes-v5',now=()=>Date.now()}){
 if(!auth||typeof profile!=='function'||!outbox||!ledger||!transport||!baselines||!reducer||!storage||typeof validate!=='function')throw new Error('Missing event sync dependencies');
 const activeFor=uid=>profile()===`user:${uid}`;
 const currentUid=()=>auth.currentUser?.uid||null;
 const check=(uid)=>currentUid()===uid&&activeFor(uid);
 function local(){const raw=storage.getItem(stateKey);if(raw===null)throw new Error('Local progress is missing');const state=JSON.parse(raw);if(!validate(state))throw new Error('Local progress is invalid');return {raw,state}}
 async function readAll(uid){const all=[];let cursor=null;do{const page=await transport.readPage(cursor);if(!check(uid))return null;all.push(...page.events);cursor=page.nextCursor;if(page.done)break;if(!cursor)throw new Error('Event pagination did not advance')}while(true);return all}
 function backupAndApply(uid,state){
  if(!validate(state))throw new Error('Reduced progress is invalid');
  const current=local(),backupKey=`${stateKey}-before-event-sync-${encodeURIComponent(uid)}`;
  storage.setItem(backupKey,current.raw);if(storage.getItem(backupKey)!==current.raw)throw new Error('Recovery copy verification failed');
  const next=JSON.stringify(state);
  try{storage.setItem(stateKey,next);if(storage.getItem(stateKey)!==next)throw new Error('Progress write verification failed')}
  catch(error){try{storage.setItem(stateKey,current.raw)}catch{}throw error}
  return backupKey;
 }
 async function syncOnce(){
  const uid=currentUid();if(!uid||!activeFor(uid))return {status:'idle'};
  if(storage.getItem(`wordscene-v2-journal-error-${encodeURIComponent(uid)}`)==='1')return {status:'journal-error'};
  const baseline=baselines.inspect(uid);if(!baseline)return {status:'baseline-missing'};
  const {state:before}=local(),pending=outbox.list();
  if(pending.some(e=>e.uid!==uid))throw new Error('Outbox contains events for another account');
  if(pending.some(e=>e.baselineId!==baseline.baselineId))return {status:'baseline-mismatch'};
  const known=await readAll(uid);if(!known)return {status:'account-changed'};
  if(known.some(e=>e.uid!==uid))throw new Error('Cloud contains events for another account');
  if(known.some(e=>e.baselineId!==baseline.baselineId))return {status:'baseline-mismatch'};
  const published=await transport.publish(pending);if(!check(uid))return {status:'account-changed'};
  const all=await readAll(uid);if(!all)return {status:'account-changed'};
  if(all.some(e=>e.uid!==uid))throw new Error('Cloud contains events for another account');
  if(all.some(e=>e.baselineId!==baseline.baselineId))return {status:'baseline-mismatch'};
  ledger.merge(all);
  const merged=reducer.reduce({baseline:baseline.baseline,baselineId:baseline.baselineId,events:all,uid,localState:before});
  if(!check(uid))return {status:'account-changed'};
  const unchanged=JSON.stringify(merged)===JSON.stringify(before);
  const backupKey=unchanged?null:backupAndApply(uid,merged);
  if(!check(uid))throw new Error('Account changed while applying progress');
  outbox.acknowledge(published.acknowledged);
  return {status:unchanged?'synced':'applied',events:all.length,backupKey};
 }
 return {syncOnce};
}
const api={create};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneEventSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
