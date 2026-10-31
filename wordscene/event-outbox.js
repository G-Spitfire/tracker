/* WordScene v2 durable local outbox. Not connected to production or Firebase. */
(function(root){
'use strict';
const PREFIX='wordscene-v2-outbox-';
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
function create({storage,uid,makeId,now=()=>Date.now()}){
 if(!storage||typeof uid!=='function'||typeof makeId!=='function')throw Error('Missing outbox dependencies');
 const identity=()=>{const id=uid();if(typeof id!=='string'||!id||id.includes('/'))throw Error('Signed-in UID required');return id};
 const key=id=>PREFIX+encodeURIComponent(id);
 function readFor(id){
  const raw=storage.getItem(key(id));if(raw===null)return [];
  let events;try{events=JSON.parse(raw)}catch{throw Error('Outbox corrupted; original bytes preserved')}
  if(!Array.isArray(events)||!events.every(e=>isObject(e)&&e.uid===id&&typeof e.eventId==='string'&&e.eventId.length>0&&typeof e.wordId==='string'&&typeof e.kind==='string'&&Number.isSafeInteger(e.createdAt)&&isObject(e.payload)))throw Error('Invalid outbox; original bytes preserved');
  if(new Set(events.map(e=>e.eventId)).size!==events.length)throw Error('Duplicate event IDs in outbox');
  return events;
 }
 function saveFor(id,events){
  const before=storage.getItem(key(id)),raw=JSON.stringify(events);
  try{storage.setItem(key(id),raw);if(storage.getItem(key(id))!==raw)throw Error('Outbox write verification failed')}
  catch(e){try{if(before===null)storage.removeItem(key(id));else storage.setItem(key(id),before)}catch{}throw e}
 }
 function list(){return clone(readFor(identity()))}
 function append({wordId,kind,payload}){
  const id=identity();
  if(typeof wordId!=='string'||!wordId||typeof kind!=='string'||!kind||!isObject(payload))throw Error('Invalid learning event');
  const events=readFor(id),eventId=makeId();
  if(typeof eventId!=='string'||!eventId||events.some(e=>e.eventId===eventId))throw Error('Invalid or duplicate event ID');
  const event={schemaVersion:2,eventId,uid:id,wordId,kind,payload:clone(payload),createdAt:now()};
  if(!Number.isSafeInteger(event.createdAt))throw Error('Invalid event timestamp');
  if(identity()!==id)throw Error('Account changed before saving event');
  saveFor(id,[...events,event]);return clone(event);
 }
 function acknowledge(eventIds){
  const id=identity();
  if(!Array.isArray(eventIds)||!eventIds.every(x=>typeof x==='string'))throw Error('Invalid acknowledgements');
  const remove=new Set(eventIds),current=readFor(id);
  if(identity()!==id)throw Error('Account changed before acknowledgement');
  const remaining=current.filter(e=>!remove.has(e.eventId));
  if(remaining.length!==current.length)saveFor(id,remaining);
  return current.length-remaining.length;
 }
 return {append,list,acknowledge,key};
}
const api={create,PREFIX};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneOutbox=api;
})(typeof globalThis!=='undefined'?globalThis:this);
