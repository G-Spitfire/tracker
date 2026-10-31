/* Child-friendly learning insights. No storage writes or network requests. */
(function(root){
'use strict';
const DAILY_REVIEW_PORTION=15;
const NEW_WHILE_BACKLOG=5;
function day(at=Date.now()){const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function shift(date,amount){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+amount)).toISOString().slice(0,10)}
function checks(p){return Array.isArray(p?.schedule?.checks)?p.schedule.checks:[]}
function stats(records,at=Date.now()){
 const today=day(at),days=Array.from({length:7},(_,i)=>shift(today,i-6)),sets=Object.fromEntries(days.map(d=>[d,new Set()]));
 let clean=0,attempted=0,recovered=0;
 const totals={started:0,trained:0,familiar:0,oral:0,writing:0,newToday:0};
 records.forEach((p,i)=>{
  if(p.started)totals.started++;
  if(p.trained)totals.trained++;
  if(p.schedule?.stage==='spaced')totals.familiar++;
  if(p.needsWork||p.schedule?.stage==='repair')totals.oral++;
  if(p.writingNeedsWork||p.writing==='incorrect'||p.writing==='forgot')totals.writing++;
  if(p.schedule?.firstLearnedAt!=null&&day(p.schedule.firstLearnedAt)===today)totals.newToday++;
  let hadProblem=false;
  for(const c of checks(p).filter(c=>c.day>=days[0]&&c.day<=today).sort((a,b)=>a.at-b.at)){
   sets[c.day]?.add(i);attempted++;if(c.clean)clean++;
   if(hadProblem&&c.clean){recovered++;hadProblem=false}
   if(!c.clean)hadProblem=true;
  }
 });
 const week=days.map(d=>({day:d,count:sets[d].size}));
 return {...totals,today,reviewedToday:sets[today].size,reviewedThisWeek:week.reduce((s,d)=>s+d.count,0),accuracy7:attempted?Math.round(100*clean/attempted):null,checks7:attempted,recovered,week};
}
function canLearnNew(records,dueCount,at=Date.now()){
 if(dueCount===0)return true;
 const s=stats(records,at);
 return s.reviewedToday>=DAILY_REVIEW_PORTION&&s.newToday<NEW_WHILE_BACKLOG;
}
function speedFeedback(history){
 const rounds=(history||[]).filter(r=>r&&r.valid!==false&&Number.isFinite(r.time)&&r.time>0);
 if(rounds.length<2)return {kind:'unknown',pauseSuggested:false};
 const previous=rounds.at(-2),current=rounds.at(-1),change=(previous.time-current.time)/previous.time;
 const plateau=Math.abs(change)<0.10;
 const kind=plateau?'plateau':change>=0.10&&current.errors<=previous.errors?'faster':change<=-0.10?'slower':'mixed';
 return {kind,change:Math.round(change*100),previousSeconds:Math.round(previous.time),currentSeconds:Math.round(current.time),pauseSuggested:kind==='plateau'&&current.errors>0&&history.length>=3};
}
const api={day,shift,stats,canLearnNew,speedFeedback,DAILY_REVIEW_PORTION,NEW_WHILE_BACKLOG};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneInsights=api;
})(typeof globalThis!=='undefined'?globalThis:this);
