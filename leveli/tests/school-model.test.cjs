const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../school-model.js');
test('forecast uses exact agreed thresholds without rounding first',()=>{
 for(const [value,expected] of [[2.59,2],[2.6,3],[3.59,3],[3.6,4],[4.59,4],[4.6,5],[5,5],[null,null]])assert.equal(S.forecast(value),expected);
 assert.equal(S.forecast(4.59999),4);
});
test('school dates are strict and retain explicit quarters across academic years',()=>{
 assert.equal(S.date({date:'31.10.2026'}).getMonth(),9);assert.equal(S.date({date:'31.02.2026'}),null);
 assert.equal(S.period({date:'2027-02-01'}),'2026-3');assert.equal(S.period({date:'2026-11-01',quarter:1}),'2026-1');
});
test('attendance never becomes a grade even with a numeric fallback',()=>{
 assert.equal(S.mark({value:'неизвестная',valueCode:'5'}),null);
 assert.equal(S.mark({value:'5',type:'н'}),null);assert.equal(S.mark({value:'5/5'}),5);
});
test('official grades are separate from summative tests and comments',()=>{
 assert.equal(S.officialKind({type:'Итоговая контрольная работа'}),'');
 assert.equal(S.officialKind({type:'Четвертная'}),'За четверть');assert.equal(S.officialKind({type:'Годовая'}),'За год');
 assert.equal(S.officialKind({type:'Устный ответ',comment:'четверть'}),'');
});
test('last three are sorted by date and a drop of exactly 0.5 triggers the warning',()=>{
 const rows=[5,5,5,4,4,4].map((value,i)=>({value,date:new Date(2026,8,i+1)})).reverse();
 const result=S.summary(rows,[{value:5,date:new Date(2026,9,1),officialKind:'За четверть'}]);
 assert.equal(result.average,4.5);assert.equal(result.recentAverage,4);assert.equal(result.deteriorating,true);assert.equal(result.forecast,4);assert.equal(result.official,5);
 assert.equal(S.summary(rows.slice(0,2)).deteriorating,false);
 assert.equal(S.summary([{value:4,date:null},{value:3,date:null},{value:2,date:null}]).deteriorating,false);
});
test('normalization preserves source objects and excludes non-marks',()=>{
 const row={value:'5/5',type:'Контрольная',date:'01.09.2026'};const normalized=S.normalize([row,{value:'н'},null]);
 assert.equal(normalized.length,1);assert.equal(normalized[0].value,5);assert.equal(row.value,'5/5');
});

test('weights apply only when official weight is available; fallback is one',()=>{
 const rows=[{value:5,weight:2},{value:3},{value:4,weight:1}];
 assert.equal(S.mean(rows),4.25);
 assert.equal(S.weight({}),1);
 assert.equal(S.weight({weight:'3'}),3);
 assert.equal(S.weight({weight:0}),1);
 assert.equal(S.mean([]),null);
});
test('forecast needs at least three regular grades and ignores other final types',()=>{
 const grades=[{value:5,date:new Date(2026,8,1),weight:2},{value:4,date:new Date(2026,8,2)}];
 assert.equal(S.summary(grades).forecast,null);
 assert.equal(S.summary([...grades,{value:5,date:new Date(2026,8,3)}]).forecast,5);
 assert.equal(S.summary(grades,[{value:5,officialKind:'За год'}]).official,null);
 assert.equal(S.summary(grades,[{value:4,officialKind:'За четверть'}]).official,4);
 assert.equal(S.officialKind({type:'Годовая',isFinal:true}),'За год');
 assert.equal(S.officialKind({type:'Итоговая контрольная работа',isFinal:true}),'');
});
test('weighted trend measures last three against quarter average',()=>{
 const grades=[{value:5,weight:2},{value:5,weight:2},{value:4,weight:1},{value:3,weight:1},{value:3,weight:1},{value:4,weight:1}]
  .map((g,i)=>({...g,date:new Date(2026,8,i+1)}));
 const result=S.summary(grades);
 assert.equal(result.average,4.25);
 assert.equal(result.recentAverage,10/3);
 assert.equal(result.deteriorating,true);
});
test('improvement goal uses hypothetical weight-one fives and thresholds',()=>{
 const grades=[{value:4,weight:3},{value:4,weight:1},{value:4,weight:1}];
 assert.equal(S.fivesNeeded(grades),8);
 assert.equal(S.fivesNeeded([{value:5},{value:5}]),null);
 assert.equal(S.fivesNeeded([{value:5},{value:5},{value:5}]),null);
 assert.equal(S.fivesNeeded([{value:2},{value:2},{value:2}]),2);
});
test('explicit academic year and quarter overrides approximate calendar; unknown period stays unknown',()=>{
 assert.equal(S.period({date:'2026-11-02',quarter:1,schoolYear:'2026/2027'}),'2026-1');
 assert.equal(S.period({quarter:2,schoolYear:'2026/2027'}),'2026-2');
 assert.equal(S.period({quarter:2}),null);
 assert.equal(S.period({date:'2026-11-02',quarter:2}),'2026-2');
});
