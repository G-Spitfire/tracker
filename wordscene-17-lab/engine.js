/* WordScene 17.0 - independent pure learning engine. Browser and Node compatible. */
(function(root){
'use strict';
const MS=60000, DAY=86400000, INTERVALS=[3,7,14,30], LIMIT={novice:15,experienced:30,pro:Infinity};
const day=(at=Date.now())=>{const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const addDays=(d,n)=>{const [y,m,k]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,k+n)).toISOString().slice(0,10)};
const unique=a=>[...new Set(a)];
const clone=x=>JSON.parse(JSON.stringify(x));
const empty=()=>({version:17,revision:0,level:'novice',words:{},sessions:[],levels:[],createdAt:Date.now()});
function word(p,id){return p.words[id]||null}
function schedule(p,id){return word(p,id)?.schedule||null}
function due(p,now=Date.now()){const today=day(now),yesterday=addDays(today,-1);return Object.keys(p.words).filter(id=>schedule(p,id)?.nextDay<=today).sort((a,b)=>{const rank=id=>{const w=p.words[id],r=w.schedule;if(w.firstLearnedAt&&day(w.firstLearnedAt)===yesterday&&!(w.history||[]).length)return 0;if(w.needsWork||r.stage==='repair')return 1;if(r.stage==='daily')return 2;return 3};return rank(a)-rank(b)||schedule(p,a).nextDay.localeCompare(schedule(p,b).nextDay)||a.localeCompare(b)})}
function levelLimit(p){return LIMIT[p.level]??15}
function selectCandidates(words,p,opts={}){
 const excluded=new Set([...(opts.seen||[]),...(opts.skipped||[])]),selected=new Set(opts.unknown||[]);
 const chosen=(opts.unknown||[]).map(id=>words.find(w=>w.en===id)).filter(Boolean);
 const themes=new Set(opts.themes||[]);
 const topic=opts.topic||(()=>[]);
 const strong=(a,b)=>a.cue?.trim().toLowerCase()===b.cue?.trim().toLowerCase() && !!a.cue || (a.associationId&&a.associationId===b.associationId);
 const pool=words.filter(w=>!excluded.has(w.en)&&!selected.has(w.en)&&!p.words[w.en]?.origin&&(!themes.size||topic(w.en).some(t=>themes.has(t))));
 const counts={};pool.forEach(w=>counts[w.en[0]]=(counts[w.en[0]]||0)+1);
 pool.sort((a,b)=>(counts[b.en[0]]||0)-(counts[a.en[0]]||0)||words.indexOf(a)-words.indexOf(b));
 return pool.filter(w=>chosen.every(v=>!strong(w,v))).slice(0,Math.min(10,50-(opts.seen?.length||0)));
}
function beginSelection(kind='auto',themes=[]){return {kind,stage:'select',themes,seen:[],unknown:[],known:[],cursor:0,startedAt:Date.now()}}
function selectionAnswer(sel,id,knows){
 if(sel.stage!=='select'||sel.seen.includes(id)||sel.seen.length>=50)throw Error('Selection closed or duplicate');
 sel.seen.push(id);(knows?sel.known:sel.unknown).push(id);
 return sel.unknown.length>=10||sel.seen.length>=50;
}
function eligible(p,ids){return unique(ids).length===ids.length&&ids.length>=3&&ids.length<=levelLimit(p)&&ids.every(id=>!p.words[id]?.origin)}
function queue(ids){return ids.map(id=>({id,dir:1})).concat(ids.map(id=>({id,dir:0})))}
function residualErrors(p){
 const last=p.sessions.findLast(s=>s.mode==='review');
 return last?.hardIds||[];
}
function start(p,mode,ids,known=[],at=Date.now()){
 if(!['new','review','practice'].includes(mode)||!ids.length)throw Error('Invalid session');
 if(mode==='new'&&!eligible(p,ids))throw Error('Invalid new-word selection');
 if(mode==='new'&&due(p,at).length)throw Error('Complete due reviews first');
 if(mode==='review'&&ids.some(id=>!due(p,at).includes(id)))throw Error('Only due words');
 if(mode==='practice'&&(due(p,at).length||ids.some(id=>!residualErrors(p).includes(id))))throw Error('Only residual errors');
 const all=unique(ids);
 return {id:'ws17-'+at+'-'+Math.random().toString(36).slice(2,10),mode,ids:all,known:unique(known),stage:mode==='new'?'learn':'recall',learnIndex:0,round:1,extra:0,items:queue(all),index:0,answers:[],hard:[],roundHard:[],startedAt:at,lastActionAt:at,pausedAt:null,openedAt:at,locked:false};
}
function remainingTime(s,now){return Math.max(0,30*MS-(now-(s.pausedAt??s.lastActionAt)))}
function timedOut(s,now){return remainingTime(s,now)===0}
function action(s,at=Date.now()){if(timedOut(s,at))throw Error('Session expired');s.lastActionAt=at;s.pausedAt=null}
function pause(s,at=Date.now()){action(s,at);s.pausedAt=at}
function learnNext(s,at=Date.now()){action(s,at);if(s.stage!=='learn')throw Error('Not learning');if(s.learnIndex<s.ids.length-1)s.learnIndex++;else{s.stage='recall';s.items=queue(s.ids);s.index=0}}
function answer(s,ok,at=Date.now(),ms=null,checked=false){
 action(s,at);if(s.stage!=='recall'||s.index>=s.items.length)throw Error('No active recall');
 const {id,dir}=s.items[s.index];
 if(s.mode!=='practice')s.answers.push({id,dir,round:s.round,extra:s.extra,ok:!!ok,at,ms:Number.isFinite(ms)&&ms>=0?ms:null,checked});
 if(!ok&&!s.roundHard.includes(id))s.roundHard.push(id);
 s.index++;
 if(s.index<s.items.length)return {done:false};
 if(s.mode==='new'&&s.extra===0&&s.round<3){s.round++;s.index=0;s.items=queue(s.ids);s.roundHard=[];return {nextRound:true}}
 const difficult=s.roundHard;
 if(difficult.length&&(s.mode==='practice'||s.extra<3)){s.extra++;s.round++;s.hard=unique([...s.hard,...difficult]);s.items=queue(difficult);s.index=0;s.roundHard=[];return {extra:true}}
 s.stage='complete';return {done:true};
}
function firstPair(s,id){
 const base=s.answers.filter(x=>x.id===id && x.extra===0 && x.round===(s.mode==='new'?3:1));
 return base.length===2&&base.every(x=>x.ok);
}
function scheduler(old,ok,at){
 const today=day(at),r=old?clone(old):{stage:'daily',days:[],checks:[],interval:0,nextDay:today,masteredAt:null};
 const originalDue=r.nextDay,hadToday=r.days.some(x=>x.day===today);
 r.checks.push({at,day:today,ok});
 if(!hadToday)r.days.push({day:today,ok});else{const d=r.days.find(x=>x.day===today);d.ok=d.ok&&ok}
 if(!ok){if(r.stage==='spaced')r.stage='repair';r.interval=0;r.repairSince=today;r.nextDay=addDays(today,1);return r}
 if(hadToday||today<originalDue)return r;
 if(r.stage==='daily'){
  const last=r.days.slice(-2);r.nextDay=addDays(today,1);
  if(r.days.length>=7&&last.every(x=>x.ok)){r.stage='spaced';r.interval=0;r.nextDay=addDays(today,3)}
 }else if(r.stage==='repair'){
  const recent=r.days.filter(x=>x.day>r.repairSince).slice(-2);
  r.nextDay=addDays(today,1);
  if(recent.length===2&&recent.every(x=>x.ok)){r.stage='spaced';r.interval=0;r.nextDay=addDays(today,3)}
 }else{
  if(r.interval===3&&!r.masteredAt)r.masteredAt=at;
  r.interval=Math.min(3,r.interval+1);r.nextDay=addDays(today,INTERVALS[r.interval])
 }
 return r;
}
function newSchedule(at){return {stage:'daily',days:[],checks:[],interval:0,nextDay:addDays(day(at),1),firstLearnedAt:at,masteredAt:null}}
function completed(p,s,at=Date.now()){
 if(s.stage!=='complete'||timedOut(s,at))throw Error('Incomplete or expired');
 if(s.mode==='practice')return p;
 if(p.sessions.some(x=>x.id===s.id))return clone(p);
 const next=clone(p);
 if(s.mode==='new'){
  for(const id of s.ids){if(next.words[id]?.origin)throw Error('Word already introduced');
    const needsWork=!firstPair(s,id)||s.roundHard.includes(id);
    next.words[id]={origin:'learned',firstLearnedAt:at,schedule:newSchedule(at),history:[],initialAnswers:s.answers.filter(a=>a.id===id),needsWork};}
  for(const id of s.known)if(!next.words[id]?.origin)next.words[id]={origin:'known',schedule:newSchedule(at),history:[],needsWork:false};
 }else{
  for(const id of s.ids){const w=next.words[id];if(!w?.origin)throw Error('Unknown review word');const ok=firstPair(s,id);
   w.history.push({at,ok,answers:s.answers.filter(a=>a.id===id)});
   w.schedule=scheduler(w.schedule,ok,at);w.needsWork=!ok;
   if(s.roundHard.includes(id))w.schedule.nextDay=addDays(day(at),1);
  }
 }
 next.sessions.push({id:s.id,mode:s.mode,ids:s.ids,at,successful:s.ids.filter(id=>firstPair(s,id)).length,extraWords:unique(s.answers.filter(a=>a.extra>0).map(a=>a.id)).length,hard:s.roundHard.length,...(s.mode==='review'?{hardIds:s.roundHard}: {})});
 next.revision++;recalcLevel(next);return next;
}
function recalcLevel(p){
 for(const [from,to,min,threshold] of [['novice','experienced',10,.8],['experienced','pro',20,.9]]){
  if(p.level!==from)continue;
  const last=p.sessions.filter(s=>s.mode==='new'&&s.ids.length>=min&&(from==='novice'||s.at>(p.levels.at(-1)?.at||0))).filter(s=>s.ids.every(id=>p.words[id]?.history.some(h=>day(h.at)>day(s.at)))).slice(-3);
  if(last.length<3)break;
  const ids=last.flatMap(s=>s.ids);
  const success=ids.filter(id=>{const origin=last.find(s=>s.ids.includes(id));const h=p.words[id].history.find(x=>day(x.at)>day(origin.at));return h?.ok}).length;
  if(success/ids.length>=threshold){p.level=to;p.levels.push({level:to,at:Date.now()})}
 }
}
function levelProgress(p){
 const cfg=p.level==='novice'?{min:10,threshold:.8,label:'Опытный'}:p.level==='experienced'?{min:20,threshold:.9,label:'Профи'}:null;
 if(!cfg)return {level:'pro',target:null,eligible:0,confirmed:0,successRate:null};
 const cutoff=p.level==='experienced'?(p.levels.at(-1)?.at||0):0;
 const eligible=p.sessions.filter(x=>x.mode==='new'&&x.ids.length>=cfg.min&&x.at>cutoff);
 const confirmed=eligible.filter(x=>x.ids.every(id=>p.words[id]?.history.some(h=>day(h.at)>day(x.at))));
 const three=confirmed.slice(-3),ids=three.flatMap(x=>x.ids);
 let successRate=null;
 if(ids.length){const hits=ids.filter(id=>{const origin=three.find(x=>x.ids.includes(id));return p.words[id].history.find(h=>day(h.at)>day(origin.at))?.ok}).length;successRate=hits/ids.length}
 return {level:p.level,target:cfg.label,eligible:eligible.length,confirmed:confirmed.length,window:three.length,successRate,threshold:cfg.threshold,min:cfg.min};
}
function status(w){if(!w)return 'new';if(w.schedule?.masteredAt&&w.schedule.stage==='spaced')return 'mastered';if(w.origin==='known')return 'known';return 'learning'}
const api={day,addDays,empty,clone,due,levelLimit,selectCandidates,beginSelection,selectionAnswer,eligible,queue,start,residualErrors,remainingTime,timedOut,action,pause,learnNext,answer,firstPair,scheduler,newSchedule,completed,recalcLevel,levelProgress,status};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WS17Engine=api;
})(typeof globalThis!=='undefined'?globalThis:this);