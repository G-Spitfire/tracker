import {initializeFirebase} from "./firebase.js";
import {firebaseConfig} from "./config.js";
import {signIn,signOutUser,observeUser} from "./auth.js";
import {loadOwnSchoolGrades} from "./school.js";
import {groupGradesBySubject} from "./subjects.js";
import {loadOwnProfile} from "./profile.js";

const $=id=>document.getElementById(id);
const login=$("school-login"),results=$("school-results"),state=$("school-state"),error=$("school-error"),list=$("school-subjects");
let userId=null, requestId=0;
function updateProfile(user, profile=null, profileError=false){
  const name=profile?.name||user?.displayName?.trim()||"";
  $("home-greeting").textContent=user?(name?"Привет, "+name+"!":"Привет!"):"Привет!";
  $("profile-name").textContent=user?(name||"Мой профиль"):"Гость";
  $("profile-status").textContent=!user?"Войди в аккаунт через раздел «Школа», чтобы увидеть свои данные.":profileError?"Аккаунт подключён. Не удалось загрузить профиль из Firestore.":name?"Аккаунт подключён. Школьные оценки доступны в разделе «Школа».":"Аккаунт подключён. Имя в профиле пока не задано.";
  $("profile-logout").hidden=!user;
}
$("profile-logout").addEventListener("click",async()=>{try{await signOutUser()}catch(e){sayError(e)}});
const sayError=e=>{error.textContent=e?.code||e?.message||"Не удалось загрузить данные";};
function render(subjects){
  list.replaceChildren();
  for(const s of subjects){
    const card=document.createElement("article");card.className="card";
    const heading=document.createElement("h2");heading.textContent=s.subject||"Предмет";
    const info=document.createElement("p");info.textContent="Текущих оценок: "+s.current.length+" · Средний балл: "+(s.average===null?"—":s.average.toFixed(2));
    card.append(heading,info);
    if(s.finals.length){
      const final=document.createElement("p");
      final.textContent="Итоговые: "+s.finals.map(g=>g.quarter+" четверть — "+(g.grade??"—")).join("; ");
      card.append(final);
    }
    const details=document.createElement("details");const summary=document.createElement("summary");summary.textContent="Посмотреть оценки";
    const entries=document.createElement("ul");
    for(const g of s.current){
      const item=document.createElement("li");
      item.textContent=[g.date,g.type,g.grade].filter(v=>v!==null&&v!==undefined&&v!=="").join(" · ");
      entries.append(item);
    }
    if(!s.current.length){const empty=document.createElement("p");empty.textContent="Текущих оценок нет";details.append(summary,empty)}
    else details.append(summary,entries);
    card.append(details);list.append(card);
  }
}
async function refresh(){
  const id=++requestId;
  state.textContent="Загрузка оценок…";error.textContent="";list.replaceChildren();
  try{
    const result=await loadOwnSchoolGrades();
    if(id!==requestId||!userId)return;
    if(result.status!=="ok"){state.textContent="Школьные данные пока отсутствуют.";return}
    const subjects=groupGradesBySubject(result.data);
    render(subjects);
    state.textContent=subjects.length?"Предметов: "+subjects.length+". Средний балл рассчитан по всем загруженным текущим оценкам.":"Оценок пока нет.";
  }catch(e){if(id===requestId){state.textContent="Не удалось получить оценки.";sayError(e)}}
}
$("school-form").addEventListener("submit",async e=>{
  e.preventDefault();error.textContent="";
  try{await signIn($("school-email").value,$("school-password").value)}
  catch(e){sayError(e)}
  finally{$("school-password").value=""}
});
$("school-refresh").addEventListener("click",refresh);
$("school-logout").addEventListener("click",async()=>{try{await signOutUser()}catch(e){sayError(e)}});
try{
  await initializeFirebase(firebaseConfig);
  await observeUser(user=>{
    userId=user?.uid??null;++requestId;updateProfile(user);
    login.hidden=!!user;results.hidden=!user;error.textContent="";
    if(user){
      const expectedUid=user.uid;
      loadOwnProfile().then(result=>{
        if(userId===expectedUid)updateProfile(user,result.profile);
      }).catch(()=>{
        if(userId===expectedUid)updateProfile(user,null,true);
      });
      refresh();
    }else list.replaceChildren();
  });
}catch(e){sayError(e)}
