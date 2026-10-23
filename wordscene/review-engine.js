/* WordScene: calendar-day review rules. No DOM, storage or hidden network calls. */
(function(root){
'use strict';
const INTERVALS=[3,7,14,30];
function day(at=Date.now()){const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function addDays(date,n){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10)}
function ensure(p,at=Date.now()){
 if(!p.trained)return null;
 if(!p.schedule)p.schedule={version:1,firstLearnedAt:null,stage:'daily',days:[],checks:[],interval:0,nextDay:day(at),migrated:true};
 return p.schedule;
}
function introduce(p,at=Date.now()){
 if(p.schedule)return p.schedule;
 p.trained=true;
 return p.schedule={version:1,firstLearnedAt:at,stage:'daily',days:[],checks:[],interval:0,nextDay:addDays(day(at),1),migrated:false};
}
function finish(p,{id,at=Date.now(),directions,clean}){
 const r=ensure(p,at);if(!r||r.checks.some(c=>c.id===id))return false;
 const today=day(at),previousDue=r.nextDay,hadToday=r.days.some(d=>d.day===today);
 const ok=clean===undefined?!!(directions&&directions[0]===true&&directions[1]===true):!!clean;
 r.checks.push({id,at,day:today,clean:ok,directions:directions||null});if(r.checks.length>100)r.checks.shift();
 const firstDay=r.firstLearnedAt===null?null:day(r.firstLearnedAt);
 // Same-day return is useful but does not stand in for tomorrow's check.
 if(firstDay!==today){const existing=r.days.find(d=>d.day===today);if(existing)existing.clean=existing.clean&&ok;else r.days.push({day:today,clean:ok});r.days.sort((a,b)=>a.day.localeCompare(b.day))}
 p.needsWork=!ok;
 if(!ok){if(r.stage==='spaced')r.stage='repair';r.interval=0;r.nextDay=addDays(today,1);r.repairSince=today;return true}
 // Repeating before the due date or several times today cannot advance stages.
 if(hadToday||today<previousDue){return true}
 if(r.stage==='daily'){
  const last=r.days.slice(-2);
  if(r.days.length>=7&&last.length===2&&last.every(d=>d.clean)){r.stage='spaced';r.interval=0;r.nextDay=addDays(today,INTERVALS[0])}
  else r.nextDay=addDays(today,1);
 }else if(r.stage==='repair'){
  const recent=r.days.filter(d=>d.day>(r.repairSince||'')).slice(-2);
  if(recent.length===2&&recent.every(d=>d.clean)){r.stage='spaced';r.interval=0;r.nextDay=addDays(today,INTERVALS[0])}
  else r.nextDay=addDays(today,1);
 }else{r.interval=Math.min(r.interval+1,INTERVALS.length-1);r.nextDay=addDays(today,INTERVALS[r.interval])}
 return true;
}
function due(p,at=Date.now()){const r=ensure(p,at);return !!r&&r.nextDay<=day(at)}
function optional(p,at=Date.now()){const r=ensure(p,at);return !!r&&r.firstLearnedAt!==null&&day(r.firstLearnedAt)===day(at)&&at-r.firstLearnedAt>=30*60*1000&&!r.checks.some(c=>c.day===day(at))}
function queue(records,at=Date.now()){
 return records.map((p,i)=>({p,i,r:ensure(p,at)})).filter(x=>x.r&&due(x.p,at)).sort((a,b)=>{
 const priority=x=>x.p.needsWork||x.r.stage==='repair'?0:x.r.stage==='daily'?1:2;
 return priority(a)-priority(b)||a.r.nextDay.localeCompare(b.r.nextDay)||(a.r.checks.at(-1)?.at||0)-(b.r.checks.at(-1)?.at||0)||a.i-b.i;
 }).map(x=>x.i);
}
function label(p,at=Date.now()){const r=ensure(p,at);return !r?(p.started?'Учим':'Не учили'):r.stage==='spaced'?'Знакомое':r.stage==='repair'?'Восстанавливаем':`Закрепляем ${Math.min(7,r.days.length)}/7`}
const api={day,addDays,ensure,introduce,finish,due,optional,queue,label,INTERVALS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneReview=api;
})(typeof globalThis!=='undefined'?globalThis:this);
