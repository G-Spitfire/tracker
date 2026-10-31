/* Reversible snapshot boundary for starting event replay. Never replaces the active save. */
(function(root){
'use strict';
const VERSION=1,KEY='wordscene-v2-baseline-';
const clone=x=>JSON.parse(JSON.stringify(x));
const stable=x=>JSON.stringify(x);
function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x)}
function fingerprint(value){const bytes=new TextEncoder().encode(canonical(value)),mask=(1n<<64n)-1n,prime=0x100000001b3n;let a=0xcbf29ce484222325n,b=0x84222325cbf29ce4n;for(const byte of bytes){a=((a^BigInt(byte))*prime)&mask;b=((b^BigInt(byte^0xa5))*prime)&mask}return `wsb1-${a.toString(16).padStart(16,'0')}${b.toString(16).padStart(16,'0')}`}
function create({storage,validate,makeId,now=()=>Date.now()}){
 if(!storage||typeof validate!=='function'||(makeId!==undefined&&typeof makeId!=='function'))throw new Error('Missing migration dependencies');
 const key=uid=>{if(typeof uid!=='string'||!uid||uid.includes('/'))throw new Error('Invalid profile');return KEY+encodeURIComponent(uid)};
 function parse(raw){try{return JSON.parse(raw)}catch{return null}}
 function progressOnly(value){const copy=clone(value);copy.session=null;return copy}
 function prepare(uid,activeKey='word-scenes-v5'){
  const activeRaw=storage.getItem(activeKey);if(activeRaw===null)throw new Error('Active save is missing');
  const progress=parse(activeRaw);if(!progress||!validate(progress))throw new Error('Active save is invalid; original bytes preserved');
  const target=key(uid),currentRaw=storage.getItem(target);
  const cleanProgress=progressOnly(progress);
  if(currentRaw!==null){const current=parse(currentRaw);if(!current||current.version!==VERSION||current.uid!==uid||typeof current.baselineId!=='string'||!validate(current.progress))throw new Error('Stored baseline is invalid; original bytes preserved');return {status:stable(current.progress)===stable(cleanProgress)?'same':'different',baselineId:current.baselineId,baseline:clone(current.progress),backupKey:current.backupKey}}
  const baselineId=makeId?makeId():fingerprint(cleanProgress);if(typeof baselineId!=='string'||!baselineId||baselineId.includes('/'))throw new Error('Invalid baseline ID');
  const backupKey=activeKey+'-before-event-v2-'+encodeURIComponent(uid)+'-'+baselineId;
  const envelope={format:'wordscene-event-baseline',version:VERSION,uid,baselineId,createdAt:now(),backupKey,progress:cleanProgress};
  // Write and verify an immutable copy before placing the baseline marker.
  storage.setItem(backupKey,activeRaw);if(storage.getItem(backupKey)!==activeRaw)throw new Error('Baseline backup verification failed');
  const raw=JSON.stringify(envelope);storage.setItem(target,raw);if(storage.getItem(target)!==raw){storage.removeItem(target);throw new Error('Baseline verification failed')}
  return {status:'created',baselineId,baseline:clone(cleanProgress),backupKey};
 }
 function inspect(uid){const raw=storage.getItem(key(uid));if(raw===null)return null;const value=parse(raw);if(!value||value.format!=='wordscene-event-baseline'||value.version!==VERSION||value.uid!==uid||typeof value.baselineId!=='string'||!validate(value.progress))throw new Error('Stored baseline is invalid; original bytes preserved');return {baselineId:value.baselineId,baseline:clone(value.progress),backupKey:value.backupKey,createdAt:value.createdAt}}
 function restore(uid){const record=inspect(uid);if(!record)throw new Error('Baseline is missing');const raw=storage.getItem(record.backupKey);const progress=parse(raw);if(!raw||!progress||!validate(progress)||stable(progressOnly(progress))!==stable(record.baseline))throw new Error('Baseline backup is missing or does not match');return clone(progress)}
 return {prepare,inspect,restore,key,VERSION};
}
const api={create,VERSION,KEY,fingerprint};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneEventBaseline=api;
})(typeof globalThis!=='undefined'?globalThis:this);
