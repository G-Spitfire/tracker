/* Child-first progress metrics and card-batch helpers. */
(function(root){
'use strict';
const REVIEW_PORTION=30,NEW_BATCH=5;
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
function portion(ids,excluded=[],limit=REVIEW_PORTION){
 const skipped=new Set(excluded),selected=[],seen=new Set();
 for(const id of ids){if(skipped.has(id)||seen.has(id))continue;seen.add(id);selected.push(id);if(selected.length>=limit)break}
 return selected;
}
function pairedCards(ids,shuffle=items=>items){
 const cards=[...new Set(ids)].flatMap(i=>[{i,dir:1},{i,dir:0}]);
 return shuffle(cards);
}
const api={day,shift,stats,portion,pairedCards,REVIEW_PORTION,NEW_BATCH};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneInsights=api;
})(typeof globalThis!=='undefined'?globalThis:this);
