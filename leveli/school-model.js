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
 // A stable sort follows the school-work date; missing dates retain source order.
 const items=regular.map((g,index)=>({...g,index})).sort((a,b)=>{
  const da=a.date instanceof Date&&!Number.isNaN(a.date.getTime())?a.date.getTime():null;
  const db=b.date instanceof Date&&!Number.isNaN(b.date.getTime())?b.date.getTime():null;
  return da===null||db===null?a.index-b.index:da-db||a.index-b.index;
 });
 const n=items.length;
 if(n<2)return {difference:null,recentAverage:null,previousAverage:null,recentGrades:[],previousGrades:[]};
 // For 2–5 grades compare the last individual grade against all earlier grades.
 // For 6+ grades compare weighted averages of two adjacent 3-grade blocks.
 const recent=n<6?items.slice(-1):items.slice(-3);
 const previous=n<6?items.slice(0,-1):items.slice(-6,-3);
 const recentAverage=mean(recent),previousAverage=mean(previous);
 return {difference:recentAverage-previousAverage,recentAverage,previousAverage,recentGrades:recent,previousGrades:previous};
}
function summary(regular,final=[]){
 const average=mean(regular);
 const {difference,recentAverage,previousAverage,recentGrades,previousGrades}=subjectTrend(regular);
 const official=final.filter(g=>g.officialKind==='За четверть'||officialKind(g)==='За четверть')
  .slice().sort((a,b)=>(a.date?.getTime()||0)-(b.date?.getTime()||0)).at(-1)?.value??null;
 return {average,forecast:regular.length>=3?forecast(average):null,official,recentAverage,previousAverage,difference,recentGrades,previousGrades,
  deteriorating:difference!==null&&difference<=-0.5};
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
// Each subject contributes equally, while its own average uses the mark weights.
function meanOfSubjects(groups){
 const averages=[...groups].map(mean);
 return averages.length?averages.reduce((sum,value)=>sum+value,0)/averages.length:null;
}
function monday(d){
 return new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7),12);
}
function dateKey(d){
 return [d.getFullYear(),d.getMonth()+1,d.getDate()].map(n=>String(n).padStart(2,'0')).join('-');
}
function selectWeeklySubjects(subjects){
 const magnitude=s=>Math.abs(s.delta??0);
 const ranked=subjects.sort((a,b)=>magnitude(b)-magnitude(a)||a.name.localeCompare(b.name,'ru'));
 const up=ranked.find(s=>s.delta>0),down=ranked.find(s=>s.delta<0);
 if(!up||!down)return ranked.slice(0,3);
 return [up,down,...ranked.filter(s=>s!==up&&s!==down).slice(0,1)];
}
function weeklyIssues(rows,now=new Date()){
 const currentMonday=monday(now);
 const buckets=new Map();
 for(const g of normalize(rows)){
  const when=date(g),quarter=period(g),name=String(g.subject||g.subjectName||'').trim();
  if(!when||!quarter||!name||officialKind(g))continue;
  const start=monday(when);
  if(start>=currentMonday)continue;
  const week=dateKey(start),id=quarter+':'+week;
  if(!buckets.has(id))buckets.set(id,{id,quarter,week,rows:[]});
  buckets.get(id).rows.push({...g,name});
 }
 const quarters=new Map();
 const releases=[];
 for(const {id,quarter,week,rows} of [...buckets.values()].sort((a,b)=>a.week.localeCompare(b.week)||a.quarter.localeCompare(b.quarter))){
  if(!quarters.has(quarter))quarters.set(quarter,{bySubject:new Map(),previous:null});
  const state=quarters.get(quarter);
  const active=new Set(rows.map(g=>g.name));
  const before=new Map([...active].map(name=>[name,mean(state.bySubject.get(name)||[])]));
  for(const g of rows){
   if(!state.bySubject.has(g.name))state.bySubject.set(g.name,[]);
   state.bySubject.get(g.name).push(g);
  }
  const totals={count:rows.length,fives:rows.filter(g=>g.value===5).length,average:meanOfSubjects(state.bySubject.values())};
  const subjects=selectWeeklySubjects([...active].map(name=>{
   const after=mean(state.bySubject.get(name)),prior=before.get(name);
   return {name,before:prior,after,delta:prior===null?null:after-prior};
  }));
  releases.push({id,quarter,week,totals,previous:state.previous,subjects});
  state.previous=totals;
 }
 return releases;
}
const api={score,mark,officialKind,date,period,academicYear,weight,mean,forecast,normalize,subjectTrend,summary,fivesNeeded,meanOfSubjects,weeklyIssues};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeveliSchool=api;
})(typeof globalThis!=='undefined'?globalThis:this);
