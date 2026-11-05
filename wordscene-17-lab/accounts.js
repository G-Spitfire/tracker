/* Pure, account-scoped local persistence. Never reads or writes WordScene 16.x keys. */
(function(root){
'use strict';
const PREFIX='wordscene-17-lab-account-v1:',ACTIVE='wordscene-17-lab-account-active-v1:';
const clone=x=>JSON.parse(JSON.stringify(x));
/* Validate persisted learning invariants before allowing a damaged profile to be edited.
   Historical optional fields are preserved unchanged. */
function validProfile(p){
 const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const date=x=>typeof x==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
 if(!obj(p)||p.version!==17||!Number.isSafeInteger(p.revision)||p.revision<0||
    !['novice','experienced','pro'].includes(p.level)||!obj(p.words)||
    !Array.isArray(p.sessions)||!Array.isArray(p.levels))return false;
 if(!Object.values(p.words).every(w=>{
   if(!obj(w)||!['learned','known'].includes(w.origin))return false;
   if(w.history!==undefined&&!Array.isArray(w.history))return false;
   if(w.schedule!==undefined){
     const s=w.schedule;
     if(!obj(s)||!['daily','repair','spaced'].includes(s.stage)||!date(s.nextDay)||
        !Array.isArray(s.days)||!Array.isArray(s.checks))return false;
   }
   return true;
 }))return false;
 return p.sessions.every(s=>obj(s)&&typeof s.id==='string'&&s.id.length>0&&
   ['new','review'].includes(s.mode)&&Number.isFinite(s.at)&&
   Array.isArray(s.ids)&&s.ids.every(id=>typeof id==='string')&&
   Number.isSafeInteger(s.successful)&&s.successful>=0);
}
function create({storage,empty,valid,keyFor}){
 if(!storage||typeof empty!=='function'||typeof valid!=='function')throw Error('Missing dependencies');
 const id=u=>{if(typeof u!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(u))throw Error('Invalid account identifier');return u};
 const keys=u=>{const v=id(u);return keyFor?keyFor(v):{main:PREFIX+v+':main',backup:PREFIX+v+':backup',active:ACTIVE+v}};
 const parse=raw=>{if(raw===null)return null;try{const v=JSON.parse(raw);return valid(v)?v:null}catch{return null}};
 function inspect(uid){
  const k=keys(uid),raw=storage.getItem(k.main),backupRaw=storage.getItem(k.backup),profile=parse(raw),backup=parse(backupRaw);
  return {status:raw===null?'new':profile?'ok':backup?'recoverable':'corrupt',profile,backup,keys:k};
 }
 function load(uid){
  const info=inspect(uid);
  if(info.status==='corrupt'||info.status==='recoverable')return {status:info.status,profile:null,backup:info.backup};
  const active=storage.getItem(info.keys.active);
  let session=null;
  if(active!==null){try{session=JSON.parse(active)}catch{return {status:'corrupt-session',profile:info.profile,session:null}}}
  if(session&&info.profile?.sessions.some(entry=>entry.id===session.id))session=null;
  return {status:info.status,profile:info.profile||empty(),session};
 }
 function save(uid,p,session=null,expectedRaw,expectedActive){
  if(!valid(p))throw Error('Invalid profile');
  const info=inspect(uid);
  if(!['new','ok'].includes(info.status))throw Error('Storage requires recovery');
  const k=info.keys,current=storage.getItem(k.main);
  if(expectedRaw!==undefined&&current!==expectedRaw)throw Error('Profile changed in another tab');
  if(expectedActive!==undefined&&storage.getItem(k.active)!==expectedActive)throw Error('Session changed in another tab');
  const next=JSON.stringify(p);
  if(next!==current){
   if(current!==null)storage.setItem(k.backup,current);
   storage.setItem(k.main,next);
  }
  if(session)storage.setItem(k.active,JSON.stringify(session));else storage.removeItem(k.active);
  return true;
 }
 function recover(uid){
  const info=inspect(uid);if(info.status!=='recoverable'||!info.backup)throw Error('No valid backup to restore');
  const k=info.keys;
  // Preserve corrupt primary for later forensic export; do not overwrite it silently.
  const damaged=storage.getItem(k.main),archive=k.main+':damaged:'+Date.now();
  storage.setItem(archive,damaged);
  storage.setItem(k.main,JSON.stringify(info.backup));
  storage.removeItem(k.active);
  return {profile:clone(info.backup),archive};
 }
 function exportData(uid){const k=keys(uid);return JSON.stringify({format:'wordscene17-local-backup',uid,exportedAt:new Date().toISOString(),main:storage.getItem(k.main),backup:storage.getItem(k.backup),active:storage.getItem(k.active)},null,2)}
 return {keys,inspect,load,save,recover,exportData};
}
const api={create,validProfile};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WS17Accounts=api;
})(typeof globalThis!=='undefined'?globalThis:this);