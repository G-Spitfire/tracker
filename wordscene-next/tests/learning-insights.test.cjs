const assert=require('node:assert/strict');
const I=require('../learning-insights.js');
const at=d=>new Date(d+'T12:00:00').getTime();
const day='2026-11-01',now=at(day);

const records=Array.from({length:5},(_,i)=>({started:true,trained:i<2,schedule:{stage:i===0?'spaced':'daily',firstLearnedAt:i===0?now:at('2026-10-01'),checks:[]}}));
records[0].schedule.checks.push({id:'r1',day,at:now,clean:true,directions:{0:true,1:true}});
assert.equal(I.stats(records,now).newToday,1);
assert.equal(I.stats(records,now).reviewedToday,1);
assert.equal(I.stats(records,now).accuracy7,100);
assert.equal(I.stats(records,now).week.at(-1).active,1);

for(const count of [3,22,30,47,83,100]){
 const due=Array.from({length:count},(_,i)=>i),visited=[];
 while(true){
  const next=I.portion(due,visited);
  if(!next.length)break;
  assert.ok(next.length<=30,`${count}: portion exceeds 30`);
  assert.equal(new Set(next).size,next.length,`${count}: duplicates in a portion`);
  assert.ok(next.every(i=>!visited.includes(i)),`${count}: repeated completed word`);
  visited.push(...next);
 }
 assert.deepEqual(visited,due,`${count}: portions must cover the complete queue`);
}
assert.deepEqual(I.portion([1,2,3,4,5],[1,2],3),[3,4,5]);
assert.equal(I.NEW_BATCH,5);
assert.equal(I.REVIEW_PORTION,30);

const cards=I.pairedCards([7,8,9]);
assert.equal(cards.length,6);
for(const id of [7,8,9])assert.deepEqual(cards.filter(c=>c.i===id).map(c=>c.dir).sort(),[0,1]);
assert.equal(I.pairedCards([7,7,8]).length,4,'one card pair per unique word');
console.log('PASS: daily metrics, five-word batches, paired checks and 30-word portions.');
