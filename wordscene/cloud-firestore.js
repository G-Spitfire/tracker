/* WordScene Firestore transport, intentionally not loaded by index.html.
   Firebase modular SDK functions are injected; no credentials are embedded. */
(function(root){
'use strict';
function create({auth,db,sdk,validate,now=()=>Date.now()}){
 if(!auth||!db||!sdk||typeof validate!=='function')throw new Error('Missing cloud dependencies');
 const {doc,getDoc,runTransaction,serverTimestamp}=sdk;
 const path=uid=>{if(!uid||typeof uid!=='string'||uid.includes('/'))throw new Error('Invalid UID');return doc(db,'users',uid,'wordscene','state')};
 const copy=x=>JSON.parse(JSON.stringify(x));
 // Firestore rejects arrays directly nested in arrays. Encode only those arrays
 // as tagged maps; restore the original structure on reads.
 const TAG='__wordsceneNestedArrayV1__';
 function encode(value,inArray=false){
  if(Array.isArray(value)){
   const items=value.map(item=>encode(item,true));
   return inArray?{[TAG]:items}:items;
  }
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v,false)]));
  return value;
 }
 function decode(value){
  if(Array.isArray(value))return value.map(decode);
  if(value&&typeof value==='object'){
   if(Object.keys(value).length===1&&Array.isArray(value[TAG]))return value[TAG].map(decode);
   return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
  }
  return value;
 }
 const current=()=>{const user=auth.currentUser;if(!user?.uid)throw new Error('Sign-in required');return user.uid};
 async function read(){
  const uid=current(),snap=await getDoc(path(uid));
  if(current()!==uid)throw new Error('Account changed');
  if(!snap.exists())return {exists:false,revision:0};
  const value=snap.data();
  if(!Number.isSafeInteger(value.revision)||value.revision<1||!validate(decode(value.payload)))throw new Error('Invalid cloud state');
  return {exists:true,revision:value.revision,payload:decode(copy(value.payload))};
 }
 async function write(payload,expectedRevision){
  if(!validate(payload))throw new Error('Invalid local state');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid expected revision');
  const uid=current(),ref=path(uid),safe=encode(copy(payload));
  const result=await runTransaction(db,async tx=>{
   const snap=await tx.get(ref),existing=snap.exists()?snap.data():null;
   if(existing&&(!Number.isSafeInteger(existing.revision)||!validate(decode(existing.payload))))throw new Error('Invalid cloud state');
   const revision=existing?.revision||0;
   if(revision!==expectedRevision){const e=new Error('Cloud revision conflict');e.code='wordscene/conflict';throw e}
   tx.set(ref,{schemaVersion:1,revision:revision+1,updatedAt:serverTimestamp(),clientSavedAt:now(),payload:safe});
   return {revision:revision+1};
  });
  if(current()!==uid)throw new Error('Account changed; verify cloud state');
  return result;
 }
 return {read,write};
}
const api={create};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneFirestore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
