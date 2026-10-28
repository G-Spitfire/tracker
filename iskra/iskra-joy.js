/* Iskra: gentle, child-led daily interactions. Extends the existing screens, never replaces history. */
(function(){
'use strict';
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
  node.innerHTML=sprite('star_celebrate','reaction')+
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
    reaction(remaining===0?'Привычки на сегодня готовы!':'Звёздочка радуется!',
      '+1 ⭐'+(remaining===0?' · и 2 бонусные звезды!':' · Осталось '+remaining+' привычек'));
  }
};
const originalToday=today;
function welcomeCard(){
  if(S.joyIntroSeen)return '';
  return '<div class="ik-joy-welcome"><div>'+sprite('star_wave','welcome')+'<span><b>Привет! Это твоя «Искра»</b><small>Отмечай привычки, собирай звёзды и выбирай то, что тебе подходит. Всё получится!</small></span></div><button type="button" data-action="ikJoyIntroDone">Понятно!</button></div>';
}
ACTIONS.ikJoyIntroDone=()=>{S.joyIntroSeen=true;save();render()};
today=function(){
  ensure();
  let markup=originalToday();
  return markup.replace('<div class="ik-task-list">',welcomeCard()+'<div class="ik-task-list">');
};
function weekReflection(){
  const d=todayKey(),weekday=new Date(d+'T12:00:00').getDay();
  if(weekday!==0&&weekday!==6)return '';
  const key=weekStart(d),already=S.joyWeekNotes[key],dates=wk();
  const done=dates.reduce((n,k)=>n+dn(k).length,0),starTotal=dates.reduce((n,k)=>n+st(k),0);
  return '<div class="ik-joy-reflection">'+sprite('achievement_streak','reflection')+
    '<div><b>Как прошла твоя неделя?</b><small>'+done+' привычек · '+starTotal+' ⭐. Даже маленькие шаги — это здорово.</small></div>'+
    (already?'<p>Ты выбрала: '+quote(already)+'. Спасибо, что поделилась!</p>':
    '<div class="ik-joy-reflect-options">'+['Я горжусь собой','Было непросто','Хочу попробовать ещё'].map((t,i)=>
      '<button type="button" data-action="ikJoyReflect" data-id="'+i+'">'+quote(t)+'</button>').join('')+'</div>')+
    '</div>';
}
const oldReward=reward;
reward=function(){
  ensure();
  let html=oldReward();
  // Keep the weekly reflection after the reward strip; historical choice data remains available.
  html=html.replace('<div class="ik-row-between" id="ik-achievements">',weekReflection()+
    '<div class="ik-row-between" id="ik-achievements">');
  return html;
};
ACTIONS.ikJoyReflect=index=>{
  const texts=['Я горжусь собой','Было непросто','Хочу попробовать ещё'],val=texts[Number(index)];
  if(!val)return;
  S.joyWeekNotes[weekStart(todayKey())]=val;save();render();
};
function collection(){
  const count=Object.keys(S.d||{}).reduce((a,d)=>a+dn(d).length,0)+(Object.values(S.joyDone||{}).filter(Boolean).length);
  const items=[{n:1,icon:'achievement_first',title:'Первый шаг'},
    {n:10,icon:'achievement_helper',title:'Первые 10 привычек'},
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
// Keep the personal-style shortcut available in the child's profile settings.
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
// Historical prize choices remain in backups, but the UI no longer offers real-world prizes.
window.addEventListener('pageshow',()=>{ensure()});
render();
})();
