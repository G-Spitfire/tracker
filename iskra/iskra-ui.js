/* Iskra 2.0: child-focused screens. Legacy data/IDs remain unchanged. */
(function(){
  'use strict';
  const star = '<img class="ik-star" alt="" aria-hidden="true" width="118" height="118" src="./assets/hero-star.webp" decoding="async">';
  const starSmall = '<img class="ik-star ik-star-sm" alt="" aria-hidden="true" width="74" height="74" src="./assets/hero-star.webp" decoding="async">';
  const safe = value => esc(value == null ? '' : String(value));
  const art=(name,kind='')=>'<span class="ik-art ik-art-'+name+(kind?' ik-art--'+kind:'')+'" aria-hidden="true"></span>';
  try{localStorage.removeItem('iskra_parent_pin_v1')}catch(_){/* PIN is retired; continue if storage is unavailable. */}
  const taskArt={hw:'task_read',en:'task_english',bg:'nav_today',cl:'task_clothes',ho:'task_clean',ex:'task_walk',rd:'task_book'};
  const taskIcon=t=>art(taskArt[t.i]||'task_star','task');
  const achievementArt={'Постоянство':'achievement_streak','Усердие':'achievement_grades','Отличные оценки':'achievement_grades','Помощник':'achievement_helper','Первый шаг':'achievement_first','Книголюб':'achievement_read','Мастер дел':'achievement_master'};

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
  if(typeof S.interests!=='string')S.interests='';
  if(!S.ex){S.ex=iso(new Date());save();}
  const weekDates=()=>wk();
  function navTo(id){tab=id;render();window.scrollTo(0,0)}
  const profileWindow=()=>['all','30','7'].includes(S.profileStatsWindow)?S.profileStatsWindow:'all';
  const profileWindowLabel=()=>({all:'За всё время','30':'За 30 дней','7':'За 7 дней'})[profileWindow()];
  const shortDay=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  function ensureHabitScheduleTracking(){
    S.habitScheduleHistory=S.habitScheduleHistory&&typeof S.habitScheduleHistory==='object'?S.habitScheduleHistory:{};
    const today=iso(new Date());let changed=false;
    for(const task of taskCatalog())if(!S.habitScheduleHistory[task.i]?.length&&!S.hiddenTasks.includes(task.i)){
      S.habitScheduleHistory[task.i]=[{from:today,days:daysForHabit(task.i).slice()}];changed=true;
    }
    if(changed)save();
  }
  function habitRegularity(){
    ensureHabitScheduleTracking();
    const today=iso(new Date()),dates=[];
    for(let offset=13;offset>=0;offset--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-offset);dates.push(iso(d))}
    const habits=taskCatalog().filter(t=>!S.hiddenTasks.includes(t.i));
    if(!habits.length)return '<section class="ik-habit-stats"><p class="ik-habit-stats-empty">Добавь привычку — и здесь появится её история.</p></section>';
    const cards=habits.map(task=>{
      const events=S.habitScheduleHistory[task.i]||[],days=dates.map(date=>{
        const snapshot=Array.isArray(S.planHistory[date])?S.planHistory[date].some(x=>x.i===task.i):null;
        let event=null;for(const e of events)if(e.from<=date)event=e;else break;
        const planned=snapshot===true?true:snapshot===false?false:event&&event.from<=date?event.days.includes(new Date(date+'T12:00:00').getDay()):null;
        const done=dn(date).includes(task.i);
        // Old skip records remain stored for backup compatibility, but now mean
        // the same thing as any other uncompleted scheduled day.
        const state=done?'done':planned===true?(date===today?'today':'missed'):planned===false?'off':'unknown';
        return {date,state,planned};
      });
      const counted=days.filter(x=>x.planned===true&&(x.date<today||x.state==='done')),done=counted.filter(x=>x.state==='done').length;
      const totalKnown=days.filter(x=>x.state==='done').length;
      const status=counted.length?('Выполнено '+done+' из '+counted.length+' дней по расписанию'):
        totalKnown?'Есть '+totalKnown+' отмет. в истории · расписание отслеживается с сегодняшнего дня':'';
      const symbols={done:'✓',missed:'·',today:'○',off:'',unknown:''};
      const cells=days.map(x=>'<span class="ik-habit-dot ik-habit-dot--'+x.state+'" title="'+safe(fmtDate(x.date))+': '+safe(({done:'выполнено',missed:'не выполнено',today:'сегодня',off:'не по расписанию',unknown:'расписание раньше не записывалось'})[x.state])+'" aria-label="'+safe(shortDay[new Date(x.date+'T12:00:00').getDay()]+' '+new Date(x.date+'T12:00:00').getDate()+': '+({done:'выполнено',missed:'не выполнено',today:'сегодня',off:'не по расписанию',unknown:'нет данных о расписании'})[x.state])+'">'+symbols[x.state]+'</span>').join('');
      return '<article class="ik-habit-stat-card"><div class="ik-habit-stat-heading"><span>'+safe(task.e||'✨')+'</span><b>'+safe(task.t)+'</b></div><div class="ik-habit-dots" role="group" aria-label="Отметки за последние 14 дней">'+cells+'</div><div class="ik-habit-dates"><span>2 недели назад</span><span>сегодня</span></div>'+(status?'<p>'+safe(status)+'</p>':'')+'</article>';
    }).join('');
    const hasObservedDays=habits.some(task=>dates.some(date=>date<today&&(dn(date).includes(task.i)||(S.skipped?.[date]||[]).includes(task.i)||Array.isArray(S.planHistory[date])&&S.planHistory[date].some(x=>x.i===task.i))));
    const week=weekStart(today),previousDate=new Date();previousDate.setDate(previousDate.getDate()-7);
    const recall=S.habitRecall?.[week]||'',previousRecall=S.habitRecall?.[weekStart(iso(previousDate))]||'',recallLabels={easy:'Уже легко',sometimes:'Иногда забываю',hard:'Пока трудно'},choices=[['easy','🙂','Уже легко'],['sometimes','😐','Иногда забываю'],['hard','🤔','Пока трудно']];
    const recallHtml=hasObservedDays?'<div class="ik-habit-recall"><b>А тебе как вспоминать о привычках?</b><small>Здесь нет правильного ответа. Это не влияет на звёзды.</small><div>'+choices.map(([key,face,label])=>'<button type="button" data-action="ikHabitRecall" data-arg="'+key+'" aria-pressed="'+(recall===key)+'" class="'+(recall===key?'selected':'')+'"><span>'+face+'</span>'+label+'</button>').join('')+'</div>'+(recall?'<small role="status">Спасибо, записала твой ответ на эту неделю.</small>':'')+(previousRecall?'<small>На прошлой неделе: '+safe(recallLabels[previousRecall])+'.</small>':'')+'</div>':'';
    const contents=hasObservedDays?'<p class="ik-habit-stats-note">Смотри, как часто получается возвращаться к привычке. Перерыв не стирает прошлые шаги. Это показывает регулярность, а не ставит оценку.</p>'+cards+'<div class="ik-habit-legend"><span><i class="ik-habit-dot ik-habit-dot--done">✓</i> сделано</span><span><i class="ik-habit-dot ik-habit-dot--missed">·</i> день по расписанию без отметки</span><span><i class="ik-habit-dot ik-habit-dot--today">○</i> сегодня</span><span><i class="ik-habit-dot ik-habit-dot--unknown"></i> расписание неизвестно</span><span><i class="ik-habit-dot ik-habit-dot--off"></i> не по расписанию</span></div>'+recallHtml:'<div class="ik-habit-stats-empty">Первые отметки появятся здесь. Начинаем наблюдать с сегодняшнего дня.</div>';
    return '<details class="ik-habit-stats"><summary><span><b>Регулярность привычек</b><small>'+(hasObservedDays?'Отметки за 14 дней':'Статистика начнётся с первых отметок')+'</small></span><span class="ik-habit-stats-chevron" aria-hidden="true">⌄</span></summary><div class="ik-habit-stats-content">'+contents+'</div></details>';
  }
  ACTIONS.ikHabitRecall=(_,value)=>{
    if(!['easy','sometimes','hard'].includes(value))return;
    S.habitRecall=S.habitRecall||{};S.habitRecall[weekStart(iso(new Date()))]=value;save();render();
  };
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
      '<div class="ik-tile"><div class="ik-tile-icon">'+art('task_done','stat')+'</div><strong>'+count+'</strong><small>привычек выполнено</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon">'+art('task_star','stat')+'</div><strong>'+starsCount+'</strong><small>звёзд</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon">'+art('nav_grades','stat')+'</div><strong>'+mean+'</strong><small>средний за период</small></div></div>';
  }
  function ikToday(){
    recordAchievements();
    const d=iso(new Date()),allTasks=tasks(d),done=dn(d),count=done.length,total=allTasks.length,hasAnyHabit=taskCatalog().some(t=>!S.hiddenTasks.includes(t.i));
    const renderTask=t=>{
      const yes=done.includes(t.i),x=(S.x[d]||{})[t.i],
        sub=yes&&x&&((x.s||[]).length||x.n)?[].concat(x.s||[],x.n?[x.n]:[]).join(', '):(t.s||'');
      const details=t.i==='hw'||t.i==='ho';
      return '<div class="ik-task '+(yes?'done':'')+'"><button class="ik-check '+(yes?'done':'')+'" data-action="toggle" data-id="'+t.i+'" aria-label="'+(yes?'Снять отметку: ':'Отметить привычку: ')+safe(t.t)+'" aria-pressed="'+yes+'">'+(yes?'✓':'')+'</button>'+
        (S.customTasks.some(custom=>custom.i===t.i)?'<span class="ik-task-icon ik-task-emoji" aria-hidden="true">'+safe(t.e||'✨')+'</span>':'<span class="ik-task-icon">'+taskIcon(t)+'</span>')+'<button class="ik-task-title" data-action="'+(details?'details':'ikTaskInfo')+'" data-id="'+t.i+'">'+safe(t.t)+(sub?'<small>'+safe(sub)+'</small>':'')+'</button>'+
        '</div>';
    };
    const waiting=allTasks.filter(t=>!done.includes(t.i)),finished=allTasks.filter(t=>done.includes(t.i)),full=total>0&&count===total;
    return '<div class="ik-page ik-today">'+
      '<div class="ik-heading-with-star"><div class="ik-greeting-copy"><h1>Привет'+(S.name?', '+safe(S.name):'')+'!</h1><p class="ik-subtitle">Сегодня ещё один замечательный день!</p><span class="ik-date-pill">'+art('history','pill')+' '+safe(fmtDate(d))+'</span></div>'+star+'</div>'+
      '<div class="ik-main-card ik-today-hero"><div class="ik-sec-title ik-plan-label">Привычки на сегодня</div><div class="ik-row">'+
      '<div class="ik-progress-circle"><svg viewBox="0 0 120 120" role="img" aria-label="'+(total?'Выполнено '+count+' из '+total+' привычек':'Сегодня нет привычек по расписанию')+'"><circle cx="60" cy="60" r="49" fill="none" stroke="#e4d2ff" stroke-width="12"/><circle cx="60" cy="60" r="49" fill="none" stroke="#9161f0" stroke-width="12" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="'+(2*Math.PI*49)+'" stroke-dashoffset="'+(2*Math.PI*49*(1-count/Math.max(total,1)))+'"/></svg><div style="position:relative;text-align:center"><strong>'+ (total?count+'/'+total:'—')+'</strong><span>привычек</span></div></div>'+
      '<div class="ik-progress-side"><strong>'+(total===0?(hasAnyHabit?'Сегодня нет привычек по расписанию':'Выбери свою первую привычку'):full?'Ты всё сделала!':'У тебя получится!')+'</strong><p class="ik-caption">⭐ Сегодня '+st(d)+' звёзд</p><div style="height:8px;border-radius:10px;background:#e0cff8;overflow:hidden"><div style="width:'+perc(count,total)+'%;height:100%;background:linear-gradient(90deg,#aa7af7,#7949ec);border-radius:10px"></div></div></div></div></div>'+
      (waiting.length?'<p class="ik-muted" style="margin:10px 4px 0;text-align:center">Сегодня не получилось? Оставь привычку без отметки — завтра появится новый список.</p>':'')+
      '<div class="ik-task-list">'+(waiting.length?waiting.map(renderTask).join(''):!finished.length?'<div class="ik-empty">'+art('star_wave','empty')+'<b>'+(hasAnyHabit?'Сегодня день без привычек':'Начни с маленькой привычки')+'</b><small>'+(hasAnyHabit?'По расписанию сегодня перерыв — можно отдохнуть.':'Добавь то, что тебе хочется попробовать.')+'</small></div>':'')+
      (finished.length?'<p class="ik-muted" style="margin:12px 4px 4px">Уже выполнено</p>'+finished.map(renderTask).join(''):'')+'</div>'+
      '<button type="button" class="ik-add-habit" data-action="ikManageHabits"><span aria-hidden="true">✎</span> Редактировать привычки</button>'+
      '<p class="ik-muted" style="text-align:center">Маленькие шаги тоже считаются!</p></div>';
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
  const achievementDefs=[
    {title:'Первый шаг',small:'Сделать первую привычку',icon:'achievement_first',test:x=>x.done>=1},
    {title:'Десятка',small:'10 выполненных привычек',icon:'achievement_gift',test:x=>x.done>=10},
    {title:'Мастер привычек',key:'Мастер дел',small:'50 выполненных привычек',icon:'achievement_master',test:x=>x.done>=50},
    {title:'Сотня',small:'100 выполненных привычек',icon:'achievement_master',test:x=>x.done>=100},
    {title:'Марафонец',small:'200 выполненных привычек',icon:'achievement_walk',test:x=>x.done>=200},
    {title:'Три дня подряд',small:'3 дня с привычками',icon:'achievement_streak',test:x=>x.streak>=3},
    {title:'Постоянство',small:'7 дней подряд',icon:'achievement_streak',test:x=>x.streak>=7},
    {title:'Две недели',small:'14 дней подряд',icon:'achievement_streak',test:x=>x.streak>=14},
    {title:'Помощник',small:'Помочь по дому 10 раз',icon:'achievement_helper',test:x=>x.help>=10},
    {title:'Суперпомощник',small:'Помочь по дому 30 раз',icon:'achievement_helper',test:x=>x.help>=30},
    {title:'Усердие',small:'Учиться в 10 разных дней',icon:'achievement_grades',test:x=>x.school>=10},
    {title:'Книголюб',small:'Читать в 10 разных дней',icon:'achievement_read',test:x=>x.read>=10},
    {title:'Все привычки дня',key:'Идеальный день',small:'Выполнить все привычки за день',icon:'achievement_master',test:x=>x.full>=1},
    {title:'Пять звёздных дней',small:'5 полностью выполненных дней',icon:'achievement_grades',test:x=>x.full>=5},
    {title:'Звёздная неделя',small:'Собрать 20 звёзд за неделю',icon:'achievement_gift',test:x=>x.bestWeek>=20},
    {title:'Воскресная звезда',small:'Три воскресенья с привычками',icon:'achievement_streak',test:x=>x.sundays>=3},
    {title:'Понедельник — супер!',small:'Три понедельника с привычками',icon:'achievement_first',test:x=>x.mondays>=3},
    {title:'Возвращение',small:'Вернуться к привычке после перерыва',icon:'achievement_walk',test:x=>x.comeback},
    {title:'Художник',small:'5 дней рисования по выбору',icon:'achievement_first',test:x=>x.draw>=5},
    {title:'Сказочник',small:'5 придуманных историй',icon:'achievement_read',test:x=>x.story>=5},
    {title:'Самостоятельность',small:'5 занятий по собственному выбору',icon:'achievement_grades',test:x=>x.joy>=5}
  ];
  function progressFacts(){
    const dates=Object.keys(S.d||{}).filter(d=>dn(d).length>0).sort(),allDates=Object.keys(S.d||{});
    const done=completed(),weekTotals={};
    let full=0,help=0,school=0,read=0,sundays=0,mondays=0,comeback=false;
    for(const d of allDates){
      const ids=dn(d);
      if(ids.includes('ho'))help++;
      if(ids.includes('hw')||ids.includes('en'))school++;
      if(ids.includes('rd'))read++;
      if(ids.length>0&&ids.length===tasks(d).length)full++;
      if(ids.length>0){
        const weekday=new Date(d+'T12:00:00').getDay();
        if(weekday===0)sundays++;if(weekday===1)mondays++;
      }
      const week=weekStart(d);weekTotals[week]=(weekTotals[week]||0)+st(d);
    }
    for(let i=1;i<dates.length;i++){
      if((new Date(dates[i]+'T12:00:00')-new Date(dates[i-1]+'T12:00:00'))/86400000>=4)comeback=true;
    }
    let joy=0,draw=0,story=0;
    for(const [d,isDone] of Object.entries(S.joyDone||{})){
      if(!isDone)continue;joy++;
      if(S.joyChoices?.[d]==='draw')draw++;
      if(S.joyChoices?.[d]==='story')story++;
    }
    return {done,streak:bestStreak(),help,school,read,full,sundays,mondays,comeback,joy,draw,story,
      bestWeek:Math.max(0,...Object.values(weekTotals))};
  }
  const achievementKey=a=>a.key||a.title;
  function recordAchievements(){
    S.earnedAchievements=S.earnedAchievements&&typeof S.earnedAchievements==='object'?S.earnedAchievements:{};
    const facts=progressFacts();
    let changed=false;
    for(const a of achievementDefs){
      const key=achievementKey(a);
      if(a.test(facts)&&!S.earnedAchievements[key]){
        S.earnedAchievements[key]=iso(new Date());changed=true;
      }
    }
    if(changed)save();
  }
  function ikReward(){
    recordAchievements();
    const dates=weekDates(),tw=dates.reduce((n,d)=>n+st(d),0),total=earned(),l=currentLevel();
    const next=levels[l+1],prev=levels[l][0],progress=next?perc(total-prev,next[0]-prev):100;
    const count=achievementDefs.filter(x=>S.earnedAchievements[achievementKey(x)]).length;
    const legacy=S.earnedAchievements['Отличные оценки'];
    const tile=a=>{const key=achievementKey(a);return '<div class="ik-achievement '+(S.earnedAchievements[key]?'':'locked')+'"><span class="icon">'+art(a.icon,'achievement')+'</span><b>'+safe(a.title)+'</b><small>'+safe(S.earnedAchievements[key]?'Получено '+S.earnedAchievements[key]:a.small)+'</small></div>'};
    const weekDay=(date,i)=>{
      const planned=tasks(date),done=planned.filter(task=>dn(date).includes(task.i)).length,required=planned.length,pct=required?Math.round(100*done/required):0;
      const label=required?DN[i]+': выполнено '+done+' из '+required+' привычек':DN[i]+': привычек по расписанию не было';
      return '<button class="ik-week-day" data-action="ikWeekDay" data-id="'+date+'" aria-label="'+label+'"><div class="ik-week-progress '+(required?'':'is-empty')+'" '+(required?'style="--ik-week-progress:'+pct+'%"':'')+' aria-hidden="true"><b>'+(required?done+'/'+required:'—')+'</b></div><span>'+DN[i]+'</span></button>';
    };
    return '<div class="ik-page ik-reward"><div class="ik-heading ik-subscreen-header"><button class="ik-header-back" data-action="ikToToday" aria-label="Вернуться к привычкам">‹</button><h1>Звёзды</h1><button class="ik-cloud-pill ik-achievements-link" data-action="ikJumpAchievements" aria-label="Мои достижения">'+art('task_star','tiny')+'<span class="ik-achievements-text">Достижения</span></button></div>'+
      '<div class="ik-main-card ik-reward-hero">'+art('cloud','decor-cloud')+art('sparkles','decor-sparkles')+
      '<div class="ik-hero-split">'+star+'<div style="flex:1"><b>Мои звёзды</b><div class="ik-row" style="gap:7px"><span class="ik-number" style="font-size:43px">'+total+'</span><span style="font-size:25px">⭐</span></div><div class="ik-caption">Собирай звёзды и открывай новые уровни!</div></div></div>'+
      '<div class="ik-level-track"><div style="width:'+progress+'%"></div></div></div>'+
      '<div class="card ik-week">'+dates.map(weekDay).join('')+'</div>'+
      '<div class="ik-action-row ik-level-summary" role="group"><span class="ik-action-icon">'+art('achievement_master','action')+'</span><span style="flex:1"><b>'+safe(levels[l][1])+'</b><small>Уровень '+(l+1)+' · '+tw+' ⭐ за неделю</small><div class="ik-level-track"><div style="width:'+progress+'%"></div></div><small>'+(next?'До следующего уровня: '+Math.max(0,next[0]-total)+' звёзд':'Высший уровень!')+'</small></span><button class="ik-btn-small" data-action="ikLevels">Уровни ›</button></div>'+
      '<div class="ik-row-between" id="ik-achievements"><h2 class="ik-sec-title">Достижения</h2><span class="ik-tab-sublabel">'+count+' из '+achievementDefs.length+'</span></div>'+
      '<div class="ik-achievements">'+achievementDefs.slice(0,6).map(tile).join('')+'</div>'+
      '<details class="ik-joy-all-achievements"><summary>Все достижения · '+achievementDefs.length+' <span aria-hidden="true">⌄</span></summary><div class="ik-achievements">'+achievementDefs.slice(6).map(tile).join('')+'</div></details>'+
      (legacy?'<p class="ik-muted">Старое достижение «Отличные оценки» тоже сохранено в истории.</p>':'')+
      '<p class="ik-muted">Звёзды не обнуляются: новые уровни открываются по мере накопления. Достижения не исчезают.</p></div>';
  }
  function ikProfile(){
    recordAchievements();
    const l=currentLevel(),total=earned(),next=levels[l+1],step=next?next[0]-levels[l][0]:0,gained=total-levels[l][0],prog=next?perc(gained,step):100;
    function item(icon,title,subtitle,action){return '<button class="ik-action-row" data-action="'+action+'"><span class="ik-action-icon">'+art(icon,'action')+'</span><span style="flex:1"><b>'+title+'</b>'+(subtitle?'<small>'+safe(subtitle)+'</small>':'')+'</span><span class="ik-chevron">›</span></button>'}
    return '<div class="ik-page ik-profile"><div class="ik-heading ik-subscreen-header"><span class="ik-header-spacer" aria-hidden="true"></span><h1>Профиль</h1><button class="ik-top-link ik-settings-link" data-action="ikPersonalSettings" aria-label="Личные настройки">'+art('settings','tiny')+'<span class="ik-settings-text">Настройки</span></button></div>'+
      '<div class="card ik-profile-card"><div class="ik-avatar" aria-label="Аватар">'+art('portrait','avatar')+'<span class="ik-avatar-choice" aria-label="Выбранный символ">'+safe(S.av.e)+'</span></div><div class="ik-profile-body"><strong>'+safe(S.name||'Полина')+' ✨</strong><small>'+safe(levels[l][1])+' · уровень '+(l+1)+'</small><div class="ik-level-track"><div style="width:'+prog+'%"></div></div><small>'+(next?Math.max(0,gained)+' из '+step+' звёзд до уровня':'Все уровни пройдены')+'</small></div><button class="ik-mini-btn" data-action="profile" aria-label="Изменить профиль">✎</button></div>'+
      '<div class="ik-row-between"><h2 class="ik-sec-title">Моя статистика</h2><button class="ik-top-link" data-action="ikProfileWindow">'+profileWindowLabel()+' ▾</button></div>'+statsTiles()+habitRegularity()+
      '<div class="ik-list">'+item('task_star','Мои привычки','Добавить привычку или изменить дни','ikManageHabits')+
      item('heart','Мои интересы',S.interests||'Добавь то, что тебе нравится','ikInterests')+
      item('history','История привычек','Что было в прошлые дни','history')+
      item('task_star','Мои звёзды','Уровни и достижения','ikToReward')+
      item('nav_grades','Школа','Предметы и отметки из дневника','ikToGrades')+'</div>'+
      '<div class="ik-list">'+item('settings','Для родителей','Настройки и резервная копия','parents')+
      item('info','О приложении','Искра · твой день и достижения','ikAbout')+'</div></div>';
  }
  today=ikToday;reward=ikReward;me=ikProfile;

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
    sheet('<h2>'+safe(task.t)+'</h2><p class="mu sm">'+safe(task.s||'Привычка на сегодня')+'</p><div data-sheet-footer><button class="btn" data-action="ikTaskDone" data-id="'+safe(id)+'">'+(done?'Снять отметку':'Отметить выполненной')+'</button><button class="btn g" data-action="ikHabitHide" data-id="'+safe(id)+'">Убрать из привычек</button></div>');
  };
  ACTIONS.ikTaskDone=(id)=>{cs();toggleTask(id)};
  ACTIONS.ikPersonalSettings=()=>sheet('<h2>Мои настройки</h2><button class="btn g" data-action="profile">Имя и аватар</button><button class="btn g" data-action="ikInterests">Мои интересы</button><p class="mu sm">Управление привычками — в профиле, в разделе «Мои привычки».</p>');
  // Real-world reward actions are retired. Historical records stay in backups.
  ACTIONS.ikLevels=()=>sheet('<h2>Твои уровни</h2>'+levels.map((lv,i)=>'<div class="row"><b>'+(i+1)+'. '+safe(lv[1])+'</b><span class="mu">'+lv[0]+' ⭐</span></div>').join('')+'<p class="mu sm">Звёзды за привычки помогают переходить на новые уровни.</p>');
  ACTIONS.ikAbout=()=>sheet('<h2>Об Искре</h2><p>«Искра» помогает замечать свои привычки, радоваться достижениям и узнавать школьные оценки.</p><p class="mu sm">Оценки загружаются из школьного дневника через защищённое подключение. Звёзды и отметки привычек сохраняются на этом устройстве.</p>');
  ACTIONS.ikInterests=()=>sheet('<h2>Мои интересы</h2><p class="mu sm">Что тебе нравится? Например, чтение, спорт или рисование.</p><input id="ikInterestInput" maxlength="100" value="'+safe(S.interests)+'" placeholder="Мои увлечения"><button data-sheet-footer class="btn" data-action="ikSaveInterests">Сохранить</button>');
  ACTIONS.ikSaveInterests=()=>{const x=document.getElementById('ikInterestInput');if(x)S.interests=x.value.trim().slice(0,100);save();cs();render()};
  // Child-facing habit management. Existing task IDs and frozen daily records are kept intact.
  const quickHabitIdeas=[
    {id:'draw',title:'Порисовать 10 минут',icon:'🎨'},
    {id:'walk',title:'Прогуляться',icon:'🚶'},
    {id:'story',title:'Придумать историю',icon:'📖'}
  ];
  const habitDays=[['Пн',1],['Вт',2],['Ср',3],['Чт',4],['Пт',5],['Сб',6],['Вс',0]];
  let habitFormDraft=null,childScheduleDraft=null;
  const daysForHabit=id=>Array.isArray(S.taskDays[id])?S.taskDays[id]:(defaultDays[id]||[0,1,2,3,4,5,6]);
  const daysLabel=days=>days.length===7?'Каждый день':days.length===5&&[1,2,3,4,5].every(d=>days.includes(d))?'По будням':days.length===2&&[0,6].every(d=>days.includes(d))?'По выходным':habitDays.filter(day=>days.includes(day[1])).map(day=>day[0]).join(', ')||'Дни не выбраны';
  function snapshotHabitToday(task,days){
    const date=iso(new Date()),weekday=new Date(date+'T12:00:00').getDay();
    if(!Array.isArray(S.planHistory[date]))freezeDay(date);
    const plan=S.planHistory[date];
    if(days.includes(weekday)&&!plan.some(item=>item.i===task.i))plan.push({...task});
  }
  function preserveTodayStarBonus(){
    const date=iso(new Date()),required=tasks(date).length;
    S.starBonusTargets=S.starBonusTargets&&typeof S.starBonusTargets==='object'?S.starBonusTargets:{};
    S.starBonusTargets[date]=Math.max(S.starBonusTargets[date]||0,required);
    if(required>0&&dn(date).length===required)S.starBonusHistory[date]=true;
  }
  function habitManager(){
    const catalog=taskCatalog(),date=iso(new Date());
    const active=catalog.filter(t=>!S.hiddenTasks.includes(t.i)&&(t.i!=='ex'||date>=S.ex));
    const archived=catalog.filter(t=>S.hiddenTasks.includes(t.i));
    const activeRows=active.length?active.map(t=>'<div class="ik-habit-manage-row"><span class="ik-habit-manage-icon">'+safe(t.e||'✨')+'</span><span class="ik-habit-manage-copy"><b>'+safe(t.t)+'</b><small>'+safe(daysLabel(daysForHabit(t.i)))+'</small></span><button type="button" class="ik-habit-days-button" data-action="ikHabitSchedule" data-id="'+safe(t.i)+'" aria-label="Дни привычки '+safe(t.t)+'">Дни</button><button type="button" class="ik-habit-remove" data-action="ikHabitHide" data-id="'+safe(t.i)+'" aria-label="Убрать привычку '+safe(t.t)+'">Убрать</button></div>').join(''):'<p class="mu sm">Пока нет привычек. Выбери идею ниже или придумай свою.</p>';
    const archivedRows=archived.map(t=>'<div class="ik-habit-manage-row"><span class="ik-habit-manage-icon">'+safe(t.e||'✨')+'</span><span class="ik-habit-manage-copy"><b>'+safe(t.t)+'</b><small>Прошлые отметки сохранены</small></span><button type="button" class="ik-habit-restore" data-action="ikHabitRestore" data-id="'+safe(t.i)+'">Вернуть</button></div>').join('');
    const ideaTiles=quickHabitIdeas.map(item=>'<button type="button" class="ik-habit-idea" data-action="ikHabitPreset" data-id="'+item.id+'"><span aria-hidden="true">'+item.icon+'</span><b>'+safe(item.title)+'</b></button>').join('');
    sheet('<h2>Привычки</h2><div class="ik-habit-manager"><p class="mu sm">Выбирай привычки сама. Убранные привычки можно вернуть, а прошлые отметки останутся.</p><h3>Мои привычки</h3><div class="ik-habit-manage-list">'+activeRows+'</div>'+
      (archived.length?'<details class="ik-habit-archive"><summary>Убранные привычки · '+archived.length+'</summary><div class="ik-habit-manage-list">'+archivedRows+'</div></details>':'')+
      '<h3>Идеи для привычки</h3><div class="ik-habit-ideas">'+ideaTiles+'<button type="button" class="ik-habit-idea ik-habit-own" data-action="ikHabitCustom"><span aria-hidden="true">＋</span><b>Своя привычка</b></button></div></div>','ik-habit-manager');
  }
  function habitForm(){
    if(!habitFormDraft)return habitManager();
    const d=habitFormDraft;
    sheet('<h2>Новая привычка</h2><div class="ik-habit-form"><p class="mu sm">Выбери дни. Подсказку для себя можно добавить по желанию.</p>'+
      '<label class="sheet-field">Название привычки<input id="ik-habit-name" maxlength="45" value="'+safe(d.name)+'" placeholder="Например, почитать 10 минут"></label>'+
      '<label class="sheet-field">Подсказка для себя <span class="mu sm">Необязательно</span><input id="ik-habit-cue" maxlength="50" value="'+safe(d.cue)+'" placeholder="Например, после ужина"></label>'+
      '<div class="ik-habit-day-group"><b>В какие дни?</b><div class="ik-habit-day-picker">'+habitDays.map(([label,wd])=>'<button type="button" id="ik-habit-day-'+wd+'" class="ik-habit-day '+(d.days.includes(wd)?'on':'')+'" data-action="ikHabitFormDay" data-arg="'+wd+'" aria-pressed="'+d.days.includes(wd)+'">'+label+'</button>').join('')+'</div></div></div>'+
      '<div data-sheet-footer><button type="button" class="btn g" data-action="ikHabitBack">Отмена</button><button type="button" class="btn" data-action="ikHabitSave">Добавить</button></div>','ik-habit-form');
  }
  function captureHabitForm(){
    const name=document.getElementById('ik-habit-name'),cue=document.getElementById('ik-habit-cue');
    if(habitFormDraft&&name)habitFormDraft.name=name.value;
    if(habitFormDraft&&cue)habitFormDraft.cue=cue.value;
  }
  function openHabitForm(draft){
    draft.initial={name:draft.name,cue:draft.cue,days:draft.days.slice()};
    habitFormDraft=draft;habitForm();
  }
  function sameDays(a,b){return a.length===b.length&&a.every(day=>b.includes(day))}
  function canLeaveHabitDraft(){
    let dirty=false;
    if(habitFormDraft){
      captureHabitForm();
      const original=habitFormDraft.initial;
      dirty=habitFormDraft.name!==original.name||habitFormDraft.cue!==original.cue||!sameDays(habitFormDraft.days,original.days);
    }else if(childScheduleDraft){
      dirty=!sameDays(childScheduleDraft.days,daysForHabit(childScheduleDraft.id));
    }
    if(dirty&&!confirm('Выйти без сохранения? Изменения пропадут.'))return false;
    habitFormDraft=null;childScheduleDraft=null;return true;
  }
  window.ikHabitCanCloseSheet=canLeaveHabitDraft;
  function setHabitHidden(id,hidden,showToast=true){
    const task=taskCatalog().find(t=>t.i===id);if(!task)return;
    preserveTodayStarBonus();
    const at=S.hiddenTasks.indexOf(id),date=iso(new Date());
    if(hidden&&at<0){freezeDay(date);S.hiddenTasks.push(id)}
    if(!hidden&&at>=0)S.hiddenTasks.splice(at,1);
    if(!hidden)snapshotHabitToday(task,daysForHabit(id));
    save();render();habitManager();
    if(showToast&&hidden)toast('Привычка убрана. История сохранена.',{action:'Вернуть',onAction:()=>setHabitHidden(id,false,false)});
    else if(showToast&&!hidden)toast('Привычка снова в списке');
  }
  ACTIONS.ikManageHabits=()=>{habitFormDraft=null;childScheduleDraft=null;habitManager()};
  ACTIONS.ikHabitPreset=id=>{
    const item=quickHabitIdeas.find(x=>x.id===id);if(!item)return;
    openHabitForm({name:item.title,cue:'',icon:item.icon,days:[1,2,3,4,5]});
  };
  ACTIONS.ikHabitCustom=()=>openHabitForm({name:'',cue:'',icon:'✨',days:[1,2,3,4,5]});
  ACTIONS.ikHabitBack=()=>{if(canLeaveHabitDraft())habitManager()};
  ACTIONS.ikHabitFormDay=(_,__,el)=>{
    captureHabitForm();const day=Number(el.dataset.arg);if(!Number.isInteger(day)||day<0||day>6)return;
    const at=habitFormDraft.days.indexOf(day);if(at>=0)habitFormDraft.days.splice(at,1);else habitFormDraft.days.push(day);
    habitForm();
  };
  ACTIONS.ikHabitSave=()=>{
    captureHabitForm();const name=habitFormDraft?.name.trim().slice(0,45),cue=habitFormDraft?.cue.trim().slice(0,50)||'',days=habitFormDraft?.days||[];
    if(!name)return toast('Напиши название привычки');
    if(!days.length)return toast('Выбери хотя бы один день');
    if(S.customTasks.length>=30)return toast('Достигнут лимит привычек');
    const normalized=name.toLocaleLowerCase('ru-RU');
    if(taskCatalog().some(t=>t.t.trim().toLocaleLowerCase('ru-RU')===normalized))return toast('Такая привычка уже есть');
    const id='user-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,5),date=iso(new Date());
    preserveTodayStarBonus();
    const task={i:id,e:habitFormDraft.icon||'✨',t:name,...(cue?{s:cue}:{})};
    S.customTasks.push(task);S.taskDays[id]=days.slice();S.taskCategories[id]='personal';S.hiddenTasks=S.hiddenTasks.filter(x=>x!==id);
    S.habitScheduleHistory=S.habitScheduleHistory||{};S.habitScheduleHistory[id]=[{from:date,days:days.slice()}];
    snapshotHabitToday(task,days);
    save();habitFormDraft=null;render();habitManager();toast('Привычка добавлена');
  };
  ACTIONS.ikHabitHide=id=>setHabitHidden(id,true);
  ACTIONS.ikHabitRestore=id=>setHabitHidden(id,false);
  function renderChildSchedule(){
    if(!childScheduleDraft)return;
    const task=taskCatalog().find(t=>t.i===childScheduleDraft.id);if(!task)return habitManager();
    sheet('<h2>Дни привычки</h2><div class="ik-habit-form"><p class="mu sm">'+safe(task.t)+' будет появляться в выбранные дни.</p><div class="ik-habit-day-group"><b>В какие дни?</b><div class="ik-habit-day-picker">'+habitDays.map(([label,wd])=>'<button type="button" id="ik-habit-day-'+wd+'" class="ik-habit-day '+(childScheduleDraft.days.includes(wd)?'on':'')+'" data-action="ikHabitScheduleDay" data-arg="'+wd+'" aria-pressed="'+childScheduleDraft.days.includes(wd)+'">'+label+'</button>').join('')+'</div></div></div><div data-sheet-footer><button type="button" class="btn g" data-action="ikHabitBackToManage">Отмена</button><button type="button" class="btn" data-action="ikHabitScheduleSave">Сохранить</button></div>','ik-habit-schedule');
  }
  ACTIONS.ikHabitSchedule=id=>{
    if(!taskCatalog().some(t=>t.i===id))return;
    childScheduleDraft={id,days:daysForHabit(id).slice()};renderChildSchedule();
  };
  ACTIONS.ikHabitScheduleDay=(_,__,el)=>{
    if(!childScheduleDraft)return;const day=Number(el.dataset.arg);if(!Number.isInteger(day)||day<0||day>6)return;
    const at=childScheduleDraft.days.indexOf(day);if(at>=0)childScheduleDraft.days.splice(at,1);else childScheduleDraft.days.push(day);
    renderChildSchedule();
  };
  ACTIONS.ikHabitBackToManage=()=>{if(canLeaveHabitDraft())habitManager()};
  ACTIONS.ikHabitScheduleSave=()=>{
    if(!childScheduleDraft)return;
    if(!childScheduleDraft.days.length)return toast('Оставь хотя бы один день или убери привычку из списка');
    const id=childScheduleDraft.id;preserveTodayStarBonus();S.taskDays[id]=childScheduleDraft.days.slice();
    S.habitScheduleHistory=S.habitScheduleHistory||{};S.habitScheduleHistory[id]=S.habitScheduleHistory[id]||[];
    const today=iso(new Date()),history=S.habitScheduleHistory[id],entry={from:today,days:childScheduleDraft.days.slice()};
    const existing=history.findIndex(e=>e.from===today);if(existing>=0)history[existing]=entry;else history.push(entry);
    history.sort((a,b)=>a.from.localeCompare(b.from));
    const task=taskCatalog().find(t=>t.i===id);if(task&&!S.hiddenTasks.includes(id))snapshotHabitToday(task,childScheduleDraft.days);
    save();childScheduleDraft=null;render();habitManager();toast('Расписание сохранено');
  };
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
  const baseParents=ACTIONS.parents;
  ACTIONS.parents=()=>{
    baseParents();
    const b=document.querySelector('.sheet-body');
    if(!b)return;
    const extra=document.createElement('div'),session=window.schoolCloud?.connection?.();
    const status=session?.isConnected
      ? '<p class="mu sm">Подключено: '+safe(session.email||'учётная запись Полины')+'</p><button class="btn g" type="button" data-sc-action="logout">Выйти из дневника</button>'
      : '<p class="mu sm">Подключи дневник один раз — дальше оценки загружаются автоматически.</p>'+ (window.schoolCloud?.loginHtml?.()||'');
    extra.innerHTML='<h2>Периоды школьных оценок</h2><button class="btn g" data-action="ikGradePeriods">Границы четвертей</button><h2>Школьный дневник</h2>'+status+
      '<div class="ik-parent-offline"><p class="mu sm">Офлайн-копия оценок: '+(window.schoolCloud?.offlineEnabled?.()?'включена':'выключена')+'. Если включить, оценки сохраняются на этом устройстве без шифрования.</p><button class="btn g" data-action="ikOfflineToggle">'+(window.schoolCloud?.offlineEnabled?.()?'Отключить офлайн-копию':'Разрешить офлайн-копию')+'</button></div>';
    b.prepend(extra);
  };
  window.addEventListener('schoolCloudUpdated',recordAchievements);
  document.querySelectorAll('.bar button').forEach((b,i)=>{
    const icon=['nav_today','nav_grades','task_star','avatar_girl'][i];
    const text=['Сегодня','Школа','Звёзды','Профиль'][i];
    b.innerHTML=art(icon,'nav')+text;
  });
  let lastViewedDate=iso(new Date());
  const refreshDate=()=>{
    const current=iso(new Date());
    if(current!==lastViewedDate){lastViewedDate=current;if(tab==='t'||tab==='r')render()}
  };
  window.addEventListener('pageshow',()=>{S=store.load();S.interests=S.interests||'';refreshDate();render()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDate()});
  setInterval(()=>{if(!document.hidden)refreshDate()},60000);
  render();
})();
