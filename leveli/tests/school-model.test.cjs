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
 const result=S.summary(rows,[{value:5,date:new Date(2026,9,1)}]);
 assert.equal(result.average,4.5);assert.equal(result.recentAverage,4);assert.equal(result.deteriorating,true);assert.equal(result.forecast,4);assert.equal(result.official,5);
 assert.equal(S.summary(rows.slice(0,2)).deteriorating,false);
 assert.equal(S.summary([{value:4,date:null},{value:3,date:null},{value:2,date:null}]).deteriorating,false);
});
test('normalization preserves source objects and excludes non-marks',()=>{
 const row={value:'5/5',type:'Контрольная',date:'01.09.2026'};const normalized=S.normalize([row,{value:'н'},null]);
 assert.equal(normalized.length,1);assert.equal(normalized[0].value,5);assert.equal(row.value,'5/5');
});
