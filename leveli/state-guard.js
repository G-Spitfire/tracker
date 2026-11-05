/* Validate persisted state before touching it. Invalid bytes remain untouched. */
(function(root){
'use strict';
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const index=(x,n)=>Number.isInteger(x)&&x>=0&&x<n;
function valid(data,count){
 if(!object(data)||!object(data.words)||(data.version!==undefined&&data.version!==5))return false;
 for(const p of Object.values(data.words)){
  if(!object(p))return false;
  for(const key of ['started','trained','needsWork','writingNeedsWork'])if(p[key]!==undefined&&typeof p[key]!=='boolean')return false;
  if(p.writing!==undefined&&!['correct','incorrect','forgot'].includes(p.writing))return false;
  for(const key of ['attempts','errors','sessions','hesitations'])if(p[key]!==undefined&&(!Number.isFinite(p[key])||p[key]<0))return false;
  if(p.times!==undefined&&((!object(p.times)&&!Array.isArray(p.times))||![0,1].every(d=>Array.isArray(p.times[d]))))return false;
  const r=p.schedule;if(r===undefined||r===null)continue;
  if(!object(r)||!['daily','spaced','repair'].includes(r.stage)||!date(r.nextDay)||!Array.isArray(r.days)||!Array.isArray(r.checks)||!index(r.interval,4))return false;
  if(!r.days.every(d=>object(d)&&date(d.day)&&typeof d.clean==='boolean')||!r.checks.every(c=>object(c)&&typeof c.id==='string'&&date(c.day)&&Number.isFinite(c.at)))return false;
 }
 if(data.habit!==undefined){const h=data.habit;if(!object(h)||!object(h.days))return false;
  if(!Object.entries(h.days).every(([key,d])=>date(key)&&object(d)&&Array.isArray(d.reviews)&&d.reviews.every(w=>typeof w==='string')))return false;
 }
 const s=data.session;if(s===undefined||s===null)return true;
 if(!object(s)||!['new','review','writing'].includes(s.part)||!['learn','sort-next','test','round','writing','between','result'].includes(s.phase))return false;
 if(!({new:['learn','sort-next','test','round','writing','between','result'],review:['test','between','result'],writing:['writing','result']})[s.part].includes(s.phase))return false;
 if(!Array.isArray(s.ids)||!s.ids.length||!s.ids.every(i=>index(i,count))||new Set(s.ids).size!==s.ids.length)return false;
 if(!['completed','errors','partErrors'].every(k=>Array.isArray(s[k])))return false;
 if(s.newIds!==undefined&&(!Array.isArray(s.newIds)||!s.newIds.every(i=>index(i,count))))return false;
 if(s.sortPendingUnknown!==undefined&&(!Array.isArray(s.sortPendingUnknown)||!s.sortPendingUnknown.every(i=>index(i,count))||new Set(s.sortPendingUnknown).size!==s.sortPendingUnknown.length||s.sortPendingUnknown.length>5))return false;
 if(s.sortExtraStacks!==undefined&&(!Number.isInteger(s.sortExtraStacks)||s.sortExtraStacks<0||s.sortExtraStacks>5))return false;
 if(!s.completed.every(t=>typeof t==='string')||!['errors','partErrors'].every(k=>s[k].every(i=>s.ids.includes(i))))return false;
 for(const key of ['revealed','feedback','writingChecked','writingBreak'])if(s[key]!==undefined&&typeof s[key]!=='boolean')return false;
 if(s.phase==='learn'&&!index(s.learnIndex,s.ids.length))return false;
 if(s.part==='new'&&['test','round'].includes(s.phase)&&(![0,1].includes(s.dir)||!Array.isArray(s.history)||!Array.isArray(s.history[0])||!Array.isArray(s.history[1])))return false;
 if(s.part==='new'&&['test','round'].includes(s.phase)&&(!Number.isInteger(s.round)||s.round<1||!s.history.every(h=>Array.isArray(h)&&h.every(r=>object(r)&&Number.isFinite(r.errors)&&r.errors>=0))))return false;
 if(s.part==='new'&&s.phase==='test'&&!['roundTime','roundErrors','hesitations'].every(k=>Number.isFinite(s[k])&&s[k]>=0))return false;
 if(s.phase==='round'&&!s.history[s.dir].length)return false;
 if(s.reviewProgress!==undefined&&(!object(s.reviewProgress)||!Object.entries(s.reviewProgress).every(([i,p])=>s.ids.includes(Number(i))&&object(p)&&object(p.first)&&Object.entries(p.first).every(([dir,ok])=>['0','1'].includes(dir)&&typeof ok==='boolean'))))return false;
 if(s.phase==='test'&&(!Array.isArray(s.queue)||!index(s.pos,s.queue.length)||!s.queue.every(t=>object(t)&&s.ids.includes(t.i)&&[0,1].includes(t.dir))))return false;
 if(s.writingVersion===2&&(![0,1,2].includes(s.writingPass)||!Array.isArray(s.writingFirstErrors)||!s.writingFirstErrors.every(i=>s.ids.includes(i))||!object(s.writingRetryResults)||!Object.values(s.writingRetryResults).every(a=>Array.isArray(a)&&a.length<=2&&a.every(v=>['correct','incorrect','forgot'].includes(v)))))return false;
 if(s.phase==='writing'&&(!Array.isArray(s.writingIds)||!index(s.writingIndex,s.writingIds.length)||!s.writingIds.every(i=>s.ids.includes(i))||new Set(s.writingIds).size!==s.writingIds.length))return false;
 return true;
}
const api={valid};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneState=api;
})(typeof globalThis!=='undefined'?globalThis:this);
