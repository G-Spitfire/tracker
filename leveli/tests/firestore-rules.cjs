const {test,after,beforeEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,collection,getDoc,getDocs,query,limit,setDoc,updateDoc,deleteDoc,serverTimestamp,runTransaction}=require('firebase/firestore');
let env;
const projectId='demo-leveli-release-check';
const payload={version:5,words:{cup:{started:true,trained:true}},session:null,reviewCycle:[],reviewVersion:1,soundEnabled:true,habit:{days:{}}};
const state=(revision,overrides={})=>({schemaVersion:1,revision,updatedAt:serverTimestamp(),clientSavedAt:Date.now(),payload,...overrides});
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const ref=(uid,client=uid)=>doc(db(client),`users/${uid}/wordscene/state`);
test('candidate rules compile in the real Firestore emulator',async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
 await env.clearFirestore();assert.ok(env);
});
after(async()=>{await env?.cleanup()});
test('each child can create and read only their own backup; anonymous access fails',async()=>{
 await assertSucceeds(setDoc(ref('A'),state(1)));await assertSucceeds(setDoc(ref('B'),state(1)));
 await assertSucceeds(getDoc(ref('A')));await assertSucceeds(getDoc(ref('B')));
 await assertFails(getDoc(ref('A','B')));await assertFails(getDoc(ref('B','A')));
 await assertFails(setDoc(ref('A','B'),state(2)));await assertFails(getDoc(ref('A',null)));await assertFails(setDoc(ref('C',null),state(1)));
});
test('backup schema, ownership path, revision and timestamp are enforced',async()=>{
 const r=ref('C');
 for(const value of [state(2),state(1,{extra:true}),state(1,{schemaVersion:2}),state(1,{revision:1.5}),state(1,{updatedAt:new Date(0)}),state(1,{clientSavedAt:-1}),state(1,{payload:{version:5}}),state(1,{payload:{version:4,words:{}}}),state(1,{payload:{version:5,words:{},session:'bad'}}),state(1,{payload:{version:5,words:{},soundEnabled:'yes'}}),state(1,{payload:{version:5,words:{},reviewCycle:Array(501).fill(0)}}),state(1,{payload:{version:5,words:Object.fromEntries(Array.from({length:501},(_,i)=>['w'+i,{}]))}})])await assertFails(setDoc(r,value));
 await assertSucceeds(setDoc(r,state(1)));await assertFails(setDoc(r,state(1)));await assertFails(setDoc(r,state(3)));await assertSucceeds(setDoc(r,state(2)));
 await assertFails(updateDoc(r,{revision:3}));await assertFails(deleteDoc(r));
 await assertFails(getDocs(collection(db('C'),'users/C/wordscene')));await assertFails(setDoc(doc(db('C'),'users/C/wordscene/other'),state(1)));
});
test('school and profiles remain read-only and private for both children',async()=>{
 await env.withSecurityRulesDisabled(async context=>{for(const uid of ['A','B'])for(const kind of ['schoolGrades','profiles'])await setDoc(doc(context.firestore(),kind,uid),{synthetic:true})});
 for(const uid of ['A','B'])for(const kind of ['schoolGrades','profiles']){
  await assertSucceeds(getDoc(doc(db(uid),kind,uid)));await assertFails(getDoc(doc(db(uid==='A'?'B':'A'),kind,uid)));await assertFails(getDoc(doc(db(null),kind,uid)));
  await assertFails(getDocs(collection(db(uid),kind)));await assertFails(setDoc(doc(db(uid),kind,uid),{changed:true}));await assertFails(deleteDoc(doc(db(uid),kind,uid)));
 }
});
test('unlisted collections and preference writers stay closed',async()=>{
 for(const p of ['unlisted/x','schoolGrades/A/private/x']){await assertFails(getDoc(doc(db('A'),p)));await assertFails(setDoc(doc(db('A'),p),{anything:true}))}
});
test('real backup transport round-trips encoded nested arrays under candidate rules',async()=>{
 const {create}=require('../cloud-firestore.js'),guard=require('../state-guard.js');
 const firestore=db('roundtrip'),auth={currentUser:{uid:'roundtrip'}};
 const cloud=create({auth,db:firestore,sdk:{doc,getDoc,runTransaction,serverTimestamp},validate:x=>guard.valid(x,500)});
 const progress={...payload,words:{cup:{started:true,times:[[1,2],[3]],attempts:3}},reviewCycle:[]};
 await cloud.write(progress,0);const remote=await cloud.read();assert.deepEqual(remote.payload,progress);assert.equal(remote.revision,1);
 await assert.rejects(()=>cloud.write(progress,0),/conflict/);await cloud.write(progress,1);assert.equal((await cloud.read()).revision,2);
});
