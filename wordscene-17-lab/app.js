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
let lastRecallKey='',lastRecallFace=false;
let progressRange='30',qualityRange='28',homeDay=null,manualMode='topics',manualShowAll=false,manualSummaryOpen=false;
let dictionaryFilter='all';
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
  '<span class="ws-manual-word-copy"><strong>'+h(w.en)+'</strong><small>'+h(w.ru)+'</small></span>'+
  (used?'<span class="ws-manual-learned">Уже изучено</span>':'')+'</button>'+
  btn(pickerIcon('volume'),'say:'+h(w.en),'ws-manual-audio')+'</div>';
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
function paperWelcome(){
 return '<div class="paper-welcome" role="status"><span class="paper-welcome-mark" aria-hidden="true">'+paperIcon('book')+'</span>'+
  '<span><strong>Твоё обучение начинается!</strong><small>Выбери первые слова и начни своё первое занятие.</small></span></div>';
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
let homeScrollCueListener=null;
function home(openPicker=false){
 if(homeScrollCueListener){window.removeEventListener?.('scroll',homeScrollCueListener);homeScrollCueListener=null;}
 view=openPicker?'sources':'home';
 homeDay=E.day();
 const pending=E.due(profile),lastReview=profile.sessions.findLast(s=>s.mode==='review');
 const cleared=lastReview&&localStorage.getItem(PRACTICE)===lastReview.id;
 const errors=cleared?[]:E.residualErrors(profile).filter(id=>byId[id]);
 const blocked=storageFailure?'Сохранение заблокировано':session?'Сначала закончи занятие':'';
 const fresh=paperAction('Учить новые слова','sources',blocked||(pending.length?'Сначала повтори слова на сегодня. После этого сможешь учить новые.':''),'Выбери способ подбора');
 const repeat=pending.length?paperAction('Повторить сегодня: '+wordCount(pending.length),'review',blocked):
  errors.length?paperAction('Повторить ещё раз','practice',blocked,'Если хочешь, потренируй ещё '+errors.length+' '+(errors.length%100>=11&&errors.length%100<=14?'трудных слов':errors.length%10===1?'трудное слово':errors.length%10>=2&&errors.length%10<=4?'трудных слова':'трудных слов')):
  (profile.sessions.some(s=>s.mode==='new'||s.mode==='review')?paperDone():paperWelcome());
 shell('', '', '<main class="paper"><div class="paper-heading"><h1>'+paperIcon('book')+'WordScene</h1></div>'+
 '<div class="paper-hero"><img src="./paper-lighthouse.svg" alt="" width="729" height="160"></div>'+
 paperLevel()+paperProgress()+'<div class="paper-actions">'+fresh+repeat+'</div>'+
 '<p class="paper-scroll-cue" hidden aria-hidden="true">Листай вниз ↓</p><nav class="paper-nav" aria-label="Разделы">'+btn(paperIcon('progress')+'Мой прогресс','progress')+btn(paperIcon('book')+'Словарь','dictionaryOpen')+'</nav></main>'+
 (openPicker?'<div class="paper-sheet-backdrop" data-action="closeSources"><section class="paper-sheet" role="dialog" aria-modal="true" aria-labelledby="picker-title"><div class="paper-sheet-handle" aria-hidden="true"></div><div class="paper-sheet-head"><h2 id="picker-title">Как будем учить?</h2>'+btn('×','closeSources','paper-sheet-close')+'</div>'+
 btn('<span class="paper-sheet-symbol" aria-hidden="true">✦</span><span><strong>Автоматически</strong><small>Подберём слова для тебя</small></span>'+paperIcon('next'),'auto','paper-sheet-choice')+
 btn('<span class="paper-sheet-symbol" aria-hidden="true">☷</span><span><strong>Выбрать самому</strong><small>Найди слова или выбери тему</small></span>'+paperIcon('next'),'manual','paper-sheet-choice')+'</section></div>':'') );
 const scrollCue=root.querySelector?.('.paper-scroll-cue'),nav=root.querySelector?.('.paper-nav');
 if(scrollCue&&nav&&typeof window.innerHeight==='number'){
  const updateCue=()=>{scrollCue.hidden=nav.getBoundingClientRect().bottom<=window.innerHeight-4};
  updateCue();
  homeScrollCueListener=updateCue;
  window.addEventListener?.('scroll',updateCue,{passive:true});
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
  volume:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9q4 3 0 6m3-9q7 6 0 12"/>',
  flip:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18M8 8l-3 4 3 4m8-8 3 4-3 4"/>'
 };
 return '<svg class="ws-picker-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+shapes[name]+'</svg>';
}
function paperWordSide(w,english,back=false,hidden=false,locked=false){
 return '<div class="ws-paper-face'+(back?' ws-paper-face-back':'')+'" aria-hidden="'+hidden+'" '+(hidden?'inert':'')+'>'+
  '<div class="ws-paper-grain" aria-hidden="true"></div>'+
  '<div class="ws-paper-wordbox"><strong class="ws-paper-word">'+h(english?w.en:w.ru)+'</strong>'+
  '<span class="ws-paper-ipa">'+(english?h(w.ipa||''):'')+'</span>'+
  '<span class="ws-paper-sound-slot">'+(english?btn(pickerIcon('volume'),'say:'+h(w.en),'ws-paper-sound'):'')+'</span></div>'+
  (locked?'':'<div class="ws-paper-foot"><span>↻ ПЕРЕВЕРНИ</span></div>')+'</div>';
}
function paperSheet(w,frontEnglish,flipped=false,locked=false,motion=''){
 return '<div class="ws-paper-stage"><div class="ws-paper-underlay" aria-hidden="true"></div>'+
  '<div class="ws-paper-sheet'+(flipped?' is-flipped':'')+(motion?' ws-paper-turn-'+motion:'')+'" data-flip-card="true" role="button" tabindex="0" aria-label="'+(locked?'Ответ открыт':flipped?'Вернуть исходное слово':'Перевернуть лист')+'" aria-expanded="'+flipped+'">'+
  '<div class="ws-paper-inner">'+paperWordSide(w,frontEnglish,false,flipped,locked)+paperWordSide(w,!frontEnglish,true,!flipped,locked)+'</div></div></div>';
}
function paperFlipInPlace(flipped){
 const sheet=root.querySelector?.('[data-flip-card]');
 // The DOM shim used by the pure UI tests has no classList. Its renderer is the fallback.
 if(!sheet?.classList)return false;
 sheet.classList.toggle('is-flipped',flipped);
 sheet.setAttribute('aria-expanded',String(flipped));
 sheet.setAttribute('aria-label',flipped?'Вернуть исходное слово':'Перевернуть лист');
 const faces=sheet.querySelectorAll('.ws-paper-face');
 faces.forEach((face,index)=>{
  const hidden=index===0?flipped:!flipped;
  face.setAttribute('aria-hidden',String(hidden));
  if(hidden)face.setAttribute('inert','');
  else face.removeAttribute('inert');
 });
 return true;
}
function paperDream(w,mode,shown,canToggle){
 if(mode==='select')return '<div class="ws-paper-dream ws-paper-dream-empty" aria-hidden="true"></div>';
 return '<section class="ws-paper-dream'+(shown?' is-open':' is-collapsed')+'" aria-label="Пространство фантазии"><div class="ws-paper-dream-head"><strong>✦ ПРОСТРАНСТВО ФАНТАЗИИ</strong>'+
  (canToggle?btn(shown?'Скрыть образ':'Показать образ','help','ws-paper-dream-toggle'):'')+'</div>'+
  '<div class="ws-paper-dream-scroll">'+(shown?'<div class="ws-paper-art">'+visual(w)+'</div><p class="ws-paper-scene">'+h(w.scene||'')+'</p>':
  '<p class="ws-paper-dream-hint">Сначала попробуй вспомнить слово. Образ можно открыть отдельно.</p>')+'</div></section>';
}
function wirePaperFlip(onTurn){
 const el=root.querySelector?.('[data-flip-card]');
 if(!el)return;
 const turn=event=>{if(event?.target?.closest?.('button'))return;onTurn()};
 el.addEventListener('click',turn);
 el.addEventListener('keydown',event=>{if(event.target!==el)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onTurn()}});
}
function selectionScreen(){
 const id=selection.current?.[selection.cursor],w=byId[id];if(!w){nextBatch();return}
 view='select';
 if(!selection.seen.includes(id))selection.seen.push(id);
 const known=selection.known.length,unknown=selection.unknown.length,seen=selection.seen.length;
 const actions='<div class="ws-paper-decisions">'+btn('Знаю','known','ws-paper-negative')+btn('Не знаю','unknown','ws-paper-positive')+'</div>';
 shell('','', '<main class="ws-paper-page ws-paper-select"><div class="ws-paper-header"><div><h1>Подбор слов</h1><small>Неизвестных: '+unknown+' из 10 · Просмотрено: '+seen+' из 50</small></div><span class="ws-paper-count">'+seen+'/50</span></div>'+

  '<div class="ws-paper-main">'+paperSheet(w,true,showAnswer)+paperDream(w,'select',false,false)+'</div>'+
  '<div class="ws-paper-bottom"><p class="ws-paper-instruction">Знаешь значение этого слова? Переверни лист, если нужно.</p>'+actions+
  '<div class="ws-paper-minors">'+btn('Завершить подбор','stopSelection','ws-paper-minor')+'</div></div></main>');
 wirePaperFlip(()=>{showAnswer=!showAnswer;if(!paperFlipInPlace(showAnswer))selectionScreen()});
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
 // An interrupted automatic selection is discarded without saving familiar words.
 selection=null;home();
}
const topicSvgPaths={"animals":"<circle cx=\"12\" cy=\"17.5\" r=\"3.3\"/><ellipse cx=\"5\" cy=\"11\" rx=\"1.6\" ry=\"2.1\"/><ellipse cx=\"9.4\" cy=\"6.6\" rx=\"1.5\" ry=\"2\"/><ellipse cx=\"15\" cy=\"6.6\" rx=\"1.5\" ry=\"2\"/><ellipse cx=\"19.3\" cy=\"11\" rx=\"1.6\" ry=\"2.1\"/>","food":"<path d=\"M12 7c-3-4-9-2-9 4 0 5 4 10 9 10s9-5 9-10c0-6-6-8-9-4Z\"/><path d=\"M12 7c0-3 1-5 4-6\"/><path d=\"M12 6c-2-3-4-3-6-3 1 3 3 4 6 3Z\"/>","kitchen":"<path d=\"M4 10h16v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-7Z\"/><path d=\"M3 10h18M9 7V4h6v3M2 13H1m22 0h-1\"/>","home":"<path d=\"m3 10 9-7 9 7v11H3V10Z\"/><path d=\"M9 21v-8h6v8\"/>","family":"<circle cx=\"8\" cy=\"8\" r=\"3\"/><circle cx=\"17\" cy=\"9\" r=\"2.5\"/><path d=\"M2 21v-3a6 6 0 0 1 12 0v3M15 15a4.5 4.5 0 0 1 7 4v2\"/>","body":"<path d=\"M20.8 8.5c0 4-8.8 10.7-8.8 10.7S3.2 12.5 3.2 8.5A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.5Z\"/><path d=\"M3.8 12h4l2-3 3.2 6 2.1-3H20\"/>","clothes":"<path d=\"m8 3 4 2 4-2 5 4-3 5-2-1v10H8V11l-2 1-3-5 5-4Z\"/>","school":"<path d=\"m2 9 10-6 10 6-10 6L2 9ZM6 12v5c4 4 8 4 12 0v-5M22 9v8\"/>","nature":"<path d=\"m12 2-7 9h4l-5 7h16l-5-7h4l-7-9ZM12 18v4\"/>","weather":"<circle cx=\"8\" cy=\"7\" r=\"3\"/><path d=\"M8 1v2M2.5 3l1.6 1.5M1 8h2M17 2l-2 2\"/><path d=\"M7 19h12a4 4 0 0 0 0-8 6 6 0 0 0-11 2 3 3 0 0 0-1 6Z\"/>","time":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4M17 3v4M3 10h18M8 14h3v3H8z\"/>","colours":"<path d=\"M12 3a9 9 0 1 0 0 18c2.4 0 2.8-2.3 1.3-3.4-.9-.6-.6-2.1.7-2.1H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3Z\"/><circle cx=\"7.5\" cy=\"11\" r=\"1\"/><circle cx=\"10\" cy=\"7\" r=\"1\"/><circle cx=\"15\" cy=\"7\" r=\"1\"/><circle cx=\"18\" cy=\"11\" r=\"1\"/>","actions":"<path d=\"M19 15c1.2-1.2 2-2.7 2-4.5 0-4-4-7.5-9-7.5S3 6.5 3 10.5 7 18 12 18h2l5 3v-6Z\"/><path d=\"M8 10h8M8 13h5\"/>","descriptions":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 15c2 3 6 3 8 0M8 9h.01M16 9h.01\"/>","sports":"<path d=\"M7 4h10v6a5 5 0 0 1-10 0V4ZM7 6H3v3a4 4 0 0 0 4 4M17 6h4v3a4 4 0 0 1-4 4M12 15v5M8 21h8\"/>","town":"<rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"1\"/><path d=\"M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-4h4v4\"/>","travel":"<path d=\"m21 3-7 18-3.5-7.5L3 10l18-7ZM10.5 13.5 21 3\"/>","arts":"<path d=\"M3 5c5-2 9-2 13 0v10c0 4-3 6-6.5 7C5 20 3 17 3 13V5ZM16 6l5-1v8c0 3-2 5-5 6\"/><path d=\"M7 10h.01M13 10h.01M7 15c2 2 4 2 6 0\"/>","tech":"<rect x=\"4\" y=\"4\" width=\"16\" height=\"13\" rx=\"2\"/><path d=\"M2 21h20l-2-4H4l-2 4Z\"/>","quantity":"<rect x=\"3\" y=\"4\" width=\"8\" height=\"8\" rx=\"1\"/><circle cx=\"17\" cy=\"8\" r=\"4\"/><path d=\"m7 15-4 7h8l-4-7ZM16 16h6v6h-6z\"/>","objects":"<path d=\"M14.5 6.5a5 5 0 0 0-6.4 6.4L3.5 17a2.4 2.4 0 0 0 3.5 3.5l4.1-4.6a5 5 0 0 0 6.4-6.4l-3 3-3-1 1-3 3-3Z\"/>","countries":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18M5 7h14M5 17h14\"/>"};
function topicIcon(id){return '<svg class="ws-topic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(topicSvgPaths[id]||topicSvgPaths.objects)+'</svg>'}
function manualView(fill=false){
 view=fill?'fill':'manual';
 const selected=[...manual],limit=E.levelLimit(profile),topicId=[...manualThemes][0]||'food';
 const topic=T.topics.find(t=>t.id===topicId);
 const q=query.trim().toLocaleLowerCase('ru');
 const themed=manualMode==='topics';
 const filtered=themed?dictionary.filter(w=>T.forWord(w.en).includes(topicId)):q?dictionary.filter(w=>(w.en+' '+w.ru).toLocaleLowerCase('ru').includes(q)):[];
 const chosenInTopic=filtered.filter(w=>manual.has(w.en)).length;
 const shownTopics=manualShowAll?T.topics:[...T.topics.filter(t=>t.id===topicId),...T.topics.filter(t=>t.id!==topicId)].slice(0,3);
 const listing=filtered.map(manualWordRow).join('');
 const main='<main class="ws-manual ws-manual-v2 ws-manual-v3'+(themed?'':' is-search')+'"><div class="ws-manual-page"><div class="ws-picker-header">'+btn(pickerIcon('back'),fill?'leaveFill':'sources','ws-picker-back')+'<div class="ws-manual-heading"><h1>'+(fill?'Добавь слова':'Выбор слов')+'</h1><small>Ручной подбор</small></div><span class="ws-manual-limit">до '+limit+' слов</span></div>'+
 '<div class="ws-manual-tabs" role="group" aria-label="Способ выбора слов">'+
 btn(pickerIcon('learn')+' По темам','manualTab:topics','ws-manual-tab'+(themed?' is-active':''))+
 btn('<svg class="ws-picker-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg> Поиск','manualTab:search','ws-manual-tab'+(!themed?' is-active':''))+'</div>'+
 '<div class="ws-manual-body">'+
 (themed?'<div class="ws-manual-topic-head"><h2>Выбери тему</h2>'+btn(manualShowAll?'Свернуть':'Все темы ›','manualAllTopics','ws-manual-all')+'</div>'+
 '<div class="ws-manual-topics-note" aria-hidden="true" hidden></div><div class="ws-manual-topics'+(manualShowAll?' is-expanded':'')+'" aria-label="Темы словаря">'+shownTopics.map(t=>btn(topicIcon(t.id)+'<span>'+h(t.name)+'</span>','manualTopic:'+h(t.id),'ws-manual-topic'+(topicId===t.id?' is-active':''))).join('')+'</div>':
 '<label class="ws-manual-search-label" for="manual-search">Поиск по всему словарю</label><div class="ws-manual-search-wrap"><span aria-hidden="true"><svg class="ws-picker-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg></span><input id="manual-search" data-input="search" type="search" placeholder="Английское слово или перевод" autocomplete="off" value="'+h(query)+'"></div>')+
 '<section class="ws-manual-list"><div class="ws-manual-list-head"><div><h2>'+(themed?h(topic?.name||'Слова'):'Результаты поиска')+'</h2><p>Нажми на слово, чтобы выбрать</p></div><small>'+(themed?'В этой теме выбрано: '+chosenInTopic:q?'Найдено: '+filtered.length:'Введите слово для поиска')+'</small></div>'+
 '<div class="ws-manual-word-scroll" role="region" aria-label="Список слов" tabindex="0">'+(listing||'<p class="ws-manual-empty">'+(themed?'В этой теме пока нет слов. Выбери другую тему.':q?'Ничего не найдено. Попробуй другой запрос.':'Начни вводить слово на русском или английском.')+'</p>')+'</div></section></div></div>'+
 '<div class="ws-manual-bottom"><div class="ws-manual-total"><div><span class="ws-manual-total-label">Выбрано слов:</span><strong>'+selected.length+' / '+limit+'</strong>'+btn('Посмотреть','manualSummary','ws-manual-summary-toggle',!selected.length)+'</div><small class="ws-manual-minimum"'+(selected.length>=3?' hidden':'')+'>Выбери минимум 3 слова</small></div>'+
 btn('Начать изучение ('+selected.length+' '+(selected.length%100>=11&&selected.length%100<=14?'слов':selected.length%10===1?'слово':selected.length%10>=2&&selected.length%10<=4?'слова':'слов')+')','startManual','ws-manual-start',!E.eligible(profile,selected))+
 '</div>'+ (manualSummaryOpen&&selected.length?'<div class="ws-selected-layer"><button type="button" class="ws-selected-backdrop" data-action="manualSummaryClose" tabindex="-1" aria-label="Закрыть список выбранных слов"></button><section class="ws-selected-sheet" role="dialog" aria-modal="true" aria-labelledby="ws-selected-title" tabindex="-1"><div class="ws-selected-handle" aria-hidden="true"></div><div class="ws-selected-head"><div><h2 id="ws-selected-title">Выбранные слова</h2><p>'+selected.length+' из '+limit+'</p></div>'+btn('×','manualSummaryClose','ws-selected-close')+'</div><div class="ws-selected-list" role="region" aria-label="Выбранные слова" tabindex="0">'+selected.map(id=>'<div class="ws-selected-row"><span><strong>'+h(id)+'</strong><small>'+h(byId[id]?.ru||'')+'</small></span>'+btn('Убрать ×','removeManual:'+h(id),'ws-manual-remove')+'</div>').join('')+'</div>'+btn('Готово','manualSummaryClose','ws-selected-done')+'</section></div>':'')+'</main>';
 const scroll=root.querySelector?.('.ws-manual-page')?.scrollTop??0;
 const selectedScroll=root.querySelector?.('.ws-selected-list')?.scrollTop??0;
 shell('','',main);
 const page=root.querySelector?.('.ws-manual-page');if(page)page.scrollTop=scroll;
 const sheet=root.querySelector?.('.ws-selected-sheet');
 if(sheet){root.querySelector?.('.ws-manual-page')?.setAttribute?.('inert','');root.querySelector?.('.ws-manual-bottom')?.setAttribute?.('inert','');const selectedList=root.querySelector?.('.ws-selected-list');if(selectedList)selectedList.scrollTop=selectedScroll;root.querySelector?.('.ws-selected-close')?.focus?.({preventScroll:true});sheet.addEventListener?.('keydown',event=>{if(event.key==='Escape'){event.preventDefault();manualSummaryOpen=false;manualView(view==='fill');return}if(event.key==='Tab'){const items=[...sheet.querySelectorAll('button:not([disabled])')];const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});}
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
 return btn('Пауза','pause','quiet')+
  (session.mode==='practice'?btn('Закончить тренировку','stopPractice','quiet'):btn('Отменить занятие','cancel','quiet'));
}
function paperPauseOverlay(){
 if(!session||session.pausedAt===null)return '';
 return '<div class="ws-paper-pause" role="presentation"><section class="ws-paper-pause-dialog" role="dialog" aria-modal="true" aria-labelledby="ws-paper-pause-title">'+
  '<span class="ws-paper-pause-icon" aria-hidden="true">Ⅱ</span><h2 id="ws-paper-pause-title">Занятие на паузе</h2>'+
  '<p>Ты вернёшься к тому же слову и той же стороне листа.</p>'+
  '<p class="ws-paper-pause-timer" id="pause-time">'+pauseTime()+'</p>'+
  '<p class="ws-paper-pause-note">Пауза не останавливает отсчёт времени.</p>'+
  '<div class="ws-paper-pause-buttons">'+btn('Продолжить','continue','ws-paper-resume')+
  (session.mode==='practice'?btn('Закончить тренировку','stopPractice','ws-paper-pause-cancel'):btn('Отменить занятие','cancel','ws-paper-pause-cancel'))+
  '</div></section></div>';
}
function visual(w){if(window.WS17_illustration){try{return window.WS17_illustration(w.en)}catch(e){}}if(w.props&&C?.render){try{return C.render(w)}catch(e){}}return '<div class="simple-art">'+h(w.cue||w.en)+'</div>'}
function learn(focusWord=false){
 if(!session)return home();view='learn';const w=byId[session.ids[session.learnIndex]];
 const position=session.learnIndex+1,total=session.ids.length,progress=Math.round(100*position/total);
 const back=!!session.paperLearnFace;
 shell('','', '<main class="ws-paper-page ws-paper-learn'+(session.pausedAt!==null?' is-paused':'')+'"><div class="ws-paper-header"><div><h1>Запоминание</h1><small>Изучаем новые слова</small></div><span class="ws-paper-count">'+position+' из '+total+'</span></div>'+
  '<div class="ws-paper-track" role="progressbar" aria-label="Прогресс запоминания" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+position+'"><span style="width:'+progress+'%"></span></div>'+
  '<div class="ws-paper-main">'+paperSheet(w,true,back)+paperDream(w,'learn',true,false)+'</div>'+
  '<div class="ws-paper-bottom"><p class="ws-paper-instruction">Изучи обе стороны и представь образ</p>'+
  '<div class="ws-paper-decisions">'+btn(position===total?'Начать проверку':'Дальше','learnNext','ws-paper-positive ws-paper-full')+'</div>'+
  '<div class="ws-paper-minors">'+cardActions()+'</div></div>'+paperPauseOverlay()+'</main>');
 wirePaperFlip(()=>{if(session.pausedAt!==null)return;session.paperLearnFace=!session.paperLearnFace;if(!store())return home();if(!paperFlipInPlace(session.paperLearnFace))learn()});
 if(focusWord){window.scrollTo?.(0,0);root.querySelector?.('[data-flip-card]')?.focus?.({preventScroll:true})}
}
function recall(){
 if(!session)return home();view='recall';const item=session.items[session.index];if(!item)return completed();
 const w=byId[item.id],total=session.items.length,position=session.index+1,progress=Math.round((position-1)/Math.max(1,total)*100);
 const direction=item.dir===1?'Русский → Английский':'Английский → Русский';
 const title=session.mode==='practice'?'Повторяем ошибки':session.mode==='review'?'Повторение':'Проверка знаний';
 const failed=!!session.feedback?.failed,answerVisible=showAnswer;
 const recallKey=[session.mode,session.round,session.index,item.id,item.dir].join(':');
 if(recallKey!==lastRecallKey){lastRecallFace=false;lastRecallKey=recallKey}
 const flipMotion=answerVisible!==lastRecallFace?(answerVisible?'back':'front'):'';
 lastRecallFace=answerVisible;
 const grade='<div class="ws-paper-decisions">'+(failed?btn('Дальше','advance','ws-paper-positive ws-paper-full'):
  btn('Не вспомнил',answerVisible?'checkedNo':'no','ws-paper-negative')+
  btn('Вспомнил',answerVisible?'checkedYes':'yes','ws-paper-positive'))+'</div>';
 shell('','', '<main class="ws-paper-page ws-paper-recall ws-recall-v4'+(session.pausedAt!==null?' is-paused':'')+'"><div class="ws-paper-header"><div><h1>'+title+'</h1><small>Проход '+session.round+' · '+direction+'</small></div><span class="ws-paper-count">'+position+' из '+total+'</span></div>'+
  '<div class="ws-paper-track" role="progressbar" aria-label="Прогресс проверки" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+(position-1)+'"><span style="width:'+progress+'%"></span></div>'+
  '<div class="ws-paper-main">'+paperSheet(w,item.dir!==1,answerVisible,failed,flipMotion)+paperDream(w,'recall',showHelp,answerVisible)+'</div>'+
  '<div class="ws-paper-bottom"><p class="ws-paper-instruction">'+(failed?'Посмотри правильный ответ и переходи дальше':'Вспомни слово и оцени себя')+'</p>'+
  grade+'<div class="ws-paper-minors">'+cardActions()+'</div></div>'+paperPauseOverlay()+'</main>');
 wirePaperFlip(()=>{if(session.pausedAt!==null||failed)return;dispatch(answerVisible?'hideTranslation':'check')});
}
function sendAnswer(ok,checked=false){
 try{
  delete session.feedback;
  delete session.recallHint;
   const r=E.answer(session,ok,Date.now(),null,checked);
  if(!store())return home();
  if(r.done)return completed();
  showAnswer=false;showHelp=false;confirmed=false;recall();
 }catch(e){expire(e)}
}
function showFeedback(failed){
 E.action(session);
 session.feedback={failed,help:false};
 delete session.recallHint;
 showAnswer=true;confirmed=failed;showHelp=false;
 if(!store())return home();
 recall();
}
function resume(){
 if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));
 if(session.stage==='complete')return completed();
 const feedback=session.feedback;
 view=session.stage==='learn'?'learn':'recall';
 showAnswer=!!feedback;confirmed=!!feedback?.failed;showHelp=!!(feedback?.help||session.recallHint);
 render();
}
function suspend(){
 if(!session||storageFailure||session.pausedAt!==null||E.timedOut(session,Date.now()))return;
 
  E.pause(session);store();
}
function resultWordList(ids){
 const unique=[...new Set(ids||[])].filter(id=>byId[id]);
 if(!unique.length)return '<p class="ws-result-no-hard">Трудных слов не осталось.</p>';
 return '<details class="ws-result-hard"><summary><span>Трудные слова</span><strong>'+unique.length+'</strong><span class="ws-result-chevron" aria-hidden="true">⌄</span></summary>'+
  '<ul>'+unique.map(id=>'<li><strong>'+h(byId[id].en)+'</strong><span>'+h(byId[id].ru)+'</span></li>').join('')+'</ul></details>';
}
function resultLevel(previousLevel){
 const p=E.levelProgress(profile),name=levelLabels[profile.level]||profile.level;
 if(previousLevel!==profile.level)return '<section class="ws-result-level"><h2>Твой уровень</h2><p>Новый уровень — <strong>'+h(name)+'</strong>.</p></section>';
 if(!p.target)return '<section class="ws-result-level"><h2>Твой уровень</h2><p><strong>Профи</strong> — высший уровень достигнут.</p></section>';
 const confirmed=Math.min(3,p.window||0),quality=p.successRate===null?'Пока нет подтверждённых проверок':Math.round(p.successRate*100)+'% при цели '+Math.round(p.threshold*100)+'%';
 return '<section class="ws-result-level"><h2>Твой уровень — '+h(name)+'</h2>'+
  '<p>К уровню «'+h(p.target)+'»: подтверждено <strong>'+confirmed+' из 3</strong> подходящих занятий.</p>'+
  '<p class="ws-result-level-note">Качество повторений: '+quality+'.</p></section>';
}
function resultScreen({mode,ids,successful=null,extraWords=null,hardIds=[],previousLevel=profile.level,reviewId=null}){
 view='result';
 const amount=new Set(ids||[]).size;
 const meaningful=successful!==null&&Number.isFinite(successful);
 const rate=meaningful&&amount?Math.round(100*successful/amount):null;
 const hard=[...new Set(hardIds)].filter(id=>byId[id]);
 const isPractice=mode==='practice',isNew=mode==='new';
 const title=isPractice?'Тренировка завершена':'Занятие завершено';
 const headline=isPractice?'Ты потренировал трудные слова.':isNew?'Новые слова изучены.':'Обязательное повторение завершено.';
 const label=isPractice?'Потренировано':isNew?'Изучено слов':'Повторено слов';
 const checkLabel=isNew?'Вспомнил в обе стороны на 3-м прогоне':'Вспомнил в обе стороны на 1-м прогоне';
 const hero='<section class="ws-result-hero"><div class="ws-result-hero-head"><div class="ws-result-total"><span>'+label+'</span><strong>'+amount+'</strong></div>'+
  (meaningful?'<div class="ws-result-total"><span>Успешно в обе стороны</span><strong>'+successful+'</strong></div>':'<div class="ws-result-total"><span>Остались трудными</span><strong>'+hard.length+'</strong></div>')+'</div>'+
  (rate!==null?'<div class="ws-result-quality"><div><span>Успешность контрольного прогона</span><strong>'+rate+'%</strong></div>'+
   '<div class="ws-result-quality-track" role="progressbar" aria-label="Успешность контрольного прогона" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rate+'"><span style="width:'+rate+'%"></span></div>'+
   '<p>'+successful+' из '+amount+' слов · '+(isNew?'3-й обязательный прогон':'1-й обязательный прогон')+'</p></div>':'')+
  '</section>';
 const details=isPractice?'<section class="ws-result-metrics"><div><span>В ходе тренировки</span><strong>Дополнительная практика</strong></div><div><span>Остались трудными</span><strong>'+hard.length+'</strong></div></section>':
  '<section class="ws-result-metrics"><div><span>Потребовались дополнительные прогоны</span><strong>'+extraWords+'</strong></div>'+
  '<div><span>Остались трудными после занятия</span><strong>'+hard.length+'</strong></div></section>';
 const next=isPractice?'Результат добровольной тренировки не изменяет прогресс, расписание, закрепление слов и уровень.':
  isNew?'Слова добавлены в словарь. Обязательное повторение появится по расписанию.':
  hard.length?'Можешь дополнительно потренировать трудные слова. Основной результат уже сохранён.':
  E.due(profile).length?'На главной доступно обязательное повторение.':'На сегодня всё повторено. Можно вернуться к новым словам.';
 const lastReview=profile.sessions.findLast(s=>s.mode==='review');
 const practiceAvailable=mode==='review'&&hard.length>0&&lastReview?.id===reviewId&&
  E.residualErrors(profile).some(id=>byId[id])&&!E.due(profile).length&&localStorage.getItem(PRACTICE)!==reviewId;
 const actions='<div class="ws-result-actions">'+btn('На главную','home','ws-result-home')+
  (practiceAvailable?btn('Потренировать трудные слова','practice','ws-result-practice'):'')+'</div>';
 shell('','', '<main class="ws-result-page"><div class="ws-result-scroll"><header class="ws-result-heading"><span class="ws-result-check" aria-hidden="true">✓</span>'+
  '<h1>'+title+'</h1><p>'+headline+'</p></header>'+hero+details+
  (isPractice?'<section class="ws-result-level"><h2>Тренировка без изменения прогресса</h2><p>Постоянная статистика, уровень и расписание остались прежними.</p></section>':resultLevel(previousLevel))+
  '<section class="ws-result-next"><h2>Что дальше?</h2><p>'+next+'</p></section>'+
  resultWordList(hard)+'</div>'+actions+'</main>');
}
function finishPractice(){
 const finished=session.stage==='complete',snapshot=session;
 session=null;
 if(!store())return home();
 if(!finished)return home();
 const lastReview=profile.sessions.findLast(s=>s.mode==='review');
 if(lastReview){try{localStorage.setItem(PRACTICE,lastReview.id)}catch(err){notice('Не удалось сохранить отметку добровольной тренировки')}}
 return resultScreen({mode:'practice',ids:snapshot.ids,hardIds:snapshot.roundHard||[]});
}
function completed(){
 if(session.mode==='practice')return finishPractice();
 try{
  const previousLevel=profile.level,previousProfile=profile,previousSession=session;
  const result=E.completed(profile,session,Date.now());
  profile=result;session=null;
  if(!store()){profile=previousProfile;session=previousSession;return home()}
  const entry=profile.sessions.at(-1);
  return resultScreen({mode:entry.mode,ids:entry.ids,successful:entry.successful,
   extraWords:entry.extraWords,hardIds:entry.mode==='review'?(entry.hardIds||[]):(previousSession.roundHard||[]),
   previousLevel,reviewId:entry.mode==='review'?entry.id:null});
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
 const rate=attempts?Math.max(0,Math.min(100,Math.round(100*hits/attempts))):null;
 const quality=attempts?'<div class="ws-progress-quality" aria-label="Успешность повторений"><strong class="quality-value">'+rate+'%</strong><p><b>'+hits+' из '+attempts+'</b> слов успешно вспомнены в обе стороны на первом прогоне</p></div>'+
  '<div class="ws-progress-quality-track" role="progressbar" aria-label="Успешность повторений" aria-valuenow="'+rate+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+rate+'%"></span></div>':
  '<div class="ws-progress-empty"><strong>Пока нет проверок за этот период</strong><p>Показатель появится после обязательного повторения.</p></div>';
 const metrics='<section class="panel ws-progress-panel ws-progress-summary"><h2>Мой словарь</h2><div class="progress-total"><small>Знакомых слов</small><strong>'+(learned+known)+' из <span>'+total+'</span></strong></div>'+
  '<div class="progress-breakdown"><span>Выучил в WordScene <strong>'+learned+'</strong></span><span>Уже знал <strong>'+known+'</strong></span><span>Из них закреплено <strong>'+mastered+'</strong></span></div></section>';
 const rangeButtons=btn('30 дней','progressRange:30',(progressRange==='30'?'primary':'secondary')+(progressRange==='30'?' is-active':''))+btn('Всё время','progressRange:all',(progressRange==='all'?'primary':'secondary')+(progressRange==='all'?' is-active':''));
 const qualityButtons=btn('28 дней','qualityRange:28',(qualityRange==='28'?'primary':'secondary')+(qualityRange==='28'?' is-active':''))+btn('Всё время','qualityRange:all',(qualityRange==='all'?'primary':'secondary')+(qualityRange==='all'?' is-active':''));
 const explanation='<details class="ws-progress-explanation"><summary>Как рассчитывается успешность?</summary><p>Учитываются завершённые обязательные повторения. Слово успешно, если в первом полном прогоне ты вспомнил его в обе стороны. Дополнительные попытки исходную оценку не меняют.</p></details>';
 shell('', '', '<main class="ws-progress-page"><div class="ws-progress-header">'+btn(pickerIcon('back'),'home','ws-progress-back')+'<div><h1>Мой прогресс</h1><p>Как продвигается обучение</p></div></div>'+metrics+
  '<section class="panel ws-progress-panel"><h2>Сколько слов я выучил</h2><div class="progress-switch">'+rangeButtons+'</div>'+
  (lessons.length?chart:'<div class="ws-progress-empty"><strong>Пока нет данных</strong><p>После первого завершённого занятия здесь появится график изучения слов.</p></div>')+
  '<p class="ws-progress-note">Накопленное количество слов, изученных в WordScene. Ранее знакомые слова не учитываются.</p></section>'+
  '<section class="panel ws-progress-panel"><h2>Как хорошо я помню слова</h2><div class="progress-switch">'+qualityButtons+'</div>'+quality+explanation+'</section>'+
  btn('На главную','home','ws-progress-home')+'</main>');
}
const dictionaryStatuses={
 new:{label:'Не изучено',filter:'new'},
 known:{label:'Уже знакомо',filter:'known'},
 learning:{label:'Закрепляется',filter:'learning'},
 mastered:{label:'Закреплено',filter:'mastered'}
};
function dictionaryMatches(w){
 const q=query.trim().toLocaleLowerCase('ru');
 return (!q||(w.en+' '+w.ru).toLocaleLowerCase('ru').includes(q))&&
  (dictionaryFilter==='all'||E.status(profile.words[w.en])===dictionaryFilter);
}
function dictionaryRow(w){
 const status=E.status(profile.words[w.en]);
 return '<button type="button" class="ws-dict-row" data-action="word:'+h(w.en)+'">'+
  '<span class="ws-dict-row-copy"><strong>'+h(w.en)+'</strong><small>'+h(w.ru)+'</small></span>'+
  '<span class="ws-dict-status ws-dict-status-'+status+'">'+dictionaryStatuses[status].label+'</span>'+
  '<span class="ws-dict-row-arrow" aria-hidden="true">›</span></button>';
}
function refreshDictionaryResults(){
 const list=dictionary.filter(dictionaryMatches);
 const container=root.querySelector?.('#ws-dict-results');
 const counter=root.querySelector?.('#ws-dict-count');
 if(counter)counter.textContent=list.length+' из '+dictionary.length+' слов';
 if(!container)return;
 container.innerHTML=list.length?list.map(dictionaryRow).join(''):
  '<div class="ws-dict-empty"><strong>Ничего не найдено</strong><p>Попробуй другой запрос или выбери фильтр «Все».</p></div>';
 container.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>dispatch(el.dataset.action,el)));
}
function dictionaryView(){
 view='dictionary';
 const filters=[['all','Все'],['learning','Закрепляются'],['mastered','Закреплены'],['known','Уже знакомы'],['new','Не изучены']];
 const chips=filters.map(([id,label])=>'<button type="button" data-action="dictionaryFilter:'+id+'" class="ws-dict-filter'+(dictionaryFilter===id?' is-active':'')+'" aria-pressed="'+(dictionaryFilter===id)+'">'+label+'</button>').join('');
 shell('','', '<main class="ws-dict-page"><div class="ws-dict-header">'+btn(pickerIcon('back'),'home','ws-dict-back')+
  '<div><h1>Словарь</h1><p>Все слова WordScene</p></div></div>'+
  '<div class="ws-dict-search"><label for="ws-dict-input">Поиск по слову или переводу</label><input id="ws-dict-input" type="search" autocomplete="off" spellcheck="false" value="'+h(query)+'" placeholder="Например, apple или яблоко"></div>'+
  '<div class="ws-dict-filters" role="group" aria-label="Фильтр по статусу">'+chips+'</div>'+
  '<section class="ws-dict-list-card" aria-label="Список слов"><div class="ws-dict-list-head"><h2>Слова</h2><span id="ws-dict-count">'+dictionary.filter(dictionaryMatches).length+' из '+dictionary.length+' слов</span></div><div id="ws-dict-results" class="ws-dict-results">'+(dictionary.filter(dictionaryMatches).length?dictionary.filter(dictionaryMatches).map(dictionaryRow).join(''):'<div class="ws-dict-empty"><strong>Ничего не найдено</strong><p>Попробуй другой запрос или выбери фильтр «Все».</p></div>')+'</div></section>'+
  '<p class="ws-dict-footnote">Просмотр слов не изменяет прогресс обучения.</p></main>');
 const input=root.querySelector?.('#ws-dict-input');
 input?.addEventListener('input',()=>{query=input.value;refreshDictionaryResults()});
 refreshDictionaryResults();
}
function wordDetail(id){
 const w=byId[id];if(!w)return dictionaryView();
 view='word';
 const state=E.status(profile.words[id]);
 const status=dictionaryStatuses[state].label;
 shell('','', '<main class="ws-dict-page ws-dict-detail"><div class="ws-dict-header">'+btn(pickerIcon('back'),'dictionary','ws-dict-back')+
  '<div><h1>Карточка слова</h1><p>Словарь WordScene</p></div></div>'+
  '<section class="ws-dict-detail-card"><div class="ws-dict-word">'+
  '<span class="ws-dict-status ws-dict-status-'+state+'">'+status+'</span>'+
  '<div class="ws-dict-word-heading"><h2>'+h(w.en)+'</h2>'+btn(pickerIcon('volume'),'say:'+h(w.en),'ws-dict-audio')+'</div>'+
  '<p class="ws-dict-ipa">'+h(w.ipa||'')+'</p><div class="ws-dict-translation">'+h(w.ru)+'</div></div>'+
  '<div class="ws-dict-art">'+visual(w)+'</div>'+
  '<div class="ws-dict-association"><h3>Ассоциация для запоминания</h3><p>'+h(w.scene||'Для этого слова нет текстовой ассоциации.')+'</p></div>'+
  '</section>'+btn('Вернуться в словарь','dictionary','ws-dict-return')+'</main>');
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
function confirmExit(practice=false){
 if(!session)return;
 const old=root.querySelector('.ws-paper-exit-confirm');if(old)return;
 const title=practice?'Закончить тренировку?':'Отменить занятие?';
 const message=practice?'Результаты досрочно завершённой тренировки не сохранятся.':'Все незавершённые результаты будут потеряны.';
 const dialog=document.createElement('div');
 dialog.className='ws-paper-pause ws-paper-exit-confirm';
 dialog.innerHTML='<section class="ws-paper-pause-dialog" role="dialog" aria-modal="true" aria-labelledby="ws-paper-exit-title">'+
  '<h2 id="ws-paper-exit-title">'+title+'</h2><p>'+message+'</p>'+
  '<div class="ws-paper-pause-buttons"><button type="button" class="ws-paper-resume" data-exit="stay">'+(practice?'Продолжить тренировку':'Продолжить занятие')+'</button>'+
  '<button type="button" class="ws-paper-pause-cancel" data-exit="leave">'+(practice?'Закончить':'Отменить занятие')+'</button></div></section>';
 root.appendChild(dialog);
 const stay=dialog.querySelector('[data-exit="stay"]'),leave=dialog.querySelector('[data-exit="leave"]');
 stay.addEventListener('click',()=>{dialog.remove();root.querySelector('[data-action="'+(practice?'stopPractice':'cancel')+'"]')?.focus()});
 leave.addEventListener('click',()=>{dialog.remove();session=null;selection=null;store();home()});
 stay.focus();
}
function confirmCancel(){confirmExit(false)}
function render(){if(session){if(E.timedOut(session,Date.now()))return expire(new Error('30 минут бездействия'));if(session.stage==='complete'&&view!=='home')return completed();if(view==='learn')return learn();if(view==='recall')return recall()}if(view==='select')return selectionScreen();if(view==='manual'||view==='fill')return manualView(view==='fill');if(view==='sources')return home(true);if(view==='progress')return progress();if(view==='dictionary')return dictionaryView();return home()}
function dispatch(act,el){
 if(storageFailure&&!['home','dictionary','progress','recover','restoreBackup'].includes(act)&&!act.startsWith('word:')&&!act.startsWith('say:'))return notice('Сохранение заблокировано. Никакие данные не перезаписываются.');
 if(act.startsWith('say:'))return speak(act.slice(4));
 if(act.startsWith('dictionaryFilter:')){dictionaryFilter=act.slice(17);return dictionaryView();}
 if(act.startsWith('removeManual:')){manual.delete(act.slice(13));if(!manual.size)manualSummaryOpen=false;return manualView(view==='fill')}
 if(act==='manualSummary'){manualSummaryOpen=!manualSummaryOpen;return manualView(view==='fill')}
 if(act==='manualSummaryClose'){manualSummaryOpen=false;manualView(view==='fill');root.querySelector?.('.ws-manual-summary-toggle')?.focus?.({preventScroll:true});return}
 if(act.startsWith('manualTopic:')){const v=act.slice(12);manualThemes.clear();manualThemes.add(v);manualShowAll=false;manualView(view==='fill');const page=root.querySelector?.('.ws-manual-page'),list=root.querySelector?.('.ws-manual-list');if(page&&list)page.scrollTop=Math.max(0,list.offsetTop-page.offsetTop-8);return}
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
 case 'review':return review();case 'practice':return review('practice');case 'stopPractice':return confirmExit(true);case 'progress':return progress();case 'dictionaryOpen':query='';dictionaryFilter='all';return dictionaryView();case 'dictionary':return dictionaryView();
 case 'known':return selectionGrade(true);case 'unknown':return selectionGrade(false);case 'stopSelection':return stopSelection();
 case 'reveal':showAnswer=!showAnswer;return selectionScreen();
 case 'startManual':return startLearning([...manual],selection?.known||[]);
 case 'leaveFill':saveFamiliar(selection.known);selection=null;manual.clear();return home();
 case 'learnNext':try{E.learnNext(session);session.artHidden=false;session.paperLearnFace=false;if(!store())return home();showHelp=false;return session.stage==='learn'?learn(true):recall()}catch(err){return expire(err)}
 
 case 'yes':return sendAnswer(true);case 'no':return showFeedback(true);
 case 'check':return showFeedback(false);
 case 'hideTranslation':if(!session.feedback||session.feedback.failed)return;E.action(session);delete session.feedback;showAnswer=false;showHelp=false;confirmed=false;if(!store())return home();return recall();
 case 'recallHint':E.action(session);session.recallHint=!session.recallHint;showHelp=!!session.recallHint;if(!store())return home();return recall();
 case 'checkedYes':return sendAnswer(true,true);case 'checkedNo':return showFeedback(true);
 case 'advance':return sendAnswer(false);
 case 'help':E.action(session);showHelp=!showHelp;if(session.feedback)session.feedback.help=showHelp;else session.recallHint=showHelp;if(!store())return home();return recall();
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
