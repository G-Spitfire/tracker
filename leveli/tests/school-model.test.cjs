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
test('six grades compare adjacent three-grade blocks regardless of source order',()=>{
 const rows=[5,5,5,4,4,4].map((value,i)=>({value,date:new Date(2026,8,i+1)})).reverse();
 const result=S.summary(rows,[{value:5,date:new Date(2026,9,1),officialKind:'За четверть'}]);
 assert.equal(result.average,4.5);assert.equal(result.recentAverage,4);
 assert.equal(result.previousAverage,5);assert.equal(result.difference,-1);
 assert.equal(result.deteriorating,true);assert.equal(result.forecast,4);assert.equal(result.official,5);
 assert.equal(S.summary(rows.slice(0,1)).difference,null);
 assert.equal(S.summary([{value:4},{value:3},{value:2}]).difference,-1.5);
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
test('trend at 6+ uses weights within both adjacent blocks',()=>{
 const grades=[{value:5,weight:2},{value:5,weight:2},{value:4,weight:1},{value:3,weight:1},{value:3,weight:1},{value:4,weight:1}].map((g,i)=>({...g,date:new Date(2026,8,i+1)}));
 const result=S.summary(grades);
 assert.equal(result.average,4.25);assert.equal(result.previousAverage,24/5);
 assert.equal(result.recentAverage,10/3);
 assert.ok(Math.abs(result.difference-(10/3-24/5))<1e-10);
 assert.equal(result.deteriorating,true);
});
test('short sequences compare last grade with previous weighted average',()=>{
 assert.equal(S.subjectTrend([]).difference,null);
 assert.equal(S.subjectTrend([{value:5}]).difference,null);
 for(const n of [2,3,4,5]){
  const grades=Array.from({length:n},(_,i)=>({value:i===n-1?5:3,weight:i===0?3:1,date:new Date(2026,8,i+1)}));
  const result=S.subjectTrend(grades);
  assert.equal(result.previousAverage,3);
  assert.equal(result.recentAverage,5);
  assert.equal(result.difference,2);
 }
 const weighted=S.subjectTrend([{value:5,weight:3},{value:3,weight:1},{value:4,weight:9}]);
 assert.equal(weighted.previousAverage,4.5);
 assert.equal(weighted.difference,-0.5);
});
test('equal dates retain source order and exactly +/-0.50 is significant',()=>{
 const rows=[{value:5,date:new Date(2026,8,1)},{value:4,date:new Date(2026,8,1)},{value:4,date:new Date(2026,8,1)}];
 const t=S.summary(rows);assert.equal(t.difference,-0.5);assert.equal(t.deteriorating,true);
 assert.equal(S.summary([{value:4},{value:5},{value:5}]).difference,0.5);
 assert.equal(S.summary([{value:4},{value:4},{value:4},{value:4},{value:4},{value:5}]).difference,1/3);
});
test('improvement goal uses hypothetical weight-one fives and thresholds',()=>{
 const grades=[{value:4,weight:3},{value:4,weight:1},{value:4,weight:1}];
 assert.equal(S.fivesNeeded(grades),8);
 assert.equal(S.fivesNeeded([{value:5},{value:5}]),null);
 assert.equal(S.fivesNeeded([{value:5},{value:5},{value:5}]),null);
 assert.equal(S.fivesNeeded([{value:2},{value:2},{value:2}]),1);
});
test('explicit academic year and quarter overrides approximate calendar; unknown period stays unknown',()=>{
 assert.equal(S.period({date:'2026-11-02',quarter:1,schoolYear:'2026/2027'}),'2026-1');
 assert.equal(S.period({quarter:2,schoolYear:'2026/2027'}),'2026-2');
 assert.equal(S.period({quarter:2}),null);
 assert.equal(S.period({date:'2026-11-02',quarter:2}),'2026-2');
});

test('observed first-quarter dates map consistently and quarter final stays separate',()=>{
 const regular={date:'2026-09-02',type:'Устный ответ',value:'5'};
 const lastRegular={date:'2026-10-23',type:'Самостоятельная работа',value:'4'};
 const final={date:'2026-10-25',type:'Четвертная',value:'5'};
 for(const row of [regular,lastRegular,final])assert.equal(S.period(row),'2026-1');
 assert.equal(S.officialKind(final),'За четверть');
 assert.equal(S.officialKind(lastRegular),'');
 assert.equal(S.period({date:'2026-11-01'}),null); assert.equal(S.period({date:'2026-11-05'}),'2026-2');
});

test('2026/27 school calendar uses supplied term dates and excludes holiday records',()=>{
 const inPeriod=(d)=>S.period({date:d});
 for(const [date,expected] of [
  ['2026-09-02','2026-1'],['2026-10-25','2026-1'],
  ['2026-10-26',null],['2026-11-03',null],['2026-11-04',null],
  ['2026-11-05','2026-2'],['2026-12-30','2026-2'],
  ['2026-12-31',null],['2027-01-10',null],
  ['2027-01-11','2026-3'],['2027-03-26','2026-3'],
  ['2027-03-27',null],['2027-04-04',null],
  ['2027-04-05','2026-4'],['2027-05-26','2026-4'],
  ['2027-05-27',null]
 ])assert.equal(inPeriod(date),expected,date);
 assert.equal(S.period({date:'2026-11-04',quarter:1}),'2026-1');
});

test('no trend below three marks; three marks are neutral against themselves',()=>{
 assert.equal(S.subjectTrend([]).difference,null);
 assert.equal(S.subjectTrend([{value:5}]).difference,null);
 assert.equal(S.subjectTrend([{value:5},{value:4}]).difference,null);
 assert.equal(S.subjectTrend([{value:5},{value:4},{value:3}]).difference,0);
});
test('older quarter marks affect the baseline',()=>{
 const data=[2,4,5,4,2,5,5].map((value,i)=>({value,date:new Date(2026,10,i+1)}));
 const res=S.summary(data);
 assert.ok(Math.abs(res.difference-(4-27/7))<1e-10);
 assert.equal(res.deteriorating,false);
 assert.notEqual(S.summary(data.slice(-6)).difference,res.difference);
});
