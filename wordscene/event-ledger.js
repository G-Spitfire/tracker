/* Append-only local event ledger retained after server acknowledgements. */
(function(root){
'use strict';
const PREFIX='wordscene-v2-event-ledger-';
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),clone=x=>JSON.parse(JSON.stringify(x));
function create({storage,profile}){
 if(!storage||typeof profile!=='function')throw new Error('Missing event ledger dependencies');
 const identity=()=>{const id=profile();if(typeof id!=='string'||!id||id.includes('/'))throw new Error('Invalid event ledger profile');return id};
 const key=id=>PREFIX+encodeURIComponent(id);
 function list(){const id=identity(),raw=storage.getItem(key(id));if(raw===null)return [];let rows;try{rows=JSON.parse(raw)}catch{throw new Error('Event ledger is corrupted; original bytes preserved')};if(!Array.isArray(rows)||!rows.every(e=>object(e)&&e.schemaVersion===2&&e.uid===id&&typeof e.baselineId==='string'&&typeof e.eventId==='string'&&typeof e.deviceId==='string'&&typeof e.wordId==='string'&&typeof e.kind==='string'&&Number.isSafeInteger(e.createdAt)&&object(e.payload)))throw new Error('Event ledger is invalid; original bytes preserved');return clone(rows)}
 function append(event){const id=identity();if(!object(event)||event.uid!==id||event.schemaVersion!==2||typeof event.eventId!=='string'||typeof event.baselineId!=='string')throw new Error('Invalid ledger event');const rows=list(),old=rows.find(e=>e.eventId===event.eventId);if(old){if(JSON.stringify(old)!==JSON.stringify(event))throw new Error('Event ID reused with different ledger content');return clone(old)}const before=storage.getItem(key(id)),raw=JSON.stringify([...rows,event]);try{storage.setItem(key(id),raw);if(storage.getItem(key(id))!==raw)throw new Error('Event ledger write verification failed')}catch(error){try{if(before===null)storage.removeItem(key(id));else storage.setItem(key(id),before)}catch{}throw error}if(identity()!==id)throw new Error('Account changed before event ledger append');return clone(event)}
 function merge(events){if(!Array.isArray(events))throw new Error('Invalid ledger merge');for(const event of events)append(event);return list()}
 return {list,append,merge,key};
}
const api={create,PREFIX};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneEventLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
