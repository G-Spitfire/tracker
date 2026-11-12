const {test}=require('node:test');
const assert=require('node:assert/strict');
const {day,select}=require('../homework.js');
test('local calendar filters include year rollover and retain completed tasks',()=>{
 const now=new Date(2026,11,31,23,59);
 const items=[{id:'b',date:'2027-01-01',order:2,done:true},{id:'a',date:'2026-12-31'},{id:'c',date:'2027-01-01',order:1}];
 assert.equal(day(now),'2026-12-31');
 assert.deepEqual(select(items,'today','',now).map(x=>x.id),['a']);
 assert.deepEqual(select(items,'tomorrow','',now).map(x=>x.id),['c','b']);
 assert.equal(select(items,'date','2026-12-30',now).length,0);
 assert.deepEqual(select(items,'all','',now).map(x=>x.id),['a','c','b']);
 assert.equal(items[0].id,'b');
});
