/* WordScene 17.0 - isolated UI; no reads/writes to 16.17 data. */
(()=>{
'use strict';
const E=window.WS17Engine,T=window.WordSceneTopics||{topics:[],forWord:()=>[]},C=window.WordSceneContent;
const dictionary=[...window.WS17_SEED,...(C?.cards||[])].filter((w,i,a)=>a.findIndex(x=>x.en===w.en)===i);
const byId=Object.fromEntries(dictionary.map(w=>[w.en,w]));
// Keep the active pre-refactor storage namespace without offering account switching.
const legacyStorageSuffix=(()=>{
 try{const old=localStorage.getItem('wordscene-17-lab-current-account-v1');
 return old==='child-1'||old==='child-2'?'-account-'+old:''}catch{return ''}
})();
const KEY='wordscene-17-lab-v1'+legacyStorageSuffix,ACTIVE='wordscene-17-lab-active-v1'+legacyStorageSuffix,PRACTICE='wordscene-17-lab-practice-cleared-v1'+legacyStorageSuffix;
const root=document.getElementById('app');
let profile,session=null,selection=null,view='home',batch=[],showAnswer=false,showHelp=false,manual=new Set(),manualThemes=new Set(),query='',confirmed=false,storageFailure=false,savedProfileRaw=null,savedActiveRaw=null;
let progressRange='30',qualityRange='28',homeDay=null,manualMode='topics',manualShowAll=false,manualSummaryOpen=false;
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const accounts=window.WS17Accounts.create({storage:localStorage,empty:E.empty,valid:window.WS17Accounts.validProfile,keyFor:()=>({main:KEY,active:ACTIVE,backup:'wordscene-17-lab-last-good-v1'+legacyStorageSuffix})});
function store(){
 if(storageFailure)return false;
 try{accounts.save('local',profile,session,savedProfileRaw,savedActiveRaw);savedProfileRaw=localStorage.getItem(KEY);savedActiveRaw=localStorage.getItem(ACTIVE);return true}
 catch(err){storageFailure=true;notice('Не удалось сохранить: '+err.message+'. Данные защищены от перезаписи.');return false}
}
function load(){
 try{
 const state=accounts.load('local');
 if(!['new','ok'].includes(state.status))throw Error('Сохранение требует восстановления: '+state.status);
 profile=state.profile;session=state.session;savedProfileRaw=localStorage.getItem(KEY);savedActiveRaw=localStorage.getItem(ACTIVE);
 }catch(err){storageFailure=true;profile=E.empty();session=null;notice('Сохранение повреждено. Исходные данные не перезаписываются.')}
 if(session&&E.timedOut(session,Date.now())){session=null;store();notice('Прошло 30 минут. Незавершённое занятие отменено.')}
}
function notice(s){let el=document.getElementById('notice');if(!el){el=document.createElement('div');el.id='notice';el.setAttribute('role','status');document.body.append(el)}el.textContent=s;el.hidden=false;clearTimeout(notice.id);notice.id=setTimeout(()=>el.hidden=true,5500)}
function speak(id){if(!('speechSynthesis' in window))return notice('Озвучивание недоступно на этом устройстве');const u=new SpeechSynthesisUtterance(id);u.lang='en-US';u.rate=.83;speechSynthesis.cancel();speechSynthesis.speak(u)}
function btn(label,event,cls='',disabled=false){return '<button type="button" data-action="'+event+'" class="'+cls+'" '+(disabled?'disabled':'')+'>'+label+'</button>'}
function head(name){return '<header><span class="brand">WordScene <b>17</b></span></header><main><h1>'+name+'</h1>'}
function end(){return '</main>'}
function shell(title,html,layout){root.innerHTML=layout||head(title)+html+end();root.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>{if(root.contains?.(el)===false)return;return dispatch(el.dataset.action,el)}));root.querySelectorAll('[data-input]').forEach(el=>el.addEventListener('input',()=>{query=el.value;if(view==='manual'&&manualMode==='search'){refreshManualSearch();return}const caret=el.selectionStart;render();const next=root.querySelector('[data-input]');if(next){next.focus();try{if(caret!==null)next.setSelectionRange(caret,caret)}catch{}}}));}
let manualSearchBaseHeight=0;
function syncManualViewport(){
 const panel=root.querySelector?.('.ws-manual.is-search');
 if(!panel)return;
 const vv=window.visualViewport;
 const field=root.querySelector?.('#manual-search');
 const focused=!!field&&document.activeElement===field;
 const available=vv?.height||window.innerHeight;
 // iOS can resize innerHeight along with visualViewport; retain the unobstructed baseline.
 if(!focused&&available>0&&(!panel.classList.contains('is-keyboard')||available>=manualSearchBaseHeight-40))manualSearchBaseHeight=available;
 if(!manualSearchBaseHeight)manualSearchBaseHeight=window.innerHeight;
 const keyboard=focused&&Math.max(window.innerHeight,manualSearchBaseHeight)-available>110;
 panel.classList.toggle('is-keyboard',keyboard);
 if(keyboard){
  panel.style.setProperty('--ws-search-vh',Math.max(0,available)+'px');
  panel.style.setProperty('--ws-search-top',(vv?.offsetTop||0)+'px');
 }else{
  panel.style.removeProperty('--ws-search-vh');
  panel.style.removeProperty('--ws-search-top');
 }
 refreshManualScroll();
}
function manualWordRow(w){
 const picked=manual.has(w.en),used=!!profile.words[w.en]?.origin,blocked=used||(!picked&&manual.size>=E.levelLimit(profile));
 return '<div class="ws-manual-word'+(used?' is-learned':'')+'">'+
  '<button type="button" class="ws-manual-pick" data-action="pick:'+h(w.en)+'" aria-pressed="'+picked+'" '+(blocked?'disabled':'')+'>'+
  '<span class="ws-manual-check" aria-hidden="true">'+(picked?'✓':'')+'</span>'+
  '<span class="ws-manual-word-copy"><strong>'+h(w.en)+'</strong><small>'+h(w.ipa||'')+' · '+h(w.ru)+'</small></span>'+
  (used?'<span class="ws-manual-learned">Уже изучено</span>':'')+'</button>'+
  btn('◖))','say:'+h(w.en),'ws-manual-audio')+'</div>';
}
function refreshManualSearch(){
 const q=query.trim().toLocaleLowerCase('ru');
 const filtered=q?dictionary.filter(w=>(w.en+' '+w.ru).toLocaleLowerCase('ru').includes(q)):[];
 const list=root.querySelector?.('.ws-manual-word-scroll');
 if(!list)return;
 list.innerHTML=filtered.length?filtered.map(manualWordRow).join(''):'<p class="ws-manual-empty">'+(q?'Ничего не найдено. Попробуй другой запрос.':'Начни вводить слово на русском или английском.')+'</p>';
 list.scrollTop=0;
 const counter=root.querySelector?.('.ws-manual-list-head small');
 if(counter)counter.textContent=q?'Найдено: '+filtered.length:'Введите слово для поиска';
 list.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>dispatch(el.dataset.action,el)));
 refreshManualScroll();
 syncManualViewport();
}
function refreshManualScroll(){
 const list=root.querySelector?.('.ws-manual-word-scroll');
 const note=root.querySelector?.('.ws-manual-scroll-note');
 if(list&&note)note.hidden=list.scrollHeight-list.clientHeight-list.scrollTop<=3;
 const topics=root.querySelector?.('.ws-manual-topics');
 const topicsNote=root.querySelector?.('.ws-manual-topics-note');
 if(topics&&topicsNote){
  const horizontal=topics.scrollWidth>topics.clientWidth+3;
  const vertical=topics.scrollHeight>topics.clientHeight+3;
  topicsNote.hidden=!(horizontal||vertical);
  if(!topicsNote.hidden)topicsNote.textContent=horizontal?'Темы → листай в сторону':'Темы ↓ листай вниз';
 }
}
function wireManualScroll(){
 const list=root.querySelector?.('.ws-manual-word-scroll');
 const topics=root.querySelector?.('.ws-manual-topics');
 list?.addEventListener('scroll',refreshManualScroll,{passive:true});
 topics?.addEventListener('scroll',refreshManualScroll,{passive:true});
 if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(refreshManualScroll);
 else refreshManualScroll();
 const active=topics?.querySelector?.('.is-active');
 if(active&&topics.scrollWidth>topics.clientWidth+3){
  const rect=active.getBoundingClientRect(),container=topics.getBoundingClientRect();
  if(rect.left<container.left||rect.right>container.right){
   topics.scrollLeft+=rect.left<container.left?rect.left-container.left:rect.right-container.right;
  }
 }
}
function warnLocked(){if(storageFailure){notice('Сохранение недоступно, изменения заблокированы');return true}if(session){notice('Сначала закончи или отмени текущее занятие');return true}return false}
function levelInfo(){const p=E.levelProgress(profile);return !p.target?'<p class="reason">Уровень Профи достигнут.</p>':'<p class="reason">До уровня «'+p.target+'»: подтверждено '+Math.min(3,p.window||0)+' из 3 подходящих занятий · минимум '+p.min+' новых слов в занятии · '+Math.round(p.threshold*100)+'% успешных первых проверок.</p>'}
function pauseTime(){
 const seconds=Math.ceil(E.remainingTime(session,Date.now())/1000);
 return 'Осталось '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
const levelLabels={novice:'Новичок',experienced:'Опытный',pro:'Профи'};
const paperIcons={
 book:'<path fill="#fff2cf" stroke="#ffa600" d="M12 5C9 2 5 2 2 3v15c4-1 7-1 10 2 3-3 6-3 10-2V3c-3-1-7-1-10 2v15"/><path stroke="#0877ff" d="M22 3v15c-4-1-7-1-10 2" class="paper-book-edge"/><path stroke="#efc16d" stroke-width=".65" d="M4 7q3-.6 6 1M4 10q3-.6 6 1M4 13q3-.6 6 1m4-6q3-1.6 6-1m-6 4q3-1.6 6-1m-6 4q3-1.6 6-1"/>',
 cap:'<path fill="#005cae" stroke="none" d="M5 11h14v7q-7 5-14 0z"/><path fill="#007bd8" stroke="none" d="m0 10 12-6 12 6-12 6z"/><path stroke="#ffa600" d="m12 10-8 4v6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
 lock:'<path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="3" y="9" width="18" height="14" rx="2" fill="currentColor" stroke="none"/><path stroke="#f4ede5" d="M12 15v4"/>',
 repeat:'<path d="M20 8a8 8 0 1 0 0 8m0-12v5h-5"/>',
 progress:'<path stroke="#0877ff" stroke-width="4.5" d="M5 20v-4m7 4v-9m7 9V4"/>',
 next:'<path d="m9 5 7 7-7 7"/>'
};
function paperIcon(name){
 return '<svg class="paper-icon paper-icon-'+name+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paperIcons[name]+'</svg>';
}
function paperAction(label,action,reason='',subtitle=''){
 const icon=reason?'lock':action==='sources'?null:'repeat';
 return btn((icon?'<span class="paper-action-icon">'+paperIcon(icon)+'</span>':'')+
  '<span class="paper-action-copy">'+label+
  (reason||subtitle?'<small>'+(reason||subtitle)+'</small>':'')+'</span>'+
  (!reason?paperIcon('next'):''),
  action,'paper-action paper-'+action,!!reason);
}
function paperDone(){
 return '<div class="paper-done" role="status"><span class="paper-done-mark" aria-hidden="true">✓</span>'+
  '<span><strong>Отлично! Всё повторено</strong><small>На сегодня заданий больше нет</small></span></div>';
}
function weeklyLearned(){
 const today=E.day(),weekday=new Date(today+'T12:00:00').getDay();
 const monday=E.addDays(today,-((weekday+6)%7)),ids=new Set();
 for(const s of profile.sessions)if(s.mode==='new'&&E.day(s.at)>=monday&&E.day(s.at)<=today)
  for(const id of s.ids)if(profile.words[id]?.origin==='learned')ids.add(id);
 return ids.size;
}
function wordCount(n){
 const tail=n%100,last=n%10;
 return n+' '+(tail>=11&&tail<=14?'слов':last===1?'слово':last>=2&&last<=4?'слова':'слов');
}
function paperLevel(){
 const p=E.levelProgress(profile),count=Math.min(3,p.window||0);
 const rate=p.successRate===null||!Number.isFinite(p.successRate)?null:Math.round(p.successRate*100);
 const threshold=p.threshold?Math.round(p.threshold*100):null;
 const details=p.target?
  '<div class="paper-level-stats">'+
   '<div class="paper-level-stat"><span class="paper-level-stat-label">Занятия</span>'+
    '<div class="paper-level-stat-value"><strong>'+count+'</strong><span>из 3</span></div>'+
    '<div class="paper-level-segments" aria-label="Подтверждено '+count+' из 3 занятий">'+
     [1,2,3].map(i=>'<i'+(i<=count?' class="filled"':'')+'></i>').join('')+'</div></div>'+
   '<div class="paper-level-stat"><span class="paper-level-stat-label">Качество повторений</span>'+
    '<div class="paper-level-stat-value"><strong>'+(rate===null?'—':rate+'%')+'</strong><span>цель '+threshold+'%</span></div>'+
    '<div class="paper-level-quality-track" aria-label="'+(rate===null?'Пока нет подтверждённых проверок':'Успешность '+rate+'%, цель '+threshold+'%')+'">'+
      (rate===null?'':'<i class="'+(rate>=threshold?'reached':'')+'" style="width:'+Math.max(0,Math.min(100,rate))+'%"></i>')+
    '</div></div></div>'+
   '<p class="paper-level-next">Следующий уровень — <strong>'+p.target+'</strong></p>'+
   '<details class="paper-level-help"><summary>Подробнее '+paperIcon('next')+'</summary>'+
    '<div class="paper-level-explain"><strong>Как перейти на уровень «'+p.target+'»</strong>'+
     '<p>Нужно подтвердить три подходящих занятия, изучив не менее '+p.min+' новых слов в каждом.</p>'+
     '<p>На последующих повторениях вспомнить не менее '+threshold+'% слов в обе стороны. Учитываются первые проверки.</p>'+
     '<p>Три занятия сами по себе не гарантируют повышение.</p></div></details>':
  '<p class="paper-level-finished">Ты на самом высоком уровне.</p>';
 return '<section class="paper-card paper-level" aria-labelledby="paper-level">'+
  '<div class="paper-level-heading">'+paperIcon('cap')+'<div><h2 id="paper-level">Твой уровень</h2><div class="paper-rank">'+levelLabels[profile.level]+'</div></div></div>'+
  details+'</section>';
}
function paperProgress(){
 const total=dictionary.length,words=dictionary.map(w=>profile.words[w.en]);
 const learned=words.filter(w=>w?.origin==='learned').length;
 const mastered=words.filter(w=>E.status(w)==='mastered').length;
 const weekly=weeklyLearned(),weekGoal=30;
 const percent=n=>total?100*n/total:0;
 const circle=(r,value,kind)=>'<circle class="ring-track '+kind+'" cx="58" cy="58" r="'+r+'"/>'+
  (value?'<circle class="ring-fill '+kind+'" cx="58" cy="58" r="'+r+'" pathLength="100" stroke-dasharray="'+Math.min(100,value)+' 100" style="--ring-value:'+Math.min(100,value)+'"/>':'');
 const label=percent(learned).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
 const rings='<svg class="paper-rings" viewBox="0 0 116 116" role="img" aria-label="Изучено '+label+' словаря; за неделю '+weekly+' из '+weekGoal+'">'+
  circle(52,percent(learned),'learned')+circle(39,percent(mastered),'mastered')+circle(26,100*weekly/weekGoal,'weekly')+
  '<text x="58" y="58" text-anchor="middle" dominant-baseline="central">'+label+'</text></svg>';
 return '<section class="paper-card paper-progress" aria-label="Прогресс по словарю и за неделю">'+rings+'<dl>'+
  '<div><dt class="learned">Изучено:</dt><dd>'+learned+' из '+total+'</dd></div>'+
  '<div><dt class="mastered">Закреплено:</dt><dd>'+mastered+' из '+total+'</dd></div>'+
  '<div><dt class="weekly">За неделю:</dt><dd>'+weekly+' из '+weekGoal+'</dd></div></dl></section>';
}
function home(openPicker=false){
 view=openPicker?'sources':'home';
 homeDay=E.day();
 const pending=E.due(profile),lastReview=profile.sessions.findLast(s=>s.mode==='review');
 const cleared=lastReview&&localStorage.getItem(PRACTICE)===lastReview.id;
 const errors=cleared?[]:E.residualErrors(profile).filter(id=>byId[id]);
 const blocked=storageFailure?'Сохранение заблокировано':session?'Сначала закончи занятие':'';
 const fresh=paperAction('Учить новые слова','sources',blocked||(pending.length?'Сначала повтори слова на сегодня. После этого сможешь учить новые.':''),'Выбери способ подбора');
 const repeat=pending.length?paperAction('Повторить сегодня: '+wordCount(pending.length),'review',blocked):
  errors.length?paperAction('Повторить ещё раз','practice',blocked,'Если хочешь, потренируй ещё '+errors.length+' '+(errors.length%100>=11&&errors.length%100<=14?'трудных слов':errors.length%10===1?'трудное слово':errors.length%10>=2&&errors.length%10<=4?'трудных слова':'трудных слов')):
  paperDone();
 shell('', '', '<main class="paper"><div class="paper-heading"><h1>'+paperIcon('book')+'WordScene</h1></div>'+
 '<div class="paper-hero"><img src="./paper-lighthouse.svg" alt="" width="729" height="160"></div>'+
 paperLevel()+paperProgress()+'<div class="paper-actions">'+fresh+repeat+'</div>'+
 '<p class="paper-scroll-cue" hidden aria-hidden="true">Листай вниз ↓</p><nav class="paper-nav" aria-label="Разделы">'+btn(paperIcon('progress')+'Мой прогресс','progress')+btn(paperIcon('book')+'Словарь','dictionary')+'</nav></main>'+
 (openPicker?'<div class="paper-sheet-backdrop" data-action="closeSources"><section class="paper-sheet" role="dialog" aria-modal="true" aria-labelledby="picker-title"><div class="paper-sheet-handle" aria-hidden="true"></div><div class="paper-sheet-head"><h2 id="picker-title">Как будем учить?</h2>'+btn('×','closeSources','paper-sheet-close')+'</div>'+
 btn('<span class="paper-sheet-symbol" aria-hidden="true">✦</span><span><strong>Автоматически</strong><small>Подберём слова для тебя</small></span>'+paperIcon('next'),'auto','paper-sheet-choice')+
 btn('<span class="paper-sheet-symbol" aria-hidden="true">☷</span><span><strong>Выбрать самому</strong><small>Найди слова или выбери тему</small></span>'+paperIcon('next'),'manual','paper-sheet-choice')+'</section></div>':'') );
 const scrollCue=root.querySelector?.('.paper-scroll-cue'),nav=root.querySelector?.('.paper-nav');
 if(scrollCue&&nav&&typeof window.innerHeight==='number'){
  const updateCue=()=>{scrollCue.hidden=nav.getBoundingClientRect().bottom<=window.innerHeight-4};
  updateCue();
  window.addEventListener?.('scroll',updateCue,{passive:true,once:true});
 }
 if(openPicker){const sheet=root.querySelector('.paper-sheet');const close=root.querySelector('.paper-sheet-close');close?.setAttribute('aria-label','Закрыть');close?.focus();let touchY=null;sheet?.addEventListener('click',event=>event.stopPropagation());sheet?.addEventListener('touchstart',event=>{touchY=event.touches[0]?.clientY??null},{passive:true});sheet?.addEventListener('touchend',event=>{if(touchY!==null&&event.changedTouches[0].clientY-touchY>75)home();touchY=null},{passive:true});}
}
function sources(){if(warnLocked())return;home(true)}
function nextBatch(){
 batch=E.selectCandidates(dictionary,profile,{seen:selection.seen,skipped:selection.skipped||[],unknown:selection.unknown,themes:selection.themes,topic:T.forWord});
 selection.cursor=0;
 if(!batch.length){finishSelection();return}
 selection.current=batch.map(w=>w.en);renderSelection();
}
function makeSelection(kind){if(warnLocked())return;selection=E.beginSelection('auto');selection.skipped=[];nextBatch()}
function pickerIcon(name){
 const shapes={
  back:'<path d="m15 18-6-6 6-6"/>',
  known:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  learn:'<path d="M12 6C9 4 5 4 2 5v14c4-1 7-1 10 2 3-3 6-3 10-2V5c-3-1-7-1-10 1v15"/>',
  volume:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9q4 3 0 6m3-9q7 6 0 12"/>'
 };
 return '<svg class="ws-picker-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+shapes[name]+'</svg>';
}
function selectionScreen(){
 const id=selection.current?.[selection.cursor],w=byId[id];if(!w){nextBatch();return}
 view='select';
 const known=selection.known.length,unknown=selection.unknown.length,seen=selection.seen.length;
 const content='<main class="ws-picker ws-picker-v2"><div class="ws-picker-header">'+
 btn(pickerIcon('back'),'stopSelection','ws-picker-back')+
 '<div class="ws-picker-heading"><h1>Подбор слов</h1><small>Автоматический подбор</small></div>'+
 '<span class="ws-picker-position" aria-label="Просмотрено '+seen+' из 50 слов">'+seen+'/50</span></div>'+
 '<div class="ws-picker-stats" aria-label="Результаты подбора"><div>'+pickerIcon('known')+'<span>Знаю<strong>'+known+'</strong></span></div><div>'+pickerIcon('learn')+'<span>Изучить<strong>'+unknown+'</strong></span></div></div>'+
 '<p class="ws-picker-instruction">Знаешь значение этого слова?</p>'+
 '<section class="ws-picker-card"><button class="ws-picker-reveal" data-action="reveal" type="button" aria-label="'+(showAnswer?'Скрыть перевод слова '+h(w.en):'Показать перевод слова '+h(w.en))+'" aria-pressed="'+showAnswer+'"><span class="ws-picker-word">'+h(w.en)+'</span><span class="ws-picker-ipa">'+h(w.ipa||'')+'</span>'+
 (showAnswer?'<span class="ws-picker-translation">'+h(w.ru)+'</span>':'')+
 '<span class="ws-picker-hint">'+(showAnswer?'Нажми, чтобы скрыть перевод':'Нажми на карточку, чтобы увидеть перевод')+'</span></button>'+
 btn(pickerIcon('volume'),'say:'+h(id),'ws-picker-speak')+'</section>'+
 '<div class="ws-picker-choices">'+
 btn(pickerIcon('known')+'<span>Знаю</span>','known','ws-picker-known')+
 btn(pickerIcon('learn')+'<span>Не знаю</span>','unknown','ws-picker-unknown')+'</div></main>';
 shell('','',content);
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
function stopSelection(){
 // A partial automatic selection contains already recognised words: keep them on exit.
 if(selection?.known?.length&&!saveFamiliar(selection.known))return;
 selection=null;home();
}
function manualView(fill=false){
 view=fill?'fill':'manual';
 const selected=[...manual],limit=E.levelLimit(profile),topicId=[...manualThemes][0]||'food';
 const topic=T.topics.find(t=>t.id===topicId);
 const q=query.trim().toLocaleLowerCase('ru');
 const themed=manualMode==='topics';
 const filtered=themed?dictionary.filter(w=>T.forWord(w.en).includes(topicId)):q?dictionary.filter(w=>(w.en+' '+w.ru).toLocaleLowerCase('ru').includes(q)):[];
 const chosenInTopic=filtered.filter(w=>manual.has(w.en)).length;
 const mainTopics=['food','home','school','animals','sports','travel'];
 const shownTopics=manualShowAll?T.topics:mainTopics.map(id=>T.topics.find(t=>t.id===id)).filter(Boolean);
 const topicIcons={food:'🍎',home:'🏠',school:'🎒',animals:'🐾',sports:'⚽',travel:'✈️',family:'👨‍👩‍👧',clothes:'👕',nature:'🌿',weather:'☀️',colours:'🎨',body:'🖐️'};
 const listing=filtered.map(manualWordRow).join('');
 const main='<main class="ws-manual'+(themed?'':' is-search')+'"><div class="ws-picker-header">'+btn('‹',fill?'leaveFill':'sources','ws-picker-back')+'<h1>'+(fill?'Добавь слова':'Выбор слов')+'</h1></div>'+
 '<div class="ws-manual-tabs" role="group" aria-label="Способ выбора слов">'+
 btn('▦　По темам','manualTab:topics','ws-manual-tab'+(themed?' is-active':''))+
 btn('⌕　Поиск слов','manualTab:search','ws-manual-tab'+(!themed?' is-active':''))+'</div>'+
 '<div class="ws-manual-body">'+
 (themed?'<div class="ws-manual-topic-head"><h2>Выбери тему</h2>'+btn(manualShowAll?'Свернуть':'Все темы ›','manualAllTopics','ws-manual-all')+'</div>'+
 '<div class="ws-manual-topics-note" aria-hidden="true" hidden></div><div class="ws-manual-topics'+(manualShowAll?' is-expanded':'')+'" aria-label="Темы словаря">'+shownTopics.map(t=>btn('<span aria-hidden="true">'+(topicIcons[t.id]||'📚')+'</span><span>'+h(t.name)+'</span>','manualTopic:'+h(t.id),'ws-manual-topic'+(topicId===t.id?' is-active':''))).join('')+'</div>':
 '<label class="ws-manual-search-label" for="manual-search">Поиск по всему словарю</label><div class="ws-manual-search-wrap"><span aria-hidden="true">⌕</span><input id="manual-search" data-input="search" type="search" placeholder="Английское слово или перевод" autocomplete="off" value="'+h(query)+'"></div>')+
 '<section class="ws-manual-list"><div class="ws-manual-list-head"><h2>'+(themed?h(topic?.name||'Слова'):'Результаты поиска')+'</h2><small>'+(themed?'В этой теме выбрано: '+chosenInTopic:q?'Найдено: '+filtered.length:'Введите слово для поиска')+'</small></div>'+
 '<div class="ws-manual-scroll-note" aria-hidden="true" hidden>Прокрути список ↓</div><div class="ws-manual-word-scroll" role="region" aria-label="Список слов" tabindex="0">'+(listing||'<p class="ws-manual-empty">'+(themed?'В этой теме пока нет слов. Выбери другую тему.':q?'Ничего не найдено. Попробуй другой запрос.':'Начни вводить слово на русском или английском.')+'</p>')+'</div></section></div>'+
 '<div class="ws-manual-bottom"><div class="ws-manual-total"><div><span aria-hidden="true">▱</span> Выбрано слов: <strong>'+selected.length+' / 10</strong>'+btn(manualSummaryOpen?'Скрыть ▲':'Список ▼','manualSummary','ws-manual-summary-toggle',!selected.length)+'</div><small>Рекомендуется 10 слов. Начать изучение можно с 3 слов.'+(Number.isFinite(limit)&&limit!==10?' Максимум уровня: '+limit+'.':'')+'</small></div>'+ (manualSummaryOpen&&selected.length?'<div class="ws-manual-summary" role="region" aria-label="Выбранные слова">'+selected.map(id=>'<div><span>'+h(id)+' <small>'+h(byId[id]?.ru||'')+'</small></span>'+btn('Убрать ×','removeManual:'+h(id),'ws-manual-remove')+'</div>').join('')+'</div>':'')+
 btn('Начать изучение ('+selected.length+' '+(selected.length%100>=11&&selected.length%100<=14?'слов':selected.length%10===1?'слово':selected.length%10>=2&&selected.length%10<=4?'слова':'слов')+')','startManual','ws-manual-start',!E.eligible(profile,selected))+
 '</div></main>';
 const scroll=root.querySelector?.('.ws-manual-word-scroll')?.scrollTop??0;
 shell('','',main);
 const next=root.querySelector?.('.ws-manual-word-scroll');if(next)next.scrollTop=scroll;
 wireManualScroll();
 syncManualViewport();
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
  recall();
 }catch(e){notice(e.message)}
}
function cardActions(){
 return (session.pausedAt!==null?'<p class="reason" id="pause-time">'+pauseTime()+'</p>':'')+
  (session.pausedAt!==null?btn('Продолжить','continue','primary'):btn('Пауза','pause','quiet'))+
  (session.mode==='practice'?btn('Закончить тренировку','stopPractice','quiet'):btn('Отменить занятие','cancel','quiet'));
}
function visual(w){if(window.WS17_illustration){try{return window.WS17_illustration(w.en)}catch(e){}}if(w.props&&C?.render){try{return C.render(w)}catch(e){}}return '<div class="simple-art">'+h(w.cue||w.en)+'</div>'}
function learn(focusWord=false){
 if(!session)return home();view='learn';const w=byId[session.ids[session.learnIndex]];
 const title='Запоминание · '+(session.learnIndex+1)+' / '+session.ids.length;
 shell('', '', '<main class="ws-learn"><div class="ws-picker-header"><h1>'+title+'</h1></div>'+
 '<section class="flash learn" tabindex="0" aria-label="Материалы слова"><h2 id="learn-word" tabindex="-1">'+h(w.en)+'</h2><div class="ipa">'+h(w.ipa||'')+'</div>'+btn('▶ Произнести','say:'+h(w.en),'quiet')+'<div class="translation">'+h(w.ru)+'</div>'+
 (!showHelp?'<div class="art">'+visual(w)+'</div><p class="scene">'+h(w.scene||'')+'</p>':'')+'</section>'+
 '<div class="ws-learn-actions"><p class="ws-learn-scroll-note" hidden aria-hidden="true">Прокрути карточку ↓</p>'+
 btn(showHelp?'Показать ассоциацию':'Представить без картинки','toggleArt','quiet')+
 btn(session.learnIndex===session.ids.length-1?'Начать проверку':'Дальше','learnNext','primary')+
 '<div class="ws-learn-session-actions">'+cardActions()+'</div></div></main>');
 const card=root.querySelector?.('.learn'),cue=root.querySelector?.('.ws-learn-scroll-note');
 if(card&&cue){
  const updateCue=()=>{cue.hidden=card.scrollHeight-card.clientHeight-card.scrollTop<=3};
  updateCue();card.addEventListener('scroll',updateCue,{passive:true});
 }
 if(focusWord){window.scrollTo?.(0,0);if(card)card.scrollTop=0;root.querySelector?.('#learn-word')?.focus?.({preventScroll:true})}
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
  delete session.feedback;
   const r=E.answer(session,ok,Date.now(),null,checked);
  if(!store())return home();
  if(r.done)return completed();
  showAnswer=false;showHelp=false;confirmed=false;recall();
 }catch(e){expire(e)}
}
function showFeedback(failed){
 E.action(session);
 session.feedback={failed,help:false};
 showAnswer=true;confirmed=failed;showHelp=false;
 if(!store())return home();
 recall();
}
function resume(){
 if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));
 if(session.stage==='complete')return completed();
 const feedback=session.feedback;
 view=session.stage==='learn'?'learn':'recall';
 showAnswer=!!feedback;confirmed=!!feedback?.failed;showHelp=!!(feedback?.help||session.artHidden);
 render();
}
function suspend(){
 if(!session||storageFailure||session.pausedAt!==null||E.timedOut(session,Date.now()))return;
 
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
 const metrics='<section class="panel"><h2>Мой словарь</h2><div class="progress-total"><small>Знакомых слов</small><strong>'+(learned+known)+' из '+total+'</strong></div>'+
  '<div class="progress-breakdown"><span>Выучил в WordScene <strong>'+learned+'</strong></span><span>Уже знал <strong>'+known+'</strong></span><span>Из них закреплено <strong>'+mastered+'</strong></span></div></section>';
 const rangeButtons=btn('30 дней','progressRange:30',progressRange==='30'?'primary':'secondary')+btn('Всё время','progressRange:all',progressRange==='all'?'primary':'secondary');
 const qualityButtons=btn('28 дней','qualityRange:28',qualityRange==='28'?'primary':'secondary')+btn('Всё время','qualityRange:all',qualityRange==='all'?'primary':'secondary');
 shell('Мой прогресс',metrics+
  '<section class="panel"><h2>Сколько слов я выучил</h2><div class="progress-switch">'+rangeButtons+'</div>'+chart+'</section>'+
  '<section class="panel"><h2>Как хорошо я помню слова</h2><div class="progress-switch">'+qualityButtons+'</div>'+quality+'</section>'+
  btn('На главную','home','quiet'));
}
function dictionaryView(){
 view='dictionary';const list=dictionary.filter(w=>(w.en+' '+w.ru).toLowerCase().includes(query.toLowerCase()));
 shell('Словарь','<section class="panel"><input data-input="search" value="'+h(query)+'" placeholder="Поиск слова" /><div class="word-picker">'+list.map(w=>'<button class="word-option" data-action="word:'+h(w.en)+'"><span><b>'+h(w.en)+'</b> · '+h(w.ru)+'</span><small>'+({new:'Не изучено',known:'Предварительно знакомо',learning:'Закрепляется',mastered:'Закреплено'}[E.status(profile.words[w.en])]||'')+'</small></button>').join('')+'</div></section>'+btn('На главную','home','quiet'));
}
function wordDetail(id){
 const w=byId[id],p=profile.words[id];
 shell(h(w.en),'<section class="flash learn"><div class="ipa">'+h(w.ipa||'')+'</div><div class="translation">'+h(w.ru)+'</div>'+btn('▶ Произнести','say:'+h(w.en),'quiet')+'<div class="art">'+visual(w)+'</div><p>'+h(w.scene||'')+'</p><p class="reason">Статус: '+({new:'Не изучено',known:'Предварительно знакомо',learning:'Закрепляется',mastered:'Закреплено'}[E.status(p)]||'')+'</p></section>'+btn('Словарь','dictionary','quiet'));
}
function recoverScreen(){
 view='recover';let backup;
 try{backup=accounts.inspect('local').backup}catch{}
 shell('Восстановление прогресса','<section class="panel"><p>Основное сохранение повреждено или недоступно.</p><p class="reason">'+(backup?'Найдена резервная копия: '+Object.keys(backup.words).length+' слов, '+backup.sessions.length+' занятий.':'Корректная резервная копия не найдена. Исходные данные остаются нетронутыми.')+'</p>'+(backup?btn('Восстановить резервную копию','restoreBackup','primary'):'')+btn('Вернуться','home','quiet')+'</section>');
}
function restoreBackup(){
 if(!storageFailure||session)return notice('Восстановление недоступно');
 try{accounts.recover('local');window.location.reload()}
 catch(err){notice('Не удалось восстановить копию. Исходные данные не изменены.')}
}
function confirmCancel(){const yes=window.confirm('Отменить занятие? Все незавершённые результаты будут потеряны.');if(yes){session=null;selection=null;store();home()}else if(session){render()}}
function render(){if(session){if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));if(session.stage==='complete'&&view!=='home')return completed();if(view==='learn')return learn();if(view==='recall')return recall()}if(view==='select')return selectionScreen();if(view==='manual'||view==='fill')return manualView(view==='fill');if(view==='sources')return home(true);if(view==='progress')return progress();if(view==='dictionary')return dictionaryView();return home()}
function dispatch(act,el){
 if(storageFailure&&!['home','dictionary','progress','recover','restoreBackup'].includes(act)&&!act.startsWith('word:')&&!act.startsWith('say:'))return notice('Сохранение заблокировано. Никакие данные не перезаписываются.');
 if(act.startsWith('say:'))return speak(act.slice(4));
 if(act.startsWith('removeManual:')){manual.delete(act.slice(13));if(!manual.size)manualSummaryOpen=false;return manualView(view==='fill')}
 if(act==='manualSummary'){manualSummaryOpen=!manualSummaryOpen;return manualView(view==='fill')}
 if(act.startsWith('manualTopic:')){const v=act.slice(12);manualThemes.clear();manualThemes.add(v);return manualView(view==='fill')}
 if(act.startsWith('manualTab:')){manualMode=act.slice(10);if(manualMode==='search')manualSearchBaseHeight=window.visualViewport?.height||window.innerHeight;return manualView(view==='fill')}
 if(act==='manualAllTopics'){manualShowAll=!manualShowAll;return manualView(view==='fill')}
 if(act.startsWith('pick:')){const v=act.slice(5);if(profile.words[v]?.origin||!byId[v])return;manual.has(v)?manual.delete(v):manual.size<E.levelLimit(profile)&&manual.add(v);return manualView(view==='fill')}
 if(act.startsWith('progressRange:')){progressRange=act.slice(14);return progress()}
 if(act.startsWith('qualityRange:')){qualityRange=act.slice(13);return progress()}
 if(act.startsWith('word:'))return wordDetail(act.slice(5));
 if(session&&E.timedOut(session,Date.now()))return expire();
 if(session&&session.pausedAt!==null&&!['continue','cancel','stopPractice'].includes(act))return notice('Сначала продолжи занятие');
 switch(act){
 case 'home':return home();case 'closeSources':return home();case 'restoreBackup':return restoreBackup();case 'recover':return recoverScreen();case 'sources':return sources();case 'manual':manual.clear();manualThemes.clear();manualThemes.add('food');manualMode='topics';manualShowAll=false;manualSummaryOpen=false;query='';manualSearchBaseHeight=0;return manualView();
 case 'auto':return makeSelection('auto');
 case 'review':return review();case 'practice':return review('practice');case 'stopPractice':session=null;store();return home();case 'progress':return progress();case 'dictionary':query='';return dictionaryView();
 case 'known':return selectionGrade(true);case 'unknown':return selectionGrade(false);case 'stopSelection':return stopSelection();
 case 'reveal':showAnswer=!showAnswer;return selectionScreen();
 case 'startManual':return startLearning([...manual],selection?.known||[]);
 case 'leaveFill':saveFamiliar(selection.known);selection=null;manual.clear();return home();
 case 'learnNext':try{E.learnNext(session);session.artHidden=false;if(!store())return home();showHelp=false;return session.stage==='learn'?learn(true):recall()}catch(err){return expire(err)}
 case 'toggleArt':E.action(session);showHelp=!showHelp;session.artHidden=showHelp;store();return learn();
 case 'yes':return sendAnswer(true);case 'no':return showFeedback(true);
 case 'check':return showFeedback(false);
 case 'checkedYes':return sendAnswer(true,true);case 'checkedNo':return sendAnswer(false,true);
 case 'advance':return sendAnswer(false);
 case 'help':E.action(session);showHelp=true;session.feedback.help=true;store();return recall();
 case 'pause':suspend();return storageFailure?home():render();
  case 'continue':session.pausedAt=null;if(!store())return home();return render();
 case 'cancel':return confirmCancel();
 }
}
function refreshHomeDay(){
 if(!storageFailure&&!session&&view==='home'&&homeDay!==E.day())home();
}
function returnToCard(){if(session&&!storageFailure)resume();else refreshHomeDay()}
document.addEventListener?.('keydown',event=>{if(view==='sources'&&event.key==='Escape')home()});
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)suspend();else returnToCard()});
window.addEventListener?.('pagehide',suspend);
window.addEventListener?.('pageshow',event=>{if(event.persisted)returnToCard()});
window.addEventListener?.('focus',refreshHomeDay);
window.visualViewport?.addEventListener?.('resize',syncManualViewport,{passive:true});
window.visualViewport?.addEventListener?.('scroll',syncManualViewport,{passive:true});
window.addEventListener?.('resize',syncManualViewport,{passive:true});
document.addEventListener?.('focusin',event=>{if(event.target?.id==='manual-search')syncManualViewport()});
document.addEventListener?.('focusout',event=>{if(event.target?.id==='manual-search'&&typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(syncManualViewport)});
load();if(storageFailure)recoverScreen();else if(session)resume();else home();
setInterval(()=>{
 refreshHomeDay();
 if(!session||storageFailure)return;
 if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));
 const timer=root.querySelector('#pause-time');
 if(timer)timer.textContent=pauseTime();
},1000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
