const test=require('node:test'),assert=require('node:assert/strict'),A=require('./accounts.js'),E=require('./engine.js');
const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const valid=p=>p?.version===17&&p.words&&Array.isArray(p.sessions);
test('account saves remain isolated',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid});
 const p=E.empty();p.words.apple={origin:'known'};
 a.save('child-1',p);
 assert.ok(a.load('child-1').profile.words.apple);
 assert.equal(Object.keys(a.load('child-2').profile.words).length,0);
});
test('damaged main is never silently overwritten; backup is recoverable',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid});
 const p=E.empty();p.words.apple={origin:'known'};
 a.save('child-1',p);
 a.save('child-1',{...p,revision:1});
 const k=a.keys('child-1');storage.setItem(k.main,'{broken');
 assert.equal(a.load('child-1').status,'recoverable');
 assert.throws(()=>a.save('child-1',E.empty()));
 const recovered=a.recover('child-1');
 assert.ok(recovered.archive);assert.ok(a.load('child-1').profile.words.apple);
 assert.equal(storage.getItem(recovered.archive),'{broken');
});
test('corrupt main with no backup is blocked',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid});
 storage.setItem(a.keys('child-1').main,'bad');
 assert.equal(a.load('child-1').status,'corrupt');
 assert.throws(()=>a.save('child-1',E.empty()));
});
test('invalid account ids cannot become storage keys',()=>{
 const a=A.create({storage:memory(),empty:E.empty,valid});
 assert.throws(()=>a.keys('../other'));
});

test('stale tab cannot replace a checkpoint when permanent progress is unchanged',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid}),p=E.empty();
 a.save('child-1',p);
 const {main,active}=a.keys('child-1'),raw=storage.getItem(main);
 a.save('child-1',p,{id:'first'},raw,null);
 assert.throws(()=>a.save('child-1',p,{id:'second'},raw,null),/Session changed/);
 assert.equal(JSON.parse(storage.getItem(active)).id,'first');
});

test('strict persisted profile validation rejects malformed nested schedules without losing data',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid:A.validProfile});
 const p=E.empty();p.words.apple={origin:'learned',schedule:{stage:'other',nextDay:'2026-11-05'},history:[]};
 const k=a.keys('child-1');storage.setItem(k.main,JSON.stringify(p));
 assert.equal(a.load('child-1').status,'corrupt');
 assert.throws(()=>a.save('child-1',E.empty()),/recovery/);
 assert.ok(storage.getItem(k.main).includes('other'));
});
test('valid current WordScene 17 profiles remain readable',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid:A.validProfile}),p=E.empty();
 p.words.apple={origin:'known',schedule:E.newSchedule(Date.now()),history:[]};
 a.save('child-1',p);
 assert.equal(a.load('child-1').status,'ok');
});

test('missing primary with valid backup requires explicit recovery instead of new profile',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid:A.validProfile}),p=E.empty();
 a.save('child-1',p);p.revision++;a.save('child-1',p);
 const k=a.keys('child-1');storage.removeItem(k.main);
 assert.equal(a.load('child-1').status,'recoverable');
 assert.throws(()=>a.save('child-1',E.empty()),/recovery/);
 a.recover('child-1');
 assert.equal(a.load('child-1').status,'ok');
});

test('stale tab cannot overwrite a newer committed profile',()=>{
 const storage=memory(),a=A.create({storage,empty:E.empty,valid:A.validProfile}),first=E.empty();
 a.save('child-1',first);
 const k=a.keys('child-1'),stale=storage.getItem(k.main);
 const second=E.clone(first);second.revision=1;
 a.save('child-1',second,null,stale,null);
 assert.throws(()=>a.save('child-1',first,null,stale,null),/Profile changed/);
 assert.equal(JSON.parse(storage.getItem(k.main)).revision,1);
});
test('failed main write preserves prior committed data and does not replace backup',()=>{
 const base=memory(),p=E.empty(),a=A.create({storage:base,empty:E.empty,valid:A.validProfile});
 a.save('child-1',p);
 const keys=a.keys('child-1'),old=base.getItem(keys.main);
 const failing={getItem:k=>base.getItem(k),setItem:(k,v)=>{if(k===keys.main)throw Error('Quota exceeded');base.setItem(k,v)},removeItem:k=>base.removeItem(k)};
 const b=A.create({storage:failing,empty:E.empty,valid:A.validProfile}),next=E.clone(p);next.revision=1;
 assert.throws(()=>b.save('child-1',next),/Quota exceeded/);
 assert.equal(base.getItem(keys.main),old);
 assert.equal(b.load('child-1').profile.revision,0);
});
