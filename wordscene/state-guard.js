/* Validate persisted state before touching it. Invalid bytes remain untouched. */
(function(root){
'use strict';
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const index=(x,n)=>Number.isInteger(x)&&x>=0&&x<n;
function valid(data,count){
 if(!object(data)||!object(data.words))return false;
 for(const p of Object.values(data.words)){
  if(!object(p))return false;
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
 if(!object(s)||!['new','review'].includes(s.part)||!['learn','test','round','writing','between','result'].includes(s.phase))return false;
 if(!Array.isArray(s.ids)||!s.ids.length||!s.ids.every(i=>index(i,count))||new Set(s.ids).size!==s.ids.length)return false;
 if(!['completed','errors','partErrors'].every(k=>Array.isArray(s[k])))return false;
 if(s.newIds!==undefined&&(!Array.isArray(s.newIds)||!s.newIds.every(i=>index(i,count))))return false;
 if(s.phase==='learn'&&!index(s.learnIndex,s.ids.length))return false;
 if(s.part==='new'&&['test','round'].includes(s.phase)&&(![0,1].includes(s.dir)||!Array.isArray(s.history)||!Array.isArray(s.history[0])||!Array.isArray(s.history[1])))return false;
 if(s.phase==='test'&&(!Array.isArray(s.queue)||!index(s.pos,s.queue.length)||!s.queue.every(t=>object(t)&&s.ids.includes(t.i)&&[0,1].includes(t.dir))))return false;
 if(s.phase==='writing'&&(!Array.isArray(s.writingIds)||!index(s.writingIndex,s.writingIds.length)||!s.writingIds.every(i=>s.ids.includes(i))))return false;
 return true;
}
const api={valid};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneState=api;
})(typeof globalThis!=='undefined'?globalThis:this);
