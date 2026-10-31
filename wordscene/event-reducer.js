/* Deterministic materializer for confirmed WordScene v2 events. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
const cmp=(a,b)=>String(a).localeCompare(String(b));
function create({review,habit,validate}){
 if(!review||!habit||typeof validate!=='function')throw new Error('Missing reducer dependencies');
 const stable=value=>JSON.stringify(value);
 const dayTime=day=>{if(typeof day!=='string'||!dayPattern.test(day))throw new Error('Invalid event day');const [y,m,d]=day.split('-').map(Number);return new Date(y,m-1,d,12).getTime()};
 const validEvent=e=>isObject(e)&&e.schemaVersion===2&&typeof e.eventId==='string'&&!!e.eventId&&typeof e.uid==='string'&&!!e.uid&&typeof e.baselineId==='string'&&!!e.baselineId&&typeof e.deviceId==='string'&&!!e.deviceId&&typeof e.wordId==='string'&&!!e.wordId&&typeof e.kind==='string'&&Number.isSafeInteger(e.createdAt)&&isObject(e.payload);
 function deduplicate(events,uid,baselineId){
  if(!Array.isArray(events)||!events.every(validEvent))throw new Error('Invalid event set');
  const map=new Map();for(const e of events){if(e.uid!==uid)throw new Error('Events belong to another profile');if(e.baselineId!==baselineId)throw new Error('Event was created from a different baseline');const previous=map.get(e.eventId);if(previous&&stable(previous)!==stable(e))throw new Error('Event ID collision in event set');map.set(e.eventId,e)}
  return [...map.values()];
 }
 function reduce({baseline,events,uid,baselineId,localState=null}){
  if(!validate(baseline))throw new Error('Invalid event baseline');
  if(typeof baselineId!=='string'||!baselineId)throw new Error('Invalid baseline identity');
  const all=deduplicate(events,uid,baselineId),data=clone(baseline),answers=all.filter(e=>e.kind==='answer'),introductions=all.filter(e=>e.kind==='new-completion'),checks=all.filter(e=>e.kind==='review-check'),writing=all.filter(e=>e.kind==='writing-check');
  const get=wordId=>data.words[wordId]??=( {} );
  for(const e of answers){const p=get(e.wordId),x=e.payload;if(![0,1].includes(x.direction)||typeof x.correct!=='boolean'||typeof x.easy!=='boolean'||!(x.elapsedSeconds===null||Number.isFinite(x.elapsedSeconds)))throw new Error('Invalid answer event');p.started=true;p.attempts=(p.attempts||0)+1;if(!x.correct){p.errors=(p.errors||0)+1;p.needsWork=true}else if(!x.easy)p.hesitations=(p.hesitations||0)+1;}
  // Samples and totals are independent of delivery order. The capped time
  // series uses stable event IDs for ordering, never a client clock.
  for(const wordId of new Set(answers.map(e=>e.wordId))){const p=get(wordId),samples=answers.filter(e=>e.wordId===wordId&&e.payload.correct&&e.payload.elapsedSeconds!==null).sort((a,b)=>cmp(a.eventId,b.eventId)).map(e=>e.payload.elapsedSeconds);if(samples.length){const baselineTimes=p.times||{0:[],1:[]};p.times={0:[...(baselineTimes[0]||[])],1:[...(baselineTimes[1]||[])]};for(const e of answers.filter(x=>x.wordId===wordId&&x.payload.correct&&x.payload.elapsedSeconds!==null).sort((a,b)=>cmp(a.eventId,b.eventId))){p.times[e.payload.direction].push(e.payload.elapsedSeconds);if(p.times[e.payload.direction].length>60)p.times[e.payload.direction].shift()}}}
  for(const e of answers){const p=get(e.wordId);p.lastAt=Math.max(p.lastAt||0,e.createdAt)}
  const orderedIntroductions=introductions.sort((a,b)=>cmp(a.payload.day,b.payload.day)||cmp(a.eventId,b.eventId));
  for(const e of orderedIntroductions){const p=get(e.wordId);if(typeof e.payload.day!=='string'||!dayPattern.test(e.payload.day)||typeof e.payload.needsWork!=='boolean')throw new Error('Invalid completion event');p.started=true;p.trained=true;if(!p.schedule)review.introduce(p,dayTime(e.payload.day));p.sessions=(p.sessions||0)+1;p.needsWork=!!p.needsWork||e.payload.needsWork;p.lastAt=Math.max(p.lastAt||0,e.createdAt)}
  const orderedChecks=checks.sort((a,b)=>cmp(a.payload.day,b.payload.day)||cmp(a.eventId,b.eventId));
  for(const e of orderedChecks){const x=e.payload;if(typeof x.day!=='string'||!dayPattern.test(x.day)||typeof x.clean!=='boolean'||!(x.directions===null||(Array.isArray(x.directions)&&x.directions.length===2&&x.directions.every(v=>typeof v==='boolean'))))throw new Error('Invalid review event');const p=get(e.wordId);p.started=true;p.trained=true;if(review.finish(p,{id:e.eventId,at:dayTime(x.day),directions:x.directions,clean:x.clean})){p.sessions=(p.sessions||0)+1;p.lastAt=Math.max(p.lastAt||0,e.createdAt)}}
  for(const wordId of new Set(writing.map(e=>e.wordId))){
   const p=get(wordId),rows=writing.filter(e=>e.wordId===wordId).sort((a,b)=>cmp(a.eventId,b.eventId)),issues=new Set(),resolved=new Set(),baselineIssue=`baseline:${wordId}`;
   if(p.writingNeedsWork===true||['incorrect','forgot'].includes(p.writing))issues.add(baselineIssue);
   p.writingEvents??=[];const seen=new Set(p.writingEvents.map(x=>x.eventId));
   for(const e of rows){const x=e.payload;if(!['correct','incorrect','forgot'].includes(x.result)||!Number.isInteger(x.pass)||x.pass<0||!(x.resolves===undefined||(Array.isArray(x.resolves)&&x.resolves.every(v=>typeof v==='string'))))throw new Error('Invalid writing event');if(x.result!=='correct')issues.add(e.eventId);if(x.result==='correct'&&x.pass>=2&&x.needsWork===false)for(const id of x.resolves||[])resolved.add(id);if(!seen.has(e.eventId)){p.writingEvents.push({eventId:e.eventId,sessionId:x.sessionId||'',pass:x.pass,result:x.result});seen.add(e.eventId)}}
   p.writingNeedsWork=[...issues].some(id=>!resolved.has(id));p.writing=rows.at(-1)?.payload.result||p.writing;if(!p.writingNeedsWork&&p.writingEvents.length)p.writing='correct';
  }
  habit.ensure(data);
  const dayEvents=[...orderedIntroductions.map(e=>({...e,habitKind:'new'})),...orderedChecks.map(e=>({...e,habitKind:'review'}))].sort((a,b)=>cmp(a.payload.day,b.payload.day)||cmp(a.eventId,b.eventId));
  for(const e of dayEvents){const at=dayTime(e.payload.day);if(e.habitKind==='new')habit.record(data.habit,{kind:'new',available:Math.max(1,introductions.length),at});else habit.record(data.habit,{kind:'review',word:e.wordId,available:Number.isInteger(e.payload.available)?e.payload.available:Math.max(1,introductions.length),at})}
  if(localState){for(const key of Object.keys(localState))if(!['words','habit','session'].includes(key))data[key]=clone(localState[key]);if(localState.session)data.session=clone(localState.session);else data.session=null}
  if(!validate(data))throw new Error('Reduced progress failed state validation');
  return data;
 }
 return {reduce,deduplicate};
}
const api={create};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneEventReducer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
