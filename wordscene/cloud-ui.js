/* Optional account panel. Never changes the existing local save workflow. */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const config={apiKey:"AIzaSyCs3gfUXcrlTJLZqxXQ0cgXpfuqNBkNIsU",authDomain:"family-school-grades.firebaseapp.com",projectId:"family-school-grades",storageBucket:"family-school-grades.firebasestorage.app",messagingSenderId:"1005917864241",appId:"1:1005917864241:web:4192a263b8ad39fdb3f010"};
const app=initializeApp(config,'wordscene-cloud');
const auth=getAuth(app),db=getFirestore(app);
const cloud=window.WordSceneFirestore.create({auth,db,sdk:{doc,getDoc,runTransaction,serverTimestamp},validate:x=>window.WordSceneState.valid(x,500)});
const KEY='word-scenes-v5';
const panel=document.createElement('section');
panel.setAttribute('aria-label','Облачная копия WordScene');
panel.style.cssText='position:fixed;right:12px;bottom:76px;z-index:40;max-width:min(340px,calc(100vw - 24px));padding:12px;border:1px solid #b8b8b8;border-radius:12px;background:#fff;color:#222;box-shadow:0 4px 20px #0002;font:14px system-ui;display:none';
const toggle=document.createElement('button');
toggle.type='button';toggle.textContent='Аккаунт';
toggle.style.cssText='position:fixed;right:12px;bottom:22px;z-index:41;padding:10px;border-radius:12px;background:#fff;color:#222;border:1px solid #888';
toggle.onclick=()=>{panel.style.display=panel.style.display==='none'?'block':'none'};
document.body.append(toggle,panel);
const status=document.createElement('p');status.setAttribute('role','status');
const form=document.createElement('form');
const email=document.createElement('input');email.type='email';email.placeholder='Электронная почта';email.required=true;email.autocomplete='username';email.style.width='100%';
const password=document.createElement('input');password.type='password';password.placeholder='Пароль';password.required=true;password.autocomplete='current-password';password.style.width='100%';
const login=document.createElement('button');login.textContent='Войти';login.type='submit';
const logout=document.createElement('button');logout.textContent='Выйти';logout.type='button';
const upload=document.createElement('button');upload.textContent='Создать облачную копию';upload.type='button';
const download=document.createElement('button');download.textContent='Скачать облачную копию';download.type='button';
const restore=document.createElement('button');restore.textContent='Восстановить из облака';restore.type='button';
const verify=document.createElement('button');verify.textContent='Проверить восстановление';verify.type='button';
const sync=document.createElement('button');sync.textContent='Включить автосинхронизацию';sync.type='button';
const syncNow=document.createElement('button');syncNow.textContent='Синхронизировать сейчас';syncNow.type='button';
const inspect=document.createElement('button');inspect.textContent='Проверить облако';inspect.type='button';
const info=document.createElement('p');info.style.whiteSpace='pre-wrap';
panel.append(status,form,logout,inspect,verify,restore,upload,sync,syncNow,download,info);form.append(email,password,login);
for(const b of [login,logout,inspect,verify,restore,upload,sync,syncNow,download]){
 b.style.cssText='display:block;width:100%;min-height:42px;margin:7px 0;padding:9px 12px;background:#6554b8;color:#fff;border:1px solid #6554b8;border-radius:10px;font:600 14px system-ui;opacity:1;cursor:pointer';
}
for(const b of [logout,inspect,verify,download]){b.style.background='#f1eafa';b.style.color='#342b49';}
const uiStyle=document.createElement('style');uiStyle.textContent='section[aria-label="Облачная копия WordScene"] button:disabled{opacity:.5!important;cursor:wait!important}section[aria-label="Облачная копия WordScene"] button[hidden]{display:none!important}';document.head.append(uiStyle);

const SYNC_KEY='wordscene-sync-v1';
let syncBusy=false;
function syncSettings(){try{return JSON.parse(localStorage.getItem(SYNC_KEY)||'null')}catch{return null}}
function syncEnabled(){const u=auth.currentUser?.uid,settings=syncSettings();return !!u&&settings?.uid===u&&Number.isSafeInteger(settings.revision)&&settings.revision>0}
function syncLabel(){sync.textContent=syncEnabled()?'Отключить автосинхронизацию':'Включить автосинхронизацию';syncNow.hidden=!syncEnabled()}
function message(value){info.textContent=value}

function local(){
 const raw=localStorage.getItem(KEY);
 if(!raw)throw new Error('Локальное сохранение отсутствует');
 const value=JSON.parse(raw);
 if(!window.WordSceneState.valid(value,500))throw new Error('Локальные данные повреждены');
 return value;
}
async function guarded(task){
 for(const el of [login,logout,inspect,verify,restore,upload,sync,syncNow,download])el.disabled=true;
 try{await task()}catch(e){console.error('[WordScene cloud] Подробности ошибки:',e);message('Ошибка: '+(e.code||'неизвестная')+'\n'+(e.message||'Нет описания')+'\n'+(e.stack||''))}
 finally{for(const el of [login,logout,inspect,verify,restore,upload,sync,syncNow,download])el.disabled=false;syncLabel()}
}
form.onsubmit=e=>{e.preventDefault();guarded(async()=>{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,email.value,password.value);password.value='';message('Вход выполнен. Данные пока не отправлены.')})};
logout.onclick=()=>guarded(async()=>{await signOut(auth);message('Вы вышли. Локальный прогресс сохранён.')});
inspect.onclick=()=>guarded(async()=>{const state=await cloud.read();message(state.exists?'В облаке есть копия, ревизия '+state.revision+'. Проверка восстановления доступна.':'В облаке пока нет копии.')});
verify.onclick=()=>guarded(async()=>{
 const remote=await cloud.read();
 if(!remote.exists){message('Облачной копии нет.');return}
 const restored=remote.payload;
 if(!window.WordSceneState.valid(restored,500))throw new Error('Облачные данные не прошли проверку');
 const original=local();
 const canonical=x=>JSON.stringify(x,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
 const same=canonical(original)===canonical(restored);
 const differences=[];
 function compare(a,b,path='root'){
  if(differences.length>=12)return;
  if(canonical(a)===canonical(b))return;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b)){
   differences.push(path+' (значения различаются)');return;
  }
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for(const key of keys){
   if(!(key in a)||!(key in b))differences.push(path+'.'+key+' (поле отсутствует)');
   else compare(a[key],b[key],path+'.'+key);
   if(differences.length>=12)break;
  }
 }
 if(!same)compare(original,restored);
 message(same?'Проверка успешна: облачная копия полностью совпадает с локальным сохранением. Ревизия '+remote.revision+'. Данные не изменены.':'Облачная копия корректна, но отличается от локального прогресса. Поля: '+differences.join(', ')+'. Ничего не изменено.');
});
restore.onclick=()=>guarded(async()=>{
 const remote=await cloud.read();
 if(!remote.exists)throw new Error('Облачная копия отсутствует');
 if(!window.WordSceneState.valid(remote.payload,500))throw new Error('Облачные данные повреждены');
 const currentRaw=localStorage.getItem(KEY);
 if(currentRaw!==null){const current=JSON.parse(currentRaw);if(!window.WordSceneState.valid(current,500))throw new Error('Локальные данные повреждены: восстановление остановлено');}
 if(!window.confirm('Восстановить прогресс из облака (ревизия '+remote.revision+')? Текущий локальный прогресс будет сохранён в отдельной резервной копии.'))return;
 const backupKey=KEY+'-before-cloud-restore-'+Date.now();
 if(currentRaw!==null){localStorage.setItem(backupKey,currentRaw);if(localStorage.getItem(backupKey)!==currentRaw)throw new Error('Не удалось сохранить резервную копию');}
 const next=JSON.stringify(remote.payload);
 try{localStorage.setItem(KEY,next);if(localStorage.getItem(KEY)!==next)throw new Error('Не удалось проверить локальное сохранение')}
 catch(error){if(currentRaw!==null)localStorage.setItem(KEY,currentRaw);else localStorage.removeItem(KEY);throw error}
 localStorage.removeItem(SYNC_KEY);syncLabel();
 message('Прогресс восстановлен из облака (ревизия '+remote.revision+'). '+(currentRaw!==null?'Резервная копия: '+backupKey+'. ':'')+'Перезагрузите страницу для применения.');
});
download.onclick=()=>guarded(async()=>{
 const remote=await cloud.read();
 if(!remote.exists){message('Облачная копия отсутствует.');return}
 const envelope={format:'wordscene-backup',version:1,createdAt:new Date().toISOString(),uid:auth.currentUser.uid,progress:remote.payload};
 const blob=new Blob([JSON.stringify(envelope,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 try{const link=document.createElement('a');link.href=url;link.download='wordscene-cloud-backup.json';document.body.appendChild(link);link.click();link.remove()}
 finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}
 message('Облачная копия подготовлена к скачиванию. Текущий прогресс не изменён.');
});
upload.onclick=()=>guarded(async()=>{
 const uid=auth.currentUser?.uid;
 if(!uid)throw new Error('Сначала войдите в аккаунт');
 const state=local();
 const remote=await cloud.read();
 if(remote.exists){message('В облаке уже есть копия. Автоматическая перезапись запрещена.');return}
 if(!window.confirm('Создать первую облачную копию текущего прогресса? Локальные данные останутся без изменений.'))return;
 await cloud.write(state,0);
 message('Облачная копия создана. Локальный прогресс не изменён.');
});
async function syncOnce(){
 if(syncBusy||!syncEnabled())return;
 syncBusy=true;
 try{
  const settings=syncSettings(),uid=auth.currentUser?.uid;
  if(!settings||settings.uid!==uid)return;
  const remote=await cloud.read();
  if(!remote.exists)throw new Error('Облачная копия исчезла: синхронизация остановлена');
  const raw=localStorage.getItem(KEY);
  if(!raw)throw new Error('Локальное сохранение отсутствует');
  const localState=JSON.parse(raw);
  if(!window.WordSceneState.valid(localState,500))throw new Error('Локальные данные повреждены');
  const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  const fingerprint=stable(localState),remoteFingerprint=stable(remote.payload);
  if(remote.revision!==settings.revision){
   if(fingerprint===remoteFingerprint){localStorage.setItem(SYNC_KEY,JSON.stringify({uid,revision:remote.revision,baseline:fingerprint}));return}
   if(fingerprint===settings.baseline){
    // Never overwrite an active app session. Let the user restore explicitly.
    localStorage.removeItem(SYNC_KEY);message('Облако обновилось на другом устройстве. Автосинхронизация остановлена. Нажмите «Восстановить из облака», чтобы принять новую версию.');syncLabel();return;
   }
   localStorage.removeItem(SYNC_KEY);message('Конфликт: прогресс изменён на двух устройствах. Автосинхронизация остановлена, данные сохранены. Выберите версию вручную.');syncLabel();return;
  }
  if(fingerprint===remoteFingerprint){
   if(settings.baseline!==fingerprint)localStorage.setItem(SYNC_KEY,JSON.stringify({uid,revision:remote.revision,baseline:fingerprint}));
   return;
  }
  if(settings.baseline!==remoteFingerprint){localStorage.removeItem(SYNC_KEY);message('Конфликт исходных данных. Синхронизация остановлена без перезаписи.');syncLabel();return}
  const result=await cloud.write(localState,remote.revision);
  localStorage.setItem(SYNC_KEY,JSON.stringify({uid,revision:result.revision,baseline:fingerprint}));
  message('Прогресс отправлен в облако. Ревизия '+result.revision+'.');
 }catch(e){if(e.code==='wordscene/conflict'){localStorage.removeItem(SYNC_KEY);message('Конфликт ревизий. Автосинхронизация остановлена.')}else{console.error('[WordScene sync]',e);message('Ошибка синхронизации: '+(e.message||e.code||'неизвестная')+'. Повторим при соединении.')}}
 finally{syncBusy=false;syncLabel()}
}
sync.onclick=()=>guarded(async()=>{
 if(syncEnabled()){localStorage.removeItem(SYNC_KEY);syncLabel();message('Автосинхронизация отключена. Прогресс остаётся локально.');return}
 const remote=await cloud.read();
 if(!remote.exists)throw new Error('Сначала создайте облачную копию');
 const state=local();
 const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 if(stable(state)!==stable(remote.payload))throw new Error('Локальная и облачная копии отличаются. Сначала выберите нужную версию; автоматическое объединение запрещено.');
 if(!window.confirm('Включить синхронизацию изменений с этим аккаунтом? При расхождении версий синхронизация остановится, чтобы не потерять данные.'))return;
 localStorage.setItem(SYNC_KEY,JSON.stringify({uid:auth.currentUser.uid,revision:remote.revision,baseline:stable(state)}));
 syncLabel();message('Автосинхронизация включена. Изменения проверяются при возвращении на вкладку и периодически.');
});
syncNow.onclick=()=>guarded(syncOnce);
window.addEventListener('online',()=>{void syncOnce()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncOnce()});
setInterval(()=>{if(!document.hidden)void syncOnce()},30000);
onAuthStateChanged(auth,user=>{
 status.textContent=user?'Аккаунт: '+(user.email||'выполнен вход'):'Гостевой режим: прогресс только на этом устройстве';
 form.hidden=!!user;logout.hidden=!user;inspect.hidden=!user;verify.hidden=!user;restore.hidden=!user;upload.hidden=!user;sync.hidden=!user;download.hidden=!user;syncLabel();
});
