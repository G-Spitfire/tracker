/* WordScene 17 cloud synchronization core: offline-first, no silent overwrites. */
(function(root){
'use strict';
const PREFIX='wordscene-17-lab-sync-', CONFLICT='wordscene-17-lab-conflict-';
const copy=x=>JSON.parse(JSON.stringify(x));
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const valid=p=>record(p)&&p.version===17&&Number.isSafeInteger(p.revision)&&p.revision>=0&&
 ['novice','experienced','pro'].includes(p.level)&&Array.isArray(p.levels)&&
 record(p.words)&&Object.values(p.words).every(w=>record(w)&&['known','learned'].includes(w.origin)&&
  (!w.history||Array.isArray(w.history))&&(!w.schedule||typeof w.schedule.nextDay==='string'))&&
 Array.isArray(p.sessions)&&p.sessions.every(s=>record(s)&&typeof s.id==='string'&&
  ['new','review'].includes(s.mode)&&Number.isFinite(s.at)&&Array.isArray(s.ids)&&
  s.ids.every(id=>typeof id==='string')&&Number.isInteger(s.successful));
const clean=p=>valid(p)&&p.sessions.length===0&&Object.keys(p.words).length===0;
function create({storage,uid,local,transport,restore,active=()=>false}){
 if(!storage||typeof uid!=='function'||typeof local!=='function'||!transport||typeof restore!=='function')throw Error('Missing sync dependencies');
 const user=()=>{const u=uid();if(typeof u!=='string'||!u||u.includes('/'))throw Error('Sign in required');return u};
 const key=u=>PREFIX+encodeURIComponent(u);
 const conflictKey=u=>CONFLICT+encodeURIComponent(u);
 const getMeta=u=>{try{return JSON.parse(storage.getItem(key(u))||'null')}catch{return null}};
 const setMeta=(u,revision,p)=>storage.setItem(key(u),JSON.stringify({uid:u,revision,baseline:stable(p)}));
 const conflict=(u,l,r,reason)=>{
  const capture={uid:u,at:Date.now(),reason,local:copy(l),cloud:r.exists?{revision:r.revision,payload:copy(r.payload)}:null};
  storage.setItem(conflictKey(u),JSON.stringify(capture));return {status:'conflict',reason};
 };
 async function sync(choice, captured){
  if(active())return {status:'session-active'};
  const u=user(),p=copy(local());if(!valid(p))throw Error('Invalid local profile');
  const fingerprint=stable(p),meta=getMeta(u),remote=await transport.read(u);
  if(uid()!==u||active()||fingerprint!==stable(local()))return {status:'local-changed'};
  if(remote.exists&&(!valid(remote.payload)||!Number.isSafeInteger(remote.revision)))throw Error('Invalid remote profile');
  if(choice){
   if(!captured||captured.uid!==u||stable(captured.local)!==fingerprint||
      captured.cloud?.revision!==(remote.exists?remote.revision:undefined)||
      (remote.exists&&stable(captured.cloud.payload)!==stable(remote.payload)))return {status:'local-changed'};
   // The captured copies are retained even after an explicit resolution.
   if(choice==='cloud'&&remote.exists){
    await restore(copy(remote.payload));
    setMeta(u,remote.revision,remote.payload);
    return {status:'restored',revision:remote.revision};
   }
   if(choice!=='local')throw Error('Invalid conflict resolution');
  }
  if(!remote.exists){
   if(meta?.revision&&!choice)return conflict(u,p,remote,'remote-missing');
   let sent;
   try{sent=await transport.write(u,p,0)}
   catch(e){
    if(e.code==='wordscene17/conflict')return conflict(u,p,await transport.read(u),'write-conflict');
    throw e;
   }
   const verify=await transport.read(u);
   if(uid()!==u||!verify.exists||verify.revision!==sent.revision||stable(verify.payload)!==fingerprint)throw Error('Cloud confirmation failed');
   setMeta(u,sent.revision,p);return {status:'uploaded',revision:sent.revision};
  }
  const remoteFp=stable(remote.payload);
  if(!meta&&!choice){
   if(fingerprint===remoteFp){setMeta(u,remote.revision,p);return {status:'same',revision:remote.revision}}
   if(clean(p)){
    if(active()||stable(local())!==fingerprint)return {status:'local-changed'};
    await restore(copy(remote.payload));
    if(uid()!==u)throw Error('Account changed during restore');
    setMeta(u,remote.revision,remote.payload);return {status:'restored',revision:remote.revision};
   }
   return conflict(u,p,remote,'unpaired-different');
  }
  if(!choice&&(meta.uid!==u||!Number.isSafeInteger(meta.revision)))throw Error('Invalid sync metadata');
  if(!choice&&meta.revision!==remote.revision){
   if(fingerprint===remoteFp){setMeta(u,remote.revision,p);return {status:'same',revision:remote.revision}}
   if(fingerprint===meta.baseline)return conflict(u,p,remote,'remote-newer');
   return conflict(u,p,remote,'concurrent-changes');
  }
  if(fingerprint===remoteFp){setMeta(u,remote.revision,p);return {status:'same',revision:remote.revision}}
  if(!choice&&meta.baseline!==remoteFp)return conflict(u,p,remote,'baseline-mismatch');
  if(active()||fingerprint!==stable(local()))return {status:'local-changed'};
  try{
   const sent=await transport.write(u,p,remote.revision);
   const verify=await transport.read(u);
   if(uid()!==u||!verify.exists||verify.revision!==sent.revision||stable(verify.payload)!==fingerprint)throw Error('Cloud confirmation failed');
   setMeta(u,sent.revision,p);return {status:'uploaded',revision:sent.revision};
  }catch(e){
   if(e.code==='wordscene17/conflict'){const newer=await transport.read(u);return conflict(u,p,newer,'write-conflict')}
   throw e;
  }
 }
 function getConflict(){const u=user();try{return JSON.parse(storage.getItem(conflictKey(u))||'null')}catch{return null}}
 return {sync,getConflict,stable,valid};
}
const api={create,stable,valid};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WS17Sync=api;
})(typeof globalThis!=='undefined'?globalThis:this);