/* Staff absences and replacements: pure canonical-document operations. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./model.js'));else root.AspectStaff=factory(root.AspectModel)})(typeof globalThis!=='undefined'?globalThis:this,function(M){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const active=e=>!e.details.cancelled&&!e.details.deleted;
 const has=(o,key)=>Object.prototype.hasOwnProperty.call(o||{},key);
 function shift(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
 function dateOK(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&shift(date,0)===date}
 function checkPeriod(start,end){if(!dateOK(start)||!dateOK(end)||start>end)throw Error('Укажите корректные даты: начало не позже окончания.');}
 function checkStaff(doc,id){if(!doc.catalogs.staff.some(s=>s.id===id))throw Error('Выберите сотрудника из справочника.');}
 const key=(date,id)=>JSON.stringify([date,id]);
 function listAbsences(doc){
  M.validate(doc);const periods=[],last=new Map();
  for(const date of Object.keys(doc.days).sort())for(const [staffId,reason]of Object.entries(doc.days[date].absences)){
   const prior=last.get(staffId);
   if(prior&&prior.reason===reason&&shift(prior.end,1)===date)prior.end=date;
   else{const p={staffId,start:date,end:date,reason};periods.push(p);last.set(staffId,p)}
  }
  return periods.map(p=>({...p,key:JSON.stringify([p.staffId,p.start,p.end,p.reason])})).sort((a,b)=>a.start.localeCompare(b.start)||a.staffId.localeCompare(b.staffId));
 }
 function removeAbsence(doc,periodKey){
  const period=listAbsences(doc).find(p=>p.key===periodKey);if(!period)throw Error('Отсутствие изменилось. Обновите список.');
  const next=clone(doc);
  for(const [date,day]of Object.entries(next.days))if(date>=period.start&&date<=period.end)delete day.absences[period.staffId];
  return M.validate(next);
 }
 function setAbsence(doc,{staffId,start,end,reason='',previousKey=null}){
  M.validate(doc);checkPeriod(start,end);checkStaff(doc,staffId);if(typeof reason!=='string')throw Error('Некорректная причина отсутствия.');
  const next=previousKey?removeAbsence(doc,previousKey):clone(doc);const overwritten=[];
  for(let date=start;;date=shift(date,1)){
   if(!next.days[date])next.days[date]={entries:[],absences:{},metadata:{}};
   if(has(next.days[date].absences,staffId))overwritten.push(date);
   next.days[date].absences[staffId]=reason.trim();
   for(const entry of next.days[date].entries)if(entry.staffIds.includes(staffId)&&next.days[date].metadata.resolutions)delete next.days[date].metadata.resolutions[entry.id];
   if(date===end)break;
  }
  return {document:M.validate(next),overwritten};
 }
 function findAssignments(doc,{staffId,start,end}){
  M.validate(doc);checkStaff(doc,staffId);checkPeriod(start,end);
  const found=[];
  for(const date of Object.keys(doc.days).sort())if(date>=start&&date<=end)for(const entry of doc.days[date].entries)if(active(entry)&&entry.staffIds.includes(staffId))found.push({key:key(date,entry.id),date,entry:clone(entry)});
  return found.sort((a,b)=>a.date.localeCompare(b.date)||a.entry.start-b.entry.start||a.entry.id.localeCompare(b.entry.id));
 }
 function previewReplacement(doc,{staffId,replacementId,start,end,selectedKeys}){
  checkStaff(doc,replacementId);if(staffId===replacementId)throw Error('Выберите другого сотрудника на замену.');
  const found=findAssignments(doc,{staffId,start,end}),selected=selectedKeys===undefined?new Set(found.map(r=>r.key)):new Set(selectedKeys);
  if([...selected].some(k=>!found.some(r=>r.key===k)))throw Error('Список занятий изменился. Найдите занятия повторно.');
  const next=clone(doc),warnings=new Map();
  for(const row of found)if(selected.has(row.key)){
   const entry=next.days[row.date].entries.find(e=>e.id===row.entry.id);
   entry.staffIds=[...new Set(entry.staffIds.map(id=>id===staffId?replacementId:id))];
  }
  for(const row of found){
   const problems=[];
   if(selected.has(row.key)){
    if(row.entry.staffIds.includes(replacementId))problems.push('Уже назначен в этой записи — останется одно назначение.');
    if(has(doc.days[row.date].absences,replacementId))problems.push('Отсутствует в эту дату.');
    const current=next.days[row.date].entries.find(e=>e.id===row.entry.id);
    for(const other of next.days[row.date].entries)if(other.id!==current.id&&active(other)&&other.staffIds.includes(replacementId)&&current.start<other.end&&other.start<current.end){
     const title=doc.catalogs.activities.find(a=>a.id===other.activityId)?.name||other.title||'Занятие';
     problems.push('Пересечение с «'+title+'» ('+time(other.start)+'–'+time(other.end)+' · '+other.groupIds.map(id=>doc.catalogs.groups.find(g=>g.id===id)?.name||id).join(', ')+').');
    }
   }
   warnings.set(row.key,[...new Set(problems)]);
  }
  return {document:M.validate(next),rows:found.map(r=>({...r,selected:selected.has(r.key),warnings:warnings.get(r.key)})),count:selected.size,warningCount:[...warnings.values()].reduce((n,w)=>n+w.length,0)};
 }
 function replace(doc,options){const result=previewReplacement(doc,options);if(!result.count)throw Error('Выберите хотя бы одну запись для замены.');return result;}
 const time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 return {listAbsences,setAbsence,removeAbsence,findAssignments,previewReplacement,replace,time};
});
