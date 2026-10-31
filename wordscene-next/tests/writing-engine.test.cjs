const assert=require('node:assert/strict'),W=require('../writing-engine');
function fixture(ids=[0,1,2]){const records={};return {s:{ids},record:i=>records[i]??={},records}}
function answer(f,result){const {s,record}=f;s.writingBreak=false;const i=s.writingIds[s.writingIndex];assert.ok(W.mark(s,record(i),i,result));assert.equal(W.mark(s,record(i),i,result),false);return W.next(s)}
let f=fixture();W.prepare(f.s,f.record);answer(f,'incorrect');answer(f,'correct');assert.equal(answer(f,'forgot'),'break');assert.deepEqual(f.s.writingIds,[0,2]);
answer(f,'correct');assert.equal(W.needs(f.record(0)),true);answer(f,'incorrect');assert.equal(f.s.writingPass,2);answer(f,'correct');assert.equal(answer(f,'correct'),'done');
assert.equal(W.needs(f.record(0)),false);assert.equal(W.needs(f.record(2)),true);assert.equal(f.record(2).writing,'correct');assert.equal(f.record(1).writing,'correct');assert.equal(W.next(f.s),'unchanged');
f=fixture([0]);W.prepare(f.s,f.record);assert.equal(answer(f,'correct'),'done');assert.deepEqual(f.s.writingFirstErrors,[]);
f=fixture([0]);W.prepare(f.s,f.record);answer(f,'forgot');answer(f,'forgot');assert.equal(answer(f,'forgot'),'done','Errors never create an infinite loop');assert.equal(W.needs(f.record(0)),true);
f=fixture([0]);W.practice(f.s);answer(f,'correct');assert.equal(W.needs(f.record(0)),true);assert.equal(answer(f,'correct'),'done');assert.equal(W.needs(f.record(0)),false);
f=fixture([0,1]);f.s.writingIds=[1,0];f.s.writingIndex=0;f.s.writingChecked=true;f.record(1).writing='incorrect';W.prepare(f.s,f.record);assert.equal(f.s.writingChecked,true);assert.deepEqual(f.s.writingFirstErrors,[1]);W.next(f.s);answer(f,'correct');assert.deepEqual(f.s.writingIds,[1]);
const saved=JSON.stringify(f.s);f.s=JSON.parse(saved);W.prepare(f.s,f.record);assert.equal(JSON.stringify(f.s),saved);answer(f,'correct');assert.equal(answer(f,'correct'),'done');
assert.equal(W.needs({writing:'incorrect'}),true);assert.equal(W.needs({writing:'correct'}),false);assert.equal(W.normalize(' MUG '),'mug');
console.log('PASS: first pass, exactly two extra checks, bounded errors, pending filter, standalone repair, legacy checked answer and reload.');
