/* Pure copy planning: no UI, storage writes or catalog changes. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./model.js'));else root.AspectCopy=factory(root.AspectModel)})(typeof globalThis!=='undefined'?globalThis:this,function(M){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const active=day=>(day?.entries||[]).filter(e=>!e.details.cancelled&&!e.details.deleted);
 function shift(date,offset){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
 function dateOK(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&shift(date,0)===date}
 const monday=date=>shift(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
 function signature(entry){const e=clone(entry);delete e.id;delete e.details.copyOrigin;return JSON.stringify(e)}
 function preview(document,options){
  M.validate(document);
  const {source,target,period='day',mode='replace'}=options;
  if(!dateOK(source)||!dateOK(target))throw Error('Выберите корректные исходную и целевую даты.');
  if(!['day','week'].includes(period)||!['replace','merge'].includes(mode))throw Error('Выберите период и режим копирования.');
  const from=period==='week'?monday(source):source,to=period==='week'?monday(target):target;
  if(from===to)throw Error('Исходный и целевой периоды должны различаться.');
  const days=[];let repeats=0,absenceWarnings=0;
  for(let i=0;i<(period==='week'?7:1);i++){
   const sourceDate=shift(from,i),targetDate=shift(to,i),entries=active(document.days[sourceDate]);
   if(!entries.length)continue;
   const old=active(document.days[targetDate]);
   const repeated=entries.filter(e=>old.some(x=>x.details.copyOrigin?.date===sourceDate&&x.details.copyOrigin?.id===e.id||signature(x)===signature(e))).length;
   const absent=document.days[targetDate]?.absences||{};
   const absentCount=entries.filter(e=>e.staffIds.some(id=>Object.prototype.hasOwnProperty.call(absent,id))).length;
   days.push({source:sourceDate,target:targetDate,add:entries.length,replace:mode==='replace'?old.length:0,repeats:repeated,absences:absentCount});repeats+=repeated;absenceWarnings+=absentCount;
  }
  return {source:from,target:to,period,mode,days,add:days.reduce((n,d)=>n+d.add,0),replace:days.reduce((n,d)=>n+d.replace,0),repeats,absenceWarnings};
 }
 function apply(document,options){
  const plan=preview(document,options);
  if(!plan.days.length)throw Error('В исходном периоде нет записей для копирования.');
  const next=clone(document),ids=new Set(Object.values(document.days).flatMap(d=>d.entries.map(e=>e.id)));
  for(const day of plan.days){
   // Always read the immutable source document, including for any future overlapping ranges.
   const copies=active(document.days[day.source]).map(e=>{
    let id;do{id=M.id(e.event?'event':'ex')}while(ids.has(id));ids.add(id);
    return {...clone(e),id,details:{...clone(e.details),copyOrigin:{date:day.source,id:e.id}}};
   });
   const old=next.days[day.target]||{entries:[],absences:{},metadata:{}};
   next.days[day.target]={...old,entries:plan.mode==='merge'?[...old.entries,...copies]:copies,
    absences:clone(old.absences),metadata:plan.mode==='replace'?{...old.metadata,edits:{},resolutions:{},initialized:true}:old.metadata};
  }
  return {document:M.validate(next),plan};
 }
 return {preview,apply,active,monday,shift};
});
