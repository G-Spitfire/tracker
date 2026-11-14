import {icon as uiIcon} from './icons.js';
import {readAppearance,saveAppearance,applyAppearance} from './appearance.js';
import {localKey,totalForDate,splitSession,legacyConvert} from './core.js';
import {all,get,put,remove,fillInitialHistory} from './db.js';
const $=id=>document.getElementById(id);
const uid=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random();
const START='2026-11-14',NIGHT='2026-11-24',MAX=120;
let sessions=[],nights=[],active=null,selected=localKey(Date.now()),view=new Date(),busy=false,graphWeek=null;view.setDate(1);
const day=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(k,n)=>{const d=day(k);d.setDate(d.getDate()+n);return localKey(d.getTime())};
const goalFor=k=>({'2026-11-11':10,'2026-11-12':20,'2026-11-13':20}[k]??(k<START?null:Math.min(MAX,30+10*Math.round((day(k)-day(START))/86400000))));
const nightFor=k=>nights.find(n=>n.date===k)?.status||'';
const seconds=k=>totalForDate(sessions,k,Date.now(),active);
const fmt=s=>{s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=String(Math.floor(s%3600/60)).padStart(2,'0'),sec=String(s%60).padStart(2,'0');return h?h+':'+m+':'+sec:m+':'+sec};
const toast=s=>{const t=$('toast');t.textContent=s;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,3000)};
async function refresh(){sessions=await all('sessions');nights=await all('nights');const a=await get('meta','active');active=a?.start?{start:a.start}:null;render();}
async function init(){if(!(await get('meta','migration'))){let old=null;try{old=JSON.parse(localStorage.getItem('moya-kapa-v1')||'null')}catch{}const converted=legacyConvert(old);for(const s of converted.sessions)await put('sessions',s);for(const n of converted.nights)await put('nights',n);if(converted.active)await put('meta',{key:'active',start:converted.active.start});await put('meta',{key:'migration',done:true});}await fillInitialHistory();await refresh();}
function render(){const today=localKey(Date.now()),total=seconds(today),g=goalFor(today),pct=g?Math.min(100,total/(g*60)*100):0;$('todayTime').textContent=fmt(total);$('goalLabel').textContent=g?'из '+g+' минут':'Первые шаги';$('progress').style.setProperty('--progress',pct+'%');$('progress').setAttribute('aria-valuenow',String(Math.round(pct)));$('remaining').textContent=g?(total>=g*60?'Цель достигнута!': 'Осталось '+Math.ceil((g*60-total)/60)+' мин'):'Продолжай в своём темпе';$('toggle').innerHTML=uiIcon(active?'square':'play')+'<span>'+(active?'Сняла капу':'Надела капу')+'</span>';$('toggle').classList.toggle('running',!!active);$('timerHint').textContent=active?'Таймер работает — можно закрыть приложение':'Можно носить несколько раз в день';$('sessionTotal').textContent=Math.floor(total/60)+' мин';const list=$('todaySessions');list.replaceChildren();const parts=[];for(const s of sessions){if(s.type==='manual'&&s.date===today)parts.push({start:'Добавлено ранее',seconds:s.seconds});else if(s.type==='timer')for(const p of splitSession(s.start,s.end))if(p.date===today)parts.push({start:new Date(s.start).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),seconds:p.seconds});}if(active){const ps=splitSession(active.start,Date.now()).find(p=>p.date===today);if(ps)parts.push({start:'Сейчас',seconds:ps.seconds});}parts.forEach((p,i)=>{const el=document.createElement('div');el.className='session';el.textContent=(i+1)+'. '+p.start+' · '+Math.floor(p.seconds/60)+' мин';list.append(el)});if(!parts.length)list.textContent='Пока нет сеансов';$('nightCard').hidden=today<=NIGHT;const last=addDays(today,-1),marked=['all','part'].includes(nightFor(last));$('nightCheck').classList.toggle('checked',marked);$('nightCheck').setAttribute('aria-pressed',String(marked));$('nightCheck').setAttribute('aria-label','Ночь '+day(last).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+': '+(marked?'носила':'не отмечено'));renderCalendar();renderAwards();if(!$('page-graph').hidden)renderGraph();}
function renderCalendar(){const y=view.getFullYear(),m=view.getMonth();$('monthTitle').textContent=view.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});let html='';for(const n of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])html+='<div class="weekday">'+n+'</div>';for(let i=0;i<(new Date(y,m,1).getDay()+6)%7;i++)html+='<div></div>';for(let i=1;i<=new Date(y,m+1,0).getDate();i++){const k=localKey(new Date(y,m,i)),mins=Math.floor(seconds(k)/60),g=goalFor(k),cl=g&&mins>=g?'done':mins?'partial':'';html+='<button class="calday '+cl+' '+(selected===k?'selected':'')+'" data-date="'+k+'" type="button">'+i+'<small>'+(nightFor(k)?uiIcon('moon'):mins?mins+'м':' ')+'</small></button>';}$('calendar').innerHTML=html;const mns=Math.floor(seconds(selected)/60),n=nightFor(selected);$('selectedSummary').textContent=day(selected).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+' · '+mns+' мин'+(n?' · ночь: '+(n==='none'?'не носила':'носила'):'');}
function renderAwards(){const today=localKey(Date.now());let any=0,goals=0,night=0;for(let i=0;i<365;i++){const k=addDays(today,-i),g=goalFor(k),s=seconds(k);if(s>0)any++;if(g&&s>=g*60)goals++;if(['all','part'].includes(nightFor(k)))night++;}const data=[['sprout','Первый шаг','Первый день',any>=1],['star','Три дня','3 дня ношения',any>=3],['star','Семь дней','7 дней ношения',any>=7],['trophy','На пути к цели','5 выполненных целей',goals>=5],['moon','Ночная звезда','5 ночей с капой',night>=5],['heart','Большая цель','120 минут за день',sessions.some(s=>s.type==='manual'&&s.seconds>=7200)||Array.from({length:365},(_,i)=>addDays(today,-i)).some(k=>seconds(k)>=7200)]];$('awards').replaceChildren();for(const [symbol,title,desc,ok] of data){const el=document.createElement('div');el.className='award '+(ok?'':'locked');const icon=document.createElement('div');icon.className='award-icon';icon.innerHTML=uiIcon(symbol);const name=document.createElement('strong');name.textContent=title;const sub=document.createElement('small');sub.textContent=ok?'Получено · '+desc:desc;el.append(icon,name,sub);$('awards').append(el);}}
async function toggle(){if(busy)return;busy=true;try{if(active){const now=Date.now(),elapsed=now-active.start;if(elapsed<0){toast('Проверьте время устройства');return}if(elapsed>12*3600000&&!confirm('Таймер работал более 12 часов. Сохранить?'))return;await put('sessions',{id:uid(),type:'timer',start:active.start,end:now});await put('meta',{key:'active',start:null});toast('Время сохранено');}else{await put('meta',{key:'active',start:Date.now()});toast('Таймер запущен')}await refresh()}catch(e){toast('Ошибка сохранения: '+e.message)}finally{busy=false}}
async function toggleNight(){if(busy)return;const k=addDays(localKey(Date.now()),-1);if(k<NIGHT)return;busy=true;try{if(['all','part'].includes(nightFor(k)))await remove('nights',k);else await put('nights',{date:k,status:'all'});await refresh();toast('Ночная отметка сохранена')}catch(e){toast('Не удалось сохранить ночь')}finally{busy=false}}
function navigate(name){if(name==='graph'&&graphWeek===null)graphWeek=graphWeekFor(localKey(Date.now()));document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!=='page-'+name);render();window.scrollTo(0,0)}

const GRAPH_START='2026-11-11';
const graphWeekFor=k=>Math.max(0,Math.floor((day(k)-day(GRAPH_START))/86400000/7));
function renderGraph(){
 const today=localKey(Date.now());
 if(graphWeek===null)graphWeek=graphWeekFor(today);
 const maxWeek=graphWeekFor(today)+1;
 graphWeek=Math.max(0,Math.min(maxWeek,graphWeek));
 const entries=Array.from({length:7},(_,i)=>{const index=graphWeek*7+i,key=addDays(GRAPH_START,index);return {index,key,plan:goalFor(key)||0,fact:key<=today?seconds(key)/60:0,night:key>=NIGHT?nightFor(key):''};});
 const top=Math.max(120,Math.ceil(Math.max(...entries.map(e=>e.fact),120)/30)*30);
 const x0=34,x1=350,bottom=187,plotH=164,step=(x1-x0)/7,bar=24;
 const y=v=>bottom-Math.min(top,v)/top*plotH;
 let svg='<svg viewBox="0 0 354 251" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
 for(let v=0;v<=top;v+=30){const yy=y(v);svg+='<line x1="31" x2="351" y1="'+yy+'" y2="'+yy+'" class="graph-grid"/><text x="26" y="'+(yy+4)+'" text-anchor="end" class="graph-axis">'+v+'</text>';}
 svg+='<text x="3" y="12" class="graph-axis">мин</text>';
 entries.forEach((e,i)=>{
  const x=x0+i*step+step/2,px=x-bar/2,isToday=e.key===today;
  if(isToday)svg+='<rect x="'+(x-step/2+2)+'" y="13" width="'+(step-4)+'" height="234" rx="7" class="graph-today"/>';
  if(e.plan)svg+='<rect x="'+px+'" y="'+y(e.plan)+'" width="'+bar+'" height="'+(bottom-y(e.plan))+'" rx="3" class="graph-plan"/>';
  if(e.fact>0)svg+='<rect x="'+px+'" y="'+y(e.fact)+'" width="'+bar+'" height="'+(bottom-y(e.fact))+'" rx="3" class="graph-fact"/>';
  svg+='<text x="'+x+'" y="205" text-anchor="middle" class="graph-day'+(isToday?' graph-current':'')+'">'+(e.index+1)+'</text>';
  const d=day(e.key),date=String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');
  svg+='<text x="'+x+'" y="219" text-anchor="middle" class="graph-date">'+date+'</text>';
  if(e.night==='all'||e.night==='part')svg+='<text x="'+x+'" y="238" text-anchor="middle" class="graph-night-yes">☾✓</text>';
  else if(e.night==='none')svg+='<text x="'+x+'" y="238" text-anchor="middle" class="graph-night-no">☾×</text>';
 });
 svg+='</svg>';
 $('wearGraph').innerHTML=svg;
 $('wearGraph').setAttribute('aria-label','Дни '+(entries[0].index+1)+'–'+(entries[6].index+1)+'. '+entries.map(e=>'День '+(e.index+1)+': план '+e.plan+', факт '+Math.floor(e.fact)+' минут'+(e.night?', ночь '+(e.night==='none'?'не носила':'носила'):'')).join('; '));
 $('graphRange').textContent='Дни '+(entries[0].index+1)+'–'+(entries[6].index+1);
 $('graphPrev').disabled=graphWeek===0;
 $('graphNext').disabled=graphWeek>=maxWeek;
}
function shiftGraph(delta){graphWeek=Math.max(0,Math.min(graphWeekFor(localKey(Date.now()))+1,(graphWeek??graphWeekFor(localKey(Date.now())))+delta));renderGraph();}

$('toggle').onclick=toggle;$('historyLink').onclick=()=>navigate('history');$('openHistory').onclick=()=>navigate('graph');$('openAwards').onclick=()=>navigate('awards');document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>navigate('today'));$('nightCheck').onclick=toggleNight;$('prevMonth').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);renderCalendar()};$('nextMonth').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);renderCalendar()};$('calendar').onclick=e=>{const b=e.target.closest('[data-date]');if(b){selected=b.dataset.date;renderCalendar()}};document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});setInterval(()=>{if(!document.hidden)render()},1000);init().catch(e=>{toast('Не удалось открыть хранилище');console.error(e)});if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn);

// Check for updates on launch and whenever the app returns to the foreground.
if('serviceWorker' in navigator){const check=()=>navigator.serviceWorker.getRegistration('./').then(reg=>reg?.update()).catch(()=>{});window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});let reloaded=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloaded){reloaded=true;window.location.reload()}});}

// Appearance is independent of IndexedDB and never resets tracking data.
let appearance=readAppearance();
const panel=$('appearancePanel'),appearanceToggle=$('appearanceToggle');
function syncAppearance(){applyAppearance(appearance);panel.querySelectorAll('[data-palette]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===appearance.palette)));panel.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===appearance.theme)));}
function closeAppearance(){panel.hidden=true;appearanceToggle.setAttribute('aria-expanded','false');}
appearanceToggle.onclick=()=>{panel.hidden=!panel.hidden;appearanceToggle.setAttribute('aria-expanded',String(!panel.hidden));};
panel.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.palette)appearance.palette=b.dataset.palette;if(b.dataset.theme)appearance.theme=b.dataset.theme;saveAppearance(appearance);syncAppearance();};
document.addEventListener('click',e=>{if(!panel.contains(e.target)&&!appearanceToggle.contains(e.target))closeAppearance()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){closeAppearance();appearanceToggle.focus()}});
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=uiIcon(el.dataset.icon));
$('graphPrev').onclick=()=>shiftGraph(-1);
$('graphNext').onclick=()=>shiftGraph(1);
let swipeX=null;
$('wearGraph').addEventListener('touchstart',e=>{swipeX=e.touches[0]?.clientX??null},{passive:true});
$('wearGraph').addEventListener('touchend',e=>{if(swipeX===null)return;const dx=(e.changedTouches[0]?.clientX??swipeX)-swipeX;swipeX=null;if(Math.abs(dx)>45)shiftGraph(dx<0?1:-1)},{passive:true});
syncAppearance();
