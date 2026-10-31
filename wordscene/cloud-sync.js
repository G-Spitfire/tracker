/* Local-first snapshot sync. A conflict is captured and stopped, never guessed. */
(function(root){
'use strict';
const KEY='wordscene-sync-v1',CONFLICT_KEY='wordscene-conflict-v1';
const copy=x=>JSON.parse(JSON.stringify(x));
function stable(x){return JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)}
function create({auth,cloud,storage,validate,now=()=>Date.now(),reload=()=>{}}){
 if(!auth||!cloud||!storage||typeof validate!=='function')throw new Error('Missing sync dependencies');
 let busy=false;
 const uid=()=>auth.currentUser?.uid||null;
 const settings=()=>{try{return JSON.parse(storage.getItem(KEY)||'null')}catch{return null}};
 const saveSettings=value=>storage.setItem(KEY,JSON.stringify(value));
 const local=()=>{const raw=storage.getItem('word-scenes-v5');if(!raw)throw new Error('Локальное сохранение отсутствует');const value=JSON.parse(raw);if(!validate(value))throw new Error('Локальные данные повреждены');return {raw,value,fingerprint:stable(value)}};
 const enabled=()=>{const user=uid(),s=settings();return !!user&&s?.uid===user&&Number.isSafeInteger(s.revision)&&s.revision>0};
 function captureConflict(localCopy,remote){
  const user=uid();if(!user)throw new Error('Аккаунт изменился');
  const capture={version:1,uid:user,capturedAt:new Date(now()).toISOString(),local:{savedAt:new Date(now()).toISOString(),progress:copy(localCopy.value)},cloud:{revision:remote.revision,progress:copy(remote.payload)}};
  storage.setItem(CONFLICT_KEY,JSON.stringify(capture));
  storage.removeItem(KEY);
  return capture;
 }
 async function exportConflict(){
  const user=uid();if(!user)throw new Error('Сначала войдите в аккаунт');
  const old=await getConflict();if(!old||old.uid!==user)throw new Error('Для этого аккаунта нет сохранённого конфликта');
  const remote=await cloud.read();if(uid()!==user||!remote.exists)throw new Error('Не удалось прочитать актуальную облачную копию');
  const current=local(),capture={version:1,uid:user,capturedAt:new Date(now()).toISOString(),local:{progress:copy(current.value)},cloud:{revision:remote.revision,progress:copy(remote.payload)}};
  storage.setItem(CONFLICT_KEY,JSON.stringify(capture));return copy(capture);
 }
 async function enable(){
  const user=uid();if(!user)throw new Error('Сначала войдите в аккаунт');
  const remote=await cloud.read();if(!remote.exists)throw new Error('Сначала создайте облачную копию');
  const current=local();if(current.fingerprint!==stable(remote.payload))throw new Error('Локальная и облачная копии отличаются. Сначала разрешите конфликт.');
  if(uid()!==user)throw new Error('Аккаунт изменился');
  saveSettings({uid:user,revision:remote.revision,baseline:current.fingerprint});return remote.revision;
 }
 function disable(){storage.removeItem(KEY)}
 async function syncOnce(){
  if(busy||!enabled())return {status:'idle'};
  busy=true;let syncUid=null;
  try{
   const initial=uid(),setting=settings();syncUid=initial;if(!setting||setting.uid!==initial)return {status:'account-changed'};
   const remote=await cloud.read();if(uid()!==initial)return {status:'account-changed'};
   if(!remote.exists)throw new Error('Облачная копия исчезла');
   const current=local(),remoteFingerprint=stable(remote.payload);
   if(remote.revision!==setting.revision){
    if(current.fingerprint===remoteFingerprint){saveSettings({uid:initial,revision:remote.revision,baseline:current.fingerprint});return {status:'same',revision:remote.revision}}
    if(current.fingerprint===setting.baseline){
     if(current.value.session||remote.payload.session)return {status:'deferred'};
     storage.setItem('word-scenes-v5-before-auto-cloud-'+now(),current.raw);
     if(storage.getItem('word-scenes-v5')!==current.raw)return {status:'local-changed'};
     const next=JSON.stringify(remote.payload);storage.setItem('word-scenes-v5',next);
     if(storage.getItem('word-scenes-v5')!==next){storage.setItem('word-scenes-v5',current.raw);throw new Error('Не удалось проверить локальное восстановление')}
     saveSettings({uid:initial,revision:remote.revision,baseline:remoteFingerprint});reload();
     return {status:'pulled',revision:remote.revision};
    }
    captureConflict(current,remote);return {status:'conflict',revision:remote.revision};
   }
   if(current.fingerprint===remoteFingerprint){if(setting.baseline!==current.fingerprint)saveSettings({uid:initial,revision:remote.revision,baseline:current.fingerprint});return {status:'same',revision:remote.revision}}
   if(setting.baseline!==remoteFingerprint){captureConflict(current,remote);return {status:'conflict',revision:remote.revision}}
   const result=await cloud.write(current.value,remote.revision);
   if(uid()!==initial)return {status:'account-changed'};
   saveSettings({uid:initial,revision:result.revision,baseline:current.fingerprint});return {status:'pushed',revision:result.revision};
  }catch(error){
   if(error.code==='wordscene/conflict'){
    try{const remote=await cloud.read();if(remote.exists&&uid()===syncUid){captureConflict(local(),remote);return {status:'conflict',revision:remote.revision}}}catch{}
    storage.removeItem(KEY);return {status:'conflict-race'}
   }
   throw error
  }
  finally{busy=false}
 }
 async function getConflict(){
  const raw=storage.getItem(CONFLICT_KEY);if(!raw)return null;
  const value=JSON.parse(raw);if(value.version!==1||!value.uid||!Number.isSafeInteger(value.cloud?.revision)||!validate(value.local?.progress)||!validate(value.cloud?.progress))throw new Error('Снимок конфликта повреждён');
  return value;
 }
 async function resolve(choice){
  const user=uid();if(!user)throw new Error('Сначала войдите в аккаунт');
  const conflict=await getConflict();if(!conflict||conflict.uid!==user)throw new Error('Для этого аккаунта нет сохранённого конфликта');
  const latest=await cloud.read();if(uid()!==user)throw new Error('Аккаунт изменился');if(!latest.exists)throw new Error('Облачная копия отсутствует');
  const current=local();
  if(!conflict.cloud||conflict.cloud.revision!==latest.revision||stable(conflict.local.progress)!==current.fingerprint)throw new Error('Копии изменились после скачивания. Скачайте актуальный набор обеих версий ещё раз.');
  const selected=choice==='local'?current.value:choice==='cloud'?latest.payload:null;
  if(!selected||!validate(selected))throw new Error('Неизвестный вариант прогресса');
  if(choice==='local'){
   const result=await cloud.write(selected,latest.revision);
   if(uid()!==user)throw new Error('Аккаунт изменился; проверьте облачную копию');
   const afterWrite=local();
   if(afterWrite.fingerprint!==current.fingerprint){await exportConflict();throw new Error('Локальный прогресс изменился во время записи. Конфликт сохранён заново; скачайте обе версии ещё раз.')}
   saveSettings({uid:user,revision:result.revision,baseline:stable(current.value)});
   storage.removeItem(CONFLICT_KEY);
   return {status:'kept-local',revision:result.revision};
  }
  const currentRaw=storage.getItem('word-scenes-v5');
  if(currentRaw!==null&&!validate(JSON.parse(currentRaw)))throw new Error('Локальные данные повреждены: восстановление остановлено');
  if(currentRaw!==null){const key='word-scenes-v5-before-cloud-restore-'+now();storage.setItem(key,currentRaw);if(storage.getItem(key)!==currentRaw)throw new Error('Не удалось сохранить резервную копию')}
  const next=JSON.stringify(selected);storage.setItem('word-scenes-v5',next);if(storage.getItem('word-scenes-v5')!==next){if(currentRaw!==null)storage.setItem('word-scenes-v5',currentRaw);throw new Error('Не удалось проверить восстановление')}
  storage.removeItem(KEY);storage.removeItem(CONFLICT_KEY);reload();return {status:'kept-cloud',revision:latest.revision};
 }
 return {enable,disable,enabled,syncOnce,getConflict,exportConflict,resolve,stable};
}
const api={create,KEY,CONFLICT_KEY,stable};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneCloudSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
