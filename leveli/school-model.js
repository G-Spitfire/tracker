(function(root){
'use strict';
const score=value=>{const m=/^([2-5])(?:\.0+)?(?:\/5)?$/.exec(String(value??'').trim());return m?Number(m[1]):null};
function isAttendance(value){return /^(?:н\.?|по болезни|болезнь|болел[аи]?|отсутствовал[аи]?|отсутствие|пропуск(?:\s+урока)?|неизвестн[а-яё]*(?:\s+(?:отметка|оценка))?|не\s+определен[а-яё]*|не\s+указан[а-яё]*|unknown|[?—-])$/i.test(String(value??'').trim())}
function mark(g){if([g.value,g.valueCode,g.type].some(isAttendance))return null;return score(g.value??g.grade)??score(g.valueCode)}
function officialKind(g){
 const kind=String(g.gradeType||g.type||g.category||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 // A generic isFinal flag cannot establish which reporting period was finalized.
 if(/контрольн|проверочн|самостоят|диктант|сочинен|работа|домашн|урок|тест|проект|практическ|зачет|экзамен/.test(kind))return '';
 if(/четверт|quarter/.test(kind))return 'За четверть';
 if(/триместр/.test(kind))return 'За триместр';
 if(/полугод/.test(kind))return 'За полугодие';
 if(/годов|за год|annual/.test(kind))return 'За год';
 return g.isFinal===true||/^(?:итоговая(?: (?:оценка|отметка))?|аттестационная(?: (?:оценка|отметка))?|final)$/.test(kind)?'Итоговая':'';
}
function date(g){
 const raw=g.date??g.gradeDate??g.lessonDate??g.createdAt;
 if(typeof raw!=='string')return null;
 let value=raw,parts;
 if((parts=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw)))value=parts[3]+'-'+parts[2]+'-'+parts[1];
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const [y,m,d]=value.split('-').map(Number),dt=new Date(y,m-1,d,12);
  return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?dt:null;
 }
 if(!/^\d{4}-\d{2}-\d{2}T/.test(value))return null;
 const result=new Date(value);return Number.isNaN(result.getTime())?null:result;
}
function academicYear(g,d){
 const raw=g.schoolYear??g.academicYear;
 if(typeof raw==='number'&&Number.isInteger(raw)&&raw>=2000&&raw<=2100)return raw;
 const m=/^(20\d{2})(?:[\/-](?:20)?\d{2})?$/.exec(String(raw??'').trim());
 if(m)return Number(m[1]);
 return d?(d.getMonth()>=8?d.getFullYear():d.getFullYear()-1):null;
}
function period(g){
 const d=date(g),year=academicYear(g,d),q=Number(g.quarter??g.term??g.periodNumber);
 if(year===null)return null;
 if(Number.isInteger(q)&&q>=1&&q<=4)return year+'-'+q;
 if(!d)return null;
 if(year===2026){
  const key=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
  if(key>=20260901&&key<=20261025)return '2026-1'; // first term confirmed through Oct 25
  if(key>=20261105&&key<=20261230)return '2026-2';
  if(key>=20270111&&key<=20270326)return '2026-3';
  if(key>=20270405&&key<=20270526)return '2026-4';
  return null; // do not assign holiday dates to the next term
 }
 const m=d.getMonth()+1;
 return year+'-'+(m>=9&&m<=10?1:m>=11?2:m<=3?3:4);
}
function weight(g){
 const raw=g?.weight??g?.gradeWeight??g?.coefficient;
 if(raw===undefined||raw===null||String(raw).trim()==='')return 1;
 const value=Number(raw);
 return Number.isFinite(value)&&value>0?value:1;
}
function mean(items){
 let sum=0,total=0;
 for(const g of items){
  const value=typeof g==='number'?g:Number(g?.value);
  if(!Number.isFinite(value))continue;
  const w=typeof g==='number'?1:weight(g);
  sum+=value*w;total+=w;
 }
 return total?sum/total:null;
}
function forecast(value){return value===null||!Number.isFinite(value)?null:value>=4.6?5:value>=3.6?4:value>=2.6?3:2}
function normalize(rows){return rows.filter(g=>g&&typeof g==='object').map(g=>({...g,value:mark(g)})).filter(g=>g.value!==null)}
function subjectTrend(regular){
 const dated=regular.map((g,index)=>({...g,index})).filter(g=>g.date instanceof Date&&!Number.isNaN(g.date.getTime())).sort((a,b)=>a.date-b.date||a.index-b.index);
 // If a mark has no date, preserve its source order as an explicit fallback.
 const items=dated.length===regular.length?dated:regular.map((g,index)=>({...g,index})).sort((a,b)=>{
  const da=a.date instanceof Date?a.date.getTime():null,db=b.date instanceof Date?b.date.getTime():null;
  return da===null||db===null?a.index-b.index:da-db||a.index-b.index;
 });
 const n=items.length;
 if(n<3)return {difference:null,recentAverage:null,previousAverage:null};
 // Compare the weighted last three marks to the weighted full-quarter mean.
 const recentAverage=mean(items.slice(-3)),previousAverage=mean(items);
 const difference=recentAverage-previousAverage;
 return {difference,recentAverage,previousAverage};
}
function summary(regular,final=[]){
 const average=mean(regular);
 const {difference,recentAverage,previousAverage}=subjectTrend(regular);
 const official=final.filter(g=>g.officialKind==='За четверть'||officialKind(g)==='За четверть')
  .slice().sort((a,b)=>(a.date?.getTime()||0)-(b.date?.getTime()||0)).at(-1)?.value??null;
 return {average,forecast:regular.length>=3?forecast(average):null,official,recentAverage,previousAverage,difference,
  deteriorating:difference!==null&&difference<=-0.5+1e-10};
}
// Assume future marks of 5 have weight 1. Calculation is only a scenario.
function fivesNeeded(regular){
 const avg=mean(regular),current=regular.length>=3?forecast(avg):null;
 if(current===null||current===5)return null;
 const threshold={2:2.6,3:3.6,4:4.6}[current];
 const total=regular.reduce((n,g)=>n+weight(g),0);
 const sum=regular.reduce((n,g)=>n+Number(g.value)*weight(g),0);
 // Small epsilon prevents off-by-one due to binary floating-point artifacts.
 for(let n=1;n<=100000;n++)if((sum+5*n)/(total+n)+1e-12>=threshold)return n;
 return null;
}
const api={score,mark,officialKind,date,period,academicYear,weight,mean,forecast,normalize,subjectTrend,summary,fivesNeeded};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeveliSchool=api;
})(typeof globalThis!=='undefined'?globalThis:this);
