/* Checked portable backups and one shared, reversible replacement path. */
(function(root){
'use strict';
const KEY='word-scenes-v5',ROLLBACK='wordscene-rollback-v1',LIMIT=5*1024*1024;
function create({storage,validate,identity=()=>storage.getItem('wordscene-active-profile-v1')||'guest',disable=()=>{},now=()=>Date.now()}){
 const rollbackKey=()=>ROLLBACK+'-'+encodeURIComponent(identity());
 const damagedKey=()=>ROLLBACK+'-damaged-'+encodeURIComponent(identity());
 function checkedWrite(key,raw){storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw Error('Не удалось проверить запись резервной копии')}
 function inspect(){const raw=storage.getItem(KEY);let progress=null;try{progress=JSON.parse(raw)}catch{}return {raw,progress:validate(progress)?progress:null}}
 function envelope(progress){return {format:'wordscene-backup',version:1,createdAt:new Date(now()).toISOString(),profile:identity(),progress}}
 function parse(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>LIMIT)throw Error('Файл слишком большой');
  const x=JSON.parse(raw);
  if(!x||x.format!=='wordscene-backup'||x.version!==1||x.progress?.version!==5||!validate(x.progress))throw Error('Несовместимая или повреждённая копия WordScene');
  return x;
 }
 function exportCurrent(){const x=inspect();if(!x.progress)throw Error('Текущее сохранение повреждено. Восстановите исправную копию.');return envelope(x.progress)}
 function preview(raw){return {backup:parse(raw),previous:storage.getItem(KEY),profile:identity()}}
 function assertFresh(ticket){if(ticket.profile!==identity()||ticket.previous!==storage.getItem(KEY))throw Error('Профиль или прогресс изменился. Сравните версии заново.')}
 function restore(ticket){
  const value=parse(JSON.stringify(ticket.backup));assertFresh(ticket);
  const old=inspect();
  // Never replace the last healthy rollback with malformed bytes.
  if(old.progress)checkedWrite(rollbackKey(),JSON.stringify(envelope(old.progress)));
  else if(old.raw!==null)checkedWrite(damagedKey(),JSON.stringify({format:'wordscene-damaged',version:1,profile:identity(),createdAt:new Date(now()).toISOString(),raw:old.raw}));
  disable();assertFresh(ticket);
  try{checkedWrite(KEY,JSON.stringify(value.progress))}
  catch(e){if(old.raw===null)storage.removeItem(KEY);else checkedWrite(KEY,old.raw);throw e}
  return value.progress;
 }
 function rollback(){const raw=storage.getItem(rollbackKey());if(!raw)throw Error('Откатной копии пока нет');const ticket=preview(raw);if(ticket.backup.profile!==identity())throw Error('Откатная копия принадлежит другому профилю');return ticket}
 function candidates(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>LIMIT)throw Error('Файл слишком большой');
  const x=JSON.parse(raw);
  if(x?.format==='wordscene-backup')return [{label:'Резервная копия',backup:parse(raw)}];
  if(x?.format!=='wordscene-conflict'||x.version!==1||!Array.isArray(x.versions))throw Error('Неизвестный формат копии WordScene');
  const result=[];
  for(const [i,pair] of x.versions.entries())for(const source of ['local','cloud']){
   const progress=pair?.[source]?.progress;
   if(progress?.version!==5||!validate(progress))throw Error('В архиве есть повреждённая версия. Исходный прогресс не изменён.');
   const backup={format:'wordscene-backup',version:1,createdAt:pair.capturedAt,profile:pair.uid?'user:'+pair.uid:x.uid?'user:'+x.uid:undefined,progress};
   if(!result.some(item=>JSON.stringify(item.backup.progress)===JSON.stringify(progress)))result.push({label:(source==='local'?'Устройство':'Облако')+' · снимок '+(i+1),backup});
  }
  if(!result.length)throw Error('В архиве нет сохранённого прогресса');return result;
 }
 return {exportCurrent,inspect,preview,restore,rollback,candidates,rollbackKey,damagedKey};
}
function summary(x){if(!x)return 'сохранение повреждено или отсутствует';const w=Object.values(x.words||{});return 'обучено '+w.filter(p=>p.trained).length+', ответов '+w.reduce((n,p)=>n+(p.attempts||0),0)+', дней '+Object.values(x.habit?.days||{}).filter(d=>d.qualified).length+', занятие '+(x.session&&!['result','between'].includes(x.session.phase)?'не завершено':'завершено')}
const api={create,summary,ROLLBACK};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this);
