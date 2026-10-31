/* Keeps the legacy active-save key while isolating guest and Firebase profiles. */
(function(root){
'use strict';
const KEY='word-scenes-v5',ACTIVE='wordscene-active-profile-v1',PENDING='wordscene-profile-switch-pending-v1',SYNC='wordscene-sync-v1';
const EMPTY={version:5,words:{},reviewCycle:[],session:null,mode:'new'};
function create({storage,validate,now=()=>Date.now()}){
 if(!storage||typeof validate!=='function')throw new Error('Missing profile dependencies');
 const identity=uid=>uid?`user:${uid}`:'guest';
 const profileKey=id=>id==='guest'?KEY+'-guest':KEY+'-profile-'+encodeURIComponent(id.slice(5));
 const syncProfileKey=uid=>'wordscene-sync-v1-profile-'+encodeURIComponent(uid);
 const parse=value=>{try{return JSON.parse(value)}catch{return null}};
 const assertState=raw=>{const value=parse(raw);if(!value||!validate(value))throw new Error('Локальные данные профиля повреждены; исходная копия сохранена.');return value};
 function recover(){
  const pending=parse(storage.getItem(PENDING));if(!pending)return;
  const active=storage.getItem(ACTIVE)||'guest',current=storage.getItem(KEY);
  if(active===pending.to&&current===pending.targetRaw){storage.removeItem(PENDING);return}
  if(typeof pending.previousRaw==='string')storage.setItem(KEY,pending.previousRaw);else storage.removeItem(KEY);
  storage.setItem(ACTIVE,pending.from||'guest');storage.removeItem(PENDING);
 }
 function activeId(){return storage.getItem(ACTIVE)||'guest'}
 function matches(uid){return activeId()===identity(uid)}
 function storeSync(uid){
  const raw=uid?storage.getItem(syncProfileKey(uid)):null,setting=parse(raw);
  if(uid&&setting?.uid===uid)storage.setItem(SYNC,raw);else storage.removeItem(SYNC);
 }
 function switchTo(uid){
  recover();
  const target=identity(uid),previousMarker=storage.getItem(ACTIVE),from=previousMarker||'guest',previousRaw=storage.getItem(KEY);
  if(previousRaw!==null)assertState(previousRaw);
  if(from===target){
   const activeRaw=previousRaw||JSON.stringify(EMPTY);if(previousRaw===null)storage.setItem(KEY,activeRaw);
   const activeProfile=profileKey(from);if(storage.getItem(activeProfile)!==activeRaw)storage.setItem(activeProfile,activeRaw);
   storage.setItem(ACTIVE,target);
   if(uid){const activeSync=parse(storage.getItem(SYNC));if(activeSync?.uid===uid&&!storage.getItem(syncProfileKey(uid)))storage.setItem(syncProfileKey(uid),JSON.stringify(activeSync))}
   storeSync(uid);return {changed:false,profile:target};
  }
  const sourceRaw=previousRaw||JSON.stringify(EMPTY);
  // Preserve the active profile before selecting another one.
  storage.setItem(profileKey(from),sourceRaw);
  const savedTarget=storage.getItem(profileKey(target));
  const targetRaw=savedTarget===null?JSON.stringify(EMPTY):(assertState(savedTarget),savedTarget);
  const previousSync=parse(storage.getItem(SYNC));
  // Only carry an active sync preference when it belongs to the profile being saved.
  if(previousMarker&&from.startsWith('user:')&&previousSync?.uid===from.slice(5))storage.setItem(syncProfileKey(from.slice(5)),JSON.stringify(previousSync));
  // An unmarked pre-profile save is ambiguous. Keep it as guest data and require explicit import.
  storage.setItem(PENDING,JSON.stringify({from,to:target,previousRaw,targetRaw}));
  try{storage.setItem(KEY,targetRaw);storage.setItem(ACTIVE,target);storage.removeItem(PENDING);storeSync(uid)}
  catch(error){
   if(previousRaw!==null)storage.setItem(KEY,previousRaw);else storage.removeItem(KEY);
   if(previousMarker===null)storage.removeItem(ACTIVE);else storage.setItem(ACTIVE,previousMarker);
   storage.removeItem(PENDING);throw error;
  }
  return {changed:true,profile:target};
 }
 function hasGuestProgress(){
  const raw=storage.getItem(profileKey('guest')),value=parse(raw);if(!value||!validate(value))return false;
  if(value.session||value.reviewCycle?.length||Object.keys(value.habit?.days||{}).length)return true;
  return Object.values(value.words||{}).some(p=>p.started||p.trained||p.attempts>0||p.errors>0||p.sessions>0||p.hesitations>0||p.needsWork||p.writingNeedsWork||p.schedule?.checks?.length||p.writingResults?.length);
 }
 function importGuest(uid){
  if(!uid||!matches(uid))throw new Error('Сначала откройте профиль нужного аккаунта');
  const guestRaw=storage.getItem(profileKey('guest'));if(!guestRaw||!validate(parse(guestRaw)))throw new Error('Сохранённый гостевой прогресс не найден или повреждён');
  const current=storage.getItem(KEY);if(current!==null)assertState(current);
  const currentRaw=current||JSON.stringify(EMPTY),backupKey=KEY+'-before-guest-import-'+encodeURIComponent(uid)+'-'+now();
  storage.setItem(profileKey(identity(uid)),currentRaw);storage.setItem(backupKey,currentRaw);
  if(storage.getItem(backupKey)!==currentRaw)throw new Error('Не удалось проверить резервную копию профиля');
  storage.setItem(PENDING,JSON.stringify({from:identity(uid),to:identity(uid),previousRaw:currentRaw,targetRaw:guestRaw}));
  try{storage.setItem(KEY,guestRaw);storage.setItem(ACTIVE,identity(uid));storage.removeItem(SYNC);storage.removeItem(syncProfileKey(uid));storage.removeItem(PENDING)}
  catch(error){storage.setItem(KEY,currentRaw);storage.removeItem(PENDING);throw error}
  return {backupKey};
 }
 return {switchTo,matches,activeId,hasGuestProgress,importGuest,profileKey,syncProfileKey,ACTIVE,PENDING,KEY};
}
const api={create,EMPTY};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneProfiles=api;
})(typeof globalThis!=='undefined'?globalThis:this);
