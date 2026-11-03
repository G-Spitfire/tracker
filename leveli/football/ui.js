import {normalizeSnapshot, snapshotsFromDocuments, isValidSnapshotCache, isFreshSnapshot, FOOTBALL_LEAGUES, localSnapshotFileNames, snapshotsFromLocalFiles, snapshotSeasons, favoriteTeamCatalog, favoriteTeamSummary} from './snapshot_data.mjs';
import {readStoredFavorites, writeStoredFavorites} from './favorites_sync.mjs';
import {normalizePlayerCatalog, resolvePlayerClub, searchPlayers, mergeTeamCatalog, searchTeams} from './player_data.mjs';
const $ = (selector, root = document) => root.querySelector(selector);
const view = $('#football-view');
const status = $('#football-status');
const leagueSelect = $('#football-league');
const seasonSelect = $('#football-season');
const params = new URLSearchParams(location.search);
const LOCAL = params.get('football-local') === '1';
const cacheKey = 'leveli-football-snapshots-v1';
const leagues = FOOTBALL_LEAGUES;
const leagueNames = {PL:'Английская Премьер-лига',PD:'Ла Лига',SA:'Серия А',BL1:'Бундеслига',FL1:'Лига 1',CL:'Лига чемпионов УЕФА',RPL:'Российская Премьер-Лига'};
let snapshots = {};
let playerCatalog = [];
let playerClubs = [];
let playerCatalogMessage = 'Загружаю каталог футболистов…';
let activeTab = 'my-football';
let detailPage = null;
let userKey = 'guest';
let favorites = {teams: [], players: []};
let compare = {teams: [], players: []};
let teamMetric = 'points';
let playerView = 'list';
let firebaseListenerStarted = false;
let currentUser = null;
let localLoadMessage = '';

const docId = (league, season, endpoint) => `${league}_${season}_${endpoint}`;
const isFresh = data => isFreshSnapshot(data);
const safeRead = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
function setStatus(message, kind = '') {
  status.replaceChildren();
  if (kind) { const pill = document.createElement('span'); pill.className = `pill ${kind}`; pill.textContent = kind === 'stale' ? 'Данные устарели' : 'Подтверждённые данные'; status.append(pill); }
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
  return !data || !isFresh(data) ? 'stale' : '';
}
function loadLocalCache() {
  const cached = safeRead(cacheKey);
  if (isValidSnapshotCache(cached)) snapshots=Object.fromEntries(Object.entries(cached.snapshots)
    .map(([key,item])=>[key,normalizeSnapshot(item)]).filter(([,item])=>!!item));
}
function saveFavorites() { writeStoredFavorites(localStorage,userKey,favorites); }
function loadFavorites() {
  favorites = readStoredFavorites(localStorage,userKey);
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
function avatar(entity) {
  const box=make('span',undefined,'football-avatar');
  const initial=(entity?.shortName||entity?.name||'?').trim().slice(0,1).toLocaleUpperCase('ru');
  box.append(make('span',initial));
  return box;
}
function teamById(id) { return teamRows().find(row => row.team.id === Number(id)); }
function scorerById(id) { return scorerRows().find(row => row.player.id === Number(id)); }
function playerById(id) { return playerCatalog.find(player => player.id === id) || null; }
function openDetail(page) { detailPage=page; render(); }
function closeDetail() { detailPage=detailPage?.returnDetail||null; render(); }
function saveFav(type, item, league = leagueSelect.value) {
  const list = favorites[type];
  const id = type === 'teams' ? item.team.id : item.player.id;
  const favoriteLeague = item.league || league;
  const index = list.findIndex(saved => saved.id === id && saved.league === favoriteLeague);
  if (index >= 0) list.splice(index, 1);
  else {
    if (list.length >= 3) { window.alert('Можно сохранить не больше трёх избранных. Сначала убери одну запись.'); return; }
    const entity = type === 'teams' ? item.team : item.player;
    list.push({id, name: entity.shortName || entity.name || 'Без названия', league:favoriteLeague});
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
    const profile = type === 'players' ? playerById(saved.id) : null;
    const metric = current ? (type === 'teams' ? `${current.points ?? 'Нет данных'} очков` : `${current.goals ?? 'Нет данных'} голов`)
      : profile ? `${profile.position}${profile.club?` · ${profile.club}`:''}`
      : saved.league === leagueSelect.value ? 'Нет данных' : `турнир ${leagueNames[saved.league]||saved.league}`;
    const entity=current?(type==='teams'?current.team:current.player):profile||{name:saved.name};
    const tile=make('article',undefined,'football-fav-card');
    tile.append(avatar(entity),make('strong',saved.name),make('small',metric));
    if(profile) tile.append(button('Профиль',()=>{activeTab='players';openDetail({type:'player',id:profile.id,returnDetail:null});}));
    tile.append(button('Убрать', () => { favorites[type] = favorites[type].filter(x=>x.id!==saved.id||x.league!==saved.league); saveFavorites(); updateHomeSummary(); render(); }));
    carousel.append(tile);
  }
  if(items.length)section.append(carousel);
  return section;
}
function resultLabel(result) { return `${result.result} ${result.goalsFor}:${result.goalsAgainst} · ${result.opponent?.shortName||result.opponent?.name||'соперник не указан'} · ${new Date(result.utcDate).toLocaleDateString('ru-RU')}`; }
function renderFavoriteTeamCard(favorite, selectedSeason) {
  if (favorite.league === 'RPL') {
    const club=playerClubs.find(item=>item.id===favorite.id);
    const name=club?.name||favorite.name;
    const section=card(name,`${club?.city||'Россия'} · Российская Премьер-Лига`);
    section.append(button('Открыть команду',()=>openDetail({type:'team',id:favorite.id,league:'RPL',name,returnDetail:null})));
    section.append(button('Убрать',()=>{favorites.teams=favorites.teams.filter(item=>item.id!==favorite.id||item.league!==favorite.league);saveFavorites();updateHomeSummary();render();}));
    section.append(make('p','Таблица, результаты и расписание РПЛ пока не подключены.','football-notice'));
    return section;
  }
  const summary=favoriteTeamSummary(snapshots,favorite,selectedSeason);
  const name=summary?.team?.shortName||summary?.team?.name||favorite.name;
  const section=card(name,`${leagueNames[favorite.league]||favorite.league}${summary?.season?` · сезон ${summary.season}`:''}`);
  section.append(button('Открыть команду',()=>openDetail({type:'team',id:favorite.id,league:favorite.league,name,returnDetail:null})));
  section.append(button('Убрать',()=>{
    favorites.teams=favorites.teams.filter(item=>item.id!==favorite.id||item.league!==favorite.league);
    saveFavorites();updateHomeSummary();render();
  }));
  if(!summary?.season){section.append(make('p','Данные по этой команде пока не загружены. Она останется в любимых.','football-notice'));return section;}
  const standing=summary.standing;
  section.append(make('p',standing?`Место: ${standing.position??'нет данных'} · очки: ${standing.points??'нет данных'}`:favorite.league==='CL'?'Место в таблице не показывается для этого турнира.':'Место и очки пока не загружены.','muted'));
  const last=summary.lastMatches[0];
  section.append(make('p',last?`Последний: ${resultLabel(last)}`:summary.hasMatches?'Последний результат пока не загружен.':'Календарь команды не загружен.'));
  const next=summary.nextMatch;
  section.append(make('p',next?`Ближайший: ${next.isHome?'дома':'в гостях'} с ${next.opponent?.shortName||next.opponent?.name||'соперником'} · ${new Date(next.utcDate).toLocaleDateString('ru-RU')}`:summary.hasMatches?'Ближайший матч пока не указан.':'Календарь команды не загружен.'));
  const form=summary.lastMatches.map(result=>result.result==='Победа'?'В':result.result==='Ничья'?'Н':'П').join(' · ');
  section.append(make('p',form?`Форма за последние игры: ${form}`:'Форма пока не доступна.','muted'));
  if(summary.stale) section.append(make('p',`Снимок устарел. Дата данных: ${summary.fetchedAt?new Date(summary.fetchedAt).toLocaleString('ru-RU'):'не указана'}.`,'football-notice'));
  return section;
}
function renderFavoriteTeamPicker(selectedSeason) {
  const section=card('Добавить любимую команду',`Выбери до трёх команд · сейчас ${favorites.teams.length} из 3`);
  if(favorites.teams.length>=3){section.append(make('p','Сначала убери одну команду, чтобы добавить другую.','football-notice'));return section;}
  const rows=mergeTeamCatalog(favoriteTeamCatalog(snapshots,leagues,selectedSeason),playerClubs);
  const input=document.createElement('input');input.type='search';input.className='football-search';input.placeholder='Найти команду в шести турнирах';input.setAttribute('aria-label','Найти любимую команду');
  const results=make('div',undefined,'football-search-results');
  const draw=()=>{
    results.replaceChildren();
    const query=input.value.trim().toLocaleLowerCase('ru');
    const filtered=searchTeams(rows,query);
    if(!filtered.length){results.append(make('p','Команда не найдена в доступном каталоге.','football-notice'));return;}
    filtered.slice(0,30).forEach(item=>{
      const saved=favorites.teams.some(value=>value.id===item.id&&value.league===item.league);
      const row=make('div',undefined,'football-row');
      const label=make('div',undefined,'football-entity');label.append(avatar(item),make('div',`${item.name} · ${item.city?`${item.city} · `:''}${leagueNames[item.league]||item.league}${item.season?` · сезон ${item.season}`:''}`,'football-team-option'));
      row.append(label,button(saved?'Добавлена':'Добавить',()=>saveFav('teams',{team:item,league:item.league},item.league),'football-favorite',saved));
      results.append(row);
    });
    if(filtered.length>30)results.append(make('p',`Показаны первые 30 команд из ${filtered.length}. Уточни поиск.`,'muted'));
  };
  input.addEventListener('input',draw);draw();section.append(input,results);
  return section;
}
function renderMyFootball() {
  view.replaceChildren();
  const selectedSeason=Number(seasonSelect.value)||null;
  if(favorites.teams.length) view.append(card('Мои команды',`${favorites.teams.length} из 3`));
  if(!favorites.teams.length)view.append(make('p','Пока нет любимых команд. Найди команду ниже и добавь её.','football-notice'));
  favorites.teams.forEach(favorite=>view.append(renderFavoriteTeamCard(favorite,selectedSeason)));
  const picker=renderFavoriteTeamPicker(selectedSeason);
  const details=document.createElement('details');details.className='football-picker';
  const summary=make('summary','Добавить команду');details.append(summary,picker);view.append(details);
}
function renderTeamDetail(page) {
  if (page.league === 'RPL') {
    const club=playerClubs.find(item=>item.id===page.id);
    const section=card(club?.name||page.name,`${club?.city||'Россия'} · Российская Премьер-Лига`);
    section.append(button('← Назад',closeDetail,'football-back'));
    section.append(make('p','Для РПЛ в приложении пока нет подключённого источника таблицы и расписания. Результаты не подменяются демонстрационными данными.','football-notice'));
    if(club?.source){const source=document.createElement('a');source.href=club.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Официальная страница клуба';source.className='football-source-link';section.append(source);}
    view.append(section);return;
  }
  const summary=favoriteTeamSummary(snapshots,{id:page.id,name:page.name,league:page.league},Number(seasonSelect.value)||null);
  const name=summary?.team?.shortName||summary?.team?.name||page.name;
  const section=card(name,`${leagueNames[page.league]||page.league}${summary?.season?` · сезон ${summary.season}`:''}`);
  section.append(button('← Назад',closeDetail,'football-back'));
  if(!summary?.season){section.append(make('p','Снимок этого клуба пока не загружен.','football-notice'));view.append(section);return;}
  if(summary.standing) section.append(make('p',`Место: ${summary.standing.position??'нет данных'} · очки: ${summary.standing.points??'нет данных'}`));
  else section.append(make('p',page.league==='CL'?'Таблица для этого турнира не предоставляется.':'Таблица клуба не загружена.','muted'));
  const latest=summary.lastMatches[0];
  section.append(make('p',latest?`Последний результат: ${resultLabel(latest)}`:'Последний результат пока не найден.'));
  if(summary.nextMatch) section.append(make('p',`Ближайший матч клуба: ${summary.nextMatch.isHome?'дома':'в гостях'} с ${summary.nextMatch.opponent?.shortName||summary.nextMatch.opponent?.name||'соперником'} · ${new Date(summary.nextMatch.utcDate).toLocaleString('ru-RU')}`));
  else section.append(make('p','Ближайший матч клуба пока не указан.','muted'));
  const snapshot=snapshots[docId(page.league,summary.season,'matches')];
  const games=(snapshot?.items||[]).filter(match=>match.homeTeam?.id===page.id||match.awayTeam?.id===page.id)
    .sort((a,b)=>Date.parse(b.utcDate||'')-Date.parse(a.utcDate||''));
  const details=document.createElement('details');details.className='football-match-details';
  details.append(make('summary',`Все матчи клуба · ${games.length}`));
  if(!games.length) details.append(make('p','В загруженном снимке нет матчей этого клуба.','muted'));
  games.forEach(match=>{
    const date=Date.parse(match.utcDate||'');
    const score=Number.isInteger(match.fullTime?.home)&&Number.isInteger(match.fullTime?.away)?` · ${match.fullTime.home}:${match.fullTime.away}`:'';
    const dateText=Number.isFinite(date)?new Date(date).toLocaleString('ru-RU'):'дата не указана';
    details.append(make('p',`${dateText} · ${matchText(match)}${score}`));
  });
  section.append(details);
  if(summary.stale) section.append(make('p',`Снимок устарел · ${summary.fetchedAt?new Date(summary.fetchedAt).toLocaleDateString('ru-RU'):'дата не указана'}.`,'football-notice'));
  view.append(section);
}
function renderPlayerDetail(page) {
  const player=playerById(page.id);
  if(!player){const missing=card('Игрок','Профиль больше не найден в каталоге.');missing.append(button('← Назад',closeDetail,'football-back'));view.append(missing);return;}
  const section=card(player.name,`${player.country} · ${player.position}`);
  section.append(button('← Назад к игрокам',closeDetail,'football-back'));
  section.append(make('p',`Клуб: ${player.club||'неизвестен'}`));
  section.append(make('p',`Сведения проверены: ${new Date(`${player.checkedAt}T12:00:00`).toLocaleDateString('ru-RU')}`,'muted'));
  const isSaved=favorites.players.some(saved=>saved.id===player.id);
  section.append(button(isSaved?'Убрать из моих игроков':'Добавить в мои игроки',()=>saveFav('players',{player,league:player.league||'WW'},player.league||'WW'),'football-favorite',isSaved));
  const source=document.createElement('a');source.href=player.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Источник сведений';source.className='football-source-link';section.append(source);
  if(player.league){
    const linked=resolvePlayerClub(snapshots,player,playerClubs);
    if(linked){
      const clubSummary=favoriteTeamSummary(snapshots,{id:linked.team.id,name:linked.team.name,league:linked.league},Number(seasonSelect.value)||null);
      const club=clubSummary?.team||linked.team;
      const clubCard=card(`Клуб · ${club.shortName||club.name}`,linked.club?`${linked.club.city} · Российская Премьер-Лига`:undefined);
      if(linked.club){
        clubCard.append(make('p','Статистика и календарь РПЛ в приложении пока недоступны.','football-notice'));
        clubCard.append(button('Открыть информацию о клубе',()=>openDetail({type:'team',id:club.id,league:'RPL',name:club.name,returnDetail:detailPage})));
        section.append(clubCard);view.append(section);return;
      }
      if(clubSummary?.lastMatches?.length) clubCard.append(make('p',`Последний результат: ${resultLabel(clubSummary.lastMatches[0])}`));
      else clubCard.append(make('p',clubSummary?.hasMatches?'Последний результат клуба пока не найден.':'Матчи клуба в снимках пока не загружены.','muted'));
      if(clubSummary?.nextMatch) clubCard.append(make('p',`Ближайший матч клуба: ${clubSummary.nextMatch.isHome?'дома':'в гостях'} с ${clubSummary.nextMatch.opponent?.shortName||clubSummary.nextMatch.opponent?.name||'соперником'} · ${new Date(clubSummary.nextMatch.utcDate).toLocaleDateString('ru-RU')}`));
      else clubCard.append(make('p','Ближайший матч клуба пока не указан.','muted'));
      clubCard.append(make('p','Это матчи клуба. Они не подтверждают участие футболиста.','muted'));
      clubCard.append(button('Открыть информацию о клубе',()=>openDetail({type:'team',id:club.id,league:linked.league,name:club.shortName||club.name,returnDetail:detailPage})));
      section.append(clubCard);
      if(clubSummary?.stale) section.append(make('p','Снимок матчей клуба устарел.','football-notice'));
    } else section.append(make('p',`Клуб ${player.club} подтверждён, но его матчи среди загруженных снимков пока не найдены.`,'football-notice'));
  } else section.append(make('p','Клуб вне шести турниров модуля. Календарь здесь не показывается.','muted'));
  view.append(section);
}
function renderDetail() {
  view.replaceChildren();
  if(detailPage?.type==='team') renderTeamDetail(detailPage);
  else if(detailPage?.type==='player') renderPlayerDetail(detailPage);
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
  view.append(summary);
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
  view.append(section,renderCatalog());
}
function matchText(match) { return `${match.homeTeam.shortName||match.homeTeam.name} — ${match.awayTeam.shortName||match.awayTeam.name}`; }
function renderCatalog() {
  const rows=mergeTeamCatalog(favoriteTeamCatalog(snapshots,leagues,Number(seasonSelect.value)||null),playerClubs);
  const section=card('Каталог команд','Поиск по загруженным турнирам, «Зениту» и «Динамо»');
  const input=document.createElement('input');input.type='search';input.className='football-search';input.placeholder='Найти команду';input.setAttribute('aria-label',input.placeholder);section.append(input);
  const results=make('div',undefined,'football-search-results');
  const draw=()=>{
    results.replaceChildren();
    const q=input.value.trim().toLocaleLowerCase('ru');
    const filtered=searchTeams(rows,q);
    if(!filtered.length){results.append(make('div','Ничего не найдено. Поиск не отправляет запросы к API.','football-notice'));return;}
    filtered.forEach(row=>{
      const saved=favorites.teams.some(value=>value.id===row.id&&value.league===row.league);
      const detail=row.league==='RPL'?'Статистика РПЛ не подключена':`${row.standing?.points??'Нет данных'} очков · ${row.standing?.position?`${row.standing.position}-е место`:'позиция: Нет данных'}`;
      const label=`${row.name} · ${row.city?`${row.city} · `:''}${leagueNames[row.league]||row.league}`;
      const line=make('div',undefined,'football-row');const left=make('div',undefined,'football-entity');left.append(avatar(row));const text=make('div');text.append(make('strong',row.name||'Без названия'),make('small',`${label} · ${detail}`));left.append(text);
      line.append(left,button(saved?'★':'☆',()=>saveFav('teams',{team:row,league:row.league},row.league),'football-favorite',saved));results.append(line);
    });
  };
  input.addEventListener('input',draw);draw();section.append(results);
  section.append(make('p','Показываются команды из имеющихся снимков и два российских клуба; данные РПЛ не подменяются результатами из других турниров.','muted'));
  return section;
}
function renderTeams() {
  view.replaceChildren();
  renderTeamComparison();
}
function renderPlayerComparison() {
  const players=scorerRows().map(row=>({id:row.player.id,name:row.player.shortName||row.player.name}));
  if (!players.length) return;
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
  view.append(section);
}
function renderPlayerCatalog() {
  const section=card('Каталог футболистов',`${playerCatalog.length} игроков · сведения из проверенных составов`);
  const input=document.createElement('input');input.type='search';input.className='football-search';input.placeholder='Найти футболиста';input.setAttribute('aria-label','Найти футболиста');section.append(input);
  const results=make('div',undefined,'football-search-results');
  const draw=()=>{
    results.replaceChildren();
    const filtered=searchPlayers(playerCatalog,input.value);
    if(!filtered.length){results.append(make('p',playerCatalog.length?'Ничего не найдено.':playerCatalogMessage||'Каталог пока не загрузился.','football-notice'));return;}
    filtered.forEach(player=>results.append(renderPlayerRow(player)));
  };
  input.addEventListener('input',draw);draw();section.append(results);
  if(playerCatalog.length) section.append(make('p',`Сведения проверены ${new Date(`${playerCatalog[0].checkedAt}T12:00:00`).toLocaleDateString('ru-RU')}. Каталог не содержит игровых рейтингов и показателей.`,'muted'));
  return section;
}
const POPULAR_PLAYER_IDS=['player-lionel-messi','player-cristiano-ronaldo','player-kylian-mbappe','player-erling-haaland','player-lamine-yamal','player-jude-bellingham','player-bukayo-saka','player-virgil-van-dijk','player-vinicius-junior','player-harry-kane','player-mohamed-salah','player-konstantin-tyukavin'];
function renderPlayerRow(player) {
  const saved=favorites.players.some(item=>item.id===player.id);
  const row=make('div',undefined,'football-player-row');
  const open=button(player.name,()=>openDetail({type:'player',id:player.id,returnDetail:null}),'football-player-open');
  open.append(make('small',`${player.club||'Клуб неизвестен'} · ${player.country} · ${player.position}`));
  row.append(open,button(saved?'Добавлен':'Добавить',()=>saveFav('players',{player,league:player.league||'WW'},player.league||'WW'),'football-favorite',saved));
  return row;
}
function renderPopularPlayers() {
  const popular=POPULAR_PLAYER_IDS.map(playerById).filter(Boolean);
  const section=card('Популярные футболисты','Звёзды из проверенного каталога');
  if(!popular.length){section.append(make('p','Подборка появится после загрузки каталога.','muted'));return section;}
  popular.forEach(player=>section.append(renderPlayerRow(player)));
  return section;
}
function renderMyPlayers() {
  const section=card('Мои игроки',`${favorites.players.length} из 3`);
  if(!favorites.players.length){section.append(make('p','Пока никого нет. Добавь игрока из каталога.','muted'));return section;}
  favorites.players.forEach(saved=>{
    const player=playerById(saved.id);
    const row=make('div',undefined,'football-player-row');
    const open=button(player?.name||saved.name,()=>player?openDetail({type:'player',id:player.id,returnDetail:null}):null,'football-player-open');
    if(player) open.append(make('small',`${player.country} · ${player.position}${player.club?` · ${player.club}`:''}`));
    else open.append(make('small','Сохранённый профиль пока отсутствует в каталоге.'));
    row.append(open,button('Убрать',()=>{favorites.players=favorites.players.filter(item=>item.id!==saved.id);saveFavorites();render();}));
    section.append(row);
  });
  return section;
}
function renderScorerSnapshot() {
  const rows=scorerRows().slice().sort((a,b)=>(b.goals??-1)-(a.goals??-1));
  if(!rows.length)return null;
  const section=card('Статистика из снимка',`${leagueNames[leagueSelect.value]} · сезон ${seasonSelect.value} · ${sourceLine(currentData('scorers'))}`);
  if(playerView==='compare'){
    section.append(button('← К списку игроков',()=>{playerView='list';render();},'football-back'));
    view.append(section);
    renderPlayerComparison();
    return section;
  }
  rows.slice(0,10).forEach(row=>{
    const item=make('div',undefined,'football-row');
    const saved=favorites.players.some(player=>player.id===row.player.id&&player.league===leagueSelect.value);
    item.append(make('strong',row.player.shortName||row.player.name||'Игрок'),make('span',`${row.goals??'Нет данных'} голов · ${row.playedMatches??'Нет данных'} матчей · ${row.assists??'Нет данных'} ассистов`),button(saved?'Убрать':'В избранное',()=>saveFav('players',row),'football-favorite',saved));
    section.append(item);
  });
  if(rows.length>1)section.append(button('Сравнить по этим данным',()=>{playerView='compare';render();}));
  section.append(make('p','Это отдельный рейтинг из реального снимка источника; каталог футболистов не подменяет его данными.','muted'));
  view.append(section);
  return section;
}
function renderPlayers() {
  view.replaceChildren();
  view.append(renderMyPlayers(),renderPopularPlayers(),renderPlayerCatalog());
  renderScorerSnapshot();
}
function render() {
  updateHomeSummary();
  document.querySelectorAll('[data-football-tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.footballTab===activeTab)));
  status.hidden=activeTab==='my-football'||activeTab==='players'||!!detailPage;
  const toolbar=$('.football-toolbar');
  if(toolbar)toolbar.hidden=activeTab==='my-football'||!!detailPage;
  if(detailPage){renderDetail();return;}
  const data=currentData('standings')||currentData('matches')||currentData('scorers');
  const latest=[currentData('standings'),currentData('matches'),currentData('scorers')].filter(Boolean).sort((a,b)=>String(b.fetchedAt).localeCompare(String(a.fetchedAt)))[0]||data;
  if(LOCAL && latest)setStatus(sourceLine(latest)+(localLoadMessage?' · '+localLoadMessage:''),dataAgeKind(latest));
  else if(LOCAL)setStatus(Object.keys(snapshots).length?'Для выбранного турнира и сезона локальных снимков нет. '+localLoadMessage:(localLoadMessage||'Локальные данные не найдены. Сначала загрузите JSON-файлы в кеш футбольного модуля.'));
  else if(latest)setStatus(sourceLine(latest),dataAgeKind(latest));
  else setStatus(navigator.onLine?'Нет подключённых данных. Показывается пустое состояние.':'Офлайн: локального снимка пока нет.');
  if(activeTab==='my-football')renderMyFootball();
  if(activeTab==='overview')renderOverview();
  if(activeTab==='teams')renderTeams();
  if(activeTab==='players')renderPlayers();
}
function setTab(tab) { detailPage=null;activeTab=tab;render(); }
function refreshSeasonOptions() {
  const seasons=snapshotSeasons(snapshots,leagueSelect.value);
  const selected=Number(seasonSelect.value)||seasons[0]||new Date().getUTCFullYear();
  seasonSelect.replaceChildren(...(seasons.length?seasons:[selected]).map(year=>new Option(String(year),String(year))));
  seasonSelect.value=String(seasons.includes(selected)?selected:seasons[0]||selected);
}
async function loadPlayerCatalog() {
  try {
    const response=await fetch('./football/players-catalog.json',{cache:'no-store'});
    if(!response.ok)throw new Error('catalog unavailable');
    const catalog=normalizePlayerCatalog(await response.json());
    if(!catalog)throw new Error('catalog invalid');
    playerCatalog=catalog.players;
    playerClubs=catalog.clubs;
    playerCatalogMessage='';
  } catch {
    playerCatalog=[];
    playerClubs=[];
    playerCatalogMessage='Каталог футболистов пока не загрузился.';
  }
  if(activeTab==='players')render();
}
async function loadLocalFiles() {
  snapshots={};
  localLoadMessage='Ищу локальные JSON-файлы…';
  setStatus(localLoadMessage);
  try {
    const response=await fetch('/__leveli_local__/manifest.json',{cache:'no-store'});
    if(!response.ok)throw new Error('manifest unavailable');
    const manifest=await response.json();
    const names=localSnapshotFileNames(manifest?.files);
    if(!names.length){
      localLoadMessage='Локальные JSON-файлы не найдены. Запустите загрузчик статистики и откройте эту страницу снова.';
      refreshSeasonOptions();render();return;
    }
    localLoadMessage='Загружаю '+names.length+' локальных снимков…';
    setStatus(localLoadMessage);
    const results=await Promise.allSettled(names.map(async name=>{
      const file=await fetch('/__leveli_local__/snapshots/'+encodeURIComponent(name),{cache:'no-store'});
      if(!file.ok)throw new Error('snapshot unavailable');
      return {name,data:await file.json()};
    }));
    const files=results.filter(result=>result.status==='fulfilled').map(result=>result.value);
    const failed=results.length-files.length;
    snapshots=snapshotsFromLocalFiles(files);
    const invalid=files.length-Object.keys(snapshots).length;
    localLoadMessage='Загружено локальных снимков: '+Object.keys(snapshots).length
      +(failed+invalid?'; пропущено файлов: '+(failed+invalid):'')+'.';
  } catch {
    localLoadMessage='Не удалось прочитать локальные данные. Проверьте, что скрипт запущен из папки репозитория.';
  }
  refreshSeasonOptions();updateHomeSummary();render();
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
  if(LOCAL||!sdk?.db||!currentUser)return;
  const uid=currentUser.uid;
  let loaded=false;
  if(sdk.collection&&sdk.getDocs&&sdk.query&&sdk.limit){
    try {
      const listing=await sdk.getDocs(sdk.query(sdk.collection(sdk.db,'footballSnapshots'),sdk.limit(120)));
      if(currentUser?.uid!==uid)return;
      const discovered=snapshotsFromDocuments(listing.docs);
      Object.assign(snapshots,discovered);
      loaded=Object.keys(discovered).length>0;
    } catch { /* Some existing rules allow direct gets but not collection listing. */ }
  }
  if(!loaded){
    const currentYear=new Date().getUTCFullYear();
    const cachedSeasons=Object.values(snapshots).map(item=>item.season);
    const seasons=[...new Set([currentYear,currentYear-1,...cachedSeasons])].slice(0,4);
    const tasks=leagues.flatMap(league=>seasons.flatMap(season=>['standings','matches','scorers'].map(endpoint=>[league,season,endpoint])));
    const results=await Promise.allSettled(tasks.map(([league,season,endpoint])=>
      sdk.getDocFromServer(sdk.doc(sdk.db,'footballSnapshots',docId(league,season,endpoint)))));
    if(currentUser?.uid!==uid)return;
    results.forEach((result,index)=>{
      if(result.status!=='fulfilled'||!result.value.exists())return;
      const [league,season,endpoint]=tasks[index];
      const data=normalizeSnapshot(result.value.data(),{league,season,endpoint});
      if(!data)return;
      snapshots[docId(league,season,endpoint)]=data;loaded=true;
    });
  }
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
document.addEventListener('click',event=>{const target=event.target.closest('[data-go="football"]');if(target){detailPage=null;activeTab='my-football';render();}});
window.addEventListener('online',()=>{render();void readFirebaseSnapshots();});window.addEventListener('offline',render);
if(!LOCAL)loadLocalCache();loadFavorites();
void loadPlayerCatalog();
if(LOCAL){ refreshSeasonOptions(); render(); void loadLocalFiles(); }
else { refreshSeasonOptions(); render(); if(window.leveliFirebase)loadFirebaseSnapshots(); else window.addEventListener('leveliFirebaseReady',loadFirebaseSnapshots,{once:true}); }
