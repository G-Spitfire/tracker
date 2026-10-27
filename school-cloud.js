/* School grades: independent read-only Firebase layer for Vector and Iskra.
   All private grades are fetched from the signed-in user's own Firestore document.
   Local manual-grade storage is never overwritten. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const script = document.querySelector('script[data-school-cloud]');
const appKind = script && script.dataset.schoolCloud === 'vector' ? 'vector' : 'iskra';
const childName = appKind === 'vector' ? 'Матвея' : 'Полины';
const cfg = {
  apiKey: 'AIzaSyCs3gfUXcrlTJLZqxXQ0cgXpfuqNBkNIsU',
  authDomain: 'family-school-grades.firebaseapp.com',
  projectId: 'family-school-grades',
  storageBucket: 'family-school-grades.firebasestorage.app',
  messagingSenderId: '1005917864241',
  appId: '1:1005917864241:web:4192a263b8ad39fdb3f010'
};
// Distinct app names keep Matvey's and Polina's sessions separate on one device.
const fb = initializeApp(cfg, 'school-' + appKind);
const auth = getAuth(fb);
const db = getFirestore(fb);
const state = {
  phase: 'init', user: null, data: null, error: '',
  manual: false, from: '', to: '', loading: false, lastFetch: 0, offline: false
};
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[ch]);
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
};
// School API supplies a display name and a separate code, e.g. "5" + "5/5".
const score = value => {
  const text = String(value ?? '').trim();
  const match = /^([2-5])(?:\.0+)?(?:\/5)?$/.exec(text);
  return match ? Number(match[1]) : null;
};
const markScore = row => score(row.value) ?? score(row.valueCode);
// Attendance/non-grade journal events are never academic marks. Some are
// rendered by the school API as "неизвестная" instead of "н".
const isAttendanceLabel = value => {
  const text = String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
  return /^(?:н\.?|по болезни|болезнь|болел[аи]?|отсутствовал[аи]?|отсутствие|пропуск(?:\s+урока)?|неизвестн[а-яё]*(?:\s+(?:отметка|оценка))?|не\s+определен[а-яё]*|не\s+указан[а-яё]*|unknown|[?—-])$/.test(text);
};
const gradeScore = row => (
  isAttendanceLabel(row.value) || isAttendanceLabel(row.valueCode) ||
  isAttendanceLabel(row.type)
) ? null : markScore(row);
// Estimate type comes from the school's estimate_type_name, not from a prediction.
// Avoid identifying a summative test (e.g. "Итоговая контрольная работа")
// as the teacher's final term grade.
const officialKind = row => {
  const kind = String(row.type || '').toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  if (!kind || /контрольн|проверочн|самостоят|диктант|сочинен|работа|домашн|урок|тест|проект|практическ|зачет|экзамен/.test(kind)) return '';
  if (/четверт/.test(kind)) return 'За четверть';
  if (/триместр/.test(kind)) return 'За триместр';
  if (/полугод/.test(kind)) return 'За полугодие';
  if (/годов|за год|по итогам года/.test(kind)) return 'За год';
  if (/^итоговая(?: (?:оценка|отметка))?$|^аттестационная(?: (?:оценка|отметка))?$/.test(kind)) return 'Итоговая';
  return '';
};
const avg = rows => rows.length
  ? (rows.reduce((n, row) => n + row.n, 0) / rows.length).toFixed(2) : '—';
const forecast = n => n < 2.6 ? 2 : n < 3.6 ? 3 : n < 4.6 ? 4 : 5;
const notify = () => window.dispatchEvent(new CustomEvent('schoolCloudUpdated'));

function errorText(err) {
  if (err && (err.code === 'auth/invalid-credential' ||
    err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found')) {
    return 'Неверная почта или пароль. Проверь данные пользователя Firebase.';
  }
  if (err && err.code === 'auth/too-many-requests') {
    return 'Слишком много попыток входа. Попробуй позже.';
  }
  if (err && err.code === 'permission-denied') {
    return 'Доступ к оценкам запрещён. Проверь Firebase UID и правила Firestore.';
  }
  if (err && err.code === 'unavailable') {
    return 'Сервис временно недоступен. Проверь подключение к интернету.';
  }
  return 'Не удалось подключиться. Проверь интернет и попробуй ещё раз.';
}

function verify(raw) {
  if (!raw || raw.schemaVersion !== 1 || raw.source !== 'petersburgedu' ||
      !Array.isArray(raw.grades) || raw.grades.length > 5000) {
    throw new Error('invalid-school-document');
  }
  const ids = new Set();
  const grades = [];
  for (const row of raw.grades) {
    if (!row || typeof row.id !== 'string' || ids.has(row.id) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        typeof row.subject !== 'string' || typeof row.value !== 'string') {
      throw new Error('invalid-school-grade');
    }
    ids.add(row.id);
    grades.push({
      id: row.id, date: row.date, subject: row.subject.trim() || 'Без предмета',
      value: row.value, valueCode: typeof row.valueCode === 'string' ? row.valueCode : '',
      type: typeof row.type === 'string' ? row.type : ''
    });
  }
  return {
    schoolYear: typeof raw.schoolYear === 'string' ? raw.schoolYear : '',
    syncedAt: typeof raw.syncedAt === 'string' ? raw.syncedAt : '',
    rangeFrom: typeof raw.rangeFrom === 'string' ? raw.rangeFrom : '',
    rangeTo: typeof raw.rangeTo === 'string' ? raw.rangeTo : '',
    grades
  };
}

async function refresh(force = false) {
  const user = auth.currentUser;
  if (!user || state.loading) return;
  if (!force && Date.now() - state.lastFetch < 5 * 60 * 1000) return;
  state.loading = true;
  state.phase = state.data ? 'ready' : 'loading';
  state.error = '';
  notify();
  try {
    // Read only /schoolGrades/{currentUser.uid}; no collection listing.
    const snap = await getDocFromServer(doc(db, 'schoolGrades', user.uid));
    if (auth.currentUser?.uid !== user.uid) return;
    if (!snap.exists()) {
      state.data = null;
      state.phase = 'empty';
      state.error = 'Для этого аккаунта пока нет выгрузки оценок.';
    } else {
      const raw = snap.data(), next = verify(raw);
      state.data = next;
      state.offline=false;
      if(appKind==='iskra'){
        try{if(localStorage.getItem('iskra_offline_enabled')==='1')
          localStorage.setItem('iskra_offline_grades_'+user.uid,JSON.stringify(raw))}catch(_){}
      }
      state.phase = 'ready';
      if(appKind==='iskra')ikAutoPeriod();
      if (!state.from) state.from = /^\d{4}-\d{2}-\d{2}$/.test(next.rangeFrom)
        ? next.rangeFrom : next.schoolYear.slice(0, 4) + '-09-01';
      if (!state.to) state.to = today();
    }
    state.lastFetch = Date.now();
  } catch (err) {
    if (auth.currentUser?.uid !== user.uid) return;
    if(appKind==='iskra'&&!state.data){
      try{
        if(localStorage.getItem('iskra_offline_enabled')==='1'){
          const raw=JSON.parse(localStorage.getItem('iskra_offline_grades_'+user.uid)||'null');
          if(raw){state.data=verify(raw);state.offline=true;ikAutoPeriod()}
        }
      }catch(_){}
    }
    state.phase = state.data ? 'ready' : 'error';
    state.error = state.offline?'Нет соединения. Показана сохранённая офлайн-копия; её оценки могут быть устаревшими.':
      err && String(err.message).startsWith('invalid-school-')
      ? 'Неверный формат данных в базе. Старые записи не изменены.'
      : errorText(err);
  } finally {
    state.loading = false;
    notify();
  }
}

function trend(rows) {
  const sorted = rows.slice().sort((a, b) =>
    a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let total = 0, points = [];
  sorted.forEach((r, i) => {
    total += r.n;
    points.push(total / (i + 1));
  });
  points = points.slice(-45);
  if (points.length < 2) return '<div class="mu sm">График появится, когда оценок станет больше.</div>';
  const lo = Math.max(1.8, Math.min(...points) - .15);
  const hi = Math.min(5.2, Math.max(...points) + .15);
  const coords = points.map((n, i) =>
    (12 + i * 296 / (points.length - 1)).toFixed(1) + ',' +
    (104 - (n - lo) / Math.max(.1, hi - lo) * 85).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 320 120" width="100%" role="img" aria-label="Динамика среднего балла"><polyline fill="none" stroke="var(--ac)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + coords + '"/></svg>';
}

function cloudGrades() {
  const d = state.data;
  const filtered = d.grades.filter(row => row.date >= state.from && row.date <= state.to);
  const numbered = filtered.map(row => ({...row, n: gradeScore(row)}))
    .filter(row => row.n !== null);
  const numeric = numbered.filter(row => !officialKind(row));
  const official = numbered.filter(row => !!officialKind(row));
  const group = new Map();
  numbered.forEach(row => {
    if (!group.has(row.subject)) group.set(row.subject, {works: [], official: []});
    group.get(row.subject)[officialKind(row) ? 'official' : 'works'].push(row);
  });
  const ordered = [...group].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  let s = '<div class="scs-filters"><label>С даты<input type="date" data-sc-date="from" value="' +
    esc(state.from) + '"></label><label>По дату<input type="date" data-sc-date="to" value="' +
    esc(state.to) + '"></label></div>';
  if (state.from > state.to) {
    s += '<p class="scs-warning">Начальная дата позже конечной. Измени период.</p>';
  }
  s += '<div class="hero"><div class="big">' + avg(numeric) +
    '</div><div class="mu">Средний за работы · ' + numeric.length +
    ' оценок' + (official.length ? ' · ' + official.length + ' итоговых отдельно' : '') +
    '</div></div>';
  s += '<div class="card"><b>Динамика среднего балла</b>' + trend(numeric) +
    '<div class="mu sm">Все числовые оценки равновесные; официальный школьный средний может отличаться.</div></div>';
  if (!numbered.length) s += '<div class="card">В выбранном периоде числовых оценок пока нет.</div>';
  s += ordered.map(([subject, group]) => {
    const works = group.works.slice().sort((a, b) => a.date.localeCompare(b.date) ||
      a.id.localeCompare(b.id));
    const officialMarks = group.official.slice().sort((a, b) =>
      a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const mean = works.length ? works.reduce((n, r) => n + r.n, 0) / works.length : null;
    const chips = works.map(row => {
      const tip = [row.date.split('-').reverse().join('.'), row.type].filter(Boolean).join(' · ');
      return '<span class="chip c' + row.n +
        '" title="' + esc(tip) + '" aria-label="' + esc(tip + ': ' + row.n) +
        '">' + row.n + '</span>';
    }).join('');
    const finalRows = officialMarks.map(row => {
      const kind = officialKind(row);
      const date = row.date.split('-').reverse().join('.');
      return '<div class="scs-final-row">' +
        '<span class="scs-final-label">' + esc(kind) + ' · официально</span>' +
        '<span class="scs-final-mark c' + row.n + '">' + row.n + '</span>' +
        '<span class="mu sm">' + esc(date) + '</span>' +
        '</div>';
    }).join('');
    const detailRows = works.map(row =>
      '<li class="scs-grade-detail">' +
      '<span class="scs-grade-date">' + esc(row.date.split('-').reverse().join('.')) + '</span>' +
      '<span class="scs-grade-number c' + row.n + '">' + row.n + '</span>' +
      '<span class="mu sm">' + esc(row.type || 'Вид работы не указан') + '</span></li>'
    ).join('');
    const subtitle = (mean === null ? 'Оценок за работы пока нет'
      : 'Средний за работы ' + mean.toFixed(2)) +
      (!officialMarks.length && mean !== null ? ' · прогноз ' + forecast(mean) : '') +
      ' · оценок за работы: ' + works.length;
    const audit = works.length
      ? '<details class="scs-grade-audit"><summary>Посмотреть даты и работы (' +
        works.length + ')</summary><ol>' + detailRows + '</ol>' +
        '<p class="mu sm">Итоговые оценки за период в этот список не включены.</p>' +
        '</details>'
      : '';
    return '<div class="card sub"><div class="row"><div><b>' + esc(subject) +
      '</b><div class="mu sm">' + subtitle + '</div></div></div>' +
      (finalRows ? '<div class="scs-final-list">' + finalRows + '</div>' : '') +
      (works.length ? '<div class="chips">' + chips + '</div>' : '') +
      audit + '</div>';
  }).join('');
  s += '<p class="mu sm">Период: ' + esc(state.from.split('-').reverse().join('.')) +
    ' — ' + esc(state.to.split('-').reverse().join('.')) +
    '. Итоговые отметки, определённые по типу записи дневника, показаны отдельно и не участвуют в среднем. ' +
    'Пропуски и служебные записи скрыты. Прогноз — только при отсутствии официального итога. ' +
    'Средний за работы равновесный; школьные коэффициенты не применяются.</p>';
  return s;
}

function summary() {
  if (!state.user || !state.data || (appKind !== 'iskra' && (!state.from || !state.to))) return null;
  const filtered = appKind === 'iskra' ? ikFiltered() : state.data.grades.filter(row => row.date >= state.from && row.date <= state.to);
  const valid = filtered.map(row => ({...row, n: gradeScore(row)}))
    .filter(row => row.n !== null && !officialKind(row));
  const average = valid.length ? valid.reduce((s, row) => s + row.n, 0) / valid.length : 0;
  const groups = new Map();
  valid.forEach(row => {
    const values = groups.get(row.subject) || [];
    values.push(row.n);
    groups.set(row.subject, values);
  });
  const weakest = [...groups].map(([name, values]) => ({
    name, mean: values.reduce((s, n) => s + n, 0) / values.length
  })).sort((a, b) => a.mean - b.mean)[0];
  return {
    average, count: valid.length,
    weakSubject: weakest && weakest.mean < 3.6 ? weakest.name : ''
  };
}

function loginPanel() {
  return '<form id="scs-login" class="scs-form">' +
    '<label>Почта пользователя Firebase<input type="email" name="email" required autocomplete="username"></label>' +
    '<label>Пароль<input type="password" name="password" required autocomplete="current-password"></label>' +
    '<button class="btn" type="submit">Войти и загрузить оценки</button></form>' +
    '<p class="mu sm">Используй аккаунт, созданный для ' + esc(childName) +
    '. Данные входа не сохраняются в коде приложения.</p>';
}

/* Iskra-specific grades UI. Vector keeps its existing independent view. */
const ikPeriodsKey = 'iskra_grade_periods_v1';
const ikReadPeriods = () => {
  try { const value = JSON.parse(localStorage.getItem(ikPeriodsKey) || '{}'); return value && typeof value==='object' ? value : {}; }
  catch (_) { return {}; }
};
const ikSavedPeriods = ikReadPeriods();
let ikPeriod='all',ikSubject='',ikEditing='',ikPeriodChosen=false;
const ikPresets=[['all','Всё'],['q1','1 четверть'],['q2','2 четверть'],['q3','3 четверть'],['q4','4 четверть'],['custom','Другие даты']];
const ikYearForDate=d=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return '';
  const y=Number(d.slice(0,4))-(Number(d.slice(5,7))<9?1:0);
  return y+'/'+(y+1);
};
// Show only the currently active academic year in Iskra.
const ikYearValue=()=>ikYearForDate(today());
const ikTermKey=(period,year=ikYearValue())=>year+'#'+period;
// Infer quarter boundaries from teacher-issued official quarter grades.
// School-specific dates configured by the parent always take precedence.
function ikOfficialTermEnds(){
  const ends={};
  const rows=(state.data?.grades||[]).filter(r=>
    ikYearForDate(r.date)===ikYearValue()&&gradeScore(r)!==null&&
    (officialKind(r)==='За четверть'||
      (officialKind(r)==='Итоговая'&&/^\d{4}-(10-(?:2[0-9]|3[01])|11-(?:0[1-9]|1[0-5]))$/.test(r.date)))
  ).sort((a,b)=>a.date.localeCompare(b.date));
  const bounds=[['q1',9,11],['q2',12,2],['q3',3,4],['q4',5,8]];
  for(const row of rows){
    const month=Number(row.date.slice(5,7));
    const q=bounds.find(([id,start,end])=>start<=end?month>=start&&month<=end:month>=start||month<=end)?.[0];
    if(q&&(!ends[q]||row.date>ends[q]))ends[q]=row.date;
  }
  return ends;
}
function ikDerivedRange(period){
  if(!/^q[1-4]$/.test(period)||!state.data)return null;
  const year=Number(ikYearValue().split('/')[0]),official=ikOfficialTermEnds();
  const schoolReportedEnd=official.q1||null;
  // This school's 2026 autumn break starts after 25 October.
  // A built-in fallback is only used until official records or parent dates are available.
  const fallbackEnd=ikYearValue()==='2026/2027'?'2026-10-25':null;
  const firstEnd=schoolReportedEnd||fallbackEnd;
  const starts={q1:year+'-09-01'};
  if(firstEnd)starts.q2=ikDatePlus(firstEnd,1);
  if(official.q2)starts.q3=ikDatePlus(official.q2,1);
  if(official.q3)starts.q4=ikDatePlus(official.q3,1);
  const ends={q1:firstEnd,q2:official.q2,q3:official.q3,q4:official.q4};
  // Current term is open until today. Without a known boundary, never claim
  // precise dates for a future quarter.
  const start=starts[period];
  if(!start)return null;
  const end=ends[period]||today();
  return start<=end?{from:start,to:end,inferred:true,estimated:!!fallbackEnd&&!schoolReportedEnd&&(period==='q1'||period==='q2')}:null;
}
function ikDatePlus(date,delta){
  const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+delta);
  return ikLocalDate(d);
}
function ikAutoPeriod(){
  if(ikPeriodChosen)return;
  const current=today(),quarters=['q1','q2','q3','q4'];
  const official=ikOfficialTermEnds();
  // Completed quarters outrank a stale parent-entered date range.
  const closed=quarters.filter(q=>official[q]&&official[q]<current);
  const next=closed.length?quarters[Math.min(quarters.length-1,quarters.indexOf(closed.at(-1))+1)]:null;
  if(next&&ikDerivedRange(next)){ikPeriod=next;return}
  // 2026 autumn quarter is already over. Do not silently reopen Q1.
  if(ikYearValue()==='2026/2027'&&current>='2026-10-26'&&current<'2027-01-01'&&ikDerivedRange('q2')){
    ikPeriod='q2';return;
  }
  const saved=quarters.find(q=>{
    const p=ikSavedPeriods[ikTermKey(q)];
    return ikValidRange(p)&&ikYearForDate(p.from)===ikYearValue()&&current>=p.from&&current<=p.to;
  });
  if(saved){ikPeriod=saved;return}
  const inferred=quarters.find(q=>{const p=ikDerivedRange(q);return p&&current>=p.from&&current<=p.to});
  ikPeriod=inferred||'all';
}
const ikValidRange = p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.from||'') &&
  /^\d{4}-\d{2}-\d{2}$/.test(p.to||'') && p.from<=p.to;
const ikRange=()=>{
  if(ikPeriod==='all')return null;
  const p=ikSavedPeriods[ikTermKey(ikPeriod)];
  return ikValidRange(p)&&ikYearForDate(p.from)===ikYearValue()&&ikYearForDate(p.to)===ikYearValue()?p:ikDerivedRange(ikPeriod);
};
const ikFiltered = () => {
  if(!state.data)return [];
  const bounds=ikRange();
  return state.data.grades.filter(r => ikYearForDate(r.date)===ikYearValue()&&(ikPeriod==='all' || (bounds && r.date>=bounds.from && r.date<=bounds.to)))
    .map(r => ({...r,n:gradeScore(r)})).filter(r => r.n!==null);
};
const ikWorks = rows => rows.filter(r=>!officialKind(r));
const ikSort = rows => rows.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
const ikMean = rows => rows.length ? rows.reduce((total,r)=>total+r.n,0)/rows.length : null;
const ikF = n => n===null?'—':(Math.abs(n)<0.005?0:n).toFixed(2).replace('.',',');
const ikDeltaLabel=n=>n===null?'нет сравнения':n!==0?'к предыдущим 7 дням':'без изменений';
const ikLocalDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const ikDate = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso||'') ? iso.slice(8)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4) : '—';
const ikStar = '<img class="ik-star" src="./assets/iskra/hero-star.webp" width="94" height="94" decoding="async" alt="" aria-hidden="true">';
const ikIcons = {'Русский язык':'📕','Русский':'📕','Математика':'🧮','Литературное чтение':'📖','Чтение':'📖','Английский язык':'🔤','Английский':'🔤','Окружающий мир':'🌿','Физическая культура':'🏃','Физкультура':'🏃','Музыка':'🎵','Изобразительное искусство':'🎨','ИЗО':'🎨','Технология':'🧩','ОРКСЭ':'📚'};
const ikSubjectIcon = name => ikIcons[name]||'📘';
const ikSubjectSprite = name => {
  const key=name.toLocaleLowerCase('ru-RU');
  const kind=/математик/.test(key)?'nav_grades':
    /английск|иностран/.test(key)?'task_english':
    /литератур|чтени|русск/.test(key)?'task_read':
    /физкультур|физическ/.test(key)?'task_walk':
    /музык/.test(key)?'sparkles':
    /окружающ|природ/.test(key)?'achievement_helper':
    /изобраз|изо|художеств/.test(key)?'task_star':
    /технолог|труд/.test(key)?'task_clothes':'task_book';
  return '<span class="ik-art ik-art-'+kind+' ik-art--grade" aria-hidden="true"></span>';
};
function ikTrend(rows) {
  const sorted=ikSort(rows),totals=[];
  let total=0; sorted.forEach((r,i)=>{total+=r.n;totals.push({n:total/(i+1),date:r.date})});
  const count=Math.min(45,totals.length);
  const shown=count<2?totals:Array.from({length:count},(_,i)=>totals[Math.round(i*(totals.length-1)/(count-1))]);
  if(!shown.length)return {html:'<div class="ik-empty">График появится после первой оценки.</div>',growth:null};
  if(shown.length<2)return {html:'<div class="ik-empty">Появится после следующей оценки.</div>',growth:null};
  const W=320,H=132,L=28,R=6,T=15,B=23;
  const x=i=>L+(W-L-R)*i/(shown.length-1),y=n=>T+(5-n)*(H-T-B)/3;
  const coords=shown.map((p,i)=>[x(i),y(p.n)]);
  const line=coords.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const last=coords[coords.length-1],first=coords[0],bottom=H-B;
  const area=line+' L'+last[0].toFixed(1)+' '+bottom+' L'+first[0].toFixed(1)+' '+bottom+' Z';
  const grid=[2,3,4,5].map(v=>'<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="6" y="'+(y(v)+4)+'">'+v+'</text>').join('');
  const dotStep=Math.max(1,Math.ceil(coords.length/11));
  const dots=coords.map((p,i)=>(i%dotStep===0||i===coords.length-1)?'<circle class="dot" cx="'+p[0]+'" cy="'+p[1]+'" r="'+(i===coords.length-1?4.5:2.7)+'"/>':'').join('');
  const lab1=shown[0].date.slice(8)+'.'+shown[0].date.slice(5,7),lab2=shown[shown.length-1].date.slice(8)+'.'+shown[shown.length-1].date.slice(5,7);
  const labelX=Math.max(25,Math.min(W-44,last[0]-21)),labelY=Math.max(3,last[1]-25);
  const bubble='<rect x="'+labelX+'" y="'+labelY+'" width="43" height="21" rx="8" fill="#8b62ee"/><text x="'+(labelX+21.5)+'" y="'+(labelY+15)+'" text-anchor="middle" style="fill:white;font-size:11px;font-weight:700">'+ikF(shown.at(-1).n)+'</text>';
  const svg='<svg class="ik-chart" viewBox="0 0 320 132" role="img" aria-label="Изменение среднего балла за выбранный период">'+grid+'<path class="area" d="'+area+'"/><path class="line" d="'+line+'"/>'+dots+bubble+'<text x="'+L+'" y="129">'+lab1+'</text><text x="314" y="129" text-anchor="end">'+lab2+'</text></svg>';
  // Anchor comparison to the selected period's most recent grade, not today's date.
  const anchor=new Date(sorted.at(-1).date+'T12:00:00'),start=new Date(anchor),mid=new Date(anchor);
  start.setDate(start.getDate()-13);
  mid.setDate(mid.getDate()-6);
  const from=ikLocalDate(start),boundary=ikLocalDate(mid),end=ikLocalDate(anchor);
  const recent=sorted.filter(r=>r.date>=boundary&&r.date<=end),previous=sorted.filter(r=>r.date>=from&&r.date<boundary);
  const raw=recent.length&&previous.length?ikMean(recent)-ikMean(previous):null;
  return {html:svg,growth:raw===null?null:Math.abs(raw)<.005?0:raw};
}
function ikPeriodButtons(){
  return '<div class="ik-filter-row">'+ikPresets.map(([id,name])=>'<button type="button" class="ik-filter '+(ikPeriod===id?'active':'')+'" data-ik-period="'+id+'">'+name+'</button>').join('')+'</div>';
}
function ikPeriodEditor(){
  if(ikPeriod==='all')return '';
  const p=ikRange();
  if(ikPeriod!=='custom'){
    return p?'<p class="ik-muted ik-period-caption">'+ikDate(p.from)+' — '+ikDate(p.to)+(p.estimated?' · ориентировочно':p.inferred?' · по итоговым оценкам из дневника':'')+'</p>':
      '<div class="ik-issues">Даты этой четверти пока не настроены. Попроси взрослого настроить учебные периоды в разделе «Для родителей».</div>';
  }
  if(p&&ikEditing!=='custom')return '<div class="ik-row-between"><span class="ik-muted">'+ikDate(p.from)+' — '+ikDate(p.to)+'</span><button type="button" class="ik-btn-small" data-ik-edit-period="1">Изменить даты</button></div>';
  const value=ikSavedPeriods[ikTermKey('custom')]||{};
  return '<form id="ik-period-form" class="ik-period-editor"><b>Выбери даты</b>'+
    '<label>С<input type="date" name="from" required value="'+esc(value.from||'')+'"></label>'+
    '<label>По<input type="date" name="to" required value="'+esc(value.to||'')+'"></label>'+
    '<button class="btn" type="submit">Показать оценки</button></form>';
}
function ikPeriodSettingsHtml(){
  const year=ikYearValue();
  let html='<h2>Учебные четверти</h2><p class="mu sm">Задай даты четвертей текущего учебного года ('+esc(year)+'). Даты не меняют оценки в дневнике.</p>'+
    '<form id="ik-term-settings" class="ik-period-editor"><input type="hidden" name="year" value="'+esc(year)+'">';
  for(const [q,name] of ikPresets.filter(x=>/^q[1-4]$/.test(x[0]))){
    const val=ikSavedPeriods[ikTermKey(q,year)]||{};
    html+='<fieldset class="ik-term-field"><legend>'+name+'</legend><label>Начало<input type="date" name="'+q+'_from" value="'+esc(val.from||'')+'"></label><label>Конец<input type="date" name="'+q+'_to" value="'+esc(val.to||'')+'"></label></fieldset>';
  }
  return html+'<button type="submit" class="btn">Сохранить четверти</button></form>';
}
function ikFreshness() {
  if(!state.data?.syncedAt)return 'Дата последней выгрузки неизвестна';
  const date=new Date(state.data.syncedAt);
  if(!Number.isFinite(date.getTime()))return 'Дата последней выгрузки неизвестна';
  const stamp=date.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const stale=Date.now()-date.getTime()>24*3600*1000;
  return (state.offline?'Офлайн-копия':'Выгрузка из школы')+' · '+stamp+(stale?' · может устареть':'');
}
function ikGradeList(rows) {
  if(!rows.length)return '<div class="ik-empty">Оценок за работы пока нет.</div>';
  return ikSort(rows).reverse().map(r=>'<div class="ik-grade-detail"><span class="ik-detail-date">'+ikDate(r.date)+'</span><span class="ik-detail-type">'+esc(r.type||'Работа на уроке')+'</span><strong>'+r.n+'</strong></div>').join('');
}
function ikSubjectPage() {
  const name=ikSubject,all=ikFiltered().filter(r=>r.subject===name),works=ikWorks(all),official=all.filter(r=>officialKind(r));
  const mean=ikMean(works),last=ikSort(works).at(-1),tr=ikTrend(works);
  const officially=ikSort(official).at(-1);
  const quarter=/^q[1-4]$/.test(ikPeriod),finalGrade=quarter&&officially?.n!==undefined?officially.n:null;
  return '<div class="ik-page scs-iskra ik-detail-page"><div class="ik-row-between"><button type="button" class="ik-btn-small" data-ik-back="1">‹ Назад</button><span class="ik-cloud-pill">☁ Из дневника</span></div>'+
    '<div class="ik-row"><span class="ik-sub-icon">'+ikSubjectSprite(name)+'</span><div><h1 style="font-size:24px">'+esc(name)+'</h1><span class="ik-muted">'+works.length+' оценок за работы</span></div></div>'+
    ikPeriodButtons()+ikPeriodEditor()+
    '<div class="ik-main-card"><div class="ik-hero-split"><div><div class="ik-caption">'+(finalGrade!==null?'Итоговая за четверть':'Средний за работы')+'</div><div class="ik-number">'+(finalGrade!==null?finalGrade:ikF(mean))+'</div><div class="ik-caption">'+(finalGrade!==null?'Официально · средний за работы '+ikF(mean):'По выбранному периоду')+'</div></div>'+ikStar+'</div></div>'+
    (officially?'<div class="ik-official"><div><b>🏅 '+esc(officialKind(officially))+'</b><small>Официально · '+ikDate(officially.date)+'</small></div><strong>'+officially.n+'</strong></div>':'')+
    (mean!==null&&/^q[1-4]$/.test(ikPeriod)&&!officially&&ikRange()?'<div class="ik-tile"><small>Прогноз за выбранную четверть (ориентировочно)</small><strong>'+forecast(mean)+'</strong><small>По простому среднему; официальная оценка может отличаться.</small></div>':'')+
    '<div class="card"><div class="ik-graph-label"><b>Динамика среднего балла</b></div>'+tr.html+'</div>'+
    '<div class="ik-time-stat"><div class="ik-tile"><div class="ik-tile-icon">✏️</div><strong>'+works.length+'</strong><small>всего оценок</small></div>'+
    '<div class="ik-tile"><div class="ik-tile-icon"><span class="ik-art ik-art-task_star ik-art--stat" aria-hidden="true"></span></div><strong>'+(last?last.n:'—')+'</strong><small>последняя</small></div>'+
    '<div class="ik-tile"><div class="ik-tile-icon">↗</div><strong class="'+(tr.growth!==null&&tr.growth>0?'ik-positive':'')+'">'+(tr.growth===null?'—':(tr.growth>0?'+':'')+ikF(tr.growth))+'</strong><small>'+ikDeltaLabel(tr.growth)+'</small></div></div>'+
    '<div class="card"><b>Все оценки за работы</b>'+ikGradeList(works)+'</div>'+
    (official.length?'<div class="card"><b>Официальные итоговые оценки</b>'+ikGradeList(official)+'</div>':'')+
    '<p class="ik-muted">Итоговые оценки показываются отдельно и не участвуют в среднем. Все оценки за работы равновесные.</p></div>';
}
function viewIskra() {
  const title='<div class="ik-heading ik-compact-header ik-subscreen-header"><button type="button" class="ik-header-back" data-action="ikToToday" aria-label="Вернуться к делам">‹</button><h1>Школа</h1><span class="ik-cloud-pill">☁ Из дневника</span></div>';
  if(ikSubject && state.data&&state.user)return ikSubjectPage();
  let html='<div class="ik-page scs-iskra">'+title;
  if(!state.user){
    return html+'<div class="card"><b>Школьный дневник</b>'+
      '<p class="ik-muted">'+(state.phase==='init'?'Проверяем подключение…':'Попроси взрослого один раз подключить оценки в разделе «Я» → «Для родителей».')+'</p>'+
      (state.error?'<p class="scs-warning">'+esc(state.error)+'</p>':'')+'</div></div>';
  }
  html+='<div class="ik-row-between"><span class="ik-muted">'+esc(ikFreshness())+'</span><button type="button" class="ik-btn-small" data-sc-action="refresh" '+(state.loading?'disabled':'')+'>↻ Проверить</button></div>';
  if(state.error)html+='<div class="ik-issues" role="status">'+esc(state.error)+(state.data?' Показаны последние полученные данные.':'')+'</div>';
  if(!state.data){
    html+='<div class="card ik-empty">'+ikStar+'<h2>'+(state.phase==='loading'?'Загружаем оценки…':'Оценок пока нет')+'</h2><p>После выгрузки с MacBook оценки появятся здесь автоматически.</p></div>';
    return html+'</div>';
  }
  // Show the current term immediately, before the analytics or grade cards.
  html+='<div class="ik-school-period-lead"><b>Период: '+esc(ikPresets.find(p=>p[0]===ikPeriod)?.[1]||'Школа')+'</b>'+
    '<small>'+(ikPeriod==='q2'?'Первая четверть завершена · началась вторая':'Оценки школьного дневника')+'</small></div>'+
    ikPeriodButtons()+ikPeriodEditor();
  const available=ikRange(),all=ikFiltered(),works=ikWorks(all),official=all.filter(r=>officialKind(r));
  const mean=ikMean(works),sorted=ikSort(works),last=sorted.at(-1),tr=ikTrend(works),subjects=new Map();
  all.forEach(r=>{
    if(!subjects.has(r.subject))subjects.set(r.subject,{works:[],official:[]});
    subjects.get(r.subject)[officialKind(r)?'official':'works'].push(r);
  });
  const quarter=/^q[1-4]$/.test(ikPeriod);
  const finalMarks=quarter?[...subjects.values()].map(x=>ikSort(x.official).at(-1)?.n).filter(n=>n!==undefined):[];
  const officialMean=finalMarks.length?finalMarks.reduce((a,b)=>a+b,0)/finalMarks.length:null;
  const primarySubject=group=>quarter?(ikSort(group.official).at(-1)?.n??ikMean(group.works)):ikMean(group.works);
  const ordered=[...subjects].sort((a,b)=>(primarySubject(b[1])??-1)-(primarySubject(a[1])??-1)||a[0].localeCompare(b[0],'ru'));
  html+='<div class="ik-main-card ik-hero-split"><div><div class="ik-caption">'+(officialMean!==null?'Средняя итоговая за четверть':'Средний за работы')+'</div><div class="ik-number">'+(officialMean!==null?ikF(officialMean):ikF(mean))+'</div><div class="ik-caption">'+(officialMean!==null?finalMarks.length+' официальных итоговых · ':'')+(ikPeriod==='all'?'текущий учебный год':available?ikDate(available.from)+' — '+ikDate(available.to):'период не настроен')+'</div></div>'+ikStar+'</div>';
  if(ikPeriod==='q2'){
    const firstEnd=ikOfficialTermEnds().q1||ikDerivedRange('q1')?.to;
    const previous=(state.data.grades||[]).filter(r=>
      ikYearForDate(r.date)===ikYearValue()&&r.date<=firstEnd&&
      (officialKind(r)==='За четверть'||officialKind(r)==='Итоговая')&&gradeScore(r)!==null
    ).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
    const bySubject=new Map();
    previous.forEach(r=>{if(!bySubject.has(r.subject))bySubject.set(r.subject,r)});
    const finals=[...bySubject.values()].sort((a,b)=>a.subject.localeCompare(b.subject,'ru'));
    if(finals.length){
      html+='<section class="ik-school-finals"><div class="ik-row-between"><h2 class="ik-sec-title">Итоги 1-й четверти</h2><span class="ik-school-official-chip">Официальные</span></div>'+
        '<div class="ik-school-finals-grid">'+finals.slice(0,4).map(r=>
          '<div class="ik-school-final"><span>'+esc(r.subject)+'</span><strong>'+gradeScore(r)+'</strong></div>'
        ).join('')+'</div>'+
        '<button type="button" class="ik-school-finals-more" data-ik-period="q1">'+
        (finals.length>4?'Все '+finals.length+' итоговых':'Смотреть 1-ю четверть')+' ›</button></section>';
    }else{
      html+='<div class="ik-school-finals-empty">Итоговые оценки за 1-ю четверть не найдены в последней выгрузке. Проверь дату синхронизации или открой 1-ю четверть.</div>';
    }
  }
  // Child-first view: recent school results precede the optional adult-style analytics.
  const latest=ikSort(works).slice(-3).reverse();
  if(latest.length){
    const kindness=n=>n===5?'Отличный результат!':n===4?'Хорошая работа!':n===3?'Есть что потренировать':'Можно разобраться вместе со взрослым';
    html+='<div class="ik-child-grades"><div class="ik-row-between"><h2 class="ik-sec-title">Последние оценки</h2>'+
      '<span class="ik-tab-sublabel">Из дневника</span></div>'+
      latest.map(r=>'<button type="button" class="ik-child-grade-row" data-ik-subject="'+esc(r.subject)+'">'+
        '<span class="ik-child-grade-icon">'+ikSubjectSprite(r.subject)+'</span>'+
        '<span class="ik-child-grade-copy"><b>'+esc(r.subject)+'</b><small>'+esc(kindness(r.n))+' · '+esc(ikDate(r.date))+'</small></span>'+
        '<strong class="ik-child-grade-mark grade-'+r.n+'">'+r.n+'</strong></button>').join('')+
      '</div>';
  }
  if(ikPeriod!=='all'&&!available)html+='<div class="ik-issues">Для этого периода пока не указаны даты. После сохранения появятся оценки и график.</div>';
  else {
    html+='<details class="ik-grade-analytics"><summary>График и подробная статистика <span aria-hidden="true">⌄</span></summary>';
    html+='<div class="card"><div class="ik-graph-label"><b>Динамика среднего балла</b><span class="ik-muted">За работы</span></div>'+tr.html+
      '<p class="ik-kpi-meaning">Сравнение средних за последние 7 дней выбранного периода и предыдущие 7 дней.</p></div>';
    html+='<div class="ik-time-stat"><div class="ik-tile"><div class="ik-tile-icon">↗</div><strong class="'+(tr.growth!==null&&tr.growth>0?'ik-positive':'')+'">'+(tr.growth===null?'—':(tr.growth>0?'+':'')+ikF(tr.growth))+'</strong><small>'+ikDeltaLabel(tr.growth)+'</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon"><span class="ik-art ik-art-task_star ik-art--stat" aria-hidden="true"></span></div><strong>'+(last?last.n:'—')+'</strong><small>последняя оценка</small></div>'+
      '<div class="ik-tile"><div class="ik-tile-icon"><span class="ik-art ik-art-nav_grades ik-art--stat" aria-hidden="true"></span></div><strong>'+works.length+'</strong><small>всего оценок</small></div></div>';
    html+='</details>';
    html+='<div class="ik-row-between"><h2 class="ik-sec-title">Предметы</h2><span class="ik-muted">По среднему ↓</span></div>';
    html+='<div class="ik-list" style="padding:4px 12px">'+(ordered.length?ordered.map(([subject,group])=>{
      const a=ikMean(group.works),end=ikSort(group.official).at(-1),primary=quarter&&end?end.n:a,progress=primary===null?0:Math.max(0,Math.min(100,(primary-2)/3*100));
      return '<button type="button" class="ik-grade-row" style="width:100%;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer" data-ik-subject="'+esc(subject)+'"><span class="ik-sub-icon">'+ikSubjectSprite(subject)+'</span>'+
        '<span class="ik-grade-name">'+esc(subject)+(quarter&&end?'<small class="ik-muted" style="display:block;font-size:10px">Итоговая за четверть · средний '+ikF(a)+'</small>':end?'<small class="ik-muted" style="display:block;font-size:10px">Официально: '+end.n+'</small>':'')+'</span>'+
        '<span class="ik-grade-track"><span style="width:'+progress+'%"></span></span><span class="ik-grade-num">'+(primary===null?'—':quarter&&end?String(end.n):ikF(a))+'</span><span class="ik-chevron" style="font-size:17px;margin-left:0">›</span></button>';
    }).join(''):'<div class="ik-empty">Оценок за этот период пока нет.</div>')+'</div>';
  }
  html+='<p class="ik-muted">Средний рассчитывается по обычным оценкам за работы, без школьных коэффициентов. Официальные итоговые оценки в нём не участвуют. '+official.length+' итоговых показаны отдельно в предметах.</p>';
  return html+'</div>';
}

function view(legacy) {
  if (appKind === 'iskra') return viewIskra();
  const title = 'Оценки ' + childName + ' из школьного дневника';
  let body = '<section class="scs" id="school-cloud"><div class="card"><div class="scs-head"><b>' +
    esc(title) + '</b><span class="scs-flag">Только чтение</span></div>';
  if (state.phase === 'init') body += '<p class="mu sm">Подключаем школьный дневник…</p>';
  else if (!state.user) body += loginPanel();
  else {
    body += '<div class="mu sm">Аккаунт: ' + esc(state.user.email || 'Firebase') + '</div>';
    body += '<div class="scs-actions"><button type="button" class="btn g" data-sc-action="refresh" ' +
      (state.loading ? 'disabled' : '') + '>Обновить</button>' +
      '<button type="button" class="btn g" data-sc-action="logout">Выйти</button></div>';
    if (state.data) {
      const d = new Date(state.data.syncedAt);
      const date = Number.isFinite(d.getTime()) ? d.toLocaleString('ru-RU') : 'неизвестно';
      const full = state.data.grades.filter(row => gradeScore(row) !== null);
      const officialCount = full.filter(row => !!officialKind(row)).length;
      body += '<p class="mu sm">В дневнике: ' + (full.length - officialCount) +
        ' оценок за работы' + (officialCount ? ' · ' + officialCount + ' итоговых' : '') +
        ' · получено MacBook: ' + esc(date) + '</p>';
    }
  }
  if (state.error) body += '<p class="scs-warning" role="status">' + esc(state.error) + '</p>';
  if (state.phase === 'loading') body += '<p class="mu sm">Загружаем оценки…</p>';
  if (state.phase === 'empty') body += '<p class="mu sm">Проверь привязку UID в сборщике MacBook.</p>';
  body += '</div>';
  if (state.data && state.user) body += cloudGrades();
  return body + '</section>';
}

const css = document.createElement('style');
css.textContent = '.scs{display:block}.scs .scs-head,.scs .scs-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}.scs .scs-flag{font-size:11px;opacity:.75}.scs .scs-form{display:grid;gap:12px;margin-top:15px}.scs .scs-form label,.scs .scs-filters label{display:grid;gap:6px;font-size:13px;font-weight:600}.scs input{padding:11px;border:1px solid var(--ln);border-radius:11px;background:var(--bg);color:var(--tx);font:inherit;min-width:0;box-sizing:border-box;width:100%}.scs .scs-actions{justify-content:flex-start;margin-top:12px}.scs .scs-filters{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.scs .scs-warning{color:var(--bad);margin:12px 0;font-size:14px}.scs .scs-manual{width:100%;margin:14px 0}.scs .chips{display:flex;gap:6px;flex-wrap:wrap}.scs .chips .chip{cursor:default}.scs .sub{margin:9px 0}@media(max-width:360px){.scs .scs-filters{grid-template-columns:1fr}}';
css.textContent += '.scs .scs-grade-audit{margin-top:14px}.scs .scs-grade-audit summary{cursor:pointer;font-size:13px;font-weight:700;padding:8px 0}.scs .scs-grade-audit ol{padding:0;list-style:none;margin:6px 0}.scs .scs-grade-detail{display:grid;grid-template-columns:100px 32px minmax(0,1fr);gap:10px;align-items:center;border-bottom:1px solid var(--ln);padding:9px 0;font-size:13px}.scs .scs-grade-date{font-variant-numeric:tabular-nums}.scs .scs-grade-number{display:inline-flex;width:30px;height:30px;border-radius:50%;align-items:center;justify-content:center;background:var(--bg);font-weight:750}.scs .scs-grade-detail .mu{overflow-wrap:anywhere}@media(max-width:360px){.scs .scs-grade-detail{grid-template-columns:82px 30px minmax(0,1fr);gap:6px}}';
css.textContent += '.scs .scs-final-list{display:grid;gap:8px;margin:12px 0}.scs .scs-final-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--ln);border-radius:12px;background:var(--bg)}.scs .scs-final-label{font-weight:700;flex:1;min-width:135px}.scs .scs-final-mark{font-size:22px;font-weight:800;border-radius:9px;padding:3px 10px;background:var(--bg)}';
document.head.appendChild(css);
window.schoolCloud = {view,summary,
  subjects:()=>{
    if(appKind!=='iskra'||!state.user||!state.data)return [];
    return [...new Set(state.data.grades.filter(r=>ikYearForDate(r.date)===ikYearValue())
      .map(r=>r.subject).filter(v=>typeof v==='string'&&v.trim()))]
      .sort((a,b)=>a.localeCompare(b,'ru'));
  },
status:()=>({phase:state.phase,error:state.error,loading:state.loading,connected:!!state.user}),
  // Read-only normalized snapshot for the Vector functional dashboard. No grade data is persisted by Vector.
  snapshot:()=>state.user&&state.data?{
    schoolYear:state.data.schoolYear,syncedAt:state.data.syncedAt,
    selectedFrom:state.from,selectedTo:state.to,
    grades:state.data.grades.map(row=>({
      id:row.id,date:row.date,subject:row.subject,type:row.type,
      score:gradeScore(row),official:!!officialKind(row),officialLabel:officialKind(row)
    })).filter(row=>row.score!==null)
  }:null,
  loginHtml:()=>state.user?'<p class="mu sm">Дневник уже подключён.</p>':loginPanel(),periodLabel:()=>ikPeriod==='all'?'за текущий учебный год':(ikPeriod==='custom'?'за выбранные даты':(ikPresets.find(x=>x[0]===ikPeriod)?.[1]||'за период')+' · '+ikYearValue()),
offlineEnabled:()=>{try{return localStorage.getItem('iskra_offline_enabled')==='1'}catch(_){return false}},
setOfflineEnabled:value=>{
  if(appKind!=='iskra')return false;
  try{
    if(value&& !confirm('Разрешить сохранять оценки Полины в памяти этого устройства для просмотра без интернета? Данные будут доступны пользователям этого браузера.'))return false;
    localStorage.setItem('iskra_offline_enabled',value?'1':'0');
    const uid=auth.currentUser?.uid;
    if(!value&&uid)localStorage.removeItem('iskra_offline_grades_'+uid);
    if(value&&uid&&state.data)localStorage.setItem('iskra_offline_grades_'+uid,JSON.stringify({schemaVersion:1,source:'petersburgedu',schoolYear:state.data.schoolYear,syncedAt:state.data.syncedAt,rangeFrom:state.data.rangeFrom,rangeTo:state.data.rangeTo,grades:state.data.grades}));
    return true;
  }catch(_){return false}
},
summaryBetween:(from,to)=>{
  if(appKind!=='iskra'||!state.user||!state.data)return null;
  const rows=state.data.grades.filter(r=>ikYearForDate(r.date)===ikYearValue()&&(!from||r.date>=from)&&(!to||r.date<=to))
    .map(r=>({...r,n:gradeScore(r)})).filter(r=>r.n!==null&&!officialKind(r));
  return {count:rows.length,average:rows.length?ikMean(rows):null};
},
overallSummary:()=>{
  const rows=(state.data?.grades||[]).filter(row=>ikYearForDate(row.date)===ikYearValue()).map(row=>({...row,n:gradeScore(row)})).filter(r=>r.n!==null&&!officialKind(r));
  return {count:rows.length,average:rows.length?ikMean(rows):null};
},termSettingsHtml:ikPeriodSettingsHtml,resetSubject:()=>{ikSubject='';},connection:()=>({isConnected:!!state.user,email:state.user?.email||''})};
notify();

onAuthStateChanged(auth, user => {
  state.user = user;
  state.data = null;
  state.offline = false;
  state.error = '';
  state.loading = false;
  state.lastFetch = 0;
  state.phase = user ? 'loading' : 'signedOut';
  notify();
  if (user) refresh(true);
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'scs-login') return;
  event.preventDefault();
  const form = event.target;
  const email = String(form.elements.email.value || '').trim();
  const password = String(form.elements.password.value || '');
  state.error = '';
  state.phase = 'loading';
  notify();
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    state.phase = 'signedOut';
    state.error = errorText(err);
    notify();
    const target=document.querySelector('#scs-login');
    if(target){
      let message=document.querySelector('#scs-login-error');
      if(!message){message=document.createElement('p');message.id='scs-login-error';message.className='scs-warning';message.setAttribute('role','status');target.after(message)}
      message.textContent=state.error;
    }
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-sc-action]');
  if (!button) return;
  if (button.dataset.scAction === 'refresh') {
    refresh(true);
  } else if (button.dataset.scAction === 'logout') {
    if(appKind==='iskra'){try{localStorage.removeItem('iskra_offline_grades_'+auth.currentUser?.uid)}catch(_){}}
    await signOut(auth);
    if(appKind==='iskra')document.dispatchEvent(new CustomEvent('ikGradeSignedOut'));
  }
});

document.addEventListener('change', event => {
  if (!event.target.matches('[data-sc-date]')) return;
  const key = event.target.dataset.scDate;
  if (key === 'from' || key === 'to') {
    const value = event.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      state[key] = value;
      notify();
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.user) refresh();
});


document.addEventListener('click', event => {
  if (appKind !== 'iskra') return;
  const period=event.target.closest('[data-ik-period]');
  if(period){ikPeriod=period.dataset.ikPeriod;ikPeriodChosen=true;ikEditing='';notify();return}
  if(event.target.closest('[data-ik-edit-period]')){ikEditing=ikPeriod;notify();return}
  const subj=event.target.closest('[data-ik-subject]');
  if(subj){ikSubject=subj.dataset.ikSubject;notify();window.scrollTo(0,0);return}
  if(event.target.closest('[data-ik-back]')){ikSubject='';notify();window.scrollTo(0,0)}
});
document.addEventListener('change',event=>{
  if(appKind!=='iskra')return;
  // Academic-year switching is intentionally unavailable in Iskra.
});
document.addEventListener('submit', event => {
  if(appKind!=='iskra'||event.target.id!=='ik-period-form')return;
  event.preventDefault();
  const from=event.target.elements.from.value,to=event.target.elements.to.value;
  if(!ikValidRange({from,to})||ikYearForDate(from)!==ikYearValue()||ikYearForDate(to)!==ikYearValue()){
    state.error='Выбери даты в пределах текущего учебного года.';notify();return
  }
  ikSavedPeriods[ikTermKey(ikPeriod)]={from,to};
  try{localStorage.setItem(ikPeriodsKey,JSON.stringify(ikSavedPeriods))}catch(_){}
  ikEditing='';state.error='';notify();
});
document.addEventListener('submit',event=>{
  if(appKind!=='iskra'||event.target.id!=='ik-term-settings')return;
  event.preventDefault();
  const form=event.target,year=ikYearValue(),next={};
  for(const q of ['q1','q2','q3','q4']){
    const from=form.elements[q+'_from'].value,to=form.elements[q+'_to'].value;
    if(!!from!==!!to||(from&&(!ikValidRange({from,to})||ikYearForDate(from)!==year))){
      state.error='Проверь границы четвертей: обе даты должны относиться к выбранному учебному году.';
      let msg=form.querySelector('.scs-warning');
      if(!msg){msg=document.createElement('p');msg.className='scs-warning';msg.setAttribute('role','status');form.append(msg)}
      msg.textContent=state.error;notify();return;
    }
    if(from)next[ikTermKey(q,year)]={from,to};
  }
  const ordered=['q1','q2','q3','q4'].map(q=>next[ikTermKey(q,year)]).filter(Boolean);
  if(ordered.some((p,i)=>i>0&&p.from<=ordered[i-1].to)){
    state.error='Четверти должны идти по порядку и не пересекаться.';
    let msg=form.querySelector('.scs-warning');
    if(!msg){msg=document.createElement('p');msg.className='scs-warning';msg.setAttribute('role','status');form.append(msg)}
    msg.textContent=state.error;notify();return;
  }
  for(const q of ['q1','q2','q3','q4'])delete ikSavedPeriods[ikTermKey(q,year)];
  Object.assign(ikSavedPeriods,next);
  try{localStorage.setItem(ikPeriodsKey,JSON.stringify(ikSavedPeriods))}catch(_){}
  ikAutoPeriod();state.error='';
  document.dispatchEvent(new CustomEvent('ikTermSettingsSaved'));
  notify();
});
