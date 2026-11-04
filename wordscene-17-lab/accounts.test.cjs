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
