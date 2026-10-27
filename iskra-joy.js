/* Iskra: gentle, child-led daily interactions. Extends the existing screens, never replaces history. */
(function(){
'use strict';
const activities={
  draw:{title:'Порисовать',caption:'Что-нибудь красивое или смешное',icon:'achievement_first'},
  walk:{title:'Прогуляться',caption:'Побыть немного на свежем воздухе',icon:'task_walk'},
  story:{title:'Придумать историю',caption:'Про звёздочку или кого захочешь',icon:'task_book'}
};
const themes={pink:'Розовые облака',lavender:'Сиреневое небо',mint:'Мятный сад'};
const sprite=(name,kind='')=>'<span aria-hidden="true" class="ik-art ik-art-'+name+(kind?' ik-art--'+kind:'')+'"></span>';
const quote=v=>esc(v==null?'':String(v));
const todayKey=()=>iso(new Date());
function ensure(){
  if(!S.joyChoices||typeof S.joyChoices!=='object'||Array.isArray(S.joyChoices))S.joyChoices={};
  if(!S.joyDone||typeof S.joyDone!=='object'||Array.isArray(S.joyDone))S.joyDone={};
  if(!S.joyWeekNotes||typeof S.joyWeekNotes!=='object'||Array.isArray(S.joyWeekNotes))S.joyWeekNotes={};
  if(!Array.isArray(S.rewardChoices))S.rewardChoices=[];
  if(!themes[S.joyTheme])S.joyTheme='pink';
  document.body.dataset.ikTheme=S.joyTheme;
}
ensure();
function reaction(message,extra){
  document.querySelector('.ik-joy-pop')?.remove();
  const node=document.createElement('div');
  node.className='ik-joy-pop';
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  node.innerHTML='<img src="./assets/iskra/hero-star.webp" alt="" width="58" height="58" decoding="async">'+
    '<span class="ik-joy-pop-copy"><b>'+quote(message)+'</b><small>'+quote(extra)+'</small></span>'+
    '<button type="button" data-action="ikJoyDismiss" aria-label="Закрыть">×</button>';
  document.body.append(node);
  window.setTimeout(()=>{if(node.isConnected)node.remove()},3100);
}
ACTIONS.ikJoyDismiss=()=>document.querySelector('.ik-joy-pop')?.remove();
// One feedback path covers checkboxes AND detailed homework/chores dialogs.
const oldSetDone=setDone;
setDone=function(id,on,silent,date){
  const d=date||todayKey(),was=dn(d).includes(id);
  const celebrate=!silent&&on&&!was&&d===todayKey()&&tasks(d).some(t=>t.i===id);
  oldSetDone(id,on,silent||celebrate,date);
  if(celebrate&&dn(d).includes(id)){
    const remaining=tasks(d).length-dn(d).length;
    reaction(remaining===0?'Все дела сделаны!':'Звёздочка радуется!',
      '+1 ⭐'+(remaining===0?' · и 2 бонусные звезды!':' · Осталось '+remaining+' дел'));
  }
};
const originalToday=today;
function nextCard(){
  const d=todayKey(),toDo=tasks(d).filter(t=>!dn(d).includes(t.i));
  if(!toDo.length){
    return '<div class="ik-joy-next ik-joy-finished">'+sprite('achievement_master','next')+
      '<span><b>Ты справилась со всеми делами!</b><small>Отдохни и порадуйся своим успехам.</small></span>'+
      '<button type="button" class="ik-joy-next-cta" data-action="ikToReward">Звёзды</button></div>';
  }
  const one=toDo[0];
  const icons={ex:'task_walk',bg:'nav_today',cl:'task_clothes',hw:'task_read',en:'task_english',ho:'task_clean',rd:'task_book'};
  return '<div class="ik-joy-next"><span class="ik-joy-next-icon">'+sprite(icons[one.i]||'task_star','next')+'</span>'+
    '<span class="ik-joy-next-copy"><small>Можно начать с этого · осталось '+toDo.length+'</small><b>'+quote(one.t)+'</b></span>'+
    '<button type="button" class="ik-joy-next-cta" data-action="ikJoyNext" data-id="'+quote(one.i)+'">Открыть</button></div>';
}
function welcomeCard(){
  if(S.joyIntroSeen)return '';
  return '<div class="ik-joy-welcome"><div>'+sprite('star_wave','welcome')+'<span><b>Привет! Это твоя «Искра»</b><small>Отмечай дела, собирай звёзды и иногда выбирай занятие сама. Всё получится!</small></span></div><button type="button" data-action="ikJoyIntroDone">Понятно!</button></div>';
}
ACTIONS.ikJoyIntroDone=()=>{S.joyIntroSeen=true;save();render()};
function choiceCard(){
  const d=todayKey(),choice=S.joyChoices[d],done=!!S.joyDone[d];
  const lead='<div class="ik-joy-choice-head">'+sprite('sparkles','mini')+'<span><b>Моё дело по выбору</b>'+
    '<small>Необязательно. За выполнение — ещё 1 ⭐</small></span></div>';
  if(!choice||!activities[choice]){
    return '<div class="ik-joy-choice">'+lead+'<div class="ik-joy-options">'+Object.entries(activities).map(([id,a])=>
      '<button type="button" data-action="ikJoyPick" data-id="'+id+'">'+sprite(a.icon,'choice')+'<span>'+quote(a.title)+'</span></button>').join('')+'</div></div>';
  }
  const a=activities[choice];
  return '<div class="ik-joy-choice">'+lead+'<div class="ik-joy-selected">'+sprite(a.icon,'choice')+
    '<span><b>'+quote(a.title)+'</b><small>'+quote(a.caption)+'</small></span>'+
    '<button type="button" class="'+(done?'ik-joy-selected-done':'')+'" data-action="ikJoyComplete">'+(done?'✓ Готово':'Сделано!')+'</button></div>'+
    (!done?'<button class="ik-joy-change" data-action="ikJoyChange">Выбрать другое</button>':'<p class="ik-joy-thanks">+1 ⭐ уже в твоей копилке. Здорово!</p>')+
    '</div>';
}
today=function(){
  ensure();
  let markup=originalToday();
  // The main list remains available, but completed tasks are tucked away.
  if(filterIsAll(markup)){
    const finished=[];
    markup=markup.replace(/<div class="ik-task done"[\s\S]*?<\/div>/g,x=>{finished.push(x);return ''});
    if(finished.length){
      const anchor='<p class="ik-muted" style="text-align:center">';
      const completed='<details class="ik-joy-completed"><summary>Уже сделано · '+finished.length+' <span aria-hidden="true">⌄</span></summary>'+
        '<div class="ik-task-list">'+finished.join('')+'</div></details>';
      markup=markup.replace(anchor,completed+anchor);
    }
  }
  markup=markup.replace('<div class="ik-filter-row">',welcomeCard()+nextCard()+'<div class="ik-filter-row">');
  const beforeFooter='<p class="ik-muted" style="text-align:center">';
  return markup.replace(beforeFooter,choiceCard()+beforeFooter);
};
function filterIsAll(markup){return markup.includes('data-id="all"')&&markup.includes('ik-filter active" data-action="ikFilter" data-id="all"')}
ACTIONS.ikJoyNext=id=>{
  if(!tasks(todayKey()).some(t=>t.i===id))return;
  (id==='hw'||id==='ho'?ACTIONS.details:ACTIONS.ikTaskInfo)(id);
};
ACTIONS.ikJoyPick=id=>{
  ensure();
  if(!activities[id]||S.joyDone[todayKey()])return;
  S.joyChoices[todayKey()]=id;save();render();
};
ACTIONS.ikJoyChange=()=>{
  if(S.joyDone[todayKey()])return;
  delete S.joyChoices[todayKey()];save();render();
};
ACTIONS.ikJoyComplete=()=>{
  ensure();
  const d=todayKey();if(!activities[S.joyChoices[d]])return;
  S.joyDone[d]=!S.joyDone[d];save();render();
  if(S.joyDone[d])reaction('Ты сама выбрала — и сделала!','+1 ⭐ за своё дело');
};
function approvedPrizes(){
  const arr=S.rewardChoices.filter(x=>typeof x==='string'&&x.trim()).slice(0,3);
  return [...new Set(arr)];
}
function rewardPicker(){
  const names=approvedPrizes();
  if(names.length<2)return '';
  const key=weekStart(todayKey()),plan=weekPlan(key),received=S.rewardHistory?.[key]?.status==='received';
  return '<div class="ik-joy-prizes"><div class="ik-joy-choice-head">'+sprite('prize_gift','mini')+
    '<span><b>Какую награду выбираешь?</b><small>Варианты придуманы вместе с родителями</small></span></div>'+
    '<div class="ik-joy-prize-options">'+names.map((name,i)=>
      '<button type="button" '+(received?'disabled ':'')+'class="'+(plan.name===name?'active':'')+
      '" data-action="ikJoyPrize" data-id="'+i+'">'+quote(name)+(plan.name===name?' ✓':'')+'</button>').join('')+
    '</div>'+(received?'<small>Награда уже получена — выбор сохранён.</small>':'')+'</div>';
}
function weekReflection(){
  const d=todayKey(),weekday=new Date(d+'T12:00:00').getDay();
  if(weekday!==0&&weekday!==6)return '';
  const key=weekStart(d),already=S.joyWeekNotes[key],dates=wk();
  const done=dates.reduce((n,k)=>n+dn(k).length,0),starTotal=dates.reduce((n,k)=>n+st(k),0);
  return '<div class="ik-joy-reflection">'+sprite('achievement_streak','reflection')+
    '<div><b>Как прошла твоя неделя?</b><small>'+done+' дел · '+starTotal+' ⭐. Даже маленькие шаги — это здорово.</small></div>'+
    (already?'<p>Ты выбрала: '+quote(already)+'. Спасибо, что поделилась!</p>':
    '<div class="ik-joy-reflect-options">'+['Я горжусь собой','Было непросто','Хочу попробовать ещё'].map((t,i)=>
      '<button type="button" data-action="ikJoyReflect" data-id="'+i+'">'+quote(t)+'</button>').join('')+'</div>')+
    '</div>';
}
const oldReward=reward;
reward=function(){
  ensure();
  let html=oldReward();
  // Place the child choice after the reward's weekly strip, above level stats.
  html=html.replace('<button class="ik-action-row" data-action="ikLevels">',rewardPicker()+weekReflection()+
    '<button class="ik-action-row" data-action="ikLevels">');
  return html;
};
ACTIONS.ikJoyPrize=index=>{
  const names=approvedPrizes(),name=names[Number(index)],key=weekStart(todayKey());
  if(!name)return;
  const plan=weekPlan(key),record=S.rewardHistory?.[key];
  if(record?.status==='received')return;
  plan.name=name;
  if(record?.status==='earned')record.name=name;
  save();render();reaction('Ты выбрала награду!','Можно идти к своей цели.');
};
ACTIONS.ikJoyReflect=index=>{
  const texts=['Я горжусь собой','Было непросто','Хочу попробовать ещё'],val=texts[Number(index)];
  if(!val)return;
  S.joyWeekNotes[weekStart(todayKey())]=val;save();render();
};
function collection(){
  const count=Object.keys(S.d||{}).reduce((a,d)=>a+dn(d).length,0)+(Object.values(S.joyDone||{}).filter(Boolean).length);
  const items=[{n:1,icon:'achievement_first',title:'Первый шаг'},
    {n:10,icon:'achievement_helper',title:'Первые 10 дел'},
    {n:30,icon:'achievement_streak',title:'30 маленьких побед'}];
  return '<div class="ik-joy-collection"><div class="ik-row-between"><h2 class="ik-sec-title">Моя коллекция</h2>'+
    '<span class="ik-tab-sublabel">'+items.filter(x=>count>=x.n).length+' из '+items.length+'</span></div>'+
    '<div class="ik-joy-collection-list">'+items.map(x=>'<div class="'+(count>=x.n?'unlocked':'locked')+'">'+
      sprite(x.icon,'collection')+'<small>'+quote(x.title)+'</small></div>').join('')+'</div></div>';
}
const oldProfile=me;
me=function(){
  ensure();
  let html=oldProfile();
  const personal='<button class="ik-action-row ik-joy-style-row" data-action="ikJoyStyle"><span class="ik-action-icon">'+sprite('sparkles','action')+
    '</span><span style="flex:1"><b>Мой стиль</b><small>'+quote(themes[S.joyTheme])+'</small></span><span class="ik-chevron">›</span></button>';
  html=html.replace('<div class="ik-list">',collection()+'<div class="ik-list">'+personal);
  return html;
};
ACTIONS.ikJoyStyle=()=>{
  sheet('<h2>Мой стиль</h2><p class="mu sm">Выбери фон, который тебе нравится. Он будет встречать тебя каждый день.</p>'+
    '<div class="ik-joy-theme-options">'+Object.entries(themes).map(([id,name])=>
    '<button type="button" class="ik-joy-theme-'+id+(S.joyTheme===id?' active':'')+
    '" data-action="ikJoyTheme" data-id="'+id+'">'+sprite('sparkles','theme')+
    '<b>'+quote(name)+'</b></button>').join('')+'</div>');
};
ACTIONS.ikJoyTheme=id=>{
  if(!themes[id])return;
  S.joyTheme=id;save();ensure();ACTIONS.ikJoyStyle();render();
};
// Add a personal-style shortcut to the child's own settings, without parent PIN.
const originalPersonal=ACTIONS.ikPersonalSettings;
ACTIONS.ikPersonalSettings=()=>{
  originalPersonal();
  const body=document.querySelector('.sheet-body');
  if(body){
    const button=document.createElement('button');
    button.className='btn g';button.dataset.action='ikJoyStyle';
    button.textContent='Цвет и оформление моего уголка';
    body.append(button);
  }
};
// Parents approve tangible prize options, instead of exposing free-form child editing.
const originalParents=ACTIONS.parents;
ACTIONS.parents=async()=>{
  await originalParents();
  const panel=document.querySelector('.sh[data-sheet-key="Для родителей"] .sheet-body');
  if(!panel||panel.querySelector('#ik-joy-parent-prizes'))return;
  const names=approvedPrizes();
  const block=document.createElement('section');
  block.id='ik-joy-parent-prizes';
  block.className='ik-joy-parent-prizes';
  block.innerHTML='<h2>Награды на выбор</h2><p class="mu sm">Предложите до трёх вариантов. Полина сможет выбрать один на этой неделе. Вручение подтверждает взрослый.</p>'+
    [0,1,2].map(i=>'<label class="sheet-field">Вариант '+(i+1)+'<input maxlength="50" data-ik-reward-choice="'+i+
    '" value="'+quote(names[i]||(i===0?S.reward:''))+'" placeholder="Например, семейный поход"></label>').join('')+
    '<button type="button" class="btn g" data-action="ikJoySavePrizes">Сохранить варианты</button>';
  panel.prepend(block);
};
ACTIONS.ikJoySavePrizes=async()=>{
  if(!window.iskraParentSession?.()&&!await window.iskraParentAuthorize?.())return;
  const values=[...document.querySelectorAll('[data-ik-reward-choice]')].map(el=>el.value.trim()).filter(Boolean);
  const unique=[...new Set(values)].slice(0,3);
  if(!unique.length)return toast('Добавьте хотя бы одну награду');
  S.rewardChoices=unique;save();render();toast('Варианты наград сохранены');
};
window.addEventListener('pageshow',()=>{ensure()});
render();
})();