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
const inspect=document.createElement('button');inspect.textContent='Проверить облако';inspect.type='button';
const info=document.createElement('p');info.style.whiteSpace='pre-wrap';
panel.append(status,form,logout,inspect,upload,download,info);form.append(email,password,login);
function message(value){info.textContent=value}
function local(){
 const raw=localStorage.getItem(KEY);
 if(!raw)throw new Error('Локальное сохранение отсутствует');
 const value=JSON.parse(raw);
 if(!window.WordSceneState.valid(value,500))throw new Error('Локальные данные повреждены');
 return value;
}
async function guarded(task){
 for(const el of [login,logout,inspect,upload,download])el.disabled=true;
 try{await task()}catch(e){message('Ошибка: '+(e.code||e.message||'неизвестная'))}
 finally{for(const el of [login,logout,inspect,upload])el.disabled=false}
}
form.onsubmit=e=>{e.preventDefault();guarded(async()=>{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,email.value,password.value);password.value='';message('Вход выполнен. Данные пока не отправлены.')})};
logout.onclick=()=>guarded(async()=>{await signOut(auth);message('Вы вышли. Локальный прогресс сохранён.')});
inspect.onclick=()=>guarded(async()=>{const state=await cloud.read();message(state.exists?'В облаке есть копия, ревизия '+state.revision+'. Восстановление пока недоступно.':'В облаке пока нет копии.')});
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
onAuthStateChanged(auth,user=>{
 status.textContent=user?'Аккаунт: '+(user.email||'выполнен вход'):'Гостевой режим: прогресс только на этом устройстве';
 form.hidden=!!user;logout.hidden=!user;inspect.hidden=!user;upload.hidden=!user;download.hidden=!user;
});
