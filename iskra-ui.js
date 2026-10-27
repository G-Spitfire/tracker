/* Iskra 2.0: child-focused screens. Legacy data/IDs remain unchanged. */
(function(){
  'use strict';
  const star = '<img class="ik-star" alt="" aria-hidden="true" width="118" height="118" src="./assets/iskra/hero-star.webp" decoding="async">';
  const starSmall = '<img class="ik-star ik-star-sm" alt="" aria-hidden="true" width="74" height="74" src="./assets/iskra/hero-star.webp" decoding="async">';
  const safe = value => esc(value == null ? '' : String(value));
  const art=(name,kind='')=>'<span class="ik-art ik-art-'+name+(kind?' ik-art--'+kind:'')+'" aria-hidden="true"></span>';
  const taskArt={hw:'task_read',en:'task_english',bg:'nav_today',cl:'task_clothes',ho:'task_clean',ex:'task_walk',rd:'task_book'};
  const taskIcon=t=>art(taskArt[t.i]||'task_star','task');
  const achievementArt={'Постоянство':'achievement_streak','Отличные оценки':'achievement_grades','Помощник':'achievement_helper','Первый шаг':'achievement_first','Книголюб':'achievement_read','Мастер дел':'achievement_master'};

  const fmtDate = date => new Date(date + 'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'long'});
  const completed = () => Object.keys(S.d||{}).reduce((n,date) => n+dn(date).length,0);
  const earned = () => Object.keys(S.d||{}).reduce((n,date) => n+st(date),0);
  const averageSchool = () => window.schoolCloud?.summary?.() || null;
  const gradeScope = () => window.schoolCloud?.periodLabel?.() || 'выбранный период';
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
  const profileWindow=()=>['all','30','7'].includes(S.profileStatsWindow)?S.profileStatsWindow:'all';
  const profileWindowLabel=()=>({all:'За всё время','30':'За 30 дней','7':'За 7 дней'})[profileWindow()];
  function statsTiles(){
    const windowDays=profileWindow()==='all'?null:Number(profileWindow());
    const now=new Date(),fromDate=new Date(now);
    if(windowDays!==null)fromDate.setDate(fromDate.getDate()-(windowDays-1));
    const start=windowDays===null?null:iso(fromDate),end=iso(now);
    const days=Object.keys(S.d||{}).filter(d=>start===null||(d>=start&&d<=end));
    const count=days.reduce((n,d)=>n+dn(d).length,0);
    const starsCount=days.reduce((n,d)=>n+st(d),0);
    const grades=windowDays===null?window.schoolCloud?.overallSummary?.():window.schoolCloud?.summaryBetween?.(start,end);
    const mean=grades?.count&&Number.isFinite(grades.average)?grades.average.toFixed(2).replace('.',','):'—';
    return '<div class="ik-time-stat">'+
      '<div class="ik-tile"><div class="ik-tile-icon">'+art('task_done','stat')+'</div><strong>'+count+'</strong><small>дел сделано</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon">'+art('task_star','stat')+'</div><strong>'+starsCount+'</strong><small>звёзд</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon">'+art('nav_grades','stat')+'</div><strong>'+mean+'</strong><small>средний за период</small></div></div>';
  }
  function ikToday(){
    recordAchievements();
    const d=iso(new Date()), allTasks=tasks(d), done=dn(d), count=done.length, total=allTasks.length;
    const groups={school:['hw','en','bg'],personal:['cl','ho','ex','rd']};
    const visible=filter==='all'?allTasks:allTasks.filter(task=>task.category ? task.category===filter:groups[filter].includes(task.i));
    const full=total>0&&count===total;
    return '<div class="ik-page ik-today">' +
      '<div class="ik-heading-with-star"><div class="ik-greeting-copy"><h1>Привет'+(S.name?', '+safe(S.name):'')+'!</h1><p class="ik-subtitle">Сегодня ещё один замечательный день!</p><span class="ik-date-pill">'+art('history','pill')+' '+safe(fmtDate(d))+'</span></div>'+star+'</div>'+
      '<div class="ik-main-card ik-today-hero"><div class="ik-sec-title ik-plan-label">План на сегодня</div><div class="ik-row">' +
      '<div class="ik-progress-circle"><svg viewBox="0 0 120 120" role="img" aria-label="Выполнено '+count+' из '+total+' дел"><circle cx="60" cy="60" r="49" fill="none" stroke="#e4d2ff" stroke-width="12"/><circle cx="60" cy="60" r="49" fill="none" stroke="#9161f0" stroke-width="12" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="'+(2*Math.PI*49)+'" stroke-dashoffset="'+(2*Math.PI*49*(1-count/Math.max(total,1)))+'"/></svg><div style="position:relative;text-align:center"><strong>'+count+'/'+total+'</strong><span>дел сделано</span></div></div>'+
      '<div class="ik-progress-side"><strong>'+(full?'Ты всё сделала!':'Ты большая молодец!')+'</strong><p class="ik-caption">⭐ Сегодня '+st(d)+' звёзд</p><div style="height:8px;border-radius:10px;background:#e0cff8;overflow:hidden"><div style="width:'+perc(count,total)+'%;height:100%;background:linear-gradient(90deg,#aa7af7,#7949ec);border-radius:10px"></div></div></div></div></div>'+
      '<div class="ik-filter-row">'+
       [['all','Все'],['school','Учёба'],['personal','Личное']].map(group=>'<button class="ik-filter '+(filter===group[0]?'active':'')+'" data-action="ikFilter" data-id="'+group[0]+'">'+group[1]+' ('+(group[0]==='all'?total:allTasks.filter(t=>t.category?t.category===group[0]:groups[group[0]].includes(t.i)).length)+')</button>').join('')+'</div>'+
      '<div class="ik-task-list">'+(visible.length?visible.map(t=>{
        const yes=done.includes(t.i),x=(S.x[d]||{})[t.i],sub=yes&&x&&((x.s||[]).length||x.n)?[].concat(x.s||[],x.n?[x.n]:[]).join(', '):(t.s||'');
        const details=t.i==='hw'||t.i==='ho';
        return '<div class="ik-task '+(yes?'done':'')+'"><button class="ik-check '+(yes?'done':'')+'" data-action="toggle" data-id="'+t.i+'" aria-label="'+(yes?'Снять отметку: ':'Выполнить: ')+safe(t.t)+'">'+(yes?'✓':'')+'</button>'+
          '<span class="ik-task-icon">'+taskIcon(t)+'</span><button class="ik-task-title" data-action="'+(details?'details':'ikTaskInfo')+'" data-id="'+t.i+'">'+safe(t.t)+(sub?'<small>'+safe(sub)+'</small>':'')+'</button>'+
          (S.times[t.i]?'<span class="ik-task-time">'+safe(S.times[t.i])+'</span>':'')+
          '<button class="ik-mini-btn" data-action="'+(details?'details':'ikTaskInfo')+'" data-id="'+t.i+'" aria-label="Подробнее">›</button>'+'</div>';
      }).join(''):'<div class="ik-empty">В этой категории дел сегодня нет.</div>')+'</div>'+
      '<p class="ik-muted" style="text-align:center">Отмечай выполненные дела и собирай звёзды!</p></div>';
  }
  function badgeStreak(){
    let streak=0,d=new Date();
    if(!dn(iso(d)).length)d.setDate(d.getDate()-1);
    while(streak<400&&dn(iso(d)).length){streak++;d.setDate(d.getDate()-1)}
    return streak;
  }
  function bestStreak(){
    const dates=Object.keys(S.d||{}).filter(d=>dn(d).length>0).sort();
    let best=0,run=0,previous='';
    for(const date of dates){
      if(previous){
        const x=new Date(previous+'T12:00:00');
        x.setDate(x.getDate()+1);
        run=iso(x)===date?run+1:1;
      }else run=1;
      best=Math.max(best,run);previous=date;
    }
    return best;
  }
  function recordAchievements(){
    S.earnedAchievements=S.earnedAchievements&&typeof S.earnedAchievements==='object'?S.earnedAchievements:{};
    const dates=Object.keys(S.d||{}),clouds=window.schoolCloud?.overallSummary?.();
    const conditions={
      'Постоянство':bestStreak()>=7,
      'Отличные оценки':!!(clouds?.count&&clouds.average>=4.5),
      'Помощник':dates.filter(d=>(S.d[d]||[]).includes('ho')).length>=10,
      'Первый шаг':dates.some(d=>dn(d).length>0),
      'Книголюб':dates.filter(d=>(S.d[d]||[]).includes('rd')).length>=10,
      'Мастер дел':completed()>=50
    };
    let changed=false;
    for(const [name,earned] of Object.entries(conditions)){
      if(earned&&!S.earnedAchievements[name]){S.earnedAchievements[name]=iso(new Date());changed=true}
    }
    if(changed)save();
  }
  function ikReward(){
    const dates=weekDates(),weekKey=dates[0],currentPlan=weekPlan(weekKey),savedWeek=S.rewardHistory?.[weekKey],tw=dates.reduce((n,d)=>n+st(d),0),goal=savedWeek?.goal||currentPlan.goal,total=earned(),l=currentLevel(),next=levels[l+1],prevLevel=levels[l][0],pr=next?perc(total-prevLevel,next[0]-prevLevel):100;
    recordAchievements();
    const achievements=[
      {icon:'🌞',title:'Постоянство',small:'7 дней подряд'},
      {icon:'🏅',title:'Отличные оценки',small:'Средний от 4,50'},
      {icon:'💗',title:'Помощник',small:'10 дел по дому'},
      {icon:'👟',title:'Первый шаг',small:'Первое дело'},
      {icon:'📖',title:'Книголюб',small:'10 дней чтения'},
      {icon:'🌟',title:'Мастер дел',small:'50 выполненных дел'}
    ];
    for(const a of achievements)a.ok=!!S.earnedAchievements[a.title];
    const existing=S.rewardHistory[weekKey];
    if(tw>=goal&&!existing){S.rewardHistory[weekKey]={name:currentPlan.name,goal,earnedAt:iso(new Date()),status:'earned'};save()}
    else if(tw<goal&&existing?.status==='earned'){delete S.rewardHistory[weekKey];save()}
    const prize=S.rewardHistory[weekKey];
    const rewardStatus=prize?.status==='received'?'Награда получена!':prize?'Награда заработана!':'Ты на верном пути! Продолжай в том же духе!';
    return '<div class="ik-page ik-reward"><div class="ik-heading ik-subscreen-header"><button class="ik-header-back" data-action="ikToToday" aria-label="Вернуться к делам">‹</button><h1>Награда</h1><button class="ik-cloud-pill ik-achievements-link" data-action="ikJumpAchievements" aria-label="Мои достижения">'+art('task_star','tiny')+'<span class="ik-achievements-text">Мои достижения</span></button></div>'+
      '<div class="ik-main-card ik-reward-hero">'+art('cloud','decor-cloud')+art('sparkles','decor-sparkles')+'<div class="ik-hero-split">'+star+'<div style="flex:1"><b>Твоя неделя</b><div class="ik-row" style="gap:7px"><span class="ik-number" style="font-size:43px">'+tw+'</span><span style="font-size:25px">⭐</span></div><div class="ik-caption">из '+goal+' звёзд для награды</div><p class="ik-caption" style="margin-bottom:0">'+rewardStatus+'</p></div></div><div class="ik-level-track"><div style="width:'+perc(tw,goal)+'%"></div></div></div>'+
      '<div class="card ik-week">'+dates.map((date,i)=>{const n=dn(date).length,all=n>0&&n===tasks(date).length;return '<button class="ik-week-day '+(all?'is-full':'')+'" data-action="ikWeekDay" data-id="'+date+'" aria-label="'+DN[i]+': '+st(date)+' звёзд"><div class="ik-week-star">'+(all?art('task_star','week'):n?art('sparkles','week'):'☆')+'</div><span>'+DN[i]+'</span><small>'+st(date)+' ★</small></button>'}).join('')+'</div>'+
      '<button class="ik-action-row" data-action="ikLevels"><span class="ik-action-icon">'+art('achievement_master','action')+'</span><span style="flex:1"><b>Твой уровень</b><small>'+safe(levels[l][1])+' · уровень '+(l+1)+'</small><div class="ik-level-track"><div style="width:'+pr+'%"></div></div><small>'+(next?'До следующего: '+Math.max(0,next[0]-total)+' звёзд':'Максимальный уровень!')+'</small></span><span class="ik-chevron">›</span></button>'+
      '<button class="ik-action-row" data-action="ikRewardInfo"><span class="ik-action-icon">'+art('prize_gift','action')+'</span><span style="flex:1"><b>Ближайшая награда</b><small>'+safe(prize?.name||currentPlan.name)+'</small><div class="ik-level-track"><div style="width:'+perc(tw,goal)+'%"></div></div><small>'+(prize?.status==='received'?'Награда получена':tw>=goal?'Можно вручить':Math.max(0,goal-tw)+' звёзд осталось')+'</small></span><span class="ik-chevron">›</span></button>'+
      '<div class="ik-row-between" id="ik-achievements"><h2 class="ik-sec-title">Достижения</h2><span class="ik-tab-sublabel">'+achievements.filter(a=>a.ok).length+' из '+achievements.length+'</span></div>'+
      '<div class="ik-achievements">'+achievements.map(a=>'<div class="ik-achievement '+(a.ok?'':'locked')+'"><span class="icon">'+art(achievementArt[a.title]||'star','achievement')+'</span><b>'+a.title+'</b><small>'+(a.ok?('Получено '+safe(S.earnedAchievements[a.title])):a.small)+'</small></div>').join('')+'</div>'+
      '<button class="ik-action-row" data-action="ikRewardHistory"><span class="ik-action-icon">📜</span><span style="flex:1"><b>История наград</b><small>Заработанные и полученные награды</small></span><span class="ik-chevron">›</span></button></div>';
  }
  function ikProfile(){
    recordAchievements();
    const l=currentLevel(),total=earned(),next=levels[l+1],step=next?next[0]-levels[l][0]:0,gained=total-levels[l][0],prog=next?perc(gained,step):100;
    function item(icon,title,subtitle,action){return '<button class="ik-action-row" data-action="'+action+'"><span class="ik-action-icon">'+art(icon,'action')+'</span><span style="flex:1"><b>'+title+'</b>'+(subtitle?'<small>'+safe(subtitle)+'</small>':'')+'</span><span class="ik-chevron">›</span></button>'}
    return '<div class="ik-page ik-profile"><div class="ik-heading ik-subscreen-header"><span class="ik-header-spacer" aria-hidden="true"></span><h1>Я</h1><button class="ik-top-link ik-settings-link" data-action="ikPersonalSettings" aria-label="Личные настройки">'+art('settings','tiny')+'<span class="ik-settings-text">Настройки</span></button></div>'+
      '<div class="card ik-profile-card"><div class="ik-avatar" aria-label="Аватар">'+art('portrait','avatar')+'<span class="ik-avatar-choice" aria-label="Выбранный символ">'+safe(S.av.e)+'</span></div><div class="ik-profile-body"><strong>'+safe(S.name||'Полина')+' ✨</strong><small>'+safe(levels[l][1])+' · уровень '+(l+1)+'</small><div class="ik-level-track"><div style="width:'+prog+'%"></div></div><small>'+(next?Math.max(0,gained)+' из '+step+' звёзд до уровня':'Все уровни пройдены')+'</small></div><button class="ik-mini-btn" data-action="profile" aria-label="Изменить профиль">✎</button></div>'+
      '<div class="ik-row-between"><h2 class="ik-sec-title">Моя статистика</h2><button class="ik-top-link" data-action="ikProfileWindow">'+profileWindowLabel()+' ▾</button></div>'+statsTiles()+
      '<div class="ik-list">'+item('heart','Мои интересы',S.interests||'Добавь то, что тебе нравится','ikInterests')+
      item('history','История дел','Что было в прошлые дни','history')+
      item('nav_reward','Мои награды','Звёзды и достижения','ikToReward')+
      item('nav_grades','Мои оценки','Из школьного дневника','ikToGrades')+'</div>'+
      '<div class="ik-list">'+item('parent_lock','Для родителей','Настройки и резервная копия','parents')+
      item('info','О приложении','Искра · твой день и достижения','ikAbout')+'</div></div>';
  }
  today=ikToday;reward=ikReward;me=ikProfile;
  ACTIONS.ikFilter=(id)=>{filter=id;render()};
  ACTIONS.ikToToday=()=>navTo('t');
  ACTIONS.ikToReward=()=>navTo('r');
  ACTIONS.ikJumpAchievements=()=>{
    if(tab!=='r')navTo('r');
    document.getElementById('ik-achievements')?.scrollIntoView({behavior:'smooth',block:'center'});
  };
  ACTIONS.ikToGrades=()=>{window.schoolCloud?.resetSubject?.();navTo('g')};
  ACTIONS.ikProfileWindow=()=>{
    S.profileStatsWindow=({all:'30','30':'7','7':'all'})[profileWindow()];
    save();render();
  };
  ACTIONS.ikWeekDay=(d)=>openDay(d);
  ACTIONS.ikTaskInfo=(id)=>{
    const task=tasks(iso(new Date())).find(t=>t.i===id);if(!task)return;
    const done=dn(iso(new Date())).includes(id);
    sheet('<h2>'+safe(task.t)+'</h2><p class="mu sm">'+safe(task.s||'Дело на сегодня')+'</p><p class="mu sm">Время: '+safe(S.times[id]||'не задано')+'</p><div data-sheet-footer><button class="btn" data-action="ikTaskDone" data-id="'+safe(id)+'">'+(done?'Снять отметку':'Отметить выполненным')+'</button></div>');
  };
  ACTIONS.ikTaskDone=(id)=>{cs();toggleTask(id)};
  ACTIONS.ikPersonalSettings=()=>sheet('<h2>Мои настройки</h2><button class="btn g" data-action="profile">Имя и аватар</button><button class="btn g" data-action="ikInterests">Мои интересы</button><p class="mu sm">Настройки наград и расписания находятся в разделе «Для родителей».</p>');
  ACTIONS.ikRewardInfo=()=>{
    const date=weekDates()[0],h=S.rewardHistory[date],plan=weekPlan(date);
    sheet('<h2>Награда недели</h2><p><b>'+safe(h?.name||plan.name)+'</b></p><p class="mu sm">Звёзды: '+weekDates().reduce((n,d)=>n+st(d),0)+' из '+(h?.goal||plan.goal)+'</p>'+
    (h?.status==='received'?'<p>Награда уже получена!</p>':h?'<p>Цель выполнена! Получение подтверждает взрослый.</p><button class="btn" data-action="ikClaimReward">Подтвердить получение</button>':'<p>Продолжай собирать звёзды!</p>'));
  };
  ACTIONS.ikClaimReward=()=>{
    const date=weekDates()[0],h=S.rewardHistory[date];
    if(!h||h.status==='received'||weekDates().reduce((n,d)=>n+st(d),0)<(h.goal||weekPlan(date).goal))return;
    if(!confirm('Родитель подтверждает, что награда уже вручена?'))return;
    h.status='received';h.receivedAt=iso(new Date());save();cs();render();
  };
  ACTIONS.ikRewardHistory=()=>{
    const entries=Object.entries(S.rewardHistory||{}).sort((a,b)=>b[0].localeCompare(a[0]));
    sheet('<h2>История наград</h2>'+(entries.length?entries.map(([date,h])=>
      '<div class="row" style="align-items:center"><span>🎁 '+safe(h.name)+'<small class="mu sm" style="display:block">Неделя с '+safe(date)+'</small></span>'+
      (h.status==='received'?'<b class="ok">✓ Получена</b>':'<button type="button" class="ik-btn-small" data-action="ikClaimPastReward" data-id="'+safe(date)+'">Подтвердить</button>')+'</div>'
    ).join(''):'<p class="mu sm">Первая награда ещё впереди.</p>'));
  };
  ACTIONS.ikClaimPastReward=week=>{
    const reward=S.rewardHistory?.[week];if(!reward||reward.status==='received')return;
    const [yy,mm,dd]=week.split('-').map(Number),start=new Date(yy,mm-1,dd);
    const stars=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return st(iso(d))}).reduce((a,b)=>a+b,0);
    if(stars<(reward.goal||25)){delete S.rewardHistory[week];save();ACTIONS.ikRewardHistory();return}
    if(!confirm('Взрослый подтверждает получение награды «'+reward.name+'»?'))return;
    reward.status='received';reward.receivedAt=iso(new Date());save();ACTIONS.ikRewardHistory();render();
  };
  ACTIONS.ikLevels=()=>sheet('<h2>Твои уровни</h2>'+levels.map((lv,i)=>'<div class="row"><b>'+(i+1)+'. '+safe(lv[1])+'</b><span class="mu">'+lv[0]+' ⭐</span></div>').join('')+'<p class="mu sm">Звёзды за выполненные дела помогают переходить на новые уровни.</p>');
  ACTIONS.ikAbout=()=>sheet('<h2>Об Искре</h2><p>«Искра» помогает выполнять дела, радоваться достижениям и узнавать школьные оценки.</p><p class="mu sm">Оценки загружаются из школьного дневника через защищённое подключение. Звёзды и отметки дел сохраняются на этом устройстве.</p>');
  ACTIONS.ikInterests=()=>sheet('<h2>Мои интересы</h2><p class="mu sm">Что тебе нравится? Например, чтение, спорт или рисование.</p><input id="ikInterestInput" maxlength="100" value="'+safe(S.interests)+'" placeholder="Мои увлечения"><button data-sheet-footer class="btn" data-action="ikSaveInterests">Сохранить</button>');
  ACTIONS.ikSaveInterests=()=>{const x=document.getElementById('ikInterestInput');if(x)S.interests=x.value.trim().slice(0,100);save();cs();render()};
  function createTimeSheet(){
    const current=taskCatalog().filter(t=>!S.hiddenTasks.includes(t.i));
    sheet('<h2>Время дел</h2><p class="mu sm">Необязательно: время появится рядом с делом. Напоминания пока не отправляются.</p>'+
    current.map(t=>'<label class="sheet-field">'+safe(t.t)+'<input type="time" data-ik-task-time="'+t.i+'" value="'+safe(S.times[t.i]||'')+'"></label>').join('')+
    '<button data-sheet-footer class="btn" data-action="ikSaveTimes">Сохранить</button>');
  }
  ACTIONS.ikTaskTimes=()=>createTimeSheet();
  ACTIONS.ikSaveTimes=()=>{document.querySelectorAll('[data-ik-task-time]').forEach(input=>{if(input.value)S.times[input.dataset.ikTaskTime]=input.value;else delete S.times[input.dataset.ikTaskTime]});save();cs();render()};

  let taskPlanDraft=null;
  const createTaskDraft=()=>({
    customTasks:JSON.parse(JSON.stringify(S.customTasks)),
    taskDays:JSON.parse(JSON.stringify(S.taskDays)),
    hiddenTasks:[...S.hiddenTasks],
    taskCategories:{...S.taskCategories}
  });
  const taskDraftItems=()=>[EX,...T,RD,...(taskPlanDraft?.customTasks||[])];
  function taskEditor(){
    if(!taskPlanDraft)taskPlanDraft=createTaskDraft();
    const days=[['Пн',1],['Вт',2],['Ср',3],['Чт',4],['Пт',5],['Сб',6],['Вс',0]];
    const html=taskDraftItems().map(task=>{
      const schedule=Array.isArray(taskPlanDraft.taskDays[task.i])?taskPlanDraft.taskDays[task.i]:(defaultDays[task.i]||[0,1,2,3,4,5,6]);
      const disabled=taskPlanDraft.hiddenTasks.includes(task.i);
      const cat=taskPlanDraft.taskCategories[task.i]||task.category||(['hw','en','bg'].includes(task.i)?'school':'personal');
      return '<div class="ik-plan-row"><div class="ik-row-between"><b>'+safe(task.e||'✨')+' '+safe(task.t)+'</b>'+
        '<button type="button" class="ik-btn-small" data-action="ikHideTask" data-id="'+safe(task.i)+'">'+(disabled?'Включить':'Отключить')+'</button>'+
        (task.i.startsWith('user-')?'<button type="button" class="ik-btn-small" data-action="ikRemoveTask" data-id="'+safe(task.i)+'" aria-label="Удалить дело">×</button>':'')+'</div>'+
        '<button type="button" class="ik-btn-small" data-action="ikTaskCategory" data-id="'+safe(task.i)+'">Категория: '+(cat==='school'?'Учёба':'Личное')+' ⇄</button>'+
        '<div class="ik-plan-days">'+days.map(([label,wd])=>'<button type="button" class="ik-day-pill '+(schedule.includes(wd)?'on':'')+'" data-action="ikTaskDay" data-id="'+safe(task.i)+'" data-arg="'+wd+'" aria-pressed="'+schedule.includes(wd)+'">'+label+'</button>').join('')+'</div></div>';
    }).join('');
    sheet('<h2>Расписание дел</h2><p class="mu sm">Настрой дела и нажми «Сохранить». Все изменения начнут действовать завтра. Текущий день и история останутся прежними.</p>'+
      html+'<h3>Добавить дело</h3><label class="sheet-field">Название<input maxlength="45" id="ik-new-task" placeholder="Например, Погулять"></label>'+
      '<label class="sheet-field">Категория<select id="ik-new-category"><option value="personal">Личное</option><option value="school">Учёба</option></select></label>'+
      '<button type="button" class="btn g" data-action="ikAddTask">Добавить дело</button>'+
      '<div data-sheet-footer class="chips"><button type="button" class="btn g" data-action="ikPlanCancel">Отмена</button><button type="button" class="btn" data-action="ikPlanSave">Сохранить</button></div>');
  }
  ACTIONS.ikManageTasks=()=>{taskPlanDraft=createTaskDraft();taskEditor()};
  ACTIONS.ikTaskCategory=id=>{
    const task=taskDraftItems().find(t=>t.i===id);if(!task)return;
    const current=taskPlanDraft.taskCategories[id]||task.category||(['hw','en','bg'].includes(id)?'school':'personal');
    taskPlanDraft.taskCategories[id]=current==='school'?'personal':'school';taskEditor();
  };
  ACTIONS.ikTaskDay=(id,_,el)=>{
    const wd=Number(el.dataset.arg),task=taskDraftItems().find(t=>t.i===id);
    if(!task||!Number.isInteger(wd)||wd<0||wd>6)return;
    const arr=Array.isArray(taskPlanDraft.taskDays[id])?taskPlanDraft.taskDays[id].slice():(defaultDays[id]||[0,1,2,3,4,5,6]).slice();
    const at=arr.indexOf(wd);if(at>=0)arr.splice(at,1);else arr.push(wd);
    taskPlanDraft.taskDays[id]=arr;taskEditor();
  };
  ACTIONS.ikHideTask=id=>{
    const task=taskDraftItems().find(t=>t.i===id);if(!task)return;
    const at=taskPlanDraft.hiddenTasks.indexOf(id);
    if(at<0)taskPlanDraft.hiddenTasks.push(id);else taskPlanDraft.hiddenTasks.splice(at,1);
    taskEditor();
  };
  ACTIONS.ikRemoveTask=id=>{
    if(!taskPlanDraft?.customTasks.some(t=>t.i===id))return;
    taskPlanDraft.customTasks=taskPlanDraft.customTasks.filter(t=>t.i!==id);
    delete taskPlanDraft.taskDays[id];delete taskPlanDraft.taskCategories[id];
    taskPlanDraft.hiddenTasks=taskPlanDraft.hiddenTasks.filter(v=>v!==id);
    taskEditor();
  };
  ACTIONS.ikAddTask=()=>{
    const input=document.getElementById('ik-new-task'),selector=document.getElementById('ik-new-category'),name=input?.value.trim().slice(0,45);
    if(!name)return toast('Введите название дела');
    if(taskDraftItems().length>=30)return toast('Достигнут лимит 30 дел');
    if(taskDraftItems().some(t=>t.t.toLocaleLowerCase('ru-RU')===name.toLocaleLowerCase('ru-RU')))return toast('Такое дело уже существует');
    const id='user-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,5);
    taskPlanDraft.customTasks.push({i:id,e:'✨',t:name,category:selector?.value==='school'?'school':'personal'});
    taskEditor();
  };
  ACTIONS.ikPlanSave=()=>{
    if(!taskPlanDraft)return;
    const invalid=taskDraftItems().find(task=>{
      const days=taskPlanDraft.taskDays[task.i]??defaultDays[task.i]??[0,1,2,3,4,5,6];
      return !taskPlanDraft.hiddenTasks.includes(task.i)&&days.length===0;
    });
    if(invalid){toast('Выбери дни для дела «'+invalid.t+'» или отключи его');return}
    freezeDay(iso(new Date()));
    S.customTasks=taskPlanDraft.customTasks;
    S.taskDays=taskPlanDraft.taskDays;
    S.hiddenTasks=taskPlanDraft.hiddenTasks;
    S.taskCategories=taskPlanDraft.taskCategories;
    taskPlanDraft=null;save();cs();render();toast('Расписание сохранено для будущих дней');
  };
  ACTIONS.ikPlanCancel=()=>{taskPlanDraft=null;cs();render()};
  ACTIONS.ikGradePeriods=()=>{
    const html=window.schoolCloud?.termSettingsHtml?.();
    if(!html){toast('Сначала подключи школьный дневник');return}
    sheet(html);
  };
  document.addEventListener('ikTermSettingsSaved',()=>{cs();render();toast('Периоды сохранены')});
  document.addEventListener('ikGradeSignedOut',()=>{cs();render();toast('Дневник отключён')});
  window.addEventListener('schoolCloudUpdated',()=>{
    if(document.querySelector('#scs-login')&&window.schoolCloud?.connection?.().isConnected){
      cs();render();toast('Дневник подключён');
    }
  });
  ACTIONS.ikOfflineToggle=()=>{
    const next=!window.schoolCloud?.offlineEnabled?.();
    if(window.schoolCloud?.setOfflineEnabled?.(next)){ACTIONS.parents();toast(next?'Офлайн-копия разрешена':'Офлайн-копия отключена')}
    else toast('Не удалось изменить настройку');
  };
  // A local parent-only PIN barrier. This is not server-side authorization.
  const parentPinKey='iskra_parent_pin_v1';
  let parentUnlocked=false;
  const parentPinHash=async(pin,salt)=>{
    const message=new TextEncoder().encode(salt+':'+pin);
    const digest=await window.crypto.subtle.digest('SHA-256',message);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  };
  const getParentPin=()=>{try{return JSON.parse(localStorage.getItem(parentPinKey)||'null')}catch(_){return null}};
  async function setupParentPin(){
    const pin=window.prompt('Родителю: придумай PIN из 6 цифр для настроек «Искры».');
    if(pin===null)return false;
    if(!/^\d{6}$/.test(pin)){toast('PIN должен содержать ровно 6 цифр');return false}
    const again=window.prompt('Повтори PIN, чтобы подтвердить.');
    if(again!==pin){toast('PIN не совпал');return false}
    if(!window.crypto?.subtle||!window.crypto?.getRandomValues){toast('Для PIN нужен защищённый сайт HTTPS');return false}
    const salt=Array.from(window.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
    const hash=await parentPinHash(pin,salt);
    try{localStorage.setItem(parentPinKey,JSON.stringify({salt,hash}));return true}
    catch(_){toast('PIN не удалось сохранить');return false}
  }
  async function authorizeParent(){
    let saved=getParentPin();
    if(!saved){return setupParentPin()}
    if(typeof saved.salt!=='string'||typeof saved.hash!=='string'||!window.crypto?.subtle){
      toast('Не удалось проверить родительский PIN');return false
    }
    const pin=window.prompt('Введите родительский PIN (6 цифр).');
    if(pin===null)return false;
    if(!/^\d{6}$/.test(pin)||await parentPinHash(pin,saved.salt)!==saved.hash){
      toast('Неверный родительский PIN');return false
    }
    return true;
  }
  ACTIONS.ikChangeParentPin=async()=>{
    if(!parentUnlocked)return;
    if(!confirm('Заменить родительский PIN новым?'))return;
    if(await setupParentPin())toast('Новый PIN сохранён');
  };
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-action="closeSheet"]')||e.target.matches('[data-close]'))parentUnlocked=false;
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')parentUnlocked=false});
  window.addEventListener('pageshow',()=>{parentUnlocked=false});
  window.addEventListener('iskraSheetClosed',()=>{parentUnlocked=false});
  const baseParents=ACTIONS.parents;
  ACTIONS.parents=async()=>{
    if(!parentUnlocked){
      if(!await authorizeParent())return;
      parentUnlocked=true;
    }
    baseParents();
    const b=document.querySelector('.sheet-body');
    if(!b)return;
    const extra=document.createElement('div'),session=window.schoolCloud?.connection?.();
    const status=session?.isConnected
      ? '<p class="mu sm">Подключено: '+safe(session.email||'учётная запись Полины')+'</p><button class="btn g" type="button" data-sc-action="logout">Выйти из дневника</button>'
      : '<p class="mu sm">Подключи дневник один раз — дальше оценки загружаются автоматически.</p>'+ (window.schoolCloud?.loginHtml?.()||'');
    extra.innerHTML='<h2>Мои дела</h2><button class="btn g" data-action="ikManageTasks">Дела и дни недели</button><button class="btn g" data-action="ikTaskTimes">Время дел</button><h2>Периоды школьных оценок</h2><button class="btn g" data-action="ikGradePeriods">Границы четвертей</button><h2>Школьный дневник</h2>'+status+
      '<button class="btn g" data-action="ikChangeParentPin">Сменить родительский PIN</button>'+
      '<p class="mu sm">PIN действует только на этом устройстве и не заменяет вход в школьный дневник.</p>'+
      '<div class="ik-parent-offline"><p class="mu sm">Офлайн-копия оценок: '+(window.schoolCloud?.offlineEnabled?.()?'включена':'выключена')+'. Если включить, оценки сохраняются на этом устройстве без шифрования.</p><button class="btn g" data-action="ikOfflineToggle">'+(window.schoolCloud?.offlineEnabled?.()?'Отключить офлайн-копию':'Разрешить офлайн-копию')+'</button></div>';
    b.prepend(extra);
  };
  window.addEventListener('schoolCloudUpdated',recordAchievements);
  document.querySelectorAll('.bar button').forEach((b,i)=>{
    const icon=['nav_today','nav_grades','nav_reward','avatar_girl'][i];
    const text=['Сегодня','Оценки','Награда','Я'][i];
    b.innerHTML=art(icon,'nav')+text;
  });
  let lastViewedDate=iso(new Date());
  const refreshDate=()=>{
    const current=iso(new Date());
    if(current!==lastViewedDate){lastViewedDate=current;if(tab==='t'||tab==='r')render()}
  };
  window.addEventListener('pageshow',()=>{S=store.load();S.times=S.times||{};S.interests=S.interests||'';refreshDate();render()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDate()});
  setInterval(()=>{if(!document.hidden)refreshDate()},60000);
  render();
})();