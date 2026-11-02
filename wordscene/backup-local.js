/* Portable device backups with a checked preview and reversible replacement. */
(function(root){
'use strict';
const KEY='word-scenes-v5',ROLLBACK='wordscene-rollback-v1';
function create({storage,validate,identity=()=>storage.getItem('wordscene-active-profile-v1')||'guest',disable=()=>{},now=()=>Date.now()}){
 const rollbackKey=()=>ROLLBACK+'-'+encodeURIComponent(identity());
 const parse=raw=>{const x=JSON.parse(raw);if(!x||x.format!=='wordscene-backup'||x.version!==1||x.progress?.version!==5||!validate(x.progress))throw Error('Несовместимая или повреждённая копия WordScene');return x};
 function current(){const raw=storage.getItem(KEY),progress=JSON.parse(raw);if(!validate(progress))throw Error('Текущее сохранение повреждено');return {raw,progress}}
 function exportCurrent(){return {format:'wordscene-backup',version:1,createdAt:new Date(now()).toISOString(),profile:identity(),progress:current().progress}}
 function preview(raw){if(typeof raw!=='string'||raw.length>5*1024*1024)throw Error('Файл слишком большой');return {backup:parse(raw),previous:current().raw,profile:identity()}}
 function restore(ticket){const value=parse(JSON.stringify(ticket.backup));if(ticket.profile!==identity()||ticket.previous!==current().raw)throw Error('Профиль или прогресс изменился. Сравните версии заново.');const rollback=JSON.stringify(exportCurrent());storage.setItem(rollbackKey(),rollback);if(storage.getItem(rollbackKey())!==rollback)throw Error('Не удалось сохранить откатную копию');disable();const next=JSON.stringify(value.progress);try{storage.setItem(KEY,next);if(storage.getItem(KEY)!==next)throw Error('Не удалось проверить восстановление')}catch(e){storage.setItem(KEY,ticket.previous);throw e}return value.progress}
 function rollback(){const raw=storage.getItem(rollbackKey());if(!raw)throw Error('Откатной копии пока нет');const ticket=preview(raw);if(ticket.backup.profile!==identity())throw Error('Откатная копия принадлежит другому профилю');return ticket}
 return {exportCurrent,preview,restore,rollback};
}
const api={create,ROLLBACK};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this);
