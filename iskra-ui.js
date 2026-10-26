/* Iskra 2.0: child-focused screens. Legacy data/IDs remain unchanged. */
(function(){
  'use strict';
  const star = '<img class="ik-star" alt="" aria-hidden="true" src="./iskra-star.svg">';
  const starSmall = '<img class="ik-star ik-star-sm" alt="" aria-hidden="true" src="./iskra-star.svg">';
  const safe = value => esc(value == null ? '' : String(value));
  const fmtDate = date => new Date(date + 'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'});
  const completed = () => Object.keys(S.d||{}).reduce((n,date) => n+dn(date).length,0);
  const earned = () => Object.keys(S.d||{}).reduce((n,date) => n+st(date),0);
  const averageSchool = () => window.schoolCloud && window.schoolCloud.summary && window.schoolCloud.summary();
  const levels = CONFIG.levels;
  const currentLevel = () => {let i=0;for(let j=0;j<levels.length;j++)if(earned()>=levels[j][0])i=j;return i};
  const perc = (n,d) => Math.max(0,Math.min(100,d?100*n/d:0));
  const timeIcon = id => ({bg:'🎒',cl:'👕',hw:'📚',en:'🔤',ho:'🧹',ex:'🤸',rd:'📖'})[id]||'✨';
  let filter='all';
  S.times=S.times && typeof S.times==='object' ? S.times : {};
  if(typeof S.interests!=='string')S.interests='';
  if(!S.ex){S.ex=iso(new Date());save();}
  const weekDates=()=>wk();
  function navTo(id){tab=id;render();window.scrollTo(0,0)}
  function statsTiles(){
    const sumGrade=averageSchool(),a=sumGrade&&sumGrade.count?sumGrade.average.toFixed(2).replace('.',','):'—';
    return '<div class="ik-time-stat">' +
      '<div class="ik-tile"><div class="ik-tile-icon">✅</div><strong>'+completed()+'</strong><small>дел сделано</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon">⭐</div><strong>'+earned()+'</strong><small>звёзд</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon">▥</div><strong>'+a+'</strong><small>средний за период</small></div></div>';
  }
  function ikToday(){
    const d=iso(new Date()), allTasks=tasks(d), done=dn(d), count=done.length, total=allTasks.length;
    const groups={school:['hw','en','bg'],personal:['cl','ho','ex','rd']};
    const visible=filter==='all'?allTasks:allTasks.filter(task=>groups[filter].includes(task.i));
    const full=total>0&&count===total;
    return '<div class="ik-page ik-today">' +
      '<div class="ik-heading-with-star"><div><h1>Привет'+(S.name?', '+safe(S.name):'')+'!</h1><p class="ik-subtitle">Сегодня ещё один замечательный день!</p><span class="ik-date-pill">▣ '+safe(fmtDate(d))+'</span></div>'+star+'</div>'+
      '<div class="ik-main-card"><div class="ik-sec-title" style="margin:0 0 12px">План на сегодня</div><div class="ik-row">' +
      '<div class="ik-progress-circle"><svg viewBox="0 0 120 120" role="img" aria-label="Выполнено '+count+' из '+total+' дел"><circle cx="60" cy="60" r="49" fill="none" stroke="#e4d2ff" stroke-width="12"/><circle cx="60" cy="60" r="49" fill="none" stroke="#9161f0" stroke-width="12" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="'+(2*Math.PI*49)+'" stroke-dashoffset="'+(2*Math.PI*49*(1-count/Math.max(total,1)))+'"/></svg><div style="position:relative;text-align:center"><strong>'+count+'/'+total+'</strong><span>дел сделано</span></div></div>'+
      '<div class="ik-progress-side"><strong>'+(full?'Ты всё сделала!':'Ты большая молодец!')+'</strong><p class="ik-caption">⭐ Сегодня '+st(d)+' звёзд</p><div style="height:8px;border-radius:10px;background:#e0cff8;overflow:hidden"><div style="width:'+perc(count,total)+'%;height:100%;background:linear-gradient(90deg,#aa7af7,#7949ec);border-radius:10px"></div></div></div></div></div>'+
      '<div class="ik-filter-row">'+
       [['all','Все'],['school','Учёба'],['personal','Личное']].map(group=>'<button class="ik-filter '+(filter===group[0]?'active':'')+'" data-action="ikFilter" data-id="'+group[0]+'">'+group[1]+' ('+(group[0]==='all'?total:allTasks.filter(t=>groups[group[0]].includes(t.i)).length)+')</button>').join('')+'</div>'+
      '<div class="ik-task-list">'+(visible.length?visible.map(t=>{
        const yes=done.includes(t.i),x=(S.x[d]||{})[t.i],sub=yes&&x&&((x.s||[]).length||x.n)?[].concat(x.s||[],x.n?[x.n]:[]).join(', '):(t.s||'');
        const details=t.i==='hw'||t.i==='ho';
        return '<div class="ik-task '+(yes?'done':'')+'"><button class="ik-check '+(yes?'done':'')+'" data-action="toggle" data-id="'+t.i+'" aria-label="'+(yes?'Снять отметку: ':'Выполнить: ')+safe(t.t)+'">'+(yes?'✓':'')+'</button>'+
          '<span class="ik-task-icon">'+timeIcon(t.i)+'</span><button class="ik-task-title" data-action="'+(details?'details':'toggle')+'" data-id="'+t.i+'">'+safe(t.t)+(sub?'<small>'+safe(sub)+'</small>':'')+'</button>'+
          (S.times[t.i]?'<span class="ik-task-time">'+safe(S.times[t.i])+'</span>':'')+
          (details?'<button class="ik-mini-btn" data-action="details" data-id="'+t.i+'" aria-label="Подробнее">›</button>':'')+'</div>';
      }).join(''):'<div class="ik-empty">В этой категории дел сегодня нет.</div>')+'</div>'+
      '<p class="ik-muted" style="text-align:center">Отмечай выполненные дела и собирай звёзды!</p></div>';
  }
  function badgeStreak(){
    let streak=0,d=new Date();
    if(!dn(iso(d)).length)d.setDate(d.getDate()-1);
    while(streak<400&&dn(iso(d)).length){streak++;d.setDate(d.getDate()-1)}
    return streak;
  }
  function ikReward(){
    const dates=weekDates(),tw=dates.reduce((n,d)=>n+st(d),0),goal=S.goal||25,total=earned(),l=currentLevel(),next=levels[l+1],prevLevel=levels[l][0],pr=next?perc(total-prevLevel,next[0]-prevLevel):100;
    const clouds=averageSchool(),topGrade=clouds&&clouds.count&&clouds.average>=4.5;
    const help=Object.keys(S.d||{}).filter(d=>(S.d[d]||[]).includes('ho')).length;
    const streak=badgeStreak();
    const achievements=[{icon:'🌞',title:'Постоянство',small:'7 дней подряд',ok:streak>=7},{icon:'🏅',title:'Отличные оценки',small:'Средний от 4,50',ok:topGrade},{icon:'💗',title:'Помощник',small:'10 дел по дому',ok:help>=10}];
    return '<div class="ik-page ik-reward"><div class="ik-heading"><h1>Награда</h1><span class="ik-cloud-pill">⭐ Мои достижения</span></div>'+
      '<div class="ik-main-card"><div class="ik-hero-split">'+star+'<div style="flex:1"><b>Твоя неделя</b><div class="ik-row" style="gap:7px"><span class="ik-number" style="font-size:43px">'+tw+'</span><span style="font-size:25px">⭐</span></div><div class="ik-caption">из '+goal+' звёзд для награды</div><p class="ik-caption" style="margin-bottom:0">'+(tw>=goal?'Ура! Цель выполнена!':'Ты на верном пути! Продолжай в том же духе!')+'</p></div></div><div class="ik-level-track"><div style="width:'+perc(tw,goal)+'%"></div></div></div>'+
      '<div class="card ik-week">'+dates.map((date,i)=>{const n=dn(date).length,all=n>0&&n===tasks(date).length;return '<div class="ik-week-day '+(all?'is-full':'')+'"><div class="ik-week-star">'+(all?'⭐':n?'✦':'☆')+'</div><span>'+DN[i]+'</span></div>'}).join('')+'</div>'+
      '<button class="ik-action-row" data-action="ikLevels"><span class="ik-action-icon">👑</span><span style="flex:1"><b>Твой уровень</b><small>'+safe(levels[l][1])+' · уровень '+(l+1)+'</small><div class="ik-level-track"><div style="width:'+pr+'%"></div></div><small>'+(next?'До следующего: '+Math.max(0,next[0]-total)+' звёзд':'Максимальный уровень!')+'</small></span><span class="ik-chevron">›</span></button>'+
      '<button class="ik-action-row" data-action="editReward"><span class="ik-action-icon">🎁</span><span style="flex:1"><b>Ближайшая награда</b><small>'+safe(S.reward)+'</small><div class="ik-level-track"><div style="width:'+perc(tw,goal)+'%"></div></div><small>'+Math.max(0,goal-tw)+' звёзд осталось</small></span><span class="ik-chevron">›</span></button>'+
      '<div class="ik-row-between"><h2 class="ik-sec-title">Достижения</h2><span class="ik-tab-sublabel">'+achievements.filter(a=>a.ok).length+' из '+achievements.length+'</span></div>'+
      '<div class="ik-achievements">'+achievements.map(a=>'<div class="ik-achievement '+(a.ok?'':'locked')+'"><span class="icon">'+a.icon+'</span><b>'+a.title+'</b><small>'+a.small+'</small></div>').join('')+'</div></div>';
  }
  function ikProfile(){
    const l=currentLevel(),total=earned(),next=levels[l+1],prog=next?perc(total-levels[l][0],next[0]-levels[l][0]):100;
    function item(icon,title,subtitle,action){return '<button class="ik-action-row" data-action="'+action+'"><span class="ik-action-icon">'+icon+'</span><span style="flex:1"><b>'+title+'</b>'+(subtitle?'<small>'+safe(subtitle)+'</small>':'')+'</span><span class="ik-chevron">›</span></button>'}
    return '<div class="ik-page ik-profile"><div class="ik-heading"><h1>Я</h1><button class="ik-top-link" data-action="parents" aria-label="Настройки">⚙ Настройки</button></div>'+
      '<div class="card ik-profile-card"><div class="ik-avatar" aria-label="Аватар">'+safe(S.av.e)+'</div><div class="ik-profile-body"><strong>'+safe(S.name||'Полина')+' ✨</strong><small>'+safe(levels[l][1])+' · уровень '+(l+1)+'</small><div class="ik-level-track"><div style="width:'+prog+'%"></div></div><small>'+(next?total+'/'+next[0]+' звёзд':'Все уровни пройдены')+'</small></div><button class="ik-mini-btn" data-action="profile" aria-label="Изменить профиль">✎</button></div>'+
      '<div class="ik-row-between"><h2 class="ik-sec-title">Моя статистика</h2><span class="ik-tab-sublabel">За всё время</span></div>'+statsTiles()+
      '<div class="ik-list">'+item('💗','Мои интересы',S.interests||'Добавь то, что тебе нравится','ikInterests')+
      item('📅','История дел','Что было в прошлые дни','history')+
      item('🏆','Мои награды','Звёзды и достижения','ikToReward')+
      item('▥','Мои оценки','Из школьного дневника','ikToGrades')+'</div>'+
      '<div class="ik-list">'+item('🔒','Для родителей','Настройки и резервная копия','parents')+
      item('ⓘ','О приложении','Искра · твой день и достижения','ikAbout')+'</div></div>';
  }
  today=ikToday;reward=ikReward;me=ikProfile;
  ACTIONS.ikFilter=(id)=>{filter=id;render()};
  ACTIONS.ikToReward=()=>navTo('r');
  ACTIONS.ikToGrades=()=>navTo('g');
  ACTIONS.ikLevels=()=>sheet('<h2>Твои уровни</h2>'+levels.map((lv,i)=>'<div class="row"><b>'+(i+1)+'. '+safe(lv[1])+'</b><span class="mu">'+lv[0]+' ⭐</span></div>').join('')+'<p class="mu sm">Звёзды за выполненные дела помогают переходить на новые уровни.</p>');
  ACTIONS.ikAbout=()=>sheet('<h2>Об Искре</h2><p>«Искра» помогает выполнять дела, радоваться достижениям и узнавать школьные оценки.</p><p class="mu sm">Оценки загружаются из школьного дневника через защищённое подключение. Звёзды и отметки дел сохраняются на этом устройстве.</p>');
  ACTIONS.ikInterests=()=>sheet('<h2>Мои интересы</h2><p class="mu sm">Что тебе нравится? Например, чтение, спорт или рисование.</p><input id="ikInterestInput" maxlength="100" value="'+safe(S.interests)+'" placeholder="Мои увлечения"><button data-sheet-footer class="btn" data-action="ikSaveInterests">Сохранить</button>');
  ACTIONS.ikSaveInterests=()=>{const x=document.getElementById('ikInterestInput');if(x)S.interests=x.value.trim().slice(0,100);save();cs();render()};
  function createTimeSheet(){
    const current=tasks(iso(new Date()));
    sheet('<h2>Время дел</h2><p class="mu sm">Необязательно: время появится рядом с делом. Напоминания пока не отправляются.</p>'+
    current.map(t=>'<label class="sheet-field">'+safe(t.t)+'<input type="time" data-ik-task-time="'+t.i+'" value="'+safe(S.times[t.i]||'')+'"></label>').join('')+
    '<button data-sheet-footer class="btn" data-action="ikSaveTimes">Сохранить</button>');
  }
  ACTIONS.ikTaskTimes=()=>createTimeSheet();
  ACTIONS.ikSaveTimes=()=>{document.querySelectorAll('[data-ik-task-time]').forEach(input=>{if(input.value)S.times[input.dataset.ikTaskTime]=input.value;else delete S.times[input.dataset.ikTaskTime]});save();cs();render()};
  const baseParents=ACTIONS.parents;
  ACTIONS.parents=()=>{
    baseParents();
    const b=document.querySelector('.sheet-body');
    if(!b)return;
    const extra=document.createElement('div'),session=window.schoolCloud?.connection?.();
    const status=session?.isConnected
      ? '<p class="mu sm">Подключено: '+safe(session.email||'учётная запись Полины')+'</p><button class="btn g" type="button" data-sc-action="logout">Выйти из дневника</button>'
      : '<p class="mu sm">Для подключения открой вкладку «Оценки».</p>';
    extra.innerHTML='<h2>Мои дела</h2><button class="btn g" data-action="ikTaskTimes">Настроить время дел</button><h2>Школьный дневник</h2>'+status;
    b.prepend(extra);
  };
  document.querySelectorAll('.bar button').forEach((b,i)=>{
    const icons=['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 20v-7M10 20V6M15 20v-11M20 20V3"/></svg>','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4H4v5a4 4 0 0 0 4 4M17 4h3v5a4 4 0 0 1-4 4M7 2h10v8a5 5 0 0 1-10 0z"/></svg>','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/></svg>'];
    const txt=['Сегодня','Оценки','Награда','Я'][i];b.innerHTML=icons[i]+txt;
  });
  window.addEventListener('pageshow',()=>{S=store.load();S.times=S.times||{};S.interests=S.interests||'';render()});
  render();
})();