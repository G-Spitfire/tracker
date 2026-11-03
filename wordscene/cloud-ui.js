/* Optional account panel. The learning app remains local-first and usable offline. */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

// Firebase rules verified on 2026-11-01; client backup enabled for the final candidate.
const AUTO_BACKUP_ENABLED=true;

const config={apiKey:"AIzaSyCs3gfUXcrlTJLZqxXQ0cgXpfuqNBkNIsU",authDomain:"family-school-grades.firebaseapp.com",projectId:"family-school-grades",storageBucket:"family-school-grades.firebasestorage.app",messagingSenderId:"1005917864241",appId:"1:1005917864241:web:4192a263b8ad39fdb3f010"};
const app=initializeApp(config,'wordscene-cloud'),auth=getAuth(app),db=getFirestore(app);
const validate=x=>window.WordSceneState.valid(x,500);
const cloud=window.WordSceneFirestore.create({auth,db,sdk:{doc,getDoc,runTransaction,serverTimestamp},validate});
const profiles=window.WordSceneProfiles.create({storage:localStorage,validate});
const syncEngine=window.WordSceneCloudSync.create({auth,cloud,storage:localStorage,validate,reload:()=>location.reload(),canSync:uid=>profiles.matches(uid),onSettings:value=>localStorage.setItem(profiles.syncProfileKey(value.uid),JSON.stringify(value)),onDisable:uid=>localStorage.removeItem(profiles.syncProfileKey(uid))});
const OFFER_KEY='wordscene-cloud-offer-v1';
function offerCloudLogin(){
 if(localStorage.getItem(OFFER_KEY)||auth.currentUser)return;
 const overlay=document.createElement('div');
 overlay.style.cssText='position:fixed;inset:0;z-index:1000;background:#0008;display:grid;place-items:center;padding:20px';
 const dialog=document.createElement('div');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Сохранение прогресса');
 dialog.style.cssText='background:#fff;color:#222;border-radius:18px;padding:24px;max-width:360px;width:100%;font:16px system-ui;text-align:center;box-shadow:0 12px 40px #0003';
 const title=document.createElement('h2');title.textContent='Сохраним твои успехи?';
 const desc=document.createElement('p');desc.textContent='Прогресс уже хранится на этом устройстве. Чтобы дополнительно сохранять его в облаке, попроси родителя помочь со входом.';
 const enter=document.createElement('button');enter.textContent='Войти в аккаунт';
 const skip=document.createElement('button');skip.textContent='Продолжить без аккаунта';
 for(const b of [enter,skip])b.style.cssText='display:block;width:100%;padding:12px;margin-top:10px;border-radius:10px;border:1px solid #6554b8;font:600 15px system-ui;cursor:pointer';
 enter.style.background='#6554b8';enter.style.color='#fff';skip.style.background='#fff';skip.style.color='#342b49';
 enter.onclick=()=>{localStorage.setItem(OFFER_KEY,'seen');overlay.remove();window.dispatchEvent(new Event('wordscene-open-settings'));email.focus()};
 skip.onclick=()=>{localStorage.setItem(OFFER_KEY,'seen');overlay.remove()};
 dialog.append(title,desc,enter,skip);overlay.append(dialog);document.body.append(overlay);
}

let authReady=false;
const panel=document.createElement('section');panel.setAttribute('aria-label','Облачная копия WordScene');
panel.style.cssText='font:14px system-ui;display:block';
document.getElementById('wordscene-cloud-slot').replaceChildren(panel);
window.addEventListener('wordscene-open-settings',()=>{email.focus()});
const status=document.createElement('p');status.setAttribute('role','status');
const form=document.createElement('form');
const email=document.createElement('input');email.type='email';email.setAttribute('aria-label','Электронная почта');email.placeholder='Электронная почта';email.required=true;email.autocomplete='username';email.style.width='100%';
const password=document.createElement('input');password.type='password';password.setAttribute('aria-label','Пароль');password.placeholder='Пароль';password.required=true;password.autocomplete='current-password';password.style.width='100%';
const button=(label,type='button')=>{const b=document.createElement('button');b.type=type;b.textContent=label;return b};
const saveCloud=button('Сохранить прогресс'),login=button('Войти','submit'),logout=button('Выйти'),restore=button('Восстановить прогресс'),download=button('Скачать облачную копию'),exportConflict=button('Скачать обе версии'),keepLocal=button('Сохранить эту версию в облако'),keepCloud=button('Восстановить облачную копию'),importGuest=button('Перенести гостевой прогресс');
const info=document.createElement('p');info.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
window.WordSceneBackupUI.advancedCloud.append(saveCloud,restore,keepLocal,keepCloud,download,importGuest,exportConflict);panel.append(status,form,info,logout);form.append(email,password,login);
const allButtons=[saveCloud,login,logout,restore,download,importGuest,exportConflict,keepLocal,keepCloud];
for(const b of allButtons)b.style.cssText='display:block;width:100%;min-height:42px;margin:7px 0;padding:9px 12px;background:#6554b8;color:#fff;border:1px solid #6554b8;border-radius:10px;font:600 14px system-ui;opacity:1;cursor:pointer';
for(const b of [logout,download,exportConflict]){b.style.background='#f1eafa';b.style.color='#342b49'}
for(const b of [exportConflict,keepLocal,keepCloud,importGuest])b.hidden=true;
for(const b of allButtons)b.disabled=true;login.disabled=false;
const uiStyle=document.createElement('style');uiStyle.textContent='section[aria-label="Облачная копия WordScene"] button:disabled{opacity:.5!important;cursor:wait!important}section[aria-label="Облачная копия WordScene"] button[hidden]{display:none!important}body.profile-switch-blocked>header,body.profile-switch-blocked>#app,body.profile-switch-blocked>.bottom-nav{visibility:hidden!important}';document.head.append(uiStyle);
function message(value){info.textContent=value}
let lastSyncSuccess=null;
function syncState(state){
 const uid=auth.currentUser?.uid||null;
 window.WordSceneSyncStatus={uid,state,lastSuccess:lastSyncSuccess};
 window.dispatchEvent(new Event('wordscene-sync-status'));
}

function assertProfile(uid){if(!uid||auth.currentUser?.uid!==uid||!profiles.matches(uid))throw new Error('Аккаунт или локальный профиль изменился; действие остановлено')}
let prepared=null,uiBusy=false;
function refreshButtons(){
 const user=auth.currentUser;form.hidden=!!user;logout.hidden=!user;restore.hidden=!user;download.hidden=!user;
 const validConflict=authReady&&!!user&&!!localStorage.getItem(syncEngine.conflictKey(user.uid));
 exportConflict.hidden=!validConflict;
 keepLocal.hidden=!prepared||!prepared.local;keepCloud.hidden=!prepared;
 importGuest.hidden=!(authReady&&user&&profiles.hasGuestProgress());
 for(const b of allButtons)b.disabled=!authReady||uiBusy;
 saveCloud.disabled=!authReady||!user||uiBusy||!window.WordSceneBackupUI.device.inspect().progress;
 login.disabled=uiBusy;logout.disabled=uiBusy||!user;
}
async function withBusy(task,allowBeforeReady=false){if(!authReady&&!allowBeforeReady){message('Проверяем аккаунт и локальный профиль.');return}uiBusy=true;for(const b of allButtons)b.disabled=true;try{await task()}catch(e){console.error('[WordScene cloud]',e);message('Ошибка: '+(e.code||'неизвестная')+'\n'+(e.message||'Нет описания'))}finally{uiBusy=false;refreshButtons()}}
form.onsubmit=e=>{e.preventDefault();void withBusy(async()=>{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,email.value,password.value);password.value='';message('Вход выполнен. Подготавливаем отдельный локальный профиль.')},true)};
logout.onclick=()=>void withBusy(async()=>{await signOut(auth);message('Вы вышли. Локальный прогресс сохранён.')},true);
restore.onclick=()=>void withBusy(async()=>{
 await pauseBackup();try{prepared=await syncEngine.prepareRestore();
 if(prepared.local&&syncEngine.stable(prepared.local)===prepared.remoteFingerprint){prepared=null;message('Копии совпадают. Прогресс уже сохранён в облаке.');return}
 const text='Это устройство: '+window.WordSceneBackup.summary(prepared.local)+'\nОблако: '+window.WordSceneBackup.summary(prepared.ticket.backup.progress);
 message(text);
 if(confirm(text+'\nВосстановить облачную копию? Предыдущие данные сохранятся для отката.'))await syncEngine.restorePrepared(prepared);
 }finally{resumeBackup()}
});
const summary=window.WordSceneBackup.summary;

download.onclick=()=>void withBusy(async()=>{const uid=auth.currentUser?.uid;assertProfile(uid);const remote=await cloud.read();assertProfile(uid);if(!remote.exists){message('Облачной копии нет.');return}const envelope={format:'wordscene-backup',version:1,createdAt:new Date().toISOString(),uid,progress:remote.payload};const blob=new Blob([JSON.stringify(envelope,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);try{const link=document.createElement('a');link.href=url;link.download='wordscene-cloud-backup.json';document.body.append(link);link.click();link.remove()}finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}message('Подготовлена копия облачного прогресса. Локальные данные не менялись.')});
let backupTask=null,backupRequested=false,backupTimer=0,recoveryBusy=false;
const BACKUP_DELAY=60000;
function queueBackup(delay){
 if(backupTimer)clearTimeout(backupTimer);
 backupTimer=setTimeout(()=>{backupTimer=0;void runSync()},delay);
}
function runSync(){
 if(!AUTO_BACKUP_ENABLED||!authReady||!auth.currentUser||recoveryBusy)return Promise.resolve({status:'idle'});
 if(backupTask){backupRequested=true;return backupTask}
 clearTimeout(backupTimer);backupTimer=0;backupRequested=false;
 backupTask=(async()=>{
  syncState('pending');
  try{
   const result=syncEngine.enabled()?await syncEngine.syncOnce():await syncEngine.bootstrapBackup();
   if(result.status==='conflict'||result.status==='conflict-race'){message('Обнаружены разные версии прогресса. Обе сохранены. Нужно проверить их перед продолжением облачного сохранения.');window.WordSceneBackupUI.showRecovery()}
   else if(result.status==='remote-newer'||result.status==='restore-available'){message('В облаке есть другая копия. Текущий прогресс не перезаписан.');window.WordSceneBackupUI.showRecovery()}
   else if(result.status==='pushed'||result.status==='same')message('Прогресс сохранён на устройстве и в облаке.');
   else if(result.status==='restored')message('Прогресс автоматически восстановлен из облака.');
   else if(result.status==='local-changed'){backupRequested=true;message('Копия отправлена. Новые ответы сохраняются следом.');}
   if(['pushed','same','restored'].includes(result.status)){lastSyncSuccess=Date.now();syncState('ok')}
   else if(['conflict','conflict-race','remote-newer','restore-available'].includes(result.status))syncState('conflict');
   else syncState('pending');
   refreshButtons();return result;
  }catch(e){
   console.error('[WordScene backup]',e);
   const offline=e.code==='unavailable'||e.code==='auth/network-request-failed'||e.message==='Failed to fetch'||e.message==='offline';
   message(offline?'Не удалось отправить копию. Повторим при возвращении связи.':'Не удалось обновить облачную копию: '+(e.message||e.code||'неизвестная ошибка')+'. Локальный прогресс не заменён.');
   syncState('error');return {status:'error'};
  }finally{backupTask=null;if(backupRequested)queueBackup(1000)}
 })();
 return backupTask;
}
saveCloud.onclick=()=>void withBusy(async()=>{message('Сохраняем прогресс в облаке…');await runSync()});
exportConflict.onclick=()=>void withBusy(async()=>{const capture=await syncEngine.exportConflict();const versions=[...syncEngine.getConflictHistory(capture.uid),capture];const blob=new Blob([JSON.stringify({format:'wordscene-conflict',version:1,uid:capture.uid,versions},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);try{const link=document.createElement('a');link.href=url;link.download='wordscene-conflict-backup.json';document.body.append(link);link.click();link.remove()}finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}message('Сохранены обе версии. Это устройство: '+summary(capture.local.progress)+'\nОблако (ревизия '+capture.cloud.revision+'): '+summary(capture.cloud.progress)+'\nЭтот файл можно восстановить через «Файлы и откат».')});
keepLocal.onclick=()=>void withBusy(async()=>{
 if(!prepared)throw Error('Сначала сравните копии через восстановление');
 if(!confirm('Сохранить прогресс этого устройства вместо облачного? Предыдущая облачная версия сохранится в резерве.'))return;
 const result=await syncEngine.keepPrepared(prepared);prepared=null;
 if(result.status==='local-changed'){scheduleBackup();message('Копия сохранена. Новые ответы отправятся следом.')}else message('Прогресс устройства сохранён в облаке.');
});
keepCloud.onclick=()=>void withBusy(async()=>{if(!prepared)throw Error('Сначала сравните копии');if(confirm('Восстановить показанную облачную копию? Прежние данные сохранятся для отката.'))await syncEngine.restorePrepared(prepared)});
importGuest.onclick=()=>void withBusy(async()=>{const uid=auth.currentUser?.uid;assertProfile(uid);if(!confirm('Перенести сохранённый гостевой прогресс в профиль этого аккаунта? Гостевая копия останется отдельно, а текущая копия аккаунта сохранится в резерве. Облачная копия автоматически не перезаписывается.'))return;assertProfile(uid);const result=profiles.importGuest(uid);message('Гостевой прогресс скопирован в аккаунт. Резерв текущего профиля: '+result.backupKey+'. Проверьте копии перед включением синхронизации.');location.reload()});
function scheduleBackup({immediate=false}={}){
 if(!AUTO_BACKUP_ENABLED||!authReady||!auth.currentUser)return;
 backupRequested=true;
 if(backupTask)return;
 if(immediate)queueBackup(0);else if(!backupTimer)queueBackup(BACKUP_DELAY);
}
function flushBackup(){if(backupRequested)void runSync()}
async function pauseBackup(){recoveryBusy=true;if(backupTask)await backupTask;clearTimeout(backupTimer);backupTimer=0}
function resumeBackup(){recoveryBusy=false;if(backupRequested)queueBackup(BACKUP_DELAY)}
window.WordSceneCloudBackup={enabled:AUTO_BACKUP_ENABLED,schedule:scheduleBackup,flush:flushBackup,pause:pauseBackup,resume:resumeBackup};
window.addEventListener('online',()=>void runSync());document.addEventListener('visibilitychange',()=>{if(document.hidden)flushBackup();else void runSync()});
onAuthStateChanged(auth,user=>{
 try{
  // Ask only on the first switch from a guest with actual progress to a
  // previously unused account. The guest save is preserved either way.
  const claimGuest=!!user&&profiles.canOfferGuestImport(user.uid)
   &&confirm('На этом устройстве есть изученные слова без аккаунта. Привязать этот прогресс к аккаунту '+(user.email||'ребёнка')+'?\n\nВыбирайте «ОК» только если это прогресс владельца аккаунта. Исходная гостевая копия сохранится.');
  const result=profiles.switchTo(user?.uid||null,{recoverDamagedTarget:true,importGuestOnFirstLogin:claimGuest});
  if(result.changed){authReady=false;document.body.dataset.wordsceneProfileState='switching';document.body.classList.add('profile-switch-blocked');status.textContent='Сохраняем данные предыдущего профиля и открываем отдельный профиль…';location.reload();return}
  lastSyncSuccess=null;
  window.WordSceneAccount=user?{uid:user.uid,displayName:(user.displayName||'').trim(),email:user.email||''}:null;
  syncState(user?'pending':'idle');
  window.dispatchEvent(new Event('wordscene-account-change'));
  authReady=true;document.body.dataset.wordsceneProfileState='ready';document.body.classList.remove('profile-switch-blocked');status.textContent=user?'Аккаунт: '+(user.email||'выполнен вход'):'Гостевой режим: прогресс только на этом устройстве';refreshButtons();if(user)void runSync()
 }catch(e){authReady=profiles.matches(user?.uid||null);document.body.dataset.wordsceneProfileState='damaged';document.body.classList.remove('profile-switch-blocked');status.textContent='Сохранение повреждено. Восстановите облачную копию или файл. Исходные данные не перезаписаны.';message(e.message||'Хранилище недоступно');refreshButtons();window.WordSceneBackupUI.showRecovery()}
});
