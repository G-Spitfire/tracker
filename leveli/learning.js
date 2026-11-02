import {getDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const target=document.getElementById('learning-status');
let generation=0;
function summary(payload){const records=Object.values(payload.words||{});return 'Начато слов: '+records.filter(p=>p.started).length+' · пройдено обучение: '+records.filter(p=>p.trained).length+' · дней занятий: '+Object.keys(payload.habit?.days||{}).length+(payload.session?' · есть незавершённое занятие':'')}
async function render(){
 const token=++generation,sdk=window.leveliFirebase,user=sdk?.auth.currentUser;
 target.textContent=user?'Проверяем учебный прогресс…':'Войди в разделе «Школа», чтобы увидеть прогресс своего аккаунта.';
 if(!user)return;
 const active=()=>token===generation&&sdk.auth.currentUser?.uid===user.uid;
 let localShown=false;
 try{const marker=localStorage.getItem('wordscene-active-profile-v1'),raw=marker==='user:'+user.uid?localStorage.getItem('word-scenes-v5'):localStorage.getItem('word-scenes-v5-profile-'+encodeURIComponent(user.uid));const payload=JSON.parse(raw||'null');if(window.WordSceneState.valid(payload,500)){target.textContent='На этом устройстве: '+summary(payload)+'.';localShown=true}}catch{}
 try{const cloud=window.WordSceneFirestore.create({auth:sdk.auth,db:sdk.db,sdk:{doc:sdk.doc,getDoc,runTransaction,serverTimestamp},validate:p=>window.WordSceneState.valid(p,500)});const remote=await cloud.read();if(!active())return;if(remote.exists){target.textContent+=(localShown?' ':'');if(!localShown)target.textContent='';target.textContent+='Облачная копия, версия '+remote.revision+': '+summary(remote.payload)+'. Восстановление доступно в WordScene → Для взрослых.'}else if(!localShown)target.textContent='Для этого аккаунта пока нет учебной копии. Открой WordScene, чтобы начать.'}catch{if(!active())return;if(!localShown)target.textContent='Облачный прогресс недоступен. Проверь подключение и доступ к резервным копиям.';else target.textContent+=' Облачную копию сейчас проверить не удалось.'}
}
function connect(){const sdk=window.leveliFirebase;if(sdk)sdk.onAuthStateChanged(sdk.auth,render)}
if(window.leveliFirebase)connect();else window.addEventListener('leveliFirebaseReady',connect,{once:true});
window.addEventListener('storage',render);window.addEventListener('online',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
