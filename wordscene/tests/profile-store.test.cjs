const assert=require('node:assert/strict');
const {test}=require('node:test');
const profiles=require('../profile-store.js');
const guard=require('../state-guard.js');
const valid=x=>guard.valid(x,500);
const state=(name)=>({version:5,words:{},session:null,marker:name});
function harness(initial={}){
 const values=new Map(Object.entries(initial));
 const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 return {store:profiles.create({storage,validate:valid,now:()=>999}),storage};
}
test('first account login isolates the existing guest save without deleting it',()=>{
 const guest={...state('guest'),words:{cup:{started:true}}},h=harness({'word-scenes-v5':JSON.stringify(guest)});
 assert.deepEqual(h.store.switchTo('A'),{changed:true,profile:'user:A'});
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5-guest')),guest);
 assert.equal(JSON.parse(h.storage.getItem('word-scenes-v5')).marker,undefined);
 assert.equal(h.store.matches('A'),true);assert.equal(h.store.matches('B'),false);
 assert.equal(h.store.hasGuestProgress(),true);
});
test('empty guest initialization is not offered as a progress import',()=>{
 const h=harness({'word-scenes-v5':JSON.stringify(profiles.EMPTY)});
 h.store.switchTo('A');assert.equal(h.store.hasGuestProgress(),false);
 const guest={...state('guest'),words:{cup:{started:true}}};h.storage.setItem('word-scenes-v5-guest',JSON.stringify(guest));
 h.store.switchTo(null);assert.equal(h.store.hasGuestProgress(),true);
});
test('different Firebase accounts and guest mode receive separate local saves',()=>{
 const guest={...profiles.EMPTY,words:{cup:{started:true}}},h=harness({'word-scenes-v5':JSON.stringify(guest)});
 h.store.switchTo('A');const dataA=state('A');h.storage.setItem('word-scenes-v5',JSON.stringify(dataA));
 h.store.switchTo('B');assert.equal(JSON.parse(h.storage.getItem('word-scenes-v5')).marker,undefined);
 h.storage.setItem('word-scenes-v5',JSON.stringify(state('B')));
 h.store.switchTo(null);assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),guest);
 h.store.switchTo('A');assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),dataA);
 h.store.switchTo('B');assert.equal(JSON.parse(h.storage.getItem('word-scenes-v5')).marker,'B');
});
test('per-account sync preference follows its own local profile',()=>{
 const h=harness({'word-scenes-v5':JSON.stringify(state('guest'))});h.store.switchTo('A');
 const setting={uid:'A',revision:4,baseline:'fingerprint'};
 h.storage.setItem('wordscene-sync-v1',JSON.stringify(setting));h.store.switchTo('B');
 assert.equal(h.storage.getItem('wordscene-sync-v1'),null);
 h.store.switchTo('A');assert.deepEqual(JSON.parse(h.storage.getItem('wordscene-sync-v1')),setting);
});
test('guest import keeps the guest source and backs up account-local progress',()=>{
 const guest=state('guest'),h=harness({'word-scenes-v5':JSON.stringify(guest)});h.store.switchTo('A');
 const account=state('A');h.storage.setItem('word-scenes-v5',JSON.stringify(account));
 const result=h.store.importGuest('A');
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),guest);
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5-guest')),guest);
 assert.deepEqual(JSON.parse(h.storage.getItem(result.backupKey)),account);
 assert.equal(h.storage.getItem('wordscene-sync-v1'),null);
 assert.equal(h.storage.getItem('wordscene-sync-v1-profile-A'),null);
});
test('invalid account-local save blocks switching and leaves previous active data intact',()=>{
 const guest=state('guest'),h=harness({'word-scenes-v5':JSON.stringify(guest),'word-scenes-v5-profile-B':'not-json'});
 assert.throws(()=>h.store.switchTo('B'),/повреждены/);
 assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),guest);
 assert.equal(h.store.matches(null),true);
});
test('interrupted profile switch rolls back the active pointer without losing either copy',()=>{
 const guest=state('guest'),values=new Map([['word-scenes-v5',JSON.stringify(guest)]]);let fail=true;
 const storage={getItem:k=>values.has(k)?values.get(k):null,setItem(k,v){if(k==='wordscene-active-profile-v1'&&fail){fail=false;throw Error('quota')}values.set(k,String(v))},removeItem:k=>values.delete(k)};
 const store=profiles.create({storage,validate:valid});
 assert.throws(()=>store.switchTo('A'),/quota/);
 assert.deepEqual(JSON.parse(storage.getItem('word-scenes-v5')),guest);
 assert.deepEqual(JSON.parse(storage.getItem('word-scenes-v5-guest')),guest);
 assert.equal(store.activeId(),'guest');
});
