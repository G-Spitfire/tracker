/* Read-only schedule projections; canonical IDs, no storage or DOM effects. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AspectBoard=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const PIXELS_PER_MINUTE=1.5;
 const minute=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
 const active=e=>!e.details?.cancelled&&!e.details?.deleted;
 const entries=(doc,date)=>(doc.days[date]?.entries||[]).filter(active);
 const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;
 function bounds(es,display={}){return {start:Math.min(minute(display.start||'08:00'),...es.map(e=>e.start)),end:Math.max(minute(display.end||'19:00'),...es.map(e=>e.end))};}
 // Greedy interval partitioning within connected overlap components. Adjacent
 // intervals can reuse a lane; component width is its maximum concurrency.
 function layout(es){
  const sorted=[...es].sort((a,b)=>a.start-b.start||a.end-b.end||String(a.id).localeCompare(String(b.id))),out=new Map();
  let component=[],ends=[],until=-1;
  const flush=()=>{for(const x of component)out.set(String(x.id),{lane:x.lane,lanes:ends.length});component=[];ends=[];};
  for(const e of sorted){if(e.start>=until){flush();until=-1;}let lane=ends.findIndex(end=>end<=e.start);if(lane<0)lane=ends.length;ends[lane]=e.end;component.push({id:e.id,lane});until=Math.max(until,e.end);}
  flush();return out;
 }
 function conflicts(es){
  const out=[];
  for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
   const a=es[i],b=es[j];if(a.id===b.id||!overlaps(a,b))continue;
   const entryIds=[a.id,b.id].sort(),groupIds=[...new Set([...a.groupIds,...b.groupIds])];
   const add=(kind,resourceId)=>out.push({key:JSON.stringify([kind,resourceId,...entryIds]),kind,resourceId,entryIds,groupIds,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)});
   for(const id of a.staffIds)if(b.staffIds.includes(id))add('staff',id);
   if(a.roomId&&a.roomId===b.roomId)add('rooms',a.roomId);
   const collides=a.event||b.event||a.subgroup==='all'||b.subgroup==='all'||a.subgroup===b.subgroup;
   if(collides)for(const id of a.groupIds)if(b.groupIds.includes(id))add('groups',id);
  }
  return out.sort((a,b)=>a.start-b.start||a.key.localeCompare(b.key));
 }
 function merge(intervals){
  const out=[];for(const x of [...intervals].sort((a,b)=>a.start-b.start||a.end-b.end)){const p=out[out.length-1];if(p&&x.start<=p.end)p.end=Math.max(p.end,x.end);else out.push({start:x.start,end:x.end});}return out;
 }
 function free(range,busy){
  if(!range)return [];let cursor=range.start;const out=[];
  for(const b of merge(busy)){if(b.end<=cursor||b.start>=range.end)continue;if(b.start>cursor)out.push({start:cursor,end:Math.min(b.start,range.end)});cursor=Math.max(cursor,b.end);}
  if(cursor<range.end)out.push({start:cursor,end:range.end});return out;
 }
 function workRange(doc,date,staffId){
  const cfg=doc.settings.school_week_config_v12||{},name=doc.catalogs.staff.find(s=>s.id===staffId)?.name;
  const h=cfg.hours?.[staffId]||cfg.hours?.[name],wd=new Date(date+'T12:00:00').getDay();
  if(!h||!Object.prototype.hasOwnProperty.call(h,wd))return undefined;
  return h[wd]?{start:minute(h[wd][0]),end:minute(h[wd][1])}:null;
 }
 function overview(doc,date,kind,id){
  const es=entries(doc,date),assigned=es.filter(e=>kind==='staff'?e.staffIds.includes(id):e.roomId===id).sort((a,b)=>a.start-b.start||a.end-b.end);
  const absent=kind==='staff'&&Object.prototype.hasOwnProperty.call(doc.days[date]?.absences||{},id);
  const range=kind==='staff'?workRange(doc,date,id):bounds(es,doc.settings.school_week_config_v12?.display);
  return {entries:assigned,busy:merge(assigned),free:absent?[]:free(range,assigned),range,absent,reason:absent?doc.days[date].absences[id]:null,conflicts:conflicts(es).filter(c=>c.kind===kind&&c.resourceId===id)};
 }
 return {PIXELS_PER_MINUTE,entries,bounds,layout,conflicts,merge,free,workRange,overview};
});
