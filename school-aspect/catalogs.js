/* Canonical directory operations. No implicit schedule deletion or reassignment. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./model.js'):root.AspectModel);if(typeof module==='object'&&module.exports)module.exports=api;else root.AspectCatalogs=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M){
 'use strict';
 const kinds=['staff','groups','rooms','types','activities'];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const normalized=x=>String(x).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
 function item(doc,kind,id){if(!kinds.includes(kind))throw Error('Неизвестный справочник');const value=doc.catalogs[kind].find(x=>x.id===id);if(!value)throw Error('Объект больше не существует. Откройте справочник заново.');return value;}
 function usage(doc,kind,id){
  item(doc,kind,id);let entries=0,absences=0;
  for(const d of Object.values(doc.days)){
   for(const e of d.entries)if(kind==='staff'?e.staffIds.includes(id):kind==='groups'?e.groupIds.includes(id):kind==='rooms'?e.roomId===id:kind==='types'?e.typeId===id||doc.catalogs.activities.some(a=>a.id===e.activityId&&a.typeId===id):e.activityId===id)entries++;
   if(kind==='staff'&&Object.prototype.hasOwnProperty.call(d.absences,id))absences++;
  }
  const activities=kind==='types'?doc.catalogs.activities.filter(a=>a.typeId===id).length:0;
  return {entries,absences,activities};
 }
 function deletionReason(doc,kind,id){const u=usage(doc,kind,id),reasons=[];if(u.entries)reasons.push('связанных записей расписания: '+u.entries+' (включая прошлые даты)');if(u.activities)reasons.push('связанных названий занятий: '+u.activities);if(u.absences)reasons.push('отметок отсутствия: '+u.absences);return reasons.length?'Удаление запрещено: '+reasons.join('; ')+'.':'';}
 function sync(doc){
  const cfg=doc.settings['school_week_config_v12'];
  if(cfg){cfg.customLists={...(cfg.customLists||{}),teachers:doc.catalogs.staff.map(x=>x.name),rooms:doc.catalogs.rooms.map(x=>x.name)};cfg.deletedTeachers=[];}
  doc.settings['school_subjects_v19']=doc.catalogs.activities.map(x=>x.name);
  return M.validate(doc);
 }
 function save(doc,kind,values){
  if(!kinds.includes(kind))throw Error('Неизвестный справочник');
  const next=clone(doc),old=values.id?item(next,kind,values.id):null;
  const name=String(values.name||'').normalize('NFKC').trim().replace(/\s+/g,' ');
  if(!name||normalized(name)==='не назначен')throw Error('Введите непустое название. «Не назначен» — служебное значение.');
  if(next.catalogs[kind].some(x=>x.id!==old?.id&&normalized(x.name)===normalized(name)))throw Error('Такое название уже есть в этом справочнике.');
  const value={...(old||{}),id:old?.id||M.id(kind==='types'?'type':kind),name};
  if(kind==='types'){if(!/^#[0-9a-f]{6}$/i.test(values.color))throw Error('Выберите корректный цвет типа.');value.color=values.color;}
  if(kind==='activities'){item(next,'types',values.typeId);value.typeId=values.typeId;}
  if(values.restore)value.archived=false;
  if(old)Object.assign(old,value);else next.catalogs[kind].push(value);
  if(kind==='activities')for(const d of Object.values(next.days))for(const e of d.entries)if(e.activityId===value.id)e.typeId=value.typeId;
  const cfg=next.settings['school_week_config_v12'];
  if(old&&cfg){
   const previous=doc.catalogs[kind].find(x=>x.id===value.id).name;
   if(kind==='staff')for(const field of ['hours','teacherSavedHours','teacherNames','teacherRoles'])if(cfg[field]&&Object.prototype.hasOwnProperty.call(cfg[field],previous)){
    if(!Object.prototype.hasOwnProperty.call(cfg[field],value.id))cfg[field][value.id]=cfg[field][previous];delete cfg[field][previous];
   }
   if(kind==='staff'&&previous!==name){delete cfg.teacherNames?.[value.id];delete cfg.teacherNames?.[previous];}
   if(kind==='rooms')for(const k of Object.keys(cfg.home||{}))if(cfg.home[k]===previous)cfg.home[k]=name;
   // Obsolete name maps are not replayed and must not turn a later namesake into this object.
   if(kind==='staff'||kind==='rooms')delete cfg.renames?.[kind==='staff'?'teachers':'rooms'];
  }
  return {document:sync(next),id:value.id};
 }
 function remove(doc,kind,id){
  const old=item(doc,kind,id),reason=deletionReason(doc,kind,id);if(reason)throw Error(reason);
  const next=clone(doc),cfg=next.settings['school_week_config_v12'];next.catalogs[kind]=next.catalogs[kind].filter(x=>x.id!==id);
  if(cfg&&kind==='staff')for(const field of ['hours','teacherSavedHours','teacherNames','teacherRoles']){delete cfg[field]?.[id];delete cfg[field]?.[old.name];}
  if(cfg&&kind==='rooms')for(const key of Object.keys(cfg.home||{}))if(cfg.home[key]===old.name)cfg.home[key]='Не назначен';
  if(cfg&&kind==='groups'){
   const oldIds=doc.catalogs.groups.map(x=>x.id),home={};next.catalogs.groups.forEach((g,i)=>{const previous=oldIds.indexOf(g.id);if(cfg.home&&Object.prototype.hasOwnProperty.call(cfg.home,previous))home[i]=cfg.home[previous];});cfg.home=home;
  }
  return sync(next);
 }
 return {save,remove,usage,deletionReason,normalized};
});
