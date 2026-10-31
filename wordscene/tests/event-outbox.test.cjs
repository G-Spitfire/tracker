const assert=require('node:assert/strict');
const {test}=require('node:test');
const {create}=require('../event-outbox.js');
function harness(){
 const values=new Map();let uid='A',counter=0;
 const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const outbox=create({storage,uid:()=>uid,deviceId:()=>`device-${uid}`,baselineId:()=>`baseline-${uid}`,makeId:()=>String(++counter),now:()=>123});
 return {outbox,storage,setUid:x=>uid=x};
}
test('persists events and removes only acknowledged IDs',()=>{
 const h=harness(),a=h.outbox.append({wordId:'42',kind:'answer',payload:{correct:true}}),b=h.outbox.append({wordId:'42',kind:'answer',payload:{correct:false}});
 assert.equal(h.outbox.list().length,2);assert.equal(h.outbox.acknowledge([a.eventId]),1);
 assert.deepEqual(h.outbox.list(),[b]);assert.equal(h.outbox.acknowledge([a.eventId]),0);
});
test('isolates outbox by account',()=>{
 const h=harness();h.outbox.append({wordId:'1',kind:'answer',payload:{}});
 h.setUid('B');assert.deepEqual(h.outbox.list(),[]);
 h.outbox.append({wordId:'2',kind:'answer',payload:{}});h.setUid('A');
 assert.equal(h.outbox.list().length,1);assert.equal(h.outbox.list()[0].wordId,'1');
});
test('rejects invalid event without touching stored data',()=>{
 const h=harness();assert.throws(()=>h.outbox.append({wordId:'',kind:'answer',payload:{}}));
 assert.deepEqual(h.outbox.list(),[]);
});
test('refuses corrupt outbox without overwriting it',()=>{
 const h=harness(),key=h.outbox.key('A');h.storage.setItem(key,'not json');
 assert.throws(()=>h.outbox.append({wordId:'1',kind:'answer',payload:{}}),/corrupted/);
 assert.equal(h.storage.getItem(key),'not json');
});
test('write failure does not acknowledge an event',()=>{
 const h=harness(),event=h.outbox.append({wordId:'1',kind:'answer',payload:{}});
 const key=h.outbox.key('A'),original=h.storage.getItem(key),old=h.storage.setItem;
 h.storage.setItem=(k,v)=>{if(k===key)throw Error('quota');return old(k,v)};
 assert.throws(()=>h.outbox.acknowledge([event.eventId]),/quota/);
 assert.equal(h.storage.getItem(key),original);
});
test('does not allow guest events to enter signed-in outbox',()=>{
 const h=harness();h.setUid(null);
 assert.throws(()=>h.outbox.append({wordId:'1',kind:'answer',payload:{}}),/Profile required/);
});
test('repeated action IDs are idempotent and reject changed content',()=>{
 const h=harness(),first=h.outbox.append({wordId:'1',kind:'answer',payload:{correct:true},eventId:'stable-action'});
 assert.deepEqual(h.outbox.append({wordId:'1',kind:'answer',payload:{correct:true},eventId:'stable-action'}),first);
 assert.equal(h.outbox.list().length,1);
 assert.throws(()=>h.outbox.append({wordId:'1',kind:'answer',payload:{correct:false},eventId:'stable-action'}),/different content/);
 assert.deepEqual(h.outbox.list(),[first]);
});
