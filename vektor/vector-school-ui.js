/* Vector school diary view. Read-only Firebase snapshot, no stored grades. */
(function () {
'use strict';
const palette=['#2463c9','#087c68','#8e54b7','#bb5036','#ad3474'];
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const fmt = v => v===null||v===undefined||!Number.isFinite(v)?'—':v.toFixed(2).replace('.',',');
const dateLabel = s => String(s||'').split('-').reverse().join('.');
const safeDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'');
const compareGrade = (a,b) => a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id));
const byDate = rows => rows.slice().sort(compareGrade);
const currentDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function cumulative(rows) {
  const ordered=byDate(rows.filter(g=>!g.official&&Number.isFinite(g.score)&&g.score>=2&&g.score<=5&&safeDate(g.date)));
  const points=[];let sum=0,count=0;
  for(const g of ordered) {
    sum+=g.score;count++;
    const last=points[points.length-1];
    if(last&&last.date===g.date){last.average=sum/count;last.count=count;last.newGrades.push(g);}
    else points.push({date:g.date,average:sum/count,count,newGrades:[g]});
  }
  return points;
}
/* Weekly change in the cumulative period average, not the average of
   a separate seven-day batch. Require at least two earlier marks and
   one new mark. Official quarter marks do not enter the calculation. */
function subjectDelta7(rows,range,now=currentDate()){
 if(!range)return null;
 const end=range.to<now?range.to:now;
 if(end<range.from)return null;
 const threshold=new Date(end+'T12:00:00Z');
 if(Number.isNaN(threshold.valueOf()))return null;
 threshold.setUTCDate(threshold.getUTCDate()-7);
 const cutoff=threshold.toISOString().slice(0,10);
 const all=byDate(works(rows).filter(g=>g.date>=range.from&&g.date<=end));
 const before=all.filter(g=>g.date<=cutoff);
 const recent=all.filter(g=>g.date>cutoff);
 if(before.length<2||recent.length<1)return null;
 const value=average(all)-average(before);
 return Math.abs(value)<0.005?0:value;
}
function quarterFromType(g){
 if(!g?.official||g.officialLabel!=='За четверть')return null;
 const name=String(g.type||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 const n=name.match(/(?:^|\s)([1-4])\s*(?:[-–]\s*[яй])?\s*четверт/);
 if(n)return Number(n[1]);
 const roman=name.match(/(?:^|\s)(iv|iii|ii|i)\s*четверт/);
 return roman?({i:1,ii:2,iii:3,iv:4})[roman[1]]:null;
}
function gradeQuarter(g,periods,year){
 const explicit=quarterFromType(g);
 if(explicit)return explicit;
 for(const q of [1,2,3,4]){
  const p=periods?.[year]?.[String(q)];
  if(p&&safeDate(p.from)&&safeDate(p.to)&&g.date>=p.from&&g.date<=p.to)return q;
 }
 return null;
}
function officialInQuarter(snapshot,periods,year,quarter,subject) {
 const yearStart=Number(year.slice(0,4)),from=yearStart+'-09-01',to=(yearStart+1)+'-08-31';
 return (snapshot?.grades||[]).filter(g=>g.subject===subject&&g.official&&g.officialLabel==='За четверть'&&g.date>=from&&g.date<=to&&gradeQuarter(g,periods,year)===Number(quarter)).sort(compareGrade).at(-1)||null;
}
function officialInYear(snapshot,year,subject) {
 const start=Number(year.slice(0,4));
 return (snapshot?.grades||[]).filter(g=>g.subject===subject&&g.official&&g.officialLabel==='За год'&&g.date>=start+'-09-01'&&g.date<=(start+1)+'-08-31').sort(compareGrade).at(-1)||null;
}
function termState(period,official,now) {
 if(official)return {type:'official',label:'Официально',value:official.score};
 if(!period)return {type:'unset',label:'Даты не заданы',value:null};
 if(now>period.to)return {type:'waiting',label:'Ждём итог из журнала',value:null};
 if(now<period.from)return {type:'future',label:'Четверть ещё не началась',value:null};
 return {type:'active',label:'Предварительный прогноз',value:null};
}
function rangeRows(snapshot,range) {
 return snapshot&&range?(snapshot.grades||[]).filter(g=>g.date>=range.from&&g.date<=range.to):[];
}
function works(rows) {return rows.filter(g=>!g.official&&Number.isFinite(g.score)&&g.score>=2&&g.score<=5);}
function average(rows) {return rows.length?rows.reduce((v,g)=>v+g.score,0)/rows.length:null;}
/* Classification is visual only: it does not affect grade weights or forecasts.
   Unknown source types keep their original label with no badge. */
function workBadgeKind(type) {
 const value=String(type||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
 if(/контрольн/.test(value)||/(?:^|[^а-яa-z0-9])к[\s./-]*р(?=$|[^а-яa-z0-9])/.test(value))return 'КР';
 if(/самостоят/.test(value)||/(?:^|[^а-яa-z0-9])с[\s./-]*р(?=$|[^а-яa-z0-9])/.test(value))return 'СР';
 return '';
}
function workBadge(type) {
 const kind=workBadgeKind(type);
 if(!kind)return '';
 const title=kind==='КР'?'Контрольная работа':'Самостоятельная работа';
 return '<span class="school-work-badge school-work-badge-'+(kind==='КР'?'control':'independent')+'" title="'+title+'" aria-label="'+title+'">'+kind+'</span>';
}
function button(label,action,extra='') {return '<button type="button" class="button '+extra+'" data-action="'+action+'">'+esc(label)+'</button>';}
function header(ui) {
 return '<div class="page-title"><div><h1>Школа</h1><div class="sub">Дневник с аналитикой</div></div></div>'+
 '<div class="school-tabs" role="group" aria-label="Раздел школы">'+
 ['overview','finals'].map((x,i)=>'<button type="button" data-action="school-view" data-id="'+x+'" class="school-tab '+((ui.schoolScreen||'overview')===x?'active':'')+'">'+(i?'Итоги':'Дневник')+'</button>').join('')+
 '</div>';
}
/* Least-squares straight trend across dated cumulative averages. The trend
   spans actual grade dates only; it is not a forecast for later dates. */
function linearTrend(points) {
 if(points.length<3)return null;
 const t0=Date.parse(points[0].date+'T12:00:00Z');
 const samples=points.map(p=>({x:(Date.parse(p.date+'T12:00:00Z')-t0)/86400000,y:p.average}));
 if(samples.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const n=samples.length,meanX=samples.reduce((a,p)=>a+p.x,0)/n,meanY=samples.reduce((a,p)=>a+p.y,0)/n;
 const denominator=samples.reduce((a,p)=>a+(p.x-meanX)**2,0);
 if(denominator<=0)return null;
 const slope=samples.reduce((a,p)=>a+(p.x-meanX)*(p.y-meanY),0)/denominator;
 const intercept=meanY-slope*meanX;
 const bound=v=>Math.max(2,Math.min(5,v));
 return {first:bound(intercept),last:bound(intercept+slope*samples.at(-1).x),slope};
}

function chart(series,range) {
 const available=series.filter(s=>s.points.length);
 if(!available.length)return '<div class="empty">Пока недостаточно обычных оценок для графика.</div>';
 const width=560,height=226,left=39,right=12,top=14,bottom=35;
 const start=Date.parse((range?.from||available.flatMap(s=>s.points).map(p=>p.date).sort()[0])+'T12:00:00');
 const latest=available.flatMap(s=>s.points).map(p=>p.date).sort().at(-1);
 const endDate=range?.to||latest;
 const final=Date.parse((endDate<currentDate()?endDate:currentDate())+'T12:00:00');
 const end=Math.max(start+86400000,final,Date.parse(latest+'T12:00:00'));
 const X=d=>left+(Math.max(start,Math.min(end,Date.parse(d+'T12:00:00')))-start)/(end-start)*(width-left-right);
 const Y=v=>top+(5-v)/3*(height-top-bottom);
 const grid=[2,3,4,5].map(n=>'<line x1="'+left+'" x2="'+(width-right)+'" y1="'+Y(n)+'" y2="'+Y(n)+'" stroke="#e5ebf5"/><text x="'+(left-9)+'" y="'+(Y(n)+4)+'" text-anchor="end" font-size="12" fill="#6f7f94">'+n+'</text>').join('');
 const plot=available.map(line=>{
  const points=line.points.map(p=>X(p.date).toFixed(1)+','+Y(p.average).toFixed(1)).join(' ');
  const curve=line.points.length>1?'<polyline points="'+points+'" fill="none" stroke="'+line.color+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>':'';
  const trend=linearTrend(line.points);
  const trendLine=trend?'<line class="school-chart-trend" x1="'+X(line.points[0].date).toFixed(1)+'" y1="'+Y(trend.first).toFixed(1)+
   '" x2="'+X(line.points.at(-1).date).toFixed(1)+'" y2="'+Y(trend.last).toFixed(1)+
   '" stroke="#c96d28" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round"><title>Линия тренда — направление изменения среднего, не прогноз</title></line>':'';
  return curve+trendLine+line.points.map(p=>{
   const gradeLabels=p.newGrades.map(g=>g.score+' '+g.subject+(g.type?' ('+g.type+')':'')).join('; ');
   const tooltip=(line.name?line.name+' — ':'')+dateLabel(p.date)+', средний '+fmt(p.average)+
    ', всего '+p.count+' оценок; за день: '+gradeLabels;
   return '<circle cx="'+X(p.date).toFixed(1)+'" cy="'+Y(p.average).toFixed(1)+'" r="4.2" fill="'+line.color+'" stroke="white" stroke-width="1.4">'+
    '<title>'+esc(tooltip)+'</title></circle>';
  }).join('');
 }).join('');
 const first=range?.from||available.flatMap(s=>s.points).map(p=>p.date).sort()[0];
 const endTime=new Date(end);
 const last=String(endTime.getFullYear())+'-'+String(endTime.getMonth()+1).padStart(2,'0')+'-'+String(endTime.getDate()).padStart(2,'0');
 const hasTrend=available.some(line=>linearTrend(line.points));
 return '<svg class="school-plot" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="График накопленного среднего балла от 2 до 5 с линией тренда при достаточном количестве оценок">'+grid+plot+
 '<text x="'+left+'" y="'+(height-7)+'" font-size="11" fill="#778aa3">'+dateLabel(first)+'</text>'+
 '<text x="'+(width-right)+'" y="'+(height-7)+'" font-size="11" fill="#778aa3" text-anchor="end">'+dateLabel(last)+'</text></svg>'+
 (hasTrend?'<div class="school-chart-key"><span><i class="school-chart-actual"></i>Средний</span><span><i class="school-chart-trend-key"></i>Тренд</span></div>':'');
}
function periodUi(ui,periods) {
 const options=[['year','Весь учебный год'],['1','I четверть'],['2','II четверть'],['3','III четверть'],['4','IV четверть']];
 const select='<label class="school-filter-label" for="quarter-picker">Период<select id="quarter-picker">'+options.map(([v,name])=>
  '<option value="'+v+'" '+(String(ui.quarter)===v?'selected':'')+'>'+name+'</option>').join('')+'</select></label>';
 const q=String(ui.quarter),period=periods?.[ui.year]?.[q];
 const note=q!=='year'&&!period?'<p class="school-period-hint hint">Даты этой четверти пока не заданы. <button type="button" class="link" data-action="school-period-settings">Настроить</button></p>':'';
 return '<div class="school-period-control">'+select+note+'</div>';
}
function finals(ui,snapshot,periods) {
 const year=ui.year,qs=[1,2,3,4],first=Number(year.slice(0,4));
 const all= (snapshot?.grades||[]).filter(g=>g.date>=first+'-09-01'&&g.date<=(first+1)+'-08-31');
 const official=all.filter(g=>g.official).sort(compareGrade);
 const recognizedAll=(snapshot?.grades||[]).filter(g=>g.official).sort(compareGrade);
 const previous=recognizedAll.filter(g=>schoolYearOf(g.date)!==year).reverse();
 const names=[...new Set(all.map(g=>g.subject))].sort((a,b)=>a.localeCompare(b,'ru'));
 const label='<div class="school-section-head"><h2>Официальные итоги</h2><p class="hint">Только оценки, выставленные школой.</p></div>';
 const diagnostic='<div class="school-grade-count">В полученных данных распознано итоговых отметок: <b>'+recognizedAll.length+
 '</b> · за '+esc(year)+': <b>'+official.length+'</b></div>';
 const header='<thead><tr><th>Предмет</th>'+qs.map(q=>'<th>'+['','I','II','III','IV'][q]+'</th>').join('')+'<th>Год</th></tr></thead>';
 const rows=names.map(name=>{
  const quarters=qs.map(q=>officialInQuarter(snapshot,periods,year,q,name));
  const yearly=officialInYear(snapshot,year,name);
  return '<tr><th scope="row"><button class="link" data-action="open-subject" data-id="'+esc(name)+'">'+esc(name)+'</button></th>'+
   quarters.map(g=>'<td>'+(g?'<b class="school-official">'+g.score+'</b>':'<span class="school-muted">—</span>')+'</td>').join('')+
   '<td>'+(yearly?'<b class="school-official">'+yearly.score+'</b>':'<span class="school-muted">—</span>')+'</td></tr>';
 }).join('');
 const table=names.length?'<div class="card school-table-wrap"><table class="school-finals-table">'+header+'<tbody>'+rows+'</tbody></table></div>':'';
 // Never discard official records just because the user has not set term dates.
 const unassigned=official.filter(g=>(g.officialLabel==='За четверть'&&!gradeQuarter(g,periods,year))||
 (g.officialLabel!=='За четверть'&&g.officialLabel!=='За год'));
 const gradeItem=g=>'<div class="school-mark-row"><span class="grade g'+g.score+'">'+g.score+'</span><div><b>'+esc(g.subject)+
 '</b><small>'+esc(g.type||g.officialLabel||'Итоговая запись')+' · '+dateLabel(g.date)+'</small></div></div>';
 const pending=unassigned.length?
 '<div class="card school-unassigned"><h3>Итоговые записи без привязки к четверти · '+unassigned.length+'</h3>'+
 '<p class="hint">Эти отметки есть в данных, но их четверть нельзя установить точно без дат периода или номера четверти в названии записи.</p>'+
 unassigned.slice().reverse().map(gradeItem).join('')+'</div>':'';
 const older=previous.length?'<details class="card school-older-grades"><summary>Итоговые из других учебных лет · '+previous.length+'</summary>'+
 '<p class="hint">Показываем найденные старые записи без выбора года и без смешивания с текущими итогами.</p>'+
 previous.map(g=>'<div class="school-archive-row"><span class="school-archive-year">'+esc(schoolYearOf(g.date))+'</span>'+gradeItem(g)+'</div>').join('')+'</details>':'';
 const typeTotals=new Map();
 for(const g of (snapshot?.grades||[])){
  const raw=String(g.type||'Тип не указан').trim().slice(0,120)||'Тип не указан';
  const row=typeTotals.get(raw)||{total:0,official:0};
  row.total++;if(g.official)row.official++;typeTotals.set(raw,row);
 }
 const audit='<details class="school-source-audit"><summary>Проверить типы оценок в выгрузке · '+(snapshot?.grades||[]).length+' записей</summary>'+
 '<p class="hint">Диагностика только на этом устройстве. Если в дневнике есть четвертная отметка, но здесь нет соответствующего типа, значит её не оказалось в полученной выгрузке.</p>'+
 [...typeTotals].sort((a,b)=>b[1].official-a[1].official||b[1].total-a[1].total||a[0].localeCompare(b[0],'ru')).map(([name,v])=>
 '<div class="school-audit-type"><span>'+esc(name)+'</span><span>'+v.total+' зап. · '+v.official+' итоговых</span></div>').join('')+
 '</details>';
 const empty=recognizedAll.length===0?
 '<div class="empty">В полученной выгрузке пока нет записей, которые программа смогла распознать как официальные итоговые оценки. Это не означает, что их нет в школьном дневнике: нужно проверить исходную выгрузку и типы записей.</div>':
 official.length===0?'<div class="notice info">За текущий учебный год распознанных итоговых пока нет. Проверь архив ниже: отметки за прошлые годы не пропали.</div>':'';
 const info=official.length&&names.length?'<p class="hint">Прочерк не всегда означает отсутствие отметки: если даты четверти не настроены, ищи её в блоке нераспределённых записей.</p>':'';
 return label+empty+table+'<details class="school-data-check"><summary>Проверка данных и архив</summary>'+diagnostic+info+pending+older+audit+'</details>';
}
function schoolYearOf(date){
 const y=Number(String(date||'').slice(0,4)),m=Number(String(date||'').slice(5,7));
 return String(m>=9?y:y-1)+'-'+String(m>=9?y+1:y);
}
function detail(ui,snapshot,rows,range,periods,helpers) {
 const name=ui.subject,subjectRows=rows.filter(g=>g.subject===name);
 const ordinary=works(subjectRows),official=subjectRows.filter(g=>g.official).sort(compareGrade);
 const mean=average(ordinary);
 const quarter=String(ui.quarter),byQuarter=quarter!=='year';
 const officialTerm=byQuarter?officialInQuarter(snapshot,periods,ui.year,quarter,name):null;
 const state=byQuarter?termState(range,officialTerm,currentDate()):{type:'year',label:'Весь учебный год'};
 const prediction=byQuarter&&state.type==='active'&&mean!==null?helpers.gradePrediction(mean,ordinary.length):null;
 const info=byQuarter&&state.type==='official'?'<div class="school-result-large"><span>Официальная оценка</span><strong>'+state.value+'</strong><small>Выставлена в журнале</small></div>':
  byQuarter&&state.type==='active'?'<div class="school-result-large"><span>Ориентировочный прогноз</span><strong>'+(prediction??'—')+'</strong><small>'+(prediction===null?'Ориентир после 3 оценок · '+ordinary.length+' из 3':'Неофициально · по '+ordinary.length+' оценкам')+'</small></div>':
  byQuarter?'<div class="school-result-large"><span>Четвертная оценка</span><strong>—</strong><small>'+esc(state.label)+'</small></div>':'';
 const isOfficialQuarter=byQuarter&&state.type==='official';
 const row='<div class="school-subject-hero card"><div class="school-means">'+
 (isOfficialQuarter?info:'<div><span class="hint">Средний за работы</span><strong>'+fmt(mean)+'</strong><span class="hint">'+ordinary.length+' оценок</span></div>'+info)+
 '</div><p class="hint">'+(isOfficialQuarter?'Это официальный результат из школьного журнала. Оценки за работы и динамика — ниже.':
 'Средний простой, без школьных коэффициентов. Официальные отметки в расчёт не входят.')+'</p></div>';
 const summary='<div class="card school-quarter-strip"><h3>История итогов</h3><div class="school-quarter-grid">'+[1,2,3,4].map(q=>{
  const score=officialInQuarter(snapshot,periods,ui.year,q,name);
  return '<div class="school-quarter-tile"><span>'+['','I','II','III','IV'][q]+'</span><strong>'+(score?score.score:'—')+'</strong></div>';
 }).join('')+'<div class="school-quarter-tile"><span>Год</span><strong>'+(officialInYear(snapshot,ui.year,name)?.score??'—')+'</strong></div></div><p class="hint">В этой строке только официальные итоги.</p></div>';
 const graph='<div class="card school-chart-card"><h3>Как менялся средний</h3>'+
 chart([{key:'subject',name:'',color:palette[0],points:cumulative(ordinary)}],range)+
 '<p class="hint">Точки появляются в дни с оценками. Шкала 2–5.</p></div>';
 const marks='<div class="card school-marks"><h3>Оценки за работы</h3>'+
 (ordinary.length?ordinary.slice().sort(compareGrade).reverse().map(g=>'<div class="school-mark-row"><span class="grade g'+g.score+'">'+g.score+'</span><div><b class="school-work-title">'+esc(g.type||'Работа в школе')+workBadge(g.type)+'</b><small>'+dateLabel(g.date)+'</small></div></div>').join(''):'<div class="empty">За выбранный период оценок за работы нет.</div>')+'</div>';
 const finalsBlock=official.length?'<div class="card school-official-list"><h3>Официальные оценки периода</h3>'+official.map(g=>'<div class="school-mark-row"><span class="grade g'+g.score+'">'+g.score+'</span><div><b>'+esc(g.officialLabel||'Итог')+'</b><small>'+dateLabel(g.date)+'</small></div></div>').join('')+'</div>':'';
 return '<div class="school-detail-head">'+button('← К предметам','back-school','tiny')+'<h2>'+esc(name)+'</h2></div>'+
 row+graph+marks+summary+finalsBlock;
}
function overview(ui,snapshot,rows,range,periods,helpers) {
 const ordinary=works(rows),mean=average(ordinary);
 const subjectNames=[...new Set(rows.map(g=>g.subject))].sort((a,b)=>a.localeCompare(b,'ru'));
 const current=String(ui.quarter),isQuarter=current!=='year';
 const latest=ordinary.slice().sort(compareGrade).reverse().slice(0,4);
 const top='<div class="card school-topline"><div><span class="hint">Средний по всем работам</span><strong>'+fmt(mean)+'</strong></div>'+
  '<div class="school-topmeta"><span class="hint">Оценок за период</span><b>'+ordinary.length+'</b></div></div>';
 const graph='<div class="card school-chart-card"><div class="school-chart-heading"><h3>Динамика среднего</h3></div>'+
 chart([{key:'overall',name:'',color:palette[0],points:cumulative(ordinary)}],range)+
 '<p class="hint">Средний по всем оценкам за работы в выбранном периоде.</p></div>';
 const list='<section class="school-subject-list"><div class="school-section-head"><h2>Предметы</h2>'+
 '<p class="hint">Стрелка показывает изменение накопленного среднего за последнюю неделю. Нет новых оценок или истории — нет стрелки.</p></div>'+
 (subjectNames.length?subjectNames.map(name=>{
  const subset=rows.filter(g=>g.subject===name),subjectWorks=works(subset),m=average(subjectWorks);
  const officialQuarter=isQuarter?officialInQuarter(snapshot,periods,ui.year,current,name):null;
  const delta=officialQuarter?null:subjectDelta7(subjectWorks,range);
  let trend='';
  if(delta!==null){
   if(delta>0)trend='<span class="school-subject-trend school-trend-up">↑ +'+fmt(delta)+'</span>';
   else if(delta<0)trend='<span class="school-subject-trend school-trend-down">↓ −'+fmt(Math.abs(delta))+'</span>';
   else trend='<span class="school-subject-trend school-trend-even">Без изменений</span>';
  }
  let right='',context='';
  if(isQuarter){
   const mark=officialQuarter;
   const state=termState(range,mark,currentDate());
   if(state.type==='official'){right=mark.score;context='Итог';}
   else if(state.type==='active'&&m!==null){right=helpers.gradePrediction(m,subjectWorks.length)??'—';context=subjectWorks.length>=3?'Прогноз':subjectWorks.length+' из 3 оценок';}
   else{right='—';context=state.label;}
  }else{
   const mark=officialInYear(snapshot,ui.year,name);
   right=mark?mark.score:'—';context=mark?'Годовая':'Без годовой';
  }
  return '<button type="button" class="school-subject-row" data-action="open-subject" data-id="'+esc(name)+'">'+
   '<div class="school-subject-name"><b>'+esc(name)+'</b>'+trend+'</div>'+
   (officialQuarter?'':'<div class="school-number"><strong>'+fmt(m)+'</strong><small>средний</small></div>')+
   '<div class="school-number '+(officialQuarter?'school-final-only':'')+'"><strong>'+right+'</strong><small>'+esc(context)+'</small></div><span class="school-chevron">›</span></button>';
 }).join(''):'<div class="empty">За выбранный период оценок пока нет.</div>')+'</section>';
 const recent=latest.length?'<details class="school-recent-collapsed"><summary>Последние оценки <span class="school-recent-count">'+latest.length+'</span></summary>'+
 '<div class="school-recent-list">'+latest.map(g=>'<div class="school-recent-row"><span class="grade g'+g.score+'">'+g.score+'</span>'+
 '<div><b>'+esc(g.subject)+'</b><small class="school-work-meta">'+esc(g.type||'Работа')+workBadge(g.type)+' <span>· '+dateLabel(g.date)+'</span></small></div></div>').join('')+
 '</div></details>':'';
 return top+graph+list+recent;
}
function render(ctx) {
 const {ui,state:s,api,cloudSnapshot,schoolYearFor,schoolRange,gradePrediction}=ctx;
 if(!api)return '<h1>Школа</h1><div class="card">Подключаем школьный дневник… Проверь подключение к интернету.</div>';
 const connection=api.connection?.()||{isConnected:false},info=api.status?.()||{};
 let head='<div class="page-title"><div><h1>Школа</h1><div class="sub">Дневник с аналитикой</div></div></div>';
 if(!connection.isConnected)return head+'<div class="card"><b>Подключение оценок</b><p class="hint">Войди в аккаунт Firebase для Матвея, чтобы получать реальные школьные оценки.</p>'+ (api.loginHtml?.()||'')+(info.error?'<p class="notice">'+esc(info.error)+'</p>':'')+'</div>';
 const snap=cloudSnapshot();
 const status='<div class="school-connection"><span class="hint">'+(snap?.syncedAt&&!Number.isNaN(new Date(snap.syncedAt).getTime())?'Выгрузка: '+new Date(snap.syncedAt).toLocaleString('ru-RU'):'Оценки подключены')+'</span>'+
 '<button type="button" class="link" data-sc-action="refresh" '+(info.loading?'disabled':'')+'>Обновить</button>'+
 '</div>'+
 (info.error?'<p class="notice">'+esc(info.error)+'</p>':'')+(info.loading?'<p class="hint">Получаем обновление из Firebase…</p>':'');
 if(!snap)return head+status+'<div class="card">Ожидаем данные из Firebase. Кнопка «Обновить» не запускает сборщик на MacBook.</div>';
 // School year and the default term are automatic. Manual term choices remain
 // respected until a new page session or the school-year rollover.
 const now=currentDate(),targetYear=schoolYearFor(now);
 if(ui.year!==targetYear){ui.year=targetYear;ui.quarter='year';ui.subject='';ui.editTerm=false;ui.schoolPeriodTouched=false;}
 if(!ui.schoolPeriodTouched){
  const fallback=ctx.defaultSchoolQuarter?.(now,ui.year,s.schoolPeriods||{});
  if(fallback)ui.quarter=fallback;
  ui.schoolPeriodTouched=true;
 }
 const tabs=header(ui);
 if(ui.schoolScreen==='finals'){
  if(ui.subject){ui.subject='';}
  return status+tabs+finals(ui,snap,s.schoolPeriods||{});
 }
 const controls=periodUi(ui,s.schoolPeriods||{});
 const range=schoolRange(),rows=rangeRows(snap,range);
 const content=(!range)?'<div class="empty">Даты выбранной четверти не настроены. <button type="button" class="link" data-action="school-period-settings">Настроить четверть</button></div>':
 ui.subject?detail(ui,snap,rows,range,s.schoolPeriods||{}, {gradePrediction}):
 overview(ui,snap,rows,range,s.schoolPeriods||{}, {gradePrediction});
 return status+tabs+controls+content;
}
function handleAction(btn,ctx) {
 const ui=ctx.ui,act=btn.dataset.action,id=btn.dataset.id;
 if(!['school-view','school-chart-mode'].includes(act))return false;
 if(act==='school-view'){ui.schoolScreen=id;ui.subject='';}
 if(act==='school-chart-mode'){ui.schoolChartMode=id;}
 ctx.render();
 return true;
}
window.VectorSchool={render,handleAction,test:{cumulative,subjectDelta7,linearTrend,workBadgeKind,workBadge,officialInQuarter,officialInYear,quarterFromType,gradeQuarter,termState,rangeRows,works,average}};
if(typeof window.render==='function')window.render();
})();