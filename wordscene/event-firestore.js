/* Isolated WordScene v2 event transport. Not loaded by the child app. */
(function(root){
'use strict';
const PAGE_SIZE=200,MAX_EVENT_BYTES=64*1024;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
function create({auth,db,sdk,now=()=>Date.now()}){
 if(!auth||!db||!sdk)throw new Error('Missing event transport dependencies');
 const {doc,collection,getDoc,runTransaction,serverTimestamp,query,orderBy,startAfter,limit,getDocs}=sdk;
 if(![doc,collection,getDoc,runTransaction,serverTimestamp,query,orderBy,startAfter,limit,getDocs].every(x=>typeof x==='function'))throw new Error('Incomplete event transport SDK');
 const uid=()=>{const value=auth.currentUser?.uid;if(typeof value!=='string'||!value||value.includes('/'))throw new Error('Sign-in required');return value};
 const eventRef=(user,eventId)=>{if(typeof eventId!=='string'||!eventId||eventId.includes('/'))throw new Error('Invalid event ID');return doc(db,'users',user,'wordsceneEvents',eventId)};
 const validate=e=>object(e)&&e.schemaVersion===2&&typeof e.eventId==='string'&&!!e.eventId&&typeof e.uid==='string'&&!!e.uid&&typeof e.baselineId==='string'&&!!e.baselineId&&typeof e.deviceId==='string'&&!!e.deviceId&&typeof e.wordId==='string'&&!!e.wordId&&typeof e.kind==='string'&&!!e.kind&&Number.isSafeInteger(e.createdAt)&&object(e.payload);
 const bytes=e=>new TextEncoder().encode(JSON.stringify(e)).length;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 async function publish(events){
  if(!Array.isArray(events)||!events.every(validate))throw new Error('Invalid event batch');
  const user=uid();
  if(events.some(e=>e.uid!==user))throw new Error('Event belongs to another account');
  const acknowledged=[],duplicates=[];
  for(const event of events){
   if(bytes(event)>MAX_EVENT_BYTES)throw new Error('Event exceeds the safe Firestore size limit');
   const ref=eventRef(user,event.eventId),body=clone(event);
   const result=await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(snap.exists()){
     const stored=snap.data();
     const comparable={...stored};delete comparable.receivedAt;
     if(!same(comparable,body)){const error=new Error('Event ID collision; the local event was preserved');error.code='wordscene/event-id-collision';throw error}
     return 'duplicate';
    }
    tx.set(ref,{...body,receivedAt:serverTimestamp()});
    return 'created';
   });
   if(uid()!==user)throw new Error('Account changed; event remains in the local outbox');
   acknowledged.push(event.eventId);if(result==='duplicate')duplicates.push(event.eventId);
  }
  return {acknowledged,duplicates};
 }
 async function readPage(cursor=null){
  const user=uid(),events=collection(db,'users',user,'wordsceneEvents');
  const constraints=[orderBy('receivedAt'),orderBy(sdk.documentId())];
  if(cursor){if(!cursor.receivedAt||typeof cursor.eventId!=='string')throw new Error('Invalid event cursor');constraints.push(startAfter(cursor.receivedAt,cursor.eventId))}
  constraints.push(limit(PAGE_SIZE));
  const snapshot=await getDocs(query(events,...constraints));
  if(uid()!==user)throw new Error('Account changed while reading events');
  const items=snapshot.docs.map(row=>{
   const value={...row.data()};delete value.receivedAt;
   if(!validate(value)||value.uid!==user||row.id!==value.eventId)throw new Error('Invalid cloud event; local data was not changed');
   return value;
  });
  const last=snapshot.docs.at(-1);
  return {events:items,nextCursor:last?{receivedAt:last.data().receivedAt,eventId:last.id}:null,done:snapshot.docs.length<PAGE_SIZE};
 }
 return {publish,readPage,PAGE_SIZE,MAX_EVENT_BYTES};
}
const api={create,PAGE_SIZE,MAX_EVENT_BYTES};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneEventFirestore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
