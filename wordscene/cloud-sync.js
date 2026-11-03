/* Local-first snapshot sync. A conflict is archived and stopped, never guessed. */
(function(root){
'use strict';
const KEY='wordscene-sync-v1',CONFLICT_KEY='wordscene-conflict-v1';
const copy=x=>JSON.parse(JSON.stringify(x));
function stable(x){return JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)}
const scopedKey=uid=>CONFLICT_KEY+'-'+encodeURIComponent(uid);
const historyKey=uid=>CONFLICT_KEY+'-history-'+encodeURIComponent(uid);
const exportKey=uid=>CONFLICT_KEY+'-exported-'+encodeURIComponent(uid);
function create({auth,cloud,storage,validate,now=()=>Date.now(),reload=()=>{},canSync=()=>true,onSettings=()=>{},onDisable=()=>{}}){
 if(!auth||!cloud||!storage||typeof validate!=='function')throw new Error('Missing sync dependencies');
 let busy=false;
 const B=typeof module!=='undefined'&&module.exports?require('./backup-local.js'):root.WordSceneBackup;
 const device=B.create({storage,validate,now,disable:()=>disable()});
 const uid=()=>auth.currentUser?.uid||null;
 const settings=()=>{try{return JSON.parse(storage.getItem(KEY)||'null')}catch{return null}};
 const saveSettings=value=>{storage.setItem(KEY,JSON.stringify(value));onSettings(value)};
 const local=()=>{const raw=storage.getItem('word-scenes-v5');if(!raw)throw new Error('Локальное сохранение отсутствует');const value=JSON.parse(raw);if(!validate(value))throw new Error('Локальные данные повреждены');return {raw,value,fingerprint:stable(value)}};
 const enabled=()=>{const user=uid(),s=settings();return !!user&&canSync(user)&&s?.uid===user&&Number.isSafeInteger(s.revision)&&s.revision>0};
 function clearConflict(user){storage.removeItem(scopedKey(user));storage.removeItem(exportKey(user));const legacy=(()=>{try{return JSON.parse(storage.getItem(CONFLICT_KEY)||'null')}catch{return null}})();if(legacy?.uid===user)storage.removeItem(CONFLICT_KEY)}
 function readConflict(user){
  const scoped=storage.getItem(scopedKey(user));if(scoped)return JSON.parse(scoped);
  const legacy=(()=>{try{return JSON.parse(storage.getItem(CONFLICT_KEY)||'null')}catch{return null}})();
  return legacy?.uid===user?legacy:null;
 }
 function archiveConflict(user,record){
  const key=historyKey(user);let history=[];
  try{history=JSON.parse(storage.getItem(key)||'[]')}catch{}
  if(!Array.isArray(history))history=[];
  const signature=r=>JSON.stringify([r?.cloud?.revision,stable(r?.local?.progress),stable(r?.cloud?.progress)]);
  if(!history.some(item=>signature(item)===signature(record)))history.push(copy(record));
  while(history.length>3||(history.length>1&&new TextEncoder().encode(JSON.stringify(history)).length>2*1024*1024))history.shift();
  const raw=JSON.stringify(history);if(new TextEncoder().encode(raw).length>2*1024*1024)throw Error('Снимок слишком большой. Сохраните его в файл перед заменой.');storage.setItem(key,raw);
  if(storage.getItem(key)!==raw)throw new Error('Не удалось сохранить резерв конфликтной версии');
 }
 function captureConflict(localCopy,remote){
  const user=uid();if(!user||!canSync(user))throw new Error('Аккаунт или локальный профиль изменился');
  const capture={version:1,uid:user,capturedAt:new Date(now()).toISOString(),local:{savedAt:new Date(now()).toISOString(),progress:copy(localCopy.value)},cloud:{revision:remote.revision,progress:copy(remote.payload)}};
  const old=readConflict(user);if(old)archiveConflict(user,old);
  const raw=JSON.stringify(capture);storage.setItem(scopedKey(user),raw);if(storage.getItem(scopedKey(user))!==raw)throw new Error('Не удалось сохранить обе версии конфликта');
  storage.removeItem(exportKey(user));storage.removeItem(KEY);onDisable(user);return capture;
 }
 function disable(){storage.removeItem(KEY);const user=uid();if(user)onDisable(user)}
 async function getConflict(){
  const user=uid();if(!user)return null;const value=readConflict(user);if(!value)return null;
  if(value.version!==1||value.uid!==user||!Number.isSafeInteger(value.cloud?.revision)||!validate(value.local?.progress)||!validate(value.cloud?.progress))throw new Error('Снимок конфликта повреждён');
  return value;
 }
 function getConflictHistory(user=uid()){
  if(!user)return [];
  try{const value=JSON.parse(storage.getItem(historyKey(user))||'[]');return Array.isArray(value)?value.filter(x=>x.uid===user&&validate(x.local?.progress)&&validate(x.cloud?.progress)):[]}catch{return []}
 }
 async function exportConflict(){
  const user=uid();if(!user)throw new Error('Сначала войдите в аккаунт');if(!canSync(user))throw new Error('Локальный профиль не принадлежит текущему аккаунту');
  const old=await getConflict();if(!old||old.uid!==user)throw new Error('Для этого аккаунта нет сохранённого конфликта');
  const remote=await cloud.read();if(uid()!==user||!canSync(user)||!remote.exists)throw new Error('Не удалось прочитать актуальную облачную копию');
  const current=local(),capture={version:1,uid:user,capturedAt:new Date(now()).toISOString(),local:{progress:copy(current.value)},cloud:{revision:remote.revision,progress:copy(remote.payload)}};
  if(remote.revision!==old.cloud.revision||stable(old.local.progress)!==current.fingerprint)archiveConflict(user,old);
  const raw=JSON.stringify(capture);storage.setItem(scopedKey(user),raw);if(storage.getItem(scopedKey(user))!==raw)throw new Error('Не удалось сохранить актуальную пару копий');
  storage.removeItem(exportKey(user));return copy(capture);
 }
 function markConflictExported(capture){
  const user=uid();if(!user||!canSync(user)||capture?.uid!==user)throw new Error('Аккаунт изменился');
  const current=local(),stored=readConflict(user);
  if(!stored||stored.cloud.revision!==capture.cloud?.revision||stable(current.value)!==stable(capture.local?.progress))throw new Error('Конфликт изменился; сначала скачайте актуальные версии');
  const marker={uid:user,revision:capture.cloud.revision,localFingerprint:current.fingerprint,exportedAt:new Date(now()).toISOString()};
  storage.setItem(exportKey(user),JSON.stringify(marker));return marker;
 }
 function isConflictExported(){
  const user=uid();if(!user||!canSync(user))return false;
  try{const conflict=readConflict(user),marker=JSON.parse(storage.getItem(exportKey(user))||'null'),current=local();return !!conflict&&marker?.uid===user&&marker.revision===conflict.cloud.revision&&marker.localFingerprint===current.fingerprint&&stable(conflict.local.progress)===current.fingerprint}catch{return false}
 }
 async function enable(){
  const user=uid();if(!user)throw new Error('Сначала войдите в аккаунт');if(!canSync(user))throw new Error('Локальный профиль не принадлежит текущему аккаунту');
  const remote=await cloud.read();if(!remote.exists)throw new Error('Сначала создайте облачную копию');
  if(uid()!==user||!canSync(user))throw new Error('Аккаунт или локальный профиль изменился');
  const current=local();if(current.fingerprint!==stable(remote.payload))throw new Error('Локальная и облачная копии отличаются. Сначала разрешите конфликт.');
  saveSettings({uid:user,revision:remote.revision,baseline:current.fingerprint});return remote.revision;
 }
 async function bootstrapBackup(){
  const user=uid();if(!user||!canSync(user))return {status:'idle'};
  const remote=await cloud.read();if(uid()!==user||!canSync(user))return {status:'account-changed'};
  const current=local();
  if(remote.exists){
   if(stable(remote.payload)===current.fingerprint){saveSettings({uid:user,revision:remote.revision,baseline:current.fingerprint});return {status:'same',revision:remote.revision}}
   // Only a genuinely untouched profile may be recovered without asking.
   // Existing answers, sessions, activity or unknown word data must never be replaced.
   const pristine=!current.value.session
    &&(!Array.isArray(current.value.reviewCycle)||current.value.reviewCycle.length===0)
    &&Object.keys(current.value.words||{}).length===0
    &&Object.keys(current.value.habit?.days||{}).length===0
    &&!current.value.habit?.sessions?.length
    &&!current.value.history?.length;
   if(pristine){
    // The restore path checks that neither the active profile nor the local
    // snapshot changed while the cloud was being read. It also saves rollback.
    const ticket=await prepareRestore();
    if(uid()!==user||!canSync(user))return {status:'account-changed'};
    await restorePrepared(ticket);
    return {status:'restored',revision:remote.revision};
   }
   captureConflict(current,remote);return {status:'conflict',revision:remote.revision};
  }
  const result=await cloud.write(current.value,0);
  if(uid()!==user||!canSync(user))return {status:'account-changed'};
  const confirmed=await cloud.read();
  if(uid()!==user||!canSync(user))return {status:'account-changed'};
  if(!confirmed.exists||confirmed.revision!==result.revision||stable(confirmed.payload)!==current.fingerprint)throw new Error('Облачную копию не удалось подтвердить');
  saveSettings({uid:user,revision:result.revision,baseline:current.fingerprint});
  return {status:local().raw===current.raw?'pushed':'local-changed',revision:result.revision};
 }
 async function prepareConflict(){
  const user=uid();if(!user)throw new Error('Сначала войдите в аккаунт');if(!canSync(user))throw new Error('Локальный профиль не принадлежит текущему аккаунту');
  const remote=await cloud.read();if(uid()!==user||!canSync(user))throw new Error('Аккаунт или локальный профиль изменился');
  if(!remote.exists)throw new Error('Облачная копия отсутствует');
  const current=local();if(current.fingerprint===stable(remote.payload))return {status:'same',revision:remote.revision};
  captureConflict(current,remote);return {status:'conflict',revision:remote.revision};
 }
 async function syncOnce(){
  if(busy||!enabled())return {status:'idle'};busy=true;let syncUid=null;
  try{
   const initial=uid(),setting=settings();syncUid=initial;if(!setting||setting.uid!==initial)return {status:'account-changed'};
   const remote=await cloud.read();if(uid()!==initial||!canSync(initial))return {status:'account-changed'};
   if(!remote.exists)throw new Error('Облачная копия исчезла');
   const current=local(),remoteFingerprint=stable(remote.payload);
   if(remote.revision!==setting.revision){
    if(current.fingerprint===remoteFingerprint){saveSettings({uid:initial,revision:remote.revision,baseline:current.fingerprint});return {status:'same',revision:remote.revision}}
    // This product mode is backup-only. Never replace the active local save
    // automatically, including when the local copy is unchanged.
    if(current.fingerprint===setting.baseline)return {status:'remote-newer',revision:remote.revision};
    captureConflict(current,remote);return {status:'conflict',revision:remote.revision};
   }
   if(current.fingerprint===remoteFingerprint){if(setting.baseline!==current.fingerprint)saveSettings({uid:initial,revision:remote.revision,baseline:current.fingerprint});return {status:'same',revision:remote.revision}}
   if(setting.baseline!==remoteFingerprint){captureConflict(current,remote);return {status:'conflict',revision:remote.revision}}
   const result=await cloud.write(current.value,remote.revision);
   if(uid()!==initial||!canSync(initial))return {status:'account-changed'};
   // Confirm the committed revision and payload before considering the backup current.
   const confirmed=await cloud.read();
   if(uid()!==initial||!canSync(initial))return {status:'account-changed'};
   if(!confirmed.exists||confirmed.revision!==result.revision||stable(confirmed.payload)!==current.fingerprint)throw new Error('Облачную копию не удалось подтвердить; повторим позже');
   // The confirmed upload is our new baseline even if another local answer
   // arrived during the request. The next backup uploads that newer answer.
   saveSettings({uid:initial,revision:result.revision,baseline:current.fingerprint});
   const latest=local();if(latest.raw!==current.raw)return {status:'local-changed',revision:result.revision};return {status:'pushed',revision:result.revision};
  }catch(error){
   if(error.code==='wordscene/conflict'){
    try{const remote=await cloud.read();if(remote.exists&&uid()===syncUid&&canSync(syncUid)){captureConflict(local(),remote);return {status:'conflict',revision:remote.revision}}}catch{}
    disable();return {status:'conflict-race'}
   }
   throw error
  }finally{busy=false}
 }
 async function resolve(choice){
  const user=uid();if(!user)throw new Error('Сначала войдите в аккаунт');if(!canSync(user))throw new Error('Локальный профиль не принадлежит текущему аккаунту');
  const conflict=await getConflict();if(!conflict||conflict.uid!==user)throw new Error('Для этого аккаунта нет сохранённого конфликта');
  const latest=await cloud.read();if(uid()!==user||!canSync(user))throw new Error('Аккаунт изменился');if(!latest.exists)throw new Error('Облачная копия отсутствует');
  const current=local();if(conflict.cloud.revision!==latest.revision||stable(conflict.cloud.progress)!==stable(latest.payload)||stable(conflict.local.progress)!==current.fingerprint)throw new Error('Копии изменились после скачивания. Скачайте актуальный набор обеих версий ещё раз.');
  const exported=JSON.parse(storage.getItem(exportKey(user))||'null');if(exported?.uid!==user||exported.revision!==latest.revision||exported.localFingerprint!==current.fingerprint)throw new Error('Сначала скачайте актуальный файл с обеими версиями конфликта.');
  const selected=choice==='local'?current.value:choice==='cloud'?latest.payload:null;if(!selected||!validate(selected))throw new Error('Неизвестный вариант прогресса');
  archiveConflict(user,conflict);
  if(choice==='local'){
   const result=await cloud.write(selected,latest.revision);if(uid()!==user||!canSync(user))throw new Error('Аккаунт изменился; проверьте облачную копию');
   const confirmed=await cloud.read();if(uid()!==user||!canSync(user)||!confirmed.exists||confirmed.revision!==result.revision||stable(confirmed.payload)!==current.fingerprint)throw new Error('Не удалось подтвердить облачную копию; обе версии сохранены');
   const afterWrite=local();if(afterWrite.fingerprint!==current.fingerprint){await exportConflict();throw new Error('Локальный прогресс изменился во время записи. Скачайте обе версии ещё раз.')}
   saveSettings({uid:user,revision:result.revision,baseline:current.fingerprint});clearConflict(user);return {status:'kept-local',revision:result.revision};
  }
  device.restore(device.preview(JSON.stringify({format:'wordscene-backup',version:1,progress:selected})));
  clearConflict(user);reload();return {status:'kept-cloud',revision:latest.revision};
 }
 async function prepareRestore(){
  const user=uid();if(!user||!canSync(user))throw Error('Сначала войдите в нужный аккаунт');
  const remote=await cloud.read();if(uid()!==user||!canSync(user))throw Error('Аккаунт изменился');
  if(!remote.exists)throw Error('Облачной копии пока нет');
  const ticket=device.preview(JSON.stringify({format:'wordscene-backup',version:1,uid:user,progress:remote.payload}));
  return {uid:user,revision:remote.revision,remoteFingerprint:stable(remote.payload),ticket,local:device.inspect().progress};
 }
 async function checkPrepared(prepared){
  if(!prepared||uid()!==prepared.uid||!canSync(prepared.uid))throw Error('Аккаунт изменился');
  const remote=await cloud.read();
  if(uid()!==prepared.uid||!canSync(prepared.uid))throw Error('Аккаунт изменился');
  if(!remote.exists||remote.revision!==prepared.revision||stable(remote.payload)!==prepared.remoteFingerprint||stable(prepared.ticket.backup.progress)!==prepared.remoteFingerprint)throw Error('Облачная копия изменилась. Сравните её заново.');
  if(prepared.ticket.previous!==storage.getItem('word-scenes-v5')||prepared.ticket.profile!==(storage.getItem('wordscene-active-profile-v1')||'guest'))throw Error('Прогресс устройства изменился. Сравните копии заново.');
  return remote;
 }
 async function restorePrepared(prepared){
  await checkPrepared(prepared);
  device.restore(prepared.ticket);clearConflict(prepared.uid);reload();
  return {status:'kept-cloud',revision:prepared.revision};
 }
 async function keepPrepared(prepared){
  const remote=await checkPrepared(prepared),current=local();
  // Retain the remote version locally before replacing it; no download is required.
  captureConflict(current,remote);archiveConflict(prepared.uid,readConflict(prepared.uid));
  const result=await cloud.write(current.value,remote.revision);
  if(uid()!==prepared.uid||!canSync(prepared.uid))throw Error('Аккаунт изменился; проверьте облачную копию');
  const confirmed=await cloud.read();
  if(uid()!==prepared.uid||!canSync(prepared.uid)||!confirmed.exists||confirmed.revision!==result.revision||stable(confirmed.payload)!==current.fingerprint)throw Error('Не удалось подтвердить отправку. Обе версии сохранены.');
  saveSettings({uid:prepared.uid,revision:result.revision,baseline:current.fingerprint});clearConflict(prepared.uid);
  return {status:local().raw===current.raw?'pushed':'local-changed',revision:result.revision};
 }
 return {prepareRestore,restorePrepared,keepPrepared,enable,disable,enabled,syncOnce,bootstrapBackup,getConflict,getConflictHistory,exportConflict,markConflictExported,isConflictExported,prepareConflict,resolve,stable,conflictKey:scopedKey};
}
const api={create,KEY,CONFLICT_KEY,stable,conflictKey:scopedKey};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneCloudSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
