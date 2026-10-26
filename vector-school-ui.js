/* Vector school diary view. Read-only Firebase snapshot, no stored grades. */
(function () {
'use strict';
const palette=['#2463c9','#13a18c','#a56de2'];
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
function button(label,action,extra='') {return '<button type="button" class="button '+extra+'" data-action="'+action+'">'+esc(label)+'</button>';}
function header(ui) {
 return '<div class="page-title"><div><h1>Школа</h1><div class="sub">Дневник с аналитикой</div></div></div>'+
 '<div class="school-tabs" role="group" aria-label="Раздел школы">'+
 ['overview','finals'].map((x,i)=>'<button type="button" data-action="school-view" data-id="'+x+'" class="school-tab '+((ui.schoolScreen||'overview')===x?'active':'')+'">'+(i?'Итоги':'Дневник')+'</button>').join('')+
 '</div><div class="school-year-label hint">Учебный год '+esc(ui.year)+'</div>';
}
function chartInfo(point,subject) {
 if(!point)return '';
 return '<div class="school-chart-info"><div class="row between wrap"><b>'+dateLabel(point.date)+'</b><strong>'+fmt(point.average)+'</strong></div>'+
 '<p class="hint">'+(subject?esc(subject)+' · ':'')+'Средний на эту дату · '+point.count+' оценок накоплено</p>'+
 '<div class="school-day-grades">'+point.newGrades.map(g=>'<span class="school-chip"><b>'+g.score+'</b> '+esc(g.subject)+
 (g.type?' · '+esc(g.type):'')+'</span>').join('')+'</div></div>';
}
function chart(series,range,selectedKey) {
 const available=series.filter(s=>s.points.length);
 if(!available.length)return '<div class="empty">В этом периоде ещё нет обычных оценок для построения графика.</div>';
 const width=560,height=226,left=39,right=12,top=14,bottom=35;
 const start=Date.parse((range?.from||available.flatMap(s=>s.points).map(p=>p.date).sort()[0])+'T12:00:00');
 const latest=available.flatMap(s=>s.points).map(p=>p.date).sort().at(-1);
 const endDate=range?.to||latest;
 const final=Date.parse((endDate<currentDate()?endDate:currentDate())+'T12:00:00');
 const end=Math.max(start+86400000,final,Date.parse(latest+'T12:00:00'));
 const X=d=>left+(Math.max(start,Math.min(end,Date.parse(d+'T12:00:00')))-start)/(end-start)*(width-left-right);
 const Y=v=>top+(5-v)/3*(height-top-bottom);
 const grid=[2,3,4,5].map(n=>'<line x1="'+left+'" x2="'+(width-right)+'" y1="'+Y(n)+'" y2="'+Y(n)+'" stroke="#e5ebf5"/><text x="'+(left-9)+'" y="'+(Y(n)+4)+'" text-anchor="end" font-size="12" fill="#6f7f94">'+n+'</text>').join('');
 const plot=available.map(s=>{
  const points=s.points.map(p=>X(p.date).toFixed(1)+','+Y(p.average).toFixed(1)).join(' ');
  return (s.points.length>1?'<polyline points="'+points+'" fill="none" stroke="'+s.color+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>':'')+
  s.points.map((p,i)=>'<circle cx="'+X(p.date).toFixed(1)+'" cy="'+Y(p.average).toFixed(1)+'" r="5.2" fill="'+s.color+'" stroke="white" stroke-width="1.6" role="button" tabindex="0" data-action="school-chart-point" data-id="'+esc(s.key)+'" data-index="'+i+'" aria-label="'+esc((s.name?s.name+', ':'')+dateLabel(p.date)+': средний '+fmt(p.average))+'"><title>'+esc(dateLabel(p.date)+' · '+fmt(p.average))+'</title></circle>').join('');
 }).join('');
 const first=range?.from||available.flatMap(s=>s.points).map(p=>p.date).sort()[0];
 const last=String(new Date(end).getFullYear())+'-'+String(new Date(end).getMonth()+1).padStart(2,'0')+'-'+String(new Date(end).getDate()).padStart(2,'0');
 const svg='<svg class="school-plot" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="График накопленного среднего балла от 2 до 5">'+grid+plot+
 '<text x="'+left+'" y="'+(height-7)+'" font-size="11" fill="#778aa3">'+dateLabel(first)+'</text>'+
 '<text x="'+(width-right)+'" y="'+(height-7)+'" font-size="11" fill="#778aa3" text-anchor="end">'+dateLabel(last)+'</text></svg>';
 const found=available.flatMap(s=>s.points.map((p,i)=>({key:s.key,point:p,index:i,subject:s.name})));
 const selected=found.find(o=>o.key===selectedKey?.key&&o.index===selectedKey?.index)||found.slice().sort((a,b)=>compareGrade(a.point,b.point)).at(-1);
 return svg+chartInfo(selected.point,selected.subject);
}
function periodUi(ui,periods) {
 const options=[['year','Весь учебный год'],['1','I четверть'],['2','II четверть'],['3','III четверть'],['4','IV четверть']];
 const select='<label class="school-filter-label" for="quarter-picker">Период<select id="quarter-picker">'+options.map(([v,name])=>'<option value="'+v+'" '+(String(ui.quarter)===v?'selected':'')+'>'+name+'</option>').join('')+'</select></label>';
 const q=String(ui.quarter);
 const period=periods?.[ui.year]?.[q];
 const editing=ui.editTerm;
 let setting='';
 if(q!=='year'&&(!period||editing)){
  setting='<div class="card school-term-editor"><b>'+(period?'Изменить даты':'Настроить даты')+' '+q+'-й четверти</b>'+
  '<p class="hint">Школьный журнал не передаёт границы четвертей. Укажи их один раз, чтобы получать точную выборку.</p>'+
  '<form id="school-term-form" class="school-term-fields">'+
  '<label>С<input name="from" type="date" value="'+esc(period?.from||'')+'" required></label>'+
  '<label>По<input name="to" type="date" value="'+esc(period?.to||'')+'" required></label>'+
  '<button class="button primary" type="submit">Сохранить</button>'+
  (period?button('Отмена','cancel-term-edit'):'')+'</form></div>';
 }else if(period&&q!=='year'){
  setting='<div class="school-period-note"><span class="hint">'+dateLabel(period.from)+' — '+dateLabel(period.to)+'</span>'+button('Изменить даты','edit-term','tiny')+'</div>';
 }
 return '<div class="school-period-control">'+select+setting+'</div>';
}
function finals(ui,snapshot,periods) {
 const year=ui.year,qs=[1,2,3,4],first=Number(year.slice(0,4));
 const all= (snapshot?.grades||[]).filter(g=>g.date>=first+'-09-01'&&g.date<=(first+1)+'-08-31');
 const official=all.filter(g=>g.official).sort(compareGrade);
 const recognizedAll=(snapshot?.grades||[]).filter(g=>g.official).sort(compareGrade);
 const previous=recognizedAll.filter(g=>schoolYearOf(g.date)!==year).reverse();
 const names=[...new Set(all.map(g=>g.subject))].sort((a,b)=>a.localeCompare(b,'ru'));
 const label='<div class="school-section-head"><h2>Официальные итоги</h2><p class="hint">Только оценки, распознанные как итоговые записи школьного журнала. Прогнозов нет.</p></div>';
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
 const empty=recognizedAll.length===0?
 '<div class="empty">В полученной выгрузке пока нет записей, которые программа смогла распознать как официальные итоговые оценки. Это не означает, что их нет в школьном дневнике: нужно проверить исходную выгрузку и типы записей.</div>':
 official.length===0?'<div class="notice info">За текущий учебный год распознанных итоговых пока нет. Проверь архив ниже: отметки за прошлые годы не пропали.</div>':'';
 const info=official.length&&names.length?'<p class="hint">Прочерк не всегда означает отсутствие отметки: если даты четверти не настроены, ищи её в блоке нераспределённых записей.</p>':'';
 return label+diagnostic+empty+table+info+pending+older;
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
 const prediction=byQuarter&&state.type==='active'&&mean!==null?helpers.gradePrediction(mean):null;
 const info=byQuarter&&state.type==='official'?'<div class="school-result-large"><span>Официальная оценка</span><strong>'+state.value+'</strong><small>Выставлена в журнале</small></div>':
  byQuarter&&state.type==='active'?'<div class="school-result-large"><span>Ориентировочный прогноз</span><strong>'+(prediction??'—')+'</strong><small>Неофициально · порог 0,60</small></div>':
  byQuarter?'<div class="school-result-large"><span>Четвертная оценка</span><strong>—</strong><small>'+esc(state.label)+'</small></div>':'';
 const row='<div class="school-subject-hero card"><div class="school-means"><div><span class="hint">Средний за работы</span><strong>'+fmt(mean)+'</strong><span class="hint">'+ordinary.length+' оценок</span></div>'+info+'</div>'+
 '<p class="hint">Средний простой, без школьных коэффициентов. Официальные отметки в расчёт не входят.</p></div>';
 const summary='<div class="card school-quarter-strip"><h3>История итогов</h3><div class="school-quarter-grid">'+[1,2,3,4].map(q=>{
  const score=officialInQuarter(snapshot,periods,ui.year,q,name);
  return '<div class="school-quarter-tile"><span>'+['','I','II','III','IV'][q]+'</span><strong>'+(score?score.score:'—')+'</strong></div>';
 }).join('')+'<div class="school-quarter-tile"><span>Год</span><strong>'+(officialInYear(snapshot,ui.year,name)?.score??'—')+'</strong></div></div><p class="hint">В этой строке только официальные итоги.</p></div>';
 const graph='<div class="card school-chart-card"><h3>Как менялся средний</h3>'+
 chart([{key:'subject',name:'',color:palette[0],points:cumulative(ordinary)}],range,ui.schoolChartPoint?.key==='subject'?ui.schoolChartPoint:null)+
 '<p class="hint">Точки появляются в дни с оценками. Шкала 2–5.</p></div>';
 const marks='<div class="card school-marks"><h3>Оценки за работы</h3>'+
 (ordinary.length?ordinary.slice().sort(compareGrade).reverse().map(g=>'<div class="school-mark-row"><span class="grade g'+g.score+'">'+g.score+'</span><div><b>'+esc(g.type||'Работа в школе')+'</b><small>'+dateLabel(g.date)+'</small></div></div>').join(''):'<div class="empty">За выбранный период оценок за работы нет.</div>')+'</div>';
 const finalsBlock=official.length?'<div class="card school-official-list"><h3>Официальные оценки периода</h3>'+official.map(g=>'<div class="school-mark-row"><span class="grade g'+g.score+'">'+g.score+'</span><div><b>'+esc(g.officialLabel||'Итог')+'</b><small>'+dateLabel(g.date)+'</small></div></div>').join('')+'</div>':'';
 return '<div class="school-detail-head">'+button('← К предметам','back-school','tiny')+'<h2>'+esc(name)+'</h2></div>'+
 row+summary+graph+marks+finalsBlock;
}
function overview(ui,snapshot,rows,range,periods,helpers) {
 const ordinary=works(rows),allOfficial=rows.filter(g=>g.official);
 const mean=average(ordinary),subjectNames=[...new Set(rows.map(g=>g.subject))].sort((a,b)=>a.localeCompare(b,'ru'));
 const current=String(ui.quarter),isQuarter=current!=='year';
 const latest=ordinary.slice().sort(compareGrade).reverse().slice(0,4);
 const top='<div class="card school-topline"><div><span class="hint">Средний по всем работам</span><strong>'+fmt(mean)+'</strong><span class="hint">'+ordinary.length+' оценок · '+allOfficial.length+' итоговых отдельно</span></div>'+
 '<div class="school-topmeta"><span class="hint">Период</span><b>'+(isQuarter?current+'-я четверть':'Учебный год')+'</b></div></div>';
 const recent=latest.length?'<div class="school-recent"><h3>Последние оценки</h3><div class="school-recent-list">'+latest.map(g=>'<div class="school-recent-row"><span class="grade g'+g.score+'">'+g.score+'</span><div><b>'+esc(g.subject)+'</b><small>'+esc(g.type||'Работа')+' · '+dateLabel(g.date)+'</small></div></div>').join('')+'</div></div>':'';
 const mode=ui.schoolChartMode==='subjects'?'subjects':'overall';
 const possible=[...new Set(ordinary.map(g=>g.subject))].sort((a,b)=>a.localeCompare(b,'ru'));
 let chosen=Array.isArray(ui.schoolChartSubjects)?ui.schoolChartSubjects.filter(n=>possible.includes(n)).slice(0,3):possible.slice(0,3);
 const series=mode==='overall'?
 [{key:'overall',name:'',color:palette[0],points:cumulative(ordinary)}]:
 chosen.map((name,i)=>({key:name,name,color:palette[i],points:cumulative(ordinary.filter(g=>g.subject===name))}));
 const toggles='<div class="school-mode-switch"><button class="'+(mode==='overall'?'active':'')+'" data-action="school-chart-mode" data-id="overall">Общий средний</button>'+
 '<button class="'+(mode==='subjects'?'active':'')+'" data-action="school-chart-mode" data-id="subjects">По предметам</button></div>';
 const checkboxes=mode==='subjects'?'<details class="school-compare-picker" '+(ui.schoolCompareOpen?'open':'')+'><summary>Выбрать предметы <span class="school-selected-count">'+chosen.length+' из 3</span></summary>'+
 '<div class="school-checks">'+possible.map(n=>'<label class="school-check"><input type="checkbox" data-school-compare="'+esc(n)+'" '+(chosen.includes(n)?'checked':'')+'><span>'+esc(n)+'</span></label>').join('')+'</div>'+
 '<p class="hint">На графике отображаются максимум три предмета.</p>'+ (ui.schoolChartWarning?'<p class="school-warn">'+esc(ui.schoolChartWarning)+'</p>':'')+'</details>':'';
 const legend=mode==='subjects'?'<div class="school-legend">'+series.map(item=>'<span><i style="background:'+item.color+'"></i>'+esc(item.name)+'</span>').join('')+'</div>':'';
 const graph='<div class="card school-chart-card"><div class="school-chart-heading"><div><h3>Динамика успеваемости</h3><p class="hint">Накопленный средний балл · шкала 2–5</p></div></div>'+toggles+checkboxes+legend+
 chart(series,range,ui.schoolChartPoint)+
 '<p class="hint">Учитываются только оценки за работы. Итоговые отметки не меняют график; прогнозов на линии нет.</p></div>';
 const list='<section class="school-subject-list"><div class="school-section-head"><h2>Предметы</h2><p class="hint">Средний за работы и официальная отметка или прогноз</p></div>'+
 (subjectNames.length?subjectNames.map(name=>{
  const sRows=rows.filter(g=>g.subject===name),subworks=works(sRows),m=average(subworks);
  let right='',context='';
  if(isQuarter){
   const mark=officialInQuarter(snapshot,periods,ui.year,current,name);
   const state=termState(range,mark,currentDate());
   if(state.type==='official'){right=mark.score;context='Официально';}
   else if(state.type==='active'&&m!==null){right=helpers.gradePrediction(m);context='Прогноз';}
   else {right='—';context=state.label;}
  }else{
   const mark=officialInYear(snapshot,ui.year,name);
   right=mark?mark.score:'—';context=mark?'Годовая':'Без годовой';
  }
  const chips=byDate(subworks).slice(-4).map(g=>'<span class="school-small-grade">'+g.score+'</span>').join('');
  return '<button type="button" class="school-subject-row" data-action="open-subject" data-id="'+esc(name)+'">'+
   '<div class="school-subject-name"><b>'+esc(name)+'</b><div class="school-inline-grades">'+(chips||'<small>Нет оценок за работы</small>')+'</div></div>'+
   '<div class="school-number"><strong>'+fmt(m)+'</strong><small>средний</small></div>'+
   '<div class="school-number"><strong>'+right+'</strong><small>'+esc(context)+'</small></div><span class="school-chevron">›</span></button>';
 }).join(''):'<div class="empty">За выбранный период оценок пока нет.</div>')+'</section>';
 return top+recent+graph+list;
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
 '<button type="button" class="link" data-sc-action="logout">Выйти</button></div>'+
 (info.error?'<p class="notice">'+esc(info.error)+'</p>':'')+(info.loading?'<p class="hint">Получаем обновление из Firebase…</p>':'');
 if(!snap)return head+status+'<div class="card">Ожидаем данные из Firebase. Кнопка «Обновить» не запускает сборщик на MacBook.</div>';
 if(!ui.schoolPeriodTouched&&ui.quarter==='year'){
  const now=currentDate(),periods=s.schoolPeriods?.[ui.year]||{};
  const active=[1,2,3,4].find(q=>periods[q]&&now>=periods[q].from&&now<=periods[q].to);
  if(active)ui.quarter=active;
  ui.schoolPeriodTouched=true;
 }
 // The year is automatic and cannot be changed in this version.
 const targetYear=schoolYearFor(currentDate());
 if(ui.year!==targetYear){ui.year=targetYear;ui.quarter='year';ui.subject='';ui.editTerm=false;ui.schoolPeriodTouched=false;}
 const tabs=header(ui);
 if(ui.schoolScreen==='finals'){
  if(ui.subject){ui.subject='';ui.schoolChartPoint=null;}
  return status+tabs+finals(ui,snap,s.schoolPeriods||{});
 }
 const controls=periodUi(ui,s.schoolPeriods||{});
 const range=schoolRange(),rows=rangeRows(snap,range);
 const content=(!range)?'<div class="empty">Чтобы посмотреть четверть, сначала настрой её даты. Пока можно выбрать весь учебный год.</div>':
 ui.subject?detail(ui,snap,rows,range,s.schoolPeriods||{}, {gradePrediction}):
 overview(ui,snap,rows,range,s.schoolPeriods||{}, {gradePrediction});
 return status+tabs+controls+content;
}
function handleAction(btn,ctx) {
 const ui=ctx.ui,act=btn.dataset.action,id=btn.dataset.id;
 if(!['school-view','school-chart-mode','school-chart-point'].includes(act))return false;
 if(act==='school-view'){ui.schoolScreen=id;ui.subject='';ui.schoolChartPoint=null;}
 if(act==='school-chart-mode'){ui.schoolChartMode=id;ui.schoolChartPoint=null;ui.schoolChartWarning='';}
 if(act==='school-chart-point'){ui.schoolChartPoint={key:id,index:Number(btn.dataset.index)};}
 ctx.render();
 return true;
}
function onChange(event,ctx) {
 const input=event.target;if(!input.matches('[data-school-compare]'))return false;
 const ui=ctx.ui,name=input.dataset.schoolCompare;
 ui.schoolCompareOpen=!!input.closest?.('.school-compare-picker')?.open;
 const snap=ctx.cloudSnapshot(),range=ctx.schoolRange(),rows=works(rangeRows(snap,range));
 const choices=[...new Set(rows.map(g=>g.subject))].sort((a,b)=>a.localeCompare(b,'ru'));
 let chosen=Array.isArray(ui.schoolChartSubjects)?ui.schoolChartSubjects.filter(n=>choices.includes(n)):choices.slice(0,3);
 if(input.checked){
  if(!chosen.includes(name)&&chosen.length>=3){ui.schoolChartWarning='Можно сравнивать не более трёх предметов.';ctx.render();return true;}
  if(!chosen.includes(name))chosen.push(name);
 } else chosen=chosen.filter(n=>n!==name);
 ui.schoolChartSubjects=chosen;ui.schoolChartWarning='';ui.schoolChartPoint=null;
 ctx.render();return true;
}
window.VectorSchool={render,handleAction,onChange,test:{cumulative,officialInQuarter,officialInYear,quarterFromType,gradeQuarter,termState,rangeRows,works,average}};
if(typeof window.render==='function')window.render();
})();