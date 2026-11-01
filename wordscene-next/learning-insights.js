/* Child-first analytics and learning suggestions: no network or storage writes. */
(function(root){
'use strict';
const DAILY_REVIEW_PORTION=15,NEW_WHILE_BACKLOG=5,MAX_SPEED_ROUNDS=5;
function day(at=Date.now()){const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function shift(date,amount){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+amount)).toISOString().slice(0,10)}
function checks(p){return Array.isArray(p?.schedule?.checks)?p.schedule.checks:[]}
function stats(records,at=Date.now()){
 const today=day(at),days=Array.from({length:7},(_,i)=>shift(today,i-6)),sets=Object.fromEntries(days.map(d=>[d,new Set()])),activeSets=Object.fromEntries(days.map(d=>[d,new Set()]));
 let clean=0,attempted=0,recovered=0;
 const totals={started:0,trained:0,familiar:0,oral:0,writing:0,newToday:0};
 records.forEach((p,i)=>{
  if(p.started)totals.started++;
  if(p.trained)totals.trained++;
  if(p.schedule?.stage==='spaced')totals.familiar++;
  if(p.needsWork||p.schedule?.stage==='repair')totals.oral++;
  if(p.writingNeedsWork===true||(p.writingNeedsWork===undefined&&['incorrect','forgot'].includes(p.writing)))totals.writing++;
  const learnedAt=p.schedule?.firstLearnedAt;
  if(Number.isFinite(learnedAt)){const learnedDay=day(learnedAt);if(learnedDay===today)totals.newToday++;activeSets[learnedDay]?.add(i)}
  let hadProblem=false;
  for(const c of checks(p).filter(c=>c.day>=days[0]&&c.day<=today).sort((a,b)=>a.at-b.at)){
   sets[c.day]?.add(i);activeSets[c.day]?.add(i);attempted++;if(c.clean)clean++;
   if(hadProblem&&c.clean){recovered++;hadProblem=false}
   if(!c.clean)hadProblem=true;
  }
 });
 const week=days.map(d=>({day:d,count:sets[d].size,active:activeSets[d].size}));
 return {...totals,today,reviewedToday:sets[today].size,reviewedThisWeek:week.reduce((s,d)=>s+d.count,0),accuracy7:attempted?Math.round(100*clean/attempted):null,checks7:attempted,recovered,week};
}
function newAllowance(records,dueCount,at=Date.now()){
 if(dueCount===0)return NEW_WHILE_BACKLOG;
 const s=stats(records,at);
 if(s.reviewedToday<DAILY_REVIEW_PORTION)return 0;
 // Large overdue queues together with weak recalls are a reason to consolidate, not add more.
 if(dueCount>=45&&s.checks7>=5&&s.accuracy7<70)return 0;
 return Math.max(0,NEW_WHILE_BACKLOG-s.newToday);
}
function canLearnNew(records,dueCount,at=Date.now()){return newAllowance(records,dueCount,at)>0}
function validSpeedRound(round){return round&&round.valid!==false&&Number.isFinite(round.time)&&round.time>0}
function speedFeedback(history){
 const h=Array.isArray(history)?history:[],current=h.at(-1),previous=h.at(-2);
 if(!validSpeedRound(previous)||!validSpeedRound(current))return {kind:'unknown',pauseSuggested:false,comparable:false};
 const change=(previous.time-current.time)/previous.time;
 const measure={change:Math.round(change*100),previousSeconds:Math.round(previous.time),currentSeconds:Math.round(current.time),comparable:true};
 if(current.errors>0||previous.errors>0)return {...measure,kind:'accuracy-first',pauseSuggested:false,comparable:false};
 const kind=Math.abs(change)<.10?'plateau':change>=.10?'faster':'slower';
 return {...measure,kind,pauseSuggested:false};
}
function roundRecommendation(history){
 const h=Array.isArray(history)?history:[],last=h.slice(-2);
 const clean=h.length>=3&&last.length===2&&last.every(r=>r?.errors===0);
 const speed=speedFeedback(h);
 const plateau=clean&&speed.kind==='plateau';
 const maxed=clean&&h.length>=MAX_SPEED_ROUNDS;
 const canAdvance=clean&&(speed.kind!=='faster'||maxed);
 // Treat missing timing as non-blocking, e.g. after a call, tab switch or pause.
 const suggestRest=h.length>=3&&!clean&&h.at(-1)?.errors>0;
 return {clean,plateau,maxed,canAdvance,suggestAnother:clean&&speed.kind==='faster'&&!maxed,suggestRest,speed};
}
const api={day,shift,stats,newAllowance,canLearnNew,speedFeedback,roundRecommendation,DAILY_REVIEW_PORTION,NEW_WHILE_BACKLOG,MAX_SPEED_ROUNDS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneInsights=api;
})(typeof globalThis!=='undefined'?globalThis:this);
