/* WordScene 17 Firestore transport. Separate collection; never targets WordScene 16.17. */
(function(root){
'use strict';
const TAG='wordscene17NestedArray';
function encode(x,nested=false){
 if(Array.isArray(x)){const a=x.map(v=>encode(v,true));return nested?{[TAG]:a}:a}
 if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,encode(v,false)]));
 return x;
}
function decode(x){
 if(Array.isArray(x))return x.map(decode);
 if(x&&typeof x==='object'){
  if(Object.keys(x).length===1&&Array.isArray(x[TAG]))return x[TAG].map(decode);
  return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,decode(v)]));
 }
 return x;
}
function create({db,sdk,auth,limit=800*1024}){
 if(!db||!sdk||!auth)throw Error('Cloud dependencies missing');
 const {doc,getDocFromServer,runTransaction,serverTimestamp}=sdk;
 const current=()=>{const u=auth.currentUser?.uid;if(!u||u.includes('/'))throw Error('Sign-in required');return u};
 const ref=u=>{if(current()!==u)throw Error('Account switched');return doc(db,'users',u,'wordscene17','state')};
 const conflict=()=>Object.assign(Error('Cloud revision conflict'),{code:'wordscene17/conflict'});
 const size=p=>new TextEncoder().encode(JSON.stringify(p)).length;
 async function read(uid){
  const snap=await getDocFromServer(ref(uid));if(current()!==uid)throw Error('Account switched');
  if(!snap.exists())return {exists:false,revision:0};
  const data=snap.data(),payload=decode(data.payload);
  if(data.schemaVersion!==17||!Number.isSafeInteger(data.revision)||!root.WS17Sync.valid(payload))throw Error('Unsupported remote state');
  return {exists:true,revision:data.revision,payload};
 }
 async function write(uid,payload,expectedRevision){
  if(!root.WS17Sync.valid(payload)||size(encode(payload))>limit)throw Error('Cloud document too large or invalid');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('Invalid revision');
  const target=ref(uid),encoded=encode(payload);
  const result=await runTransaction(db,async tx=>{
   const snap=await tx.get(target),rev=snap.exists()?snap.data().revision:0;
   if(current()!==uid)throw Error('Account switched');
   if(rev!==expectedRevision)throw conflict();
   tx.set(target,{schemaVersion:17,revision:rev+1,updatedAt:serverTimestamp(),payload:encoded});
   return {revision:rev+1};
  }).catch(async err=>{
   // Rules can reject a racing revision before the transaction precondition is checked.
   if(err.code==='permission-denied'){
    const latest=await read(uid).catch(()=>null);
    if(latest&&latest.revision!==expectedRevision)throw conflict();
   }
   throw err;
  });
  if(current()!==uid)throw Error('Account switched after save');
  return result;
 }
 return {read,write};
}
const api={create,encode,decode};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WS17Firestore=api;
})(typeof globalThis!=='undefined'?globalThis:this);