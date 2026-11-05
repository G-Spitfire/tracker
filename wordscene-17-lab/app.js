/* WordScene 17.0 - isolated UI; no reads/writes to 16.17 data. */
(()=>{
'use strict';
const E=window.WS17Engine,T=window.WordSceneTopics||{topics:[],forWord:()=>[]},C=window.WordSceneContent;
const dictionary=[...window.WS17_SEED,...(C?.cards||[])].filter((w,i,a)=>a.findIndex(x=>x.en===w.en)===i);
const byId=Object.fromEntries(dictionary.map(w=>[w.en,w]));
const ACCOUNT_KEY='wordscene-17-lab-current-account-v1';
const currentAccount=(()=>{try{const id=localStorage.getItem(ACCOUNT_KEY);return ['child-1','child-2'].includes(id)?id:'local'}catch{return 'local'}})();
const cloudEnabled=['localhost','127.0.0.1'].includes(window.location?.hostname);
const BINDINGS='wordscene-17-lab-cloud-bindings-v1';
let cloud,cloudBusy=false,cloudConflict;
const accountSuffix=currentAccount==='local'?'':'-account-'+currentAccount;
const KEY='wordscene-17-lab-v1'+accountSuffix,ACTIVE='wordscene-17-lab-active-v1'+accountSuffix,PRACTICE='wordscene-17-lab-practice-cleared-v1'+accountSuffix;
const root=document.getElementById('app');
let profile,session=null,selection=null,view='home',batch=[],showAnswer=false,showHelp=false,manual=new Set(),themeIds=new Set(),manualThemes=new Set(),query='',clockStarted=null,confirmed=false,storageFailure=false,savedProfileRaw=null,savedActiveRaw=null;
let progressRange='30',qualityRange='28',progressVisible=5;const openHistory=new Set();
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const dateText=at=>new Date(at).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const accounts=window.WS17Accounts.create({storage:localStorage,empty:E.empty,valid:window.WS17Accounts.validProfile,keyFor:id=>({main:'wordscene-17-lab-v1'+(id==='local'?'':'-account-'+id),active:'wordscene-17-lab-active-v1'+(id==='local'?'':'-account-'+id),backup:'wordscene-17-lab-last-good-v1'+(id==='local'?'':'-account-'+id)})});
function store(){
 if(storageFailure)return false;
 try{accounts.save(currentAccount,profile,session,savedProfileRaw,savedActiveRaw);savedProfileRaw=localStorage.getItem(KEY);savedActiveRaw=localStorage.getItem(ACTIVE);return true}
 catch(err){storageFailure=true;notice('Не удалось сохранить: '+err.message+'. Данные защищены от перезаписи.');return false}
}
function load(){
 try{
 const state=accounts.load(currentAccount);
 if(!['new','ok'].includes(state.status))throw Error('Сохранение требует восстановления: '+state.status);
 profile=state.profile;session=state.session;savedProfileRaw=localStorage.getItem(KEY);savedActiveRaw=localStorage.getItem(ACTIVE);
 }catch(err){storageFailure=true;profile=E.empty();session=null;notice('Сохранение повреждено. Исходные данные не перезаписываются.')}
 if(session&&E.timedOut(session,Date.now())){session=null;store();notice('Прошло 30 минут. Незавершённое занятие отменено.')}
}
function notice(s){let el=document.getElementById('notice');if(!el){el=document.createElement('div');el.id='notice';el.setAttribute('role','status');document.body.append(el)}el.textContent=s;el.hidden=false;clearTimeout(notice.id);notice.id=setTimeout(()=>el.hidden=true,5500)}
function speak(id){if(!('speechSynthesis' in window))return notice('Озвучивание недоступно на этом устройстве');const u=new SpeechSynthesisUtterance(id);u.lang='en-US';u.rate=.83;speechSynthesis.cancel();speechSynthesis.speak(u)}
function btn(label,event,cls='',disabled=false){return '<button type="button" data-action="'+event+'" class="'+cls+'" '+(disabled?'disabled':'')+'>'+label+'</button>'}
function head(name){return '<header><span class="brand">WordScene <b>17</b></span><span class="lab">Лаборатория · отдельный прогресс</span></header><main><h1>'+name+'</h1>'}
function end(){return '</main>'}
function shell(title,html,layout){root.innerHTML=layout||head(title)+html+end();root.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>{if(root.contains?.(el)===false)return;return dispatch(el.dataset.action,el)}));root.querySelectorAll('[data-input]').forEach(el=>el.addEventListener('input',()=>{const caret=el.selectionStart;query=el.value;render();const next=root.querySelector('[data-input]');if(next){next.focus();next.setSelectionRange(caret,caret)}}));}
function warnLocked(){if(storageFailure){notice('Сохранение недоступно, изменения заблокированы');return true}if(session){notice('Сначала закончи или отмени текущее занятие');return true}return false}
function levelInfo(){const p=E.levelProgress(profile);return !p.target?'<p class="reason">Уровень Профи достигнут.</p>':'<p class="reason">До уровня «'+p.target+'»: подтверждено '+Math.min(3,p.window||0)+' из 3 подходящих занятий · минимум '+p.min+' новых слов в занятии · '+Math.round(p.threshold*100)+'% успешных первых проверок.</p>'}
function pauseTime(){
 const seconds=Math.ceil(E.remainingTime(session,Date.now())/1000);
 return 'Осталось '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
const levelLabels={novice:'Новичок',experienced:'Опытный',pro:'Профи'};
const paperIcons={
 book:'<path fill="#fff2cf" stroke="#ffa600" d="M12 5C9 2 5 2 2 3v15c4-1 7-1 10 2 3-3 6-3 10-2V3c-3-1-7-1-10 2v15"/><path stroke="#0877ff" d="M22 3v15c-4-1-7-1-10 2" class="paper-book-edge"/><path stroke="#efc16d" stroke-width=".65" d="M4 7q3-.6 6 1M4 10q3-.6 6 1M4 13q3-.6 6 1m4-6q3-1.6 6-1m-6 4q3-1.6 6-1m-6 4q3-1.6 6-1"/>',
 settings:'<path d="M10 2h4l.6 3 2.1.9 2.6-1.6 2.8 2.8-1.6 2.6.9 2.1 3 .6v4l-3 .6-.9 2.1 1.6 2.6-2.8 2.8-2.6-1.6-2.1.9-.6 3h-4l-.6-3-2.1-.9-2.6 1.6-2.8-2.8 1.6-2.6-.9-2.1-3-.6v-4l3-.6.9-2.1-1.6-2.6 2.8-2.8 2.6 1.6 2.1-.9Z" transform="translate(2 0) scale(.82)"/><circle cx="12" cy="11.5" r="2.8"/>',
 cap:'<path fill="#005cae" stroke="none" d="M5 11h14v7q-7 5-14 0z"/><path fill="#007bd8" stroke="none" d="m0 10 12-6 12 6-12 6z"/><path stroke="#ffa600" d="m12 10-8 4v6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
 plus:'<path d="M12 3v18M3 12h18"/>',
 lock:'<path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="3" y="9" width="18" height="14" rx="2" fill="currentColor" stroke="none"/><path stroke="#f4ede5" d="M12 15v4"/>',
 repeat:'<path d="M20 8a8 8 0 1 0 0 8m0-12v5h-5"/>',
 progress:'<path stroke="#0877ff" stroke-width="4.5" d="M5 20v-4m7 4v-9m7 9V4"/>',
 next:'<path d="m9 5 7 7-7 7"/>'
};
function paperIcon(name){
 return '<svg class="paper-icon paper-icon-'+name+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paperIcons[name]+'</svg>';
}
function paperAction(label,action,reason='',subtitle=''){
 const icon=reason?'lock':action==='sources'?'plus':'repeat';
 return btn('<span class="paper-action-icon">'+paperIcon(icon)+'</span><span>'+label+
  (reason||subtitle?'<small>'+(reason||subtitle)+'</small>':'')+'</span>'+(!reason?paperIcon('next'):''),
  action,'paper-action paper-'+action,!!reason);
}
function wordCount(n){
 const tail=n%100,last=n%10;
 return n+' '+(tail>=11&&tail<=14?'слов':last===1?'слово':last>=2&&last<=4?'слова':'слов');
}
function paperLevel(){
 const p=E.levelProgress(profile);
 const count=p.window||0;
 const detail=p.target?
  '<p class="paper-target">Следующий уровень — '+p.target+'</p><p>Три занятия, от '+p.min+' новых слов в каждом. На повторении вспомни от '+Math.round(p.threshold*100)+'% в обе стороны.</p>'+
  '<div class="paper-confirmed"><small>Подтверждено занятий: <strong>'+count+' из 3</strong></small>'+
  '<div class="paper-steps" aria-hidden="true">'+[1,2,3].map(i=>i<=count?'<i class="filled">✓</i>':'<i></i>').join('')+'</div></div>'+
  (count===3?'<small>Вспомнил в обе стороны: <strong>'+Math.floor(p.successRate*100)+'%</strong></small>':''):
  '<p>Ты на самом высоком уровне.</p>';
 return '<section class="paper-card paper-level" aria-labelledby="paper-level">'+
  '<div class="paper-level-heading">'+paperIcon('cap')+'<div><h2 id="paper-level">Твой уровень</h2><div class="paper-rank">'+levelLabels[profile.level]+'</div></div>'+
  '<details class="paper-info"><summary aria-label="Как повышается уровень">'+paperIcon('info')+'</summary>'+
  '<p>Занятие подтверждается, когда все его слова проверены в обе стороны не раньше следующего дня.</p></details></div>'+detail+'</section>';
}
function paperProgress(){
 const total=dictionary.length;
 const words=dictionary.map(w=>profile.words[w.en]);
 const learned=words.filter(w=>w?.origin==='learned').length;
 const mastered=words.filter(w=>E.status(w)==='mastered').length;
 const percent=n=>total?100*n/total:0;
 const circle=(r,value,kind)=>'<circle class="ring-track '+kind+'" cx="58" cy="58" r="'+r+'"/>'+
  (value?'<circle class="ring-fill '+kind+'" cx="58" cy="58" r="'+r+'" pathLength="100" stroke-dasharray="'+value+' 100" transform="rotate(-90 58 58)"/>':'');
 const label=percent(learned).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
 const rings='<svg class="paper-rings" viewBox="0 0 116 116" role="img" aria-label="Изучено '+label+' словаря">'+circle(52,percent(learned),'learned')+circle(39,percent(mastered),'mastered')+
  '<text x="58" y="58" text-anchor="middle" dominant-baseline="central">'+label+'</text></svg>';
 return '<section class="paper-card paper-progress" aria-label="Прогресс по словарю">'+rings+'<dl>'+
  '<div><dt class="learned">Изучено:</dt><dd>'+learned+' из '+total+'</dd></div>'+
  '<div><dt class="mastered">Закреплено:</dt><dd>'+mastered+' из '+total+'</dd></div></dl></section>';
}
function home(){
 view='home';
 const pending=E.due(profile),lastReview=profile.sessions.findLast(s=>s.mode==='review');
 const cleared=lastReview&&localStorage.getItem(PRACTICE)===lastReview.id;
 const errors=cleared?[]:E.residualErrors(profile).filter(id=>byId[id]);
 const blocked=storageFailure?'Сохранение заблокировано':session?'Сначала закончи занятие':'';
 const fresh=paperAction('Учить новые слова','sources',blocked||(pending.length?'Сначала повтори слова на сегодня. После этого сможешь учить новые.':''),'Выбери способ подбора');
 const repeat=pending.length?paperAction('Повторить сегодня: '+wordCount(pending.length),'review',blocked):
  errors.length?paperAction('Повторить ещё раз','practice',blocked,'Если хочешь, потренируй ещё '+errors.length+' '+(errors.length%100>=11&&errors.length%100<=14?'трудных слов':errors.length%10===1?'трудное слово':errors.length%10>=2&&errors.length%10<=4?'трудных слова':'трудных слов')):
  paperAction('На сегодня всё повторено','review',blocked||'Повторений на сегодня нет');
 shell('', '', '<main class="paper"><div class="paper-heading"><h1>'+paperIcon('book')+'WordScene</h1>'+
 '<button type="button" data-action="accounts" class="paper-profile" aria-label="Настройки профиля" '+(session?'disabled':'')+'>'+paperIcon('settings')+'</button></div>'+
 '<div class="paper-hero"><img src="./paper-lighthouse.svg" alt="" width="729" height="160"></div>'+
 paperLevel()+paperProgress()+'<div class="paper-actions">'+fresh+repeat+'</div>'+
 '<nav class="paper-nav" aria-label="Разделы">'+btn(paperIcon('progress')+'Мой прогресс','progress')+btn(paperIcon('book')+'Словарь','dictionary')+'</nav></main>');
}
function sources(){
 if(warnLocked())return;view='sources';shell('Как будем учить?','<section class="panel">'+btn('Автоматически','auto','primary')+btn('По темам','themes','secondary')+btn('Выбрать самому','manual','secondary')+'</section>'+btn('На главную','home','quiet'));
}
function topics(){
 view='themes';shell('Выбери темы','<section class="panel"><div class="chips">'+T.topics.map(t=>'<button type="button" class="chip '+(themeIds.has(t.id)?'chosen':'')+'" data-action="topic:'+h(t.id)+'">'+h(t.name)+'</button>').join('')+'</div>'+btn('Подобрать слова','themed','primary',!themeIds.size)+'</section>'+btn('Назад','sources','quiet'));
}
function nextBatch(){
 batch=E.selectCandidates(dictionary,profile,{seen:selection.seen,skipped:selection.skipped||[],unknown:selection.unknown,themes:selection.themes,topic:T.forWord});
 selection.cursor=0;
 if(!batch.length){finishSelection();return}
 selection.current=batch.map(w=>w.en);renderSelection();
}
function makeSelection(kind){if(warnLocked())return;selection=E.beginSelection(kind,kind==='theme'?[...themeIds]:[]);selection.skipped=[];nextBatch()}
function selectionScreen(){
 const id=selection.current?.[selection.cursor],w=byId[id];if(!w){nextBatch();return}
 view='select';const title=selection.unknown.length+' / 10 неизвестных · просмотрено '+selection.seen.length+' / 50';
 shell('Подбор новых слов','<div class="counter">'+title+'</div><section class="flash"><h2>'+h(w.en)+'</h2><div class="ipa">'+h(w.ipa||'')+'</div>'+btn('▶ Произнести','say:'+h(id),'quiet')+
 (showAnswer?'<div class="translation">'+h(w.ru)+'</div><div class="actions">'+btn('Знаю','known','secondary')+btn('Не знаю','unknown','primary')+'</div>':btn('Показать перевод','reveal','primary'))+'</section>'+
 btn('Завершить подбор','stopSelection','quiet'));
}
function renderSelection(){showAnswer=false;selectionScreen()}
function selectionGrade(knows){
 const id=selection.current[selection.cursor];const stop=E.selectionAnswer(selection,id,knows);
 if(stop){finishSelection();return}
 if(selection.cursor<selection.current.length-1){selection.cursor++;while(selection.cursor<selection.current.length){const w=byId[selection.current[selection.cursor]],conflict=selection.unknown.some(id=>{const x=byId[id];return (w.cue&&x.cue&&w.cue.trim().toLowerCase()===x.cue.trim().toLowerCase())||(w.associationId&&w.associationId===x.associationId)});if(!conflict)break;selection.skipped.push(w.en);selection.cursor++}if(selection.cursor<selection.current.length){renderSelection();return}}
 nextBatch();
}
function finishSelection(){
 const n=selection.unknown.length;
 if(n>=3){startLearning(selection.unknown,selection.known);return}
 if(n===0){
  const ids=selection.known;
  selection=null;
  if(!saveFamiliar(ids))return home();
  view='selectionDone';
  shell('Неизвестных слов не найдено','<section class="panel">'+btn('Повторить знакомые','review','primary',!E.due(profile).length)+btn('На главную','home','quiet')+'</section>');
  return;
 }
 manual=new Set(selection.unknown);manualThemes=new Set(selection.themes||[]);query='';view='fill';manualView(true);
}
function saveFamiliar(ids){
 const previous=profile;
 profile=E.clone(profile);
 for(const id of ids)if(!profile.words[id]){
  profile.words[id]={origin:'known',schedule:{...E.newSchedule(Date.now()),nextDay:E.day(Date.now())},history:[]};
 }
 if(ids.length)profile.revision++;
 if(store())return true;
 profile=previous;
 return false;
}
function stopSelection(){selection=null;home()}
function manualView(fill=false){
 view=fill?'fill':'manual';const selected=[...manual],limit=E.levelLimit(profile);
 const available=dictionary.filter(w=>!profile.words[w.en]?.origin);
 const filtered=available.filter(w=>(!manualThemes.size||T.forWord(w.en).some(t=>manualThemes.has(t)))&&(w.en+' '+w.ru).toLowerCase().includes(query.toLowerCase()));
 shell(fill?'Добавь слова до трёх':'Выбери слова','<section class="panel"><div class="counter">Выбрано '+selected.length+' · минимум 3 · максимум '+(Number.isFinite(limit)?limit:'весь словарь')+'</div><input data-input="search" placeholder="Поиск слова или перевода" value="'+h(query)+'" /><div class="chips">'+T.topics.map(t=>'<button type="button" class="chip '+(manualThemes.has(t.id)?'chosen':'')+'" data-action="manualTopic:'+h(t.id)+'">'+h(t.name)+'</button>').join('')+'</div><div class="word-picker">'+filtered.map(w=>'<button class="word-option '+(manual.has(w.en)?'picked':'')+'" data-action="pick:'+h(w.en)+'"><span>'+h(w.en)+' <small>'+h(w.ru)+'</small></span><b>'+(manual.has(w.en)?'✓':'+')+'</b></button>').join('')+'</div>'+btn('Начать изучение','startManual','primary',!E.eligible(profile,selected))+'</section>'+btn(fill?'Выйти из добора':'Назад',fill?'leaveFill':'sources','quiet'));
}
function startLearning(ids,known=[]){
 try{session=E.start(profile,'new',ids,known);selection=null;manual.clear();if(!store())return home();showAnswer=false;showHelp=false;confirmed=false;learn()}catch(e){notice(e.message);home()}
}
function review(mode='review'){
 if(warnLocked())return;
 const ids=(mode==='practice'?E.residualErrors(profile):E.due(profile)).filter(id=>byId[id]);
 if(!ids.length)return home();
 try{
  session=E.start(profile,mode,ids);
  showAnswer=false;showHelp=false;confirmed=false;
  if(!store())return home();
  clockStarted=Date.now();recall();
 }catch(e){notice(e.message)}
}
function cardActions(){
 return (session.pausedAt!==null?'<p class="reason" id="pause-time">'+pauseTime()+'</p>':'')+
  btn('Пауза','pause','quiet',session.pausedAt!==null)+
  (session.mode==='practice'?btn('Закончить тренировку','stopPractice','quiet'):btn('Отменить занятие','cancel','quiet'));
}
function visual(w){if(window.WS17_illustration){try{return window.WS17_illustration(w.en)}catch(e){}}if(w.props&&C?.render){try{return C.render(w)}catch(e){}}return '<div class="simple-art">'+h(w.cue||w.en)+'</div>'}
function learn(){
 if(!session)return home();view='learn';const w=byId[session.ids[session.learnIndex]];
 shell('Запоминание · '+(session.learnIndex+1)+' / '+session.ids.length,'<section class="flash learn"><h2>'+h(w.en)+'</h2><div class="ipa">'+h(w.ipa||'')+'</div>'+btn('▶ Произнести','say:'+h(w.en),'quiet')+'<div class="translation">'+h(w.ru)+'</div>'+
 (!showHelp?'<div class="art">'+visual(w)+'</div><p class="scene">'+h(w.scene||'')+'</p>':'')+
 btn(showHelp?'Показать ассоциацию':'Представить без картинки','toggleArt','quiet')+
 btn(session.learnIndex===session.ids.length-1?'Начать проверку':'Дальше','learnNext','primary')+'</section>'+cardActions());
}
function recall(){
 if(!session)return home();view='recall';const item=session.items[session.index];if(!item)return completed();
 const w=byId[item.id],front=item.dir===1?w.ru:w.en,back=item.dir===1?w.en:w.ru;
 let text='';
 if(!showAnswer){text='<div class="direction">'+(item.dir===1?'Русский → Английский':'Английский → Русский')+'</div><h2>'+h(front)+'</h2><div class="actions">'+btn('Вспомнил','yes','primary')+btn('Не вспомнил','no','secondary')+'</div>'+btn('Проверить ответ','check','quiet')}
 else{text='<div class="direction">'+h(front)+'</div><h2>'+h(back)+'</h2>'+btn('▶ Произнести','say:'+h(w.en),'quiet')+(showHelp?'<div class="art">'+visual(w)+'</div><p>'+h(w.scene||'')+'</p>':'')+btn('Показать ассоциацию','help','quiet')+
 (confirmed?btn('Следующая карточка','advance','primary'):'<div class="actions">'+btn('Вспомнил','checkedYes','primary')+btn('Не вспомнил','checkedNo','secondary')+'</div>') }
 shell((session.mode==='new'?'Изучение':session.mode==='practice'?'Повторяем ошибки':'Повторение')+' · проход '+session.round,'<div class="counter">Карточка '+(session.index+1)+' / '+session.items.length+'</div><section class="flash recall">'+text+'</section>'+cardActions());
}
function sendAnswer(ok,checked=false){
 try{
  const ms=session.feedback?session.feedback.ms:elapsed();
  delete session.feedback;
  const r=E.answer(session,ok,Date.now(),ms,checked);
  if(!store())return home();
  if(r.done)return completed();
  showAnswer=false;showHelp=false;confirmed=false;clockStarted=Date.now();recall();
 }catch(e){expire(e)}
}
function elapsed(){return clockStarted===null?null:Date.now()-clockStarted}
function showFeedback(failed){
 E.action(session);
 session.feedback={failed,ms:elapsed(),help:false};
 showAnswer=true;confirmed=failed;showHelp=false;
 if(!store())return home();
 recall();
}
function resume(){
 if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));
 if(session.stage==='complete')return completed();
 const feedback=session.feedback;
 view=session.stage==='learn'?'learn':'recall';
 showAnswer=!!feedback;confirmed=!!feedback?.failed;showHelp=!!(feedback?.help||session.artHidden);clockStarted=null;
 render();
}
function suspend(){
 if(!session||storageFailure||session.pausedAt!==null||E.timedOut(session,Date.now()))return;
 clockStarted=null;
 if(session.feedback)session.feedback.ms=null;
 E.pause(session);store();
}
function finishPractice(){
 const finished=session.stage==='complete',lastReview=profile.sessions.findLast(s=>s.mode==='review');
 session=null;
 if(!store())return home();
 if(finished&&lastReview){try{localStorage.setItem(PRACTICE,lastReview.id)}catch(err){notice('Не удалось сохранить отметку добровольной тренировки')}}
 view='result';
 shell('Тренировка завершена','<section class="panel">'+btn('Готово','home','primary')+'</section>');
}
function completed(){
 if(session.mode==='practice')return finishPractice();
 try{const previousLevel=profile.level,previousProfile=profile,previousSession=session;const result=E.completed(profile,session,Date.now());profile=result;session=null;if(!store()){profile=previousProfile;session=previousSession;return home()}view='result';
 const entry=profile.sessions.at(-1);shell('Занятие завершено','<section class="panel"><div class="result-metrics"><div><strong>'+entry.ids.length+'</strong><small>'+(entry.mode==='new'?'Изучено':'Повторено')+'</small></div><div><strong>'+entry.successful+'</strong><small>В обе стороны · '+(entry.mode==='new'?'3-й прогон':'1-й прогон')+'</small></div><div><strong>'+(entry.extraWords||0)+'</strong><small>Нужны дополнительные прогоны</small></div></div><p class="reason">Остались трудными: '+entry.hard+' слов.</p>'+(previousLevel!==profile.level?'<p><strong>Новый уровень: '+({novice:'Новичок',experienced:'Опытный',pro:'Профи'}[profile.level])+'</strong></p>':'')+levelInfo()+btn('Готово','home','primary')+'</section>');
 }catch(err){expire(err)}
}
function expire(err){session=null;if(!storageFailure)store();notice('Занятие аннулировано: '+(err?.message||'истекло время'));home()}
function progress(){
 view='progress';
 const all=Object.entries(profile.words).filter(([id])=>byId[id]),total=dictionary.length;
 const learned=all.filter(([_,w])=>w.origin==='learned').length;
 const known=all.filter(([_,w])=>w.origin==='known').length;
 const mastered=all.filter(([_,w])=>E.status(w)==='mastered').length;
 const lessonDate=at=>E.day(at);
 const lessons=profile.sessions.filter(x=>x.mode==='new').sort((a,b)=>a.at-b.at);
 const today=E.day(),now=Date.now();
 const monday=day=>{const d=new Date(day+'T12:00:00');return E.addDays(day,-((d.getDay()+6)%7))};
 const days=progressRange==='30'?Array.from({length:30},(_,i)=>E.addDays(today,i-29)):(()=>{
  const first=monday(lessons.length?lessonDate(lessons[0].at):today);
  const last=monday(today),out=[];for(let day=first;day<=last;day=E.addDays(day,7))out.push(day);
  return out;
 })();
 const points=days.map(day=>{
  const end=progressRange==='30'?day:E.addDays(day,6);
  return {day,value:lessons.reduce((sum,x)=>sum+(lessonDate(x.at)<=end?new Set(x.ids).size:0),0)};
 });
 const top=Math.max(1,...points.map(p=>p.value));
 const coords=(points.length===1?[points[0],points[0]]:points).map((p,i,arr)=>{
  const x=26+i*286/(arr.length-1),y=124-p.value*100/top;
  return x.toFixed(1)+','+y.toFixed(1);
 }).join(' ');
 const timeLabel=day=>new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
 const chart='<svg class="progress-line" viewBox="0 0 340 164" role="img" aria-label="Накопленное количество изученных слов">'+
  '<path d="M26 24V124H312" fill="none" stroke="#c5ced9" stroke-width="1.5"/>'+
  '<text x="22" y="26" text-anchor="end">'+top+'</text><text x="22" y="127" text-anchor="end">0</text>'+
  '<polyline points="'+coords+'" fill="none" stroke="#0877dd" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>'+
  '<text x="26" y="145" text-anchor="start">'+timeLabel(days[0])+'</text>'+
  '<text x="312" y="145" text-anchor="end">'+timeLabel(days[days.length-1])+'</text></svg>';
 const reviews=profile.sessions.filter(x=>x.mode==='review'&&(qualityRange==='all'||x.at>=now-28*86400000));
 const attempts=reviews.reduce((a,x)=>a+new Set(x.ids).size,0);
 const hits=reviews.reduce((a,x)=>a+x.successful,0);
 const quality=attempts?'<strong class="quality-value">'+Math.round(100*hits/attempts)+'%</strong><p>'+hits+' из '+attempts+' слов успешно вспомнены в обе стороны на первом прогоне</p>':'<p>Пока нет проверок за этот период</p>';
 const history=profile.sessions.slice().reverse();
 const entries=history.slice(0,progressVisible).map(x=>{
  const count=new Set(x.ids).size,expanded=openHistory.has(x.id),type=x.mode==='new'?'Новые слова':'Повторение';
  return '<div class="progress-session">'+btn('<strong>'+dateText(x.at)+' · '+type+'</strong><small>'+count+' слов · '+x.successful+' в обе стороны · '+(expanded?'Скрыть':'Подробнее')+'</small>','history:'+encodeURIComponent(x.id),'progress-session-toggle')+
  (expanded?'<div class="progress-session-detail">Успешно: '+(count?Math.round(100*x.successful/count):0)+'% · Дополнительные прогоны потребовались для '+(x.extraWords||0)+' слов. '+(x.mode==='new'?'Итог третьего обязательного прогона.':'Итог первого обязательного прогона.')+'</div>':'')+'</div>';
 }).join('');
 const metrics='<section class="panel"><h2>Мой словарь</h2><div class="progress-total"><small>Знакомых слов</small><strong>'+(learned+known)+' из '+total+'</strong></div>'+
  '<div class="progress-breakdown"><span>Выучил в WordScene <strong>'+learned+'</strong></span><span>Уже знал <strong>'+known+'</strong></span><span>Из них закреплено <strong>'+mastered+'</strong></span></div></section>';
 const rangeButtons=btn('30 дней','progressRange:30',progressRange==='30'?'primary':'secondary')+btn('Всё время','progressRange:all',progressRange==='all'?'primary':'secondary');
 const qualityButtons=btn('28 дней','qualityRange:28',qualityRange==='28'?'primary':'secondary')+btn('Всё время','qualityRange:all',qualityRange==='all'?'primary':'secondary');
 shell('Мой прогресс',metrics+
  '<section class="panel"><h2>Сколько слов я выучил</h2><div class="progress-switch">'+rangeButtons+'</div>'+chart+'</section>'+
  '<section class="panel"><h2>Как хорошо я помню слова</h2><div class="progress-switch">'+qualityButtons+'</div>'+quality+'</section>'+
  '<section class="panel"><h2>Мои занятия</h2>'+(entries||'<p class="reason">Завершённых занятий пока нет.</p>')+
  (history.length>progressVisible?btn('Показать ещё','progressMore','secondary'):'')+'</section>'+btn('На главную','home','quiet'));
}
function dictionaryView(){
 view='dictionary';const list=dictionary.filter(w=>(w.en+' '+w.ru).toLowerCase().includes(query.toLowerCase()));
 shell('Словарь','<section class="panel"><input data-input="search" value="'+h(query)+'" placeholder="Поиск слова" /><div class="word-picker">'+list.map(w=>'<button class="word-option" data-action="word:'+h(w.en)+'"><span><b>'+h(w.en)+'</b> · '+h(w.ru)+'</span><small>'+({new:'Не изучено',known:'Предварительно знакомо',learning:'Закрепляется',mastered:'Закреплено'}[E.status(profile.words[w.en])]||'')+'</small></button>').join('')+'</div></section>'+btn('На главную','home','quiet'));
}
function wordDetail(id){
 const w=byId[id],p=profile.words[id],hist=p?.history||[];

 shell(h(w.en),'<section class="flash learn"><div class="ipa">'+h(w.ipa||'')+'</div><div class="translation">'+h(w.ru)+'</div>'+btn('▶ Произнести','say:'+h(w.en),'quiet')+'<div class="art">'+visual(w)+'</div><p>'+h(w.scene||'')+'</p><p class="reason">Статус: '+({new:'Не изучено',known:'Предварительно знакомо',learning:'Закрепляется',mastered:'Закреплено'}[E.status(p)]||'')+'</p></section><section class="panel"><h2>История вспоминания</h2>'+(hist.length?hist.slice(-12).reverse().map(x=>'<div class="history-row">'+dateText(x.at)+' · '+(x.ok?'Вспомнил в обе стороны':'Была ошибка')+'</div>').join(''):'<p>Проверок пока нет</p>')+'</section>'+btn('Словарь','dictionary','quiet'));
}

function accountsScreen(){
 if(session)return notice('Заверши или отмени занятие перед сменой профиля');
 view='accounts';
 const ids=['local','child-1','child-2'];
 shell('Профили WordScene 17','<section class="panel"><p class="reason">У каждого профиля собственные сохранения. Переключение не переносит данные между детьми. Не используй один профиль одновременно на разных устройствах без синхронизации.</p>'+ids.map(id=>btn((id===currentAccount?'✓ ':'')+(id==='local'?'Локальный':id==='child-1'?'Ребёнок 1':'Ребёнок 2'),'account:'+id,id===currentAccount?'primary':'secondary',id===currentAccount)).join('')+'</section>'+(cloudEnabled?btn('Облако · локальный эмулятор','cloud','secondary'):'')+btn('Назад','home','quiet'));
}
function switchAccount(id){
 if(session)return notice('Нельзя менять профиль во время занятия');
 if(!['local','child-1','child-2'].includes(id))return notice('Неизвестный профиль');
 try{localStorage.setItem(ACCOUNT_KEY,id);window.location.reload()}catch(err){notice('Не удалось сменить профиль')}
}
function cloudScreen(){
 if(!cloudEnabled||warnLocked())return;
 view='cloud';
 const details=cloudConflict?'<p>Локальная и облачная копии различаются. Обе версии сохранены на этом устройстве.</p>'+
  btn('Оставить локальную копию','cloudLocal','secondary')+
  (cloudConflict.cloud?btn('Восстановить облачную копию','cloudRestore','secondary'):''):'';
 shell('Облако WordScene 17','<section class="panel"><p>Тестовый профиль: '+h(currentAccount)+'. Используй только тестовую учётную запись эмулятора.</p>'+
  (cloud?btn('Синхронизировать','cloudSync','primary')+details+btn('Выйти из облака','cloudLogout','quiet'):
   '<input id="cloudEmail" type="email" placeholder="Тестовый email" aria-label="Тестовый email"><input id="cloudPassword" type="password" placeholder="Тестовый пароль" aria-label="Тестовый пароль">'+btn('Войти','cloudLogin','primary'))+
  '</section>'+btn('К профилям','accounts','quiet'));
}
async function cloudAction(action){
 if(!cloudEnabled||view!=='cloud'||warnLocked()||cloudBusy)return;
 if(!navigator.locks)return notice('Для облака нужен браузер с поддержкой блокировок вкладок');
 const email=document.getElementById('cloudEmail')?.value;
 const password=document.getElementById('cloudPassword')?.value;
 const choice=action==='cloudLocal'?'local':action==='cloudRestore'?'cloud':undefined;
 if(choice&&!window.confirm(choice==='local'?'Заменить облачную копию локальной?':'Восстановить облачную копию на этом устройстве?'))return;
 cloudBusy=true;
 try{
  await navigator.locks.request(BINDINGS,async()=>{
   if(action==='cloudLogout'){await cloud.close();cloud=null;cloudConflict=null;return}
   if(action==='cloudLogin'){
    const client=await (await import('./cloud-ui.mjs')).open(email,password);
    try{
     const bindings=JSON.parse(localStorage.getItem(BINDINGS)||'{}');
     if((bindings[currentAccount]&&bindings[currentAccount]!==client.signedInUid)||
        Object.entries(bindings).some(([id,uid])=>id!==currentAccount&&uid===client.signedInUid)){
      notice('Учётная запись уже связана с другим профилем');
      await client.close();return;
     }
     localStorage.setItem(BINDINGS,JSON.stringify({...bindings,[currentAccount]:client.signedInUid}));
     cloud=client;
    }catch(err){await client.close();throw err}
    return;
   }
   if(!cloud||cloud.uid()!==cloud.signedInUid)return;
   const stale=()=>storageFailure||!!session||localStorage.getItem(KEY)!==savedProfileRaw||
    localStorage.getItem(ACTIVE)!==null;
   const sync=window.WS17Sync.create({
    storage:localStorage,uid:cloud.uid,local:()=>profile,transport:cloud.transport,active:stale,
    restore:next=>{
     if(stale()||cloud.uid()!==cloud.signedInUid)throw Error('Profile changed');
     const before=profile;
     profile=next;
     if(!store()){profile=before;throw Error('Restore failed')}
    }
   });
   const {status}=await sync.sync(choice,cloudConflict);
   cloudConflict=status==='conflict'?sync.getConflict():null;
   notice(({uploaded:'Копия отправлена и проверена',same:'Копии совпадают',restored:'Копия восстановлена',
    conflict:'Нужно выбрать копию', 'session-active':'Профиль занят или изменён в другой вкладке',
    'local-changed':'Копии изменились. Запусти синхронизацию снова'})[status]);
  });
 }catch(err){notice('Облако недоступно или операция не завершена. Проверь подключение и повтори синхронизацию.')}
 finally{cloudBusy=false;if(storageFailure)home();else cloudScreen()}
}
function recoverScreen(){
 view='recover';let backup;
 try{backup=accounts.inspect(currentAccount).backup}catch{}
 shell('Восстановление прогресса','<section class="panel"><p>Основное сохранение повреждено или недоступно.</p><p class="reason">'+(backup?'Найдена резервная копия: '+Object.keys(backup.words).length+' слов, '+backup.sessions.length+' занятий.':'Корректная резервная копия не найдена. Исходные данные остаются нетронутыми.')+'</p>'+(backup?btn('Восстановить резервную копию','restoreBackup','primary'):'')+btn('Вернуться','home','quiet')+'</section>');
}
function restoreBackup(){
 if(!storageFailure||session)return notice('Восстановление недоступно');
 try{accounts.recover(currentAccount);window.location.reload()}
 catch(err){notice('Не удалось восстановить копию. Исходные данные не изменены.')}
}
function confirmCancel(){const yes=window.confirm('Отменить занятие? Все незавершённые результаты будут потеряны.');if(yes){session=null;selection=null;store();home()}else if(session){E.action(session);store();render()}}
function render(){if(session){if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));if(session.stage==='complete'&&view!=='home')return completed();if(view==='learn')return learn();if(view==='recall')return recall()}if(view==='select')return selectionScreen();if(view==='manual'||view==='fill')return manualView(view==='fill');if(view==='themes')return topics();if(view==='sources')return sources();if(view==='progress')return progress();if(view==='dictionary')return dictionaryView();return home()}
function dispatch(act,el){
 if(cloudBusy)return;
 if(['cloudLogin','cloudLogout','cloudSync','cloudLocal','cloudRestore'].includes(act))return cloudAction(act);
 if(act==='cloud')return cloudScreen();
 if(storageFailure&&!['home','dictionary','progress','recover','restoreBackup'].includes(act)&&!act.startsWith('word:')&&!act.startsWith('say:'))return notice('Сохранение заблокировано. Никакие данные не перезаписываются.');
 if(act.startsWith('say:'))return speak(act.slice(4));
 if(act.startsWith('account:'))return switchAccount(act.slice(8));
 if(act.startsWith('topic:')){let v=act.slice(6);themeIds.has(v)?themeIds.delete(v):themeIds.add(v);return topics()}
 if(act.startsWith('manualTopic:')){const v=act.slice(12);manualThemes.has(v)?manualThemes.delete(v):manualThemes.add(v);return manualView(view==='fill')}
 if(act.startsWith('pick:')){const v=act.slice(5);manual.has(v)?manual.delete(v):manual.size<E.levelLimit(profile)&&manual.add(v);return manualView(view==='fill')}
 if(act.startsWith('progressRange:')){progressRange=act.slice(14);return progress()}
 if(act.startsWith('qualityRange:')){qualityRange=act.slice(13);return progress()}
 if(act.startsWith('history:')){const id=decodeURIComponent(act.slice(8));openHistory.has(id)?openHistory.delete(id):openHistory.add(id);return progress()}
 if(act==='progressMore'){progressVisible+=5;return progress()}
 if(act.startsWith('word:'))return wordDetail(act.slice(5));
 if(session&&E.timedOut(session,Date.now()))return expire();
 switch(act){
 case 'home':return home();case 'accounts':return accountsScreen();case 'restoreBackup':return restoreBackup();case 'recover':return recoverScreen();case 'sources':return sources();case 'themes':return topics();case 'manual':manual.clear();manualThemes.clear();query='';return manualView();
 case 'auto':return makeSelection('auto');case 'themed':return makeSelection('theme');
 case 'review':return review();case 'practice':return review('practice');case 'stopPractice':session=null;store();return home();case 'progress':return progress();case 'dictionary':query='';return dictionaryView();
 case 'known':return selectionGrade(true);case 'unknown':return selectionGrade(false);case 'stopSelection':return stopSelection();
 case 'reveal':showAnswer=true;return selectionScreen();
 case 'startManual':return startLearning([...manual],selection?.known||[]);
 case 'leaveFill':saveFamiliar(selection.known);selection=null;manual.clear();return home();
 case 'learnNext':try{E.learnNext(session);session.artHidden=false;if(!store())return home();showHelp=false;clockStarted=Date.now();return session.stage==='learn'?learn():recall()}catch(err){return expire(err)}
 case 'toggleArt':E.action(session);showHelp=!showHelp;session.artHidden=showHelp;store();return learn();
 case 'yes':return sendAnswer(true);case 'no':return showFeedback(true);
 case 'check':return showFeedback(false);
 case 'checkedYes':return sendAnswer(true,true);case 'checkedNo':return sendAnswer(false,true);
 case 'advance':return sendAnswer(false);
 case 'help':E.action(session);showHelp=true;session.feedback.help=true;store();return recall();
 case 'pause':suspend();return storageFailure?home():render();
 case 'cancel':return confirmCancel();
 }
}
function returnToCard(){if(session&&!storageFailure)resume()}
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)suspend();else returnToCard()});
window.addEventListener?.('pagehide',suspend);
window.addEventListener?.('pageshow',event=>{if(event.persisted)returnToCard()});
load();if(storageFailure)recoverScreen();else if(session)resume();else home();
setInterval(()=>{
 if(!session||storageFailure)return;
 if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));
 const timer=root.querySelector('#pause-time');
 if(timer)timer.textContent=pauseTime();
},1000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();