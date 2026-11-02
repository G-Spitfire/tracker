(function(root){
'use strict';
const score=value=>{const m=/^([2-5])(?:\.0+)?(?:\/5)?$/.exec(String(value??'').trim());return m?Number(m[1]):null};
function isAttendance(value){return /^(?:н\.?|по болезни|болезнь|болел[аи]?|отсутствовал[аи]?|отсутствие|пропуск(?:\s+урока)?|неизвестн[а-яё]*(?:\s+(?:отметка|оценка))?|не\s+определен[а-яё]*|не\s+указан[а-яё]*|unknown|[?—-])$/i.test(String(value??'').trim())}
function mark(g){if([g.value,g.valueCode,g.type].some(isAttendance))return null;return score(g.value??g.grade)??score(g.valueCode)}
function officialKind(g){
 const kind=String(g.gradeType||g.type||g.category||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 if(g.isFinal===true)return 'Итоговая';
 if(/контрольн|проверочн|самостоят|диктант|сочинен|работа|домашн|урок|тест|проект|практическ|зачет|экзамен/.test(kind))return '';
 if(/четверт|quarter/.test(kind))return 'За четверть';
 if(/триместр/.test(kind))return 'За триместр';
 if(/полугод/.test(kind))return 'За полугодие';
 if(/годов|за год|annual/.test(kind))return 'За год';
 return /^(?:итоговая(?: (?:оценка|отметка))?|аттестационная(?: (?:оценка|отметка))?|final)$/.test(kind)?'Итоговая':'';
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
function period(g){const d=date(g),q=Number(g.quarter??g.term??g.periodNumber);if(!d)return null;const y=d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;const m=d.getMonth()+1;return y+'-'+(q>=1&&q<=4?q:m>=9&&m<=10?1:m>=11?2:m<=3?3:4)}
function mean(items){return items.length?items.reduce((sum,g)=>sum+Number(typeof g==='number'?g:g.value),0)/items.length:null}
function forecast(value){return value===null||!Number.isFinite(value)?null:value>=4.6?5:value>=3.6?4:value>=2.6?3:2}
function normalize(rows){return rows.filter(g=>g&&typeof g==='object').map(g=>({...g,value:mark(g)})).filter(g=>g.value!==null)}
function summary(regular,final=[]){
 const average=mean(regular),dated=regular.filter(g=>g.date instanceof Date).sort((a,b)=>a.date-b.date);
 const recent=dated.slice(-3),recentAverage=recent.length===3?mean(recent):null;
 const official=final.slice().sort((a,b)=>(a.date?.getTime()||0)-(b.date?.getTime()||0)).at(-1)?.value??null;
 return {average,forecast:forecast(average),official,recentAverage,deteriorating:recentAverage!==null&&average-recentAverage>=0.5-1e-10};
}
const api={score,mark,officialKind,date,period,mean,forecast,normalize,summary};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeveliSchool=api;
})(typeof globalThis!=='undefined'?globalThis:this);
