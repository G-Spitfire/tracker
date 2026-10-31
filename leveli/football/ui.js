const $ = (selector, root = document) => root.querySelector(selector);
const view = $('#football-view');
const status = $('#football-status');
const leagueSelect = $('#football-league');
const seasonSelect = $('#football-season');
const DEMO = new URLSearchParams(location.search).get('football-demo') === '1';
const cacheKey = 'leveli-football-snapshots-v1';
const leagues = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'];
const leagueNames = {PL:'Английская Премьер-лига',PD:'Ла Лига',SA:'Серия А',BL1:'Бундеслига',FL1:'Лига 1',CL:'Лига чемпионов УЕФА'};
let snapshots = {};
let activeTab = 'overview';
let userKey = 'guest';
let favorites = {teams: [], players: []};
let compare = {teams: [], players: []};
let teamMetric = 'points';
let playerView = 'list';
let firebaseListenerStarted = false;
let currentUser = null;

const docId = (league, season, endpoint) => `${league}_${season}_${endpoint}`;
const isFresh = data => {
  const age=Date.now()-Date.parse(data?.fetchedAt||'');
  return Number.isFinite(age)&&age>=-5*60_000&&age<=36*3600_000;
};
const safeRead = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
function setStatus(message, kind = '') {
  status.replaceChildren();
  if (kind) { const pill = document.createElement('span'); pill.className = `pill ${kind}`; pill.textContent = kind === 'demo' ? 'Демо · тестовые данные' : kind === 'stale' ? 'Данные устарели' : 'Подтверждённые данные'; status.append(pill); }
  const text = document.createElement('span'); text.textContent = message; status.append(text);
}
function currentData(endpoint) { return snapshots[docId(leagueSelect.value, Number(seasonSelect.value), endpoint)] || null; }
function allRows(endpoint) { return currentData(endpoint)?.items || []; }
function sourceLine(data) {
  if (!data?.fetchedAt) return 'Источник и дата появятся вместе с подтверждённым снимком.';
  const date = new Date(data.fetchedAt);
  const age = Date.now() - date.getTime();
  return `football-data.org · снимок ${Number.isNaN(date.getTime()) ? 'с неизвестной датой' : date.toLocaleString('ru-RU')}${age > 36 * 3600_000 ? ' · данные старше 36 часов' : ''}`;
}
function dataAgeKind(data) {
  if (DEMO) return 'demo';
  return !data || !isFresh(data) ? 'stale' : '';
}
function loadLocalCache() {
  const cached = safeRead(cacheKey);
  if (cached && cached.schemaVersion === 1 && cached.snapshots && typeof cached.snapshots === 'object') {
    snapshots=Object.fromEntries(Object.entries(cached.snapshots).filter(([,item])=>item&&item.schemaVersion===1&&item.source==='football-data.org'
      &&leagues.includes(item.league)&&Number.isInteger(item.season)&&['standings','matches','scorers'].includes(item.endpoint)
      &&Array.isArray(item.items)&&Number.isFinite(Date.parse(item.fetchedAt||''))));
  }
}
function saveFavorites() { safeWrite(`leveli-football-favorites-v1:${userKey}`, favorites); }
function loadFavorites() {
  const saved = safeRead(`leveli-football-favorites-v1:${userKey}`);
  favorites = {teams: Array.isArray(saved?.teams) ? saved.teams.slice(0,3) : [], players: Array.isArray(saved?.players) ? saved.players.slice(0,3) : []};
  const stored = safeRead(`leveli-football-compare-v1:${userKey}`);
  compare = {teams: Array.isArray(stored?.teams) ? stored.teams.slice(0,2) : [], players: Array.isArray(stored?.players) ? stored.players.slice(0,2) : []};
  updateHomeSummary();
}
function saveCompare() { safeWrite(`leveli-football-compare-v1:${userKey}`, compare); }
function fmt(value) { return Number.isFinite(value) ? String(value) : 'Нет данных'; }
function teamRows() {
  return allRows('standings').filter(row => row.team && Number.isInteger(row.team.id) && row.type === 'TOTAL');
}
function scorerRows() {
  return allRows('scorers').filter(row => row.player && Number.isInteger(row.player.id));
}
function matches() { return allRows('matches').filter(row => row.homeTeam && row.awayTeam); }
function make(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function card(title, subtitle) {
  const section = make('article', undefined, 'football-card');
  section.append(make('h3', title));
  if (subtitle) section.append(make('p', subtitle, 'muted'));
  return section;
}
function button(label, onClick, className = 'football-favorite', pressed) {
  const node = make('button', label, className);
  node.type = 'button';
  if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed));
  node.addEventListener('click', onClick);
  return node;
}
function selectFor(items, selectedId, onChange, label) {
  const select = document.createElement('select');
  select.className = 'football-search';
  select.setAttribute('aria-label', label);
  for (const item of items) {
    const option = new Option(item.name, String(item.id));
    if (String(item.id) === String(selectedId)) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(Number(select.value)));
  return select;
}
function metricList(labels, values) {
  const list = make('div', undefined, 'football-metric-list');
  labels.forEach((label, index) => {
    const cell = make('div', undefined, 'metric');
    cell.append(make('small', label), make('strong', fmt(values[index])));
    list.append(cell);
  });
  return list;
}
function avatar(entity) {
  const box=make('span',undefined,'football-avatar');
  const initial=(entity?.shortName||entity?.name||'?').trim().slice(0,1).toLocaleUpperCase('ru');
  box.append(make('span',initial));
  return box;
}
function teamById(id) { return teamRows().find(row => row.team.id === Number(id)); }
function scorerById(id) { return scorerRows().find(row => row.player.id === Number(id)); }
function saveFav(type, item, league = leagueSelect.value) {
  const list = favorites[type];
  const id = type === 'teams' ? item.team.id : item.player.id;
  const index = list.findIndex(saved => saved.id === id);
  if (index >= 0) list.splice(index, 1);
  else {
    if (list.length >= 3) { window.alert('Можно сохранить не больше трёх избранных. Сначала убери одну запись.'); return; }
    const entity = type === 'teams' ? item.team : item.player;
    list.push({id, name: entity.shortName || entity.name || 'Без названия', league});
  }
  saveFavorites();
  updateHomeSummary();
  render();
}
function saveCompareId(type, id, slot) {
  const rows = type === 'teams' ? teamRows() : scorerRows();
  const item = rows.find(row => (type === 'teams' ? row.team.id : row.player.id) === Number(id));
  if (!item) return;
  compare[type][slot] = {id: Number(id), name: (type === 'teams' ? item.team : item.player).shortName || (type === 'teams' ? item.team : item.player).name};
  compare[type] = compare[type].slice(0, 2);
  saveCompare();
  render();
}
function chartSvg(series, label, metricLabel) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 360 205'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); svg.classList.add('football-chart');
  const ns = 'http://www.w3.org/2000/svg';
  const add = (tag, attrs, text) => { const node = document.createElementNS(ns, tag); for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, String(value)); if (text) node.textContent = text; svg.append(node); return node; };
  const values = series.flatMap(item => item.values.map(point => point.value)).filter(Number.isFinite);
  if (values.length < 2) return null;
  let min = Math.min(...values), max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const left=34, right=346, top=20, bottom=167;
  for (let i=0;i<4;i++) { const y=top+(bottom-top)*i/3; add('line',{x1:left,y1:y,x2:right,y2:y,stroke:'#eee8f3','stroke-width':1}); add('text',{x:2,y:y+4},String(Math.round(max-(max-min)*i/3))); }
  const colors=['#7b5ad4','#ef8ab9'];
  series.forEach((item,index)=>{
    const pts=item.values.map((point,i)=>[left+(right-left)*i/Math.max(item.values.length-1,1),bottom-(point.value-min)/(max-min)*(bottom-top)]);
    add('polyline',{points:pts.map(point=>point.join(',')).join(' '),fill:'none',stroke:colors[index], 'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
    pts.forEach((point,i)=>add('circle',{cx:point[0],cy:point[1],r:3.5,fill:colors[index], 'aria-label':`${item.name}: ${metricLabel} ${item.values[i].value}`}));
  });
  add('text',{x:left,y:193,'text-anchor':'start'},'Тур 1');
  add('text',{x:right,y:193,'text-anchor':'end'},`Тур ${Math.max(...series.flatMap(item=>item.values.map(point=>point.matchday)))}`);
  return svg;
}
function cumulativeByMatchday(teamId, metric) {
  const played = matches().filter(match => match.status === 'FINISHED' && Number.isInteger(match.fullTime?.home) && Number.isInteger(match.fullTime?.away) && Number.isInteger(match.matchday))
    .sort((a,b)=>a.matchday-b.matchday || String(a.utcDate).localeCompare(String(b.utcDate)));
  const running = new Map();
  const byDay = new Map();
  for (const match of played) {
    const home=match.homeTeam.id, away=match.awayTeam.id, hs=match.fullTime.home, as=match.fullTime.away;
    for (const id of [home,away]) if (!running.has(id)) running.set(id,{points:0,goals:0,goalDifference:0});
    const h=running.get(home), a=running.get(away);
    h.goals += hs; h.goalDifference += hs-as; a.goals += as; a.goalDifference += as-hs;
    if (hs>as) h.points+=3; else if (hs<as) a.points+=3; else { h.points+=1; a.points+=1; }
    if (home === teamId || away === teamId) {
      if (!byDay.has(match.matchday)) byDay.set(match.matchday, new Map());
      byDay.get(match.matchday).set(home,{...h}); byDay.get(match.matchday).set(away,{...a});
    }
  }
  return [...byDay.entries()].sort((a,b)=>a[0]-b[0]).map(([matchday,teams])=>({matchday,value:teams.get(teamId)?.[metric]})).filter(point=>Number.isFinite(point.value));
}
function favoriteStrip(type) {
  const section = card(type === 'teams' ? 'Избранные команды' : 'Избранные игроки');
  const items = favorites[type];
  if (!items.length) section.append(make('p', `Можно выбрать до трёх ${type === 'teams' ? 'команд' : 'игроков'} в каталоге. Выбор можно пропустить.` , 'football-notice'));
  const carousel=make('div',undefined,'football-favorites');
  for (const saved of items) {
    const current = type === 'teams' ? teamById(saved.id) : scorerById(saved.id);
    const metric = current ? (type === 'teams' ? `${current.points ?? 'Нет данных'} очков` : `${current.goals ?? 'Нет данных'} голов`)
      : saved.league === leagueSelect.value ? 'Нет данных' : `турнир ${leagueNames[saved.league]||saved.league}`;
    const entity=current?(type==='teams'?current.team:current.player):{name:saved.name};
    const tile=make('article',undefined,'football-fav-card');
    tile.append(avatar(entity),make('strong',saved.name),make('small',metric));
    tile.append(button('Убрать', () => { favorites[type] = favorites[type].filter(x=>x.id!==saved.id); saveFavorites(); updateHomeSummary(); render(); }));
    carousel.append(tile);
  }
  if(items.length)section.append(carousel);
  return section;
}
function renderOverview() {
  view.replaceChildren();
  const summary = card('Матчи избранного турнира', sourceLine(currentData('matches')));
  const now=Date.now();
  const ordered=matches().filter(m=>m.utcDate).sort((a,b)=>new Date(a.utcDate)-new Date(b.utcDate));
  const next=ordered.find(m=>new Date(m.utcDate).getTime()>=now && ['SCHEDULED','TIMED','IN_PLAY','PAUSED'].includes(m.status));
  const last=ordered.filter(m=>m.status==='FINISHED').at(-1);
  const matchText=m=>`${m.homeTeam.shortName||m.homeTeam.name} — ${m.awayTeam.shortName||m.awayTeam.name}`;
  if (next) summary.append(make('p',`Ближайший: ${matchText(next)} · ${new Date(next.utcDate).toLocaleString('ru-RU')}`));
  else summary.append(make('p','Нет подтверждённых ближайших матчей в локальном снимке.'));
  if (last) summary.append(make('p',`Последний результат: ${matchText(last)} · ${last.fullTime?.home ?? '—'}:${last.fullTime?.away ?? '—'}`));
  else summary.append(make('p','Нет подтверждённого сыгранного матча.'));
  view.append(favoriteStrip('teams'), favoriteStrip('players'), summary);
  const info=card('Данные и избранное');
  info.append(make('p','Поиск работает только по уже загруженному каталогу. Лимит — три команды и три игрока. При отсутствии свежих данных сохранённые значения отмечаются датой снимка, а недоступные показатели остаются пустыми.','football-notice'));
  view.append(info);
}
function renderTeamComparison() {
  const teams=teamRows().map(row=>({id:row.team.id,name:row.team.shortName||row.team.name}));
  if (!teams.length) { view.append(make('div','Нет каталога команд. Для выбранного турнира и сезона пока нет проверенной таблицы.','football-notice')); return; }
  if (!compare.teams.length) compare.teams=teams.slice(0,2);
  const chosen=[compare.teams[0]?.id,compare.teams[1]?.id].filter(id=>teams.some(team=>team.id===id));
  if (!chosen.length) chosen.push(teams[0].id);
  if (chosen.length<2 && teams.length>1) chosen.push(teams.find(team=>team.id!==chosen[0]).id);
  compare.teams=chosen.map(id=>teams.find(team=>team.id===id));
  const section=card('Сравнение команд',`${leagueNames[leagueSelect.value]} · сезон ${seasonSelect.value} · одна таблица`);
  const selectors=make('div',undefined,'football-selects');
  selectors.append(selectFor(teams,compare.teams[0]?.id,id=>saveCompareId('teams',id,0),'Первая команда'));
  if (teams.length>1) selectors.append(selectFor(teams,compare.teams[1]?.id,id=>saveCompareId('teams',id,1),'Вторая команда'));
  section.append(selectors);
  const rows=compare.teams.map(team=>teamById(team.id));
  if (rows.some(row=>!row)) { section.append(make('p','Для выбранной команды нет данных за этот сезон.','football-notice')); view.append(section); return; }
  const metricButtons=make('div',undefined,'football-toggle-row');
  [['points','Очки'],['goals','Голы'],['goalDifference','Разница мячей']].forEach(([key,label])=>metricButtons.append(button(label,()=>{teamMetric=key;render();},'chip',teamMetric===key)));
  section.append(metricButtons);
  const fields=[['Очки',row=>row.points],['Голы',row=>row.goalsFor],['Разница мячей',row=>row.goalDifference]];
  rows.forEach(row=>{
    const teamCard=make('div',undefined,'football-row');
    teamCard.append(make('strong',`${row.team.shortName||row.team.name} · ${row.position ? `${row.position}-е место` : 'позиция: Нет данных'}`));
    teamCard.append(make('span',`${row.points ?? 'Нет данных'} очков`)); section.append(teamCard);
    const stats=make('div',undefined,'football-metric-list');
    fields.forEach(([label,get])=>{const cell=make('div',undefined,'metric');cell.append(make('small',label),make('strong',fmt(get(row))));stats.append(cell);});
    section.append(stats);
    section.append(make('p',`Атака: ${fmt(row.goalsFor)} голов · оборона: ${fmt(row.goalsAgainst)} пропущено · сыграно: ${fmt(row.playedGames)} матчей`,'muted'));
  });
  const chart=chartSvg(compare.teams.map(team=>({name:team.name,values:cumulativeByMatchday(team.id,teamMetric)})),`Сравнение команд: ${teamMetric==='points'?'очки':teamMetric==='goals'?'голи':'разница мячей'} по сыгранным турам`,teamMetric);
  if(chart) section.append(chart,make('p','Динамика построена только по завершённым матчам с известным счётом.','muted'));
  else section.append(make('p','Нет достаточных данных по сыгранным турам для графика.','football-notice'));
  const teamId=compare.teams[0]?.id;
  if(teamId){const schedule=matches().filter(match=>match.homeTeam.id===teamId||match.awayTeam.id===teamId).sort((a,b)=>new Date(a.utcDate||0)-new Date(b.utcDate||0));const last=schedule.filter(m=>m.status==='FINISHED').at(-1);const next=schedule.find(m=>m.status!=='FINISHED'&&m.utcDate&&new Date(m.utcDate)>Date.now());const matchCard=card('Ближайший и последний матч');for(const m of [last,next].filter(Boolean))matchCard.append(make('p',`${matchText(m)} · ${m.status==='FINISHED'?`${m.fullTime?.home??'—'}:${m.fullTime?.away??'—'}`:new Date(m.utcDate).toLocaleString('ru-RU')}`));if(!last&&!next)matchCard.append(make('p','В снимке нет матча с подтверждёнными датой и статусом.','football-notice'));section.append(matchCard);}
  view.append(section,renderCatalog('teams'));
}
function matchText(match) { return `${match.homeTeam.shortName||match.homeTeam.name} — ${match.awayTeam.shortName||match.awayTeam.name}`; }
function renderCatalog(type) {
  const isTeam=type==='teams';
  const rows=isTeam?teamRows():scorerRows();
  const section=card(isTeam?'Каталог команд':'Рейтинг бомбардиров и каталог игроков',isTeam?'Доступные команды этого турнира':'Рейтинг показывает только игроков, переданных провайдером');
  const input=document.createElement('input');input.type='search';input.className='football-search';input.placeholder=isTeam?'Найти команду':'Найти игрока';input.setAttribute('aria-label',input.placeholder);section.append(input);
  const results=make('div',undefined,'football-search-results');
  const draw=()=>{
    results.replaceChildren();
    const q=input.value.trim().toLocaleLowerCase('ru');
    const filtered=rows.filter(row=>{const item=isTeam?row.team:row.player;return !q||`${item.name||''} ${item.shortName||''}`.toLocaleLowerCase('ru').includes(q);});
    if(!filtered.length){results.append(make('div',rows.length?'Ничего не найдено. Поиск не отправляет запросы к API.':'Для этого турнира пока нет данных каталога.','football-notice'));return;}
    const top=isTeam?filtered:filtered.slice().sort((a,b)=>(b.goals??-1)-(a.goals??-1)).slice(0,20);
    top.forEach((row,index)=>{
      const item=isTeam?row.team:row.player;const id=item.id;const list=isTeam?favorites.teams:favorites.players;const saved=list.some(value=>value.id===id);
      const data=isTeam?`${row.points??'Нет данных'} очков · ${row.position?`${row.position}-е место`:'позиция: Нет данных'}`:`${row.goals??'Нет данных'} голов · ${row.playedMatches??'Нет данных'} матчей`;
      const line=make('div',undefined,'football-row');const left=make('div',undefined,'football-entity');left.append(avatar(item));const text=make('div');text.append(make('strong',`${isTeam?'':`${index+1}. `}${item.shortName||item.name||'Без названия'}`),make('small',`${isTeam?'Турнир':'Игрок'} · ${data}`));left.append(text);
      line.append(left,button(saved?'★':'☆',()=>saveFav(type,row),'football-favorite',saved));results.append(line);
    });
  };
  input.addEventListener('input',draw);draw();section.append(results);
  const note=make('p',isTeam?'Избранное не ограничивает каталог. Карточки используют только доступные строки таблицы.':'Некоторые тарифы API не возвращают бомбардиров. Отсутствие списка не означает отсутствие игроков.','muted');section.append(note);
  return section;
}
function renderTeams() {
  view.replaceChildren();
  renderTeamComparison();
}
function renderPlayerComparison() {
  const players=scorerRows().map(row=>({id:row.player.id,name:row.player.shortName||row.player.name}));
  if (!players.length) { view.append(make('div','Список бомбардиров недоступен в текущем снимке. Провайдер может не включать эти данные в выбранный тариф; приложение не подставляет вымышленные показатели.','football-notice')); return; }
  if (!compare.players.length) compare.players=players.slice(0,2);
  const chosen=[compare.players[0]?.id,compare.players[1]?.id].filter(id=>players.some(player=>player.id===id));
  if (!chosen.length) chosen.push(players[0].id);
  if(chosen.length<2&&players.length>1)chosen.push(players.find(player=>player.id!==chosen[0]).id);
  compare.players=chosen.map(id=>players.find(player=>player.id===id));
  const section=card('Сравнение игроков',`${leagueNames[leagueSelect.value]} · сезон ${seasonSelect.value}`);
  const selectors=make('div',undefined,'football-selects');
  selectors.append(selectFor(players,compare.players[0]?.id,id=>saveCompareId('players',id,0),'Первый игрок'));
  if(players.length>1)selectors.append(selectFor(players,compare.players[1]?.id,id=>saveCompareId('players',id,1),'Второй игрок'));
  section.append(selectors);
  const selected=compare.players.map(player=>scorerById(player.id));
  const metrics=[['Голы',row=>row.goals],['Матчи',row=>row.playedMatches],['Ассисты',row=>row.assists]];
  selected.forEach(row=>{
    const line=make('div',undefined,'football-row');const entity=row.player;
    const playerName=make('div',undefined,'football-entity');playerName.append(avatar(entity),make('strong',entity.shortName||entity.name||'Игрок'));
    line.append(playerName,make('span',row.team?.shortName||row.team?.name||'Команда: Нет данных'));section.append(line);
    const stats=make('div',undefined,'football-metric-list');metrics.forEach(([label,get])=>{const cell=make('div',undefined,'metric');cell.append(make('small',label),make('strong',fmt(get(row))));stats.append(cell);});section.append(stats);
  });
  section.append(make('p','Нули отображаются только когда их передал источник; null показан как «Нет данных». Сравнение ограничено выбранными турниром и сезоном.','muted'));
  view.append(section,renderCatalog('players'));
}
function renderPlayers() {
  view.replaceChildren();
  const featured=card('Избранный игрок');
  const selected=favorites.players[0];const row=selected?scorerById(selected.id):null;
  if(row){featured.append(make('h3',row.player.shortName||row.player.name),metricList(['Голы','Матчи','Ассисты'],[row.goals,row.playedMatches,row.assists]));}
  else featured.append(make('p','Добавь игрока из рейтинга или каталога. Этот шаг можно пропустить.','football-notice'));
  view.append(featured);
  const mode=make('div',undefined,'football-toggle-row');
  mode.append(button('Топ бомбардиров',()=>{playerView='list';render();},'chip',playerView==='list'),button('Сравнить игроков',()=>{playerView='compare';render();},'chip',playerView==='compare'));
  view.append(mode);
  if(playerView==='compare')renderPlayerComparison();else view.append(renderCatalog('players'));
  view.append(favoriteStrip('players'));
}
function render() {
  updateHomeSummary();
  document.querySelectorAll('[data-football-tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.footballTab===activeTab)));
  const data=currentData('standings')||currentData('matches')||currentData('scorers');
  const latest=[currentData('standings'),currentData('matches'),currentData('scorers')].filter(Boolean).sort((a,b)=>String(b.fetchedAt).localeCompare(String(a.fetchedAt)))[0]||data;
  if(DEMO)setStatus(`Искусственные данные для проверки интерфейса · ${sourceLine(latest)}`,'demo');
  else if(latest)setStatus(sourceLine(latest),dataAgeKind(latest));
  else setStatus(navigator.onLine?'Нет подключённых данных. Показывается пустое состояние.':'Офлайн: локального снимка пока нет.');
  if(activeTab==='overview')renderOverview();
  if(activeTab==='teams')renderTeams();
  if(activeTab==='players')renderPlayers();
}
function setTab(tab) { activeTab=tab; render(); }
function refreshSeasonOptions() {
  const seasons=[...new Set(Object.values(snapshots).filter(item=>item?.league===leagueSelect.value).map(item=>item.season))].sort((a,b)=>b-a);
  const selected=Number(seasonSelect.value)||seasons[0]||new Date().getUTCFullYear();
  seasonSelect.replaceChildren(...(seasons.length?seasons:[selected]).map(year=>new Option(String(year),String(year))));
  seasonSelect.value=String(seasons.includes(selected)?selected:seasons[0]||selected);
}
async function loadDemo() {
  try {
    const response=await fetch('./football/demo-snapshots.json',{cache:'no-store'});
    if(!response.ok)throw new Error('fixture unavailable');
    const data=await response.json();
    if(data.schemaVersion!==1||data.source!=='football-data.org')throw new Error('invalid fixture');
    for(const endpoint of ['standings','matches','scorers'])snapshots[docId(data.league,data.season,endpoint)]=data[endpoint];
    leagueSelect.value=data.league;refreshSeasonOptions();
  } catch { setStatus('Демо-данные не загрузились. Откройте страницу через локальный веб-сервер.'); }
}
async function loadFirebaseSnapshots() {
  const sdk=window.leveliFirebase;
  if(!sdk?.auth||!sdk?.db||firebaseListenerStarted)return;
  firebaseListenerStarted=true;
  try {
    sdk.onAuthStateChanged(sdk.auth, async user=>{
      currentUser=user||null;userKey=user?.uid||'guest';loadFavorites();
      await readFirebaseSnapshots();
    },()=>{});
  } catch { /* Firebase reader is optional until an authorized snapshot is available. */ }
}
async function readFirebaseSnapshots() {
  const sdk=window.leveliFirebase;
  if(DEMO||!sdk?.db||!currentUser)return;
  const tasks=[];
  for(const league of leagues){
    const seasons=[...new Set(Object.values(snapshots).filter(item=>item?.league===league).map(item=>item.season))];
    const season=seasons[0]||new Date().getUTCFullYear();
    for(const endpoint of ['standings','matches','scorers'])tasks.push([league,season,endpoint]);
  }
  const results=await Promise.allSettled(tasks.map(([league,season,endpoint])=>
    sdk.getDocFromServer(sdk.doc(sdk.db,'footballSnapshots',docId(league,season,endpoint)))));
  let loaded=false;
  results.forEach((result,index)=>{
    if(result.status!=='fulfilled'||!result.value.exists())return;
    const [league,season,endpoint]=tasks[index],data=result.value.data();
    if(data.schemaVersion!==1||data.source!=='football-data.org'||data.league!==league||data.season!==season
      ||data.endpoint!==endpoint||!Array.isArray(data.items)||!Number.isFinite(Date.parse(data.fetchedAt||'')))return;
    snapshots[docId(league,season,endpoint)]=data;loaded=true;
  });
  if(loaded)safeWrite(cacheKey,{schemaVersion:1,snapshots,savedAt:Date.now()});
  refreshSeasonOptions();updateHomeSummary();render();
}
function updateHomeSummary() {
  const target=$('#football-home-summary');
  if(!target)return;
  const data=currentData('matches');
  if(!data||!isFresh(data)){target.textContent='Для избранного пока нет свежих подтверждённых событий. Открой футбол, чтобы посмотреть доступные данные.';return;}
  const favoriteIds=new Set(favorites.teams.filter(item=>item.league===leagueSelect.value).map(item=>item.id));
  const ordered=matches().filter(match=>match.utcDate&&(favoriteIds.has(match.homeTeam.id)||favoriteIds.has(match.awayTeam.id))).sort((a,b)=>new Date(a.utcDate)-new Date(b.utcDate));
  const next=ordered.find(match=>new Date(match.utcDate)>=new Date()&&['SCHEDULED','TIMED','IN_PLAY','PAUSED'].includes(match.status));
  const last=ordered.filter(match=>match.status==='FINISHED').at(-1);
  if(next)target.textContent=`Ближайший матч: ${matchText(next)} · ${new Date(next.utcDate).toLocaleDateString('ru-RU')}.`;
  else if(last)target.textContent=`Последний результат: ${matchText(last)} · ${last.fullTime?.home??'—'}:${last.fullTime?.away??'—'}.`;
  else {
    const scorerData=currentData('scorers');
    const favoritePlayer=favorites.players.find(item=>item.league===leagueSelect.value);
    const player=favoritePlayer&&scorerData&&isFresh(scorerData)?scorerById(favoritePlayer.id):null;
    target.textContent=player?`Факт об избранном: ${player.player.shortName||player.player.name} — ${player.goals??'Нет данных'} голов в сезоне.`
      :'Для избранного пока нет свежего подтверждённого события.';
  }
}
document.querySelectorAll('[data-football-tab]').forEach(tab=>tab.addEventListener('click',()=>setTab(tab.dataset.footballTab)));
leagueSelect.addEventListener('change',()=>{refreshSeasonOptions();render();});
seasonSelect.addEventListener('change',render);
document.addEventListener('click',event=>{const target=event.target.closest('[data-go="football"]');if(target){activeTab='overview';render();}});
window.addEventListener('online',()=>{render();void readFirebaseSnapshots();});window.addEventListener('offline',render);
loadLocalCache();loadFavorites();
if(DEMO)loadDemo().then(render);
else { refreshSeasonOptions(); render(); if(window.leveliFirebase)loadFirebaseSnapshots(); else window.addEventListener('leveliFirebaseReady',loadFirebaseSnapshots,{once:true}); }
