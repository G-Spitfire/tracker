'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {overallAverage}=require('./analytics.js');
const quarters=[{start:'2026-11-04',end:'2026-12-30'}];
test('overall average is the unweighted mean of subject averages',()=>{
 const subjects=[{grades:[{value:5,date:'2026-11-10'},{value:5,date:'2026-11-11'},{value:5,date:'2026-11-12'}]},{grades:[{value:3,date:'2026-11-10'}]}];
 assert.equal(overallAverage(subjects,'1',quarters),4);
});
test('ignores grades outside the quarter and empty subjects',()=>{
 const subjects=[{grades:[{value:4,date:'2026-11-10'},{value:2,date:'2026-10-10'}]},{grades:[]}];
 assert.equal(overallAverage(subjects,'1',quarters),4);
});
test('empty or unknown quarter returns zero',()=>{
 assert.equal(overallAverage([], '1',quarters),0);
 assert.equal(overallAverage([{grades:[{value:5,date:'2026-11-10'}]}],'2',quarters),0);
});
