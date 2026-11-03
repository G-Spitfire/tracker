/* Recovery stays available offline and when the active save is damaged. */
(function(){
'use strict';
const B=window.WordSceneBackup,validate=x=>window.WordSceneState.valid(x,500);
const panel=document.createElement('dialog');panel.setAttribute('aria-label','Аккаунт и сохранение');panel.style.cssText='width:calc(100% - 24px);max-width:480px;max-height:85dvh;overflow:auto;padding:20px;background:var(--paper);color:var(--ink);border:1px solid var(--border);border-radius:20px;font:15px/1.5 system-ui';
const style=document.createElement('style');style.textContent='dialog[aria-label="Аккаунт и сохранение"] [hidden]{display:none!important}dialog[aria-label="Аккаунт и сохранение"]::backdrop{background:#35204466}dialog[aria-label="Аккаунт и сохранение"] button{min-height:44px}dialog[aria-label="Аккаунт и сохранение"] select{margin:8px 0}';document.head.append(style);
const title=document.createElement('h2');title.textContent='Аккаунт и сохранение';const close=document.createElement('button');close.textContent='Закрыть';close.className='quiet';close.onclick=()=>panel.close();
const explanation=document.createElement('p');explanation.textContent='Прогресс сохраняется автоматически. На новом телефоне войдите в тот же аккаунт для восстановления.';
const slot=document.createElement('div');slot.id='wordscene-cloud-slot';slot.textContent='Облако подключится при наличии связи. Восстановление из файла доступно ниже.';
const info=document.createElement('p');info.style.whiteSpace='pre-wrap';info.setAttribute('role','status');
panel.append(title,close,explanation,slot,info);document.body.append(panel);
function open(){if(!panel.open)panel.showModal()}
window.addEventListener('wordscene-open-settings',open);window.addEventListener('wordscene-screen-change',()=>{if(panel.open)panel.close()});
const device=B.create({storage:localStorage,validate,disable:()=>{localStorage.removeItem('wordscene-sync-v1');const id=localStorage.getItem('wordscene-active-profile-v1');if(id?.startsWith('user:'))localStorage.removeItem('wordscene-sync-v1-profile-'+encodeURIComponent(id.slice(5)))}});
const details=document.createElement('details'),summary=document.createElement('summary'),advancedCloud=document.createElement('div');summary.textContent='Восстановление прогресса';details.append(summary,advancedCloud);details.hidden=true;panel.append(details);
const button=label=>{const b=document.createElement('button');b.textContent=label;b.className='secondary wide';b.style.margin='8px 0';return b};
const deviceExport=button('Скачать копию устройства'),fileInput=document.createElement('input'),undo=button('Отменить последнее восстановление');fileInput.type='file';fileInput.accept='.json,application/json';fileInput.setAttribute('aria-label','Восстановить из файла JSON');
const choices=document.createElement('select');choices.setAttribute('aria-label','Версия из файла');choices.hidden=true;const importButton=button('Восстановить выбранную версию');importButton.hidden=true;
const recoveryLabel=document.createElement('h3');recoveryLabel.textContent='Файлы и аварийное восстановление';details.append(recoveryLabel,deviceExport,fileInput,choices,importButton,undo);let selected=[];
async function applyFile(ticket){
 if(document.body.dataset.wordsceneProfileState==='switching')throw Error('Дождитесь переключения профиля');
 await window.WordSceneCloudBackup?.pause?.();
 try{const text='Это устройство: '+B.summary(device.inspect().progress)+'\nВыбранная копия: '+B.summary(ticket.backup.progress);
 info.textContent=text;if(!confirm(text+'\nВосстановить эту копию? Прежние данные останутся для отката.'))return;
 device.restore(ticket);location.reload();
 }finally{window.WordSceneCloudBackup?.resume?.()}
}
deviceExport.onclick=()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify(device.exportCurrent(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wordscene-device-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){info.textContent=e.message}};
fileInput.onchange=async()=>{
 try{const file=fileInput.files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('Файл слишком большой');selected=device.candidates(await file.text());choices.replaceChildren();
  for(const [i,item] of selected.entries()){const option=document.createElement('option');option.value=String(i);option.textContent=item.label+' — '+B.summary(item.backup.progress);choices.append(option)}
  choices.hidden=selected.length<2;importButton.hidden=false;info.textContent='Выбрана копия. Проверьте прогресс и нажмите «Восстановить выбранную версию».';
 }catch(e){selected=[];choices.hidden=true;importButton.hidden=true;info.textContent=e.message}finally{fileInput.value=''}
};
importButton.onclick=async()=>{try{const item=selected[Number(choices.value)||0];if(!item)throw Error('Сначала выберите файл');await applyFile(device.preview(JSON.stringify(item.backup)))}catch(e){info.textContent=e.message}};
undo.onclick=async()=>{try{await applyFile(device.rollback())}catch(e){info.textContent=e.message}};
function showRecovery(){details.hidden=false;details.open=true;open()}
window.WordSceneBackupUI={open,device,advancedCloud,showRecovery};
})();
