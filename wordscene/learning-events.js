/* Captures explicit learning outcomes locally; it never contacts Firebase. */
(function(root){
'use strict';
const DEVICE_KEY='wordscene-v2-device-id';
function create({storage,outbox,ledger,profile,makeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}){
 if(!storage||!outbox||!ledger||typeof profile!=='function'||typeof makeId!=='function')throw new Error('Missing learning event dependencies');
 function deviceId(){
  let id=storage.getItem(DEVICE_KEY);
  if(!id){id=makeId();if(typeof id!=='string'||!id||id.includes('/'))throw new Error('Unable to create device ID');storage.setItem(DEVICE_KEY,id);if(storage.getItem(DEVICE_KEY)!==id)throw new Error('Unable to persist device ID')}
  return id;
 }
 function record({kind,wordId,sessionId,actionId,payload}){
  if(typeof sessionId!=='string'||!sessionId||typeof actionId!=='string'||!actionId)throw new Error('Invalid learning action identity');
  const active=profile();if(typeof active!=='string'||!active)throw new Error('No active local profile');
  const uid=active.startsWith('user:')?active.slice(5):'guest';
  const eventId=`${deviceId()}-${encodeURIComponent(sessionId)}-${encodeURIComponent(actionId)}`.replaceAll('%','_');
  const prior=ledger.list().find(e=>e.eventId===eventId);
  if(prior){if(prior.uid!==uid||prior.wordId!==wordId||prior.kind!==kind||JSON.stringify(prior.payload)!==JSON.stringify(payload))throw new Error('Learning action ID reused with different content');return prior}
  const event=outbox.append({uid,wordId,kind,payload,eventId});ledger.append(event);return event;
 }
 return {record,deviceId};
}
const api={create,DEVICE_KEY};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneLearningEvents=api;
})(typeof globalThis!=='undefined'?globalThis:this);
