export const FOOTBALL_LEAGUES = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL'];
const ENDPOINTS = ['standings', 'matches', 'scorers'];

export function normalizeSnapshot(input, expected = {}) {
  if (!input || input.schemaVersion !== 1 || input.source !== 'football-data.org'
      || !FOOTBALL_LEAGUES.includes(input.league) || !Number.isInteger(input.season)
      || input.season < 2000 || input.season > 2100 || !ENDPOINTS.includes(input.endpoint)
      || !Array.isArray(input.items) || input.items.length > 2000
      || !Number.isFinite(Date.parse(input.fetchedAt || ''))
      || (expected.league && input.league !== expected.league)
      || (expected.season && input.season !== expected.season)
      || (expected.endpoint && input.endpoint !== expected.endpoint)) return null;

  let items = input.items;
  if (input.endpoint === 'standings') {
    // Accept grouped snapshots as well as the flat rows produced by the exporter.
    items = items.flatMap(item => Array.isArray(item?.table)
      ? item.table.map(row => ({...row, type: item.type, stage: item.stage ?? null, group: item.group ?? null}))
      : [item]);
    items = items.filter(item => item?.team && Number.isInteger(item.team.id) && item.type === 'TOTAL');
  } else if (input.endpoint === 'matches') {
    items = items.map(item => item?.score?.fullTime
      ? {...item, fullTime: item.score.fullTime}
      : item).filter(item => Number.isInteger(item?.id) && item.homeTeam && item.awayTeam);
  } else {
    items = items.filter(item => item?.player && Number.isInteger(item.player.id));
  }

  return {...input, items, count: items.length};
}

export function isValidSnapshotCache(value) {
  return !!value && value.schemaVersion === 1 && value.snapshots && typeof value.snapshots === 'object'
    && Object.entries(value.snapshots).every(([id,item]) => {
      const normalized=normalizeSnapshot(item);
      return !!normalized && id===`${normalized.league}_${normalized.season}_${normalized.endpoint}`;
    });
}

export function snapshotsFromDocuments(documents) {
  const snapshots={};
  for(const document of documents||[]) {
    const data=normalizeSnapshot(document?.data?.());
    if(data&&document.id===`${data.league}_${data.season}_${data.endpoint}`) snapshots[document.id]=data;
  }
  return snapshots;
}

export function isFreshSnapshot(data, now = Date.now()) {
  const age=now-Date.parse(data?.fetchedAt||'');
  return Number.isFinite(age)&&age>=-5*60_000&&age<=36*3600_000;
}


const LOCAL_SNAPSHOT_FILE = /^([A-Z0-9]+)_([0-9]{4})_(standings|matches|scorers)\.json$/;

export function localSnapshotFileNames(files) {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.filter(name => {
    if (typeof name !== 'string') return false;
    const match = LOCAL_SNAPSHOT_FILE.exec(name);
    return !!match && !(match[1] === 'CL' && match[3] === 'standings');
  }))].sort();
}

export function snapshotsFromLocalFiles(files) {
  const snapshots = {};
  for (const file of files || []) {
    const match = LOCAL_SNAPSHOT_FILE.exec(file?.name || '');
    if (!match) continue;
    const [, league, seasonText, endpoint] = match;
    if (league === 'CL' && endpoint === 'standings') continue;
    const season = Number(seasonText);
    const data = normalizeSnapshot(file.data, {league, season, endpoint});
    if (!data) continue;
    const id = `${league}_${season}_${endpoint}`;
    snapshots[id] = data;
  }
  return snapshots;
}

export function snapshotSeasons(snapshots, league) {
  return [...new Set(Object.values(snapshots || {})
    .filter(item => item?.league === league && Number.isInteger(item.season))
    .map(item => item.season))].sort((a, b) => b - a);
}

function footballSeason(snapshots, league, preferredSeason) {
  const seasons = [...new Set(Object.values(snapshots || {})
    .filter(item => item?.league === league && ['standings', 'matches'].includes(item.endpoint)
      && Number.isInteger(item.season))
    .map(item => item.season))].sort((a, b) => b - a);
  return seasons.includes(Number(preferredSeason)) ? Number(preferredSeason) : seasons[0] ?? null;
}

const teamName = team => team?.shortName || team?.name || '';
const validScore = match => Number.isInteger(match?.fullTime?.home) && Number.isInteger(match?.fullTime?.away);
const matchDate = match => Date.parse(match?.utcDate || '');

export function favoriteTeamCatalog(snapshots, leagues, preferredSeason) {
  const teams = new Map();
  for (const league of leagues || []) {
    const season = footballSeason(snapshots, league, preferredSeason);
    if (season === null) continue;
    const standings = snapshots[`${league}_${season}_standings`]?.items || [];
    const matches = snapshots[`${league}_${season}_matches`]?.items || [];
    const add = (team, standing = null) => {
      if (!team || !Number.isInteger(team.id)) return;
      const key = `${league}:${team.id}`;
      const previous = teams.get(key);
      teams.set(key, {
        id: team.id,
        name: teamName(team) || previous?.name || 'Команда',
        league,
        season,
        standing: standing || previous?.standing || null,
      });
    };
    standings.forEach(row => add(row.team, row.type === 'TOTAL' ? row : null));
    matches.forEach(match => { add(match.homeTeam); add(match.awayTeam); });
  }
  return [...teams.values()].sort((a, b) => a.league.localeCompare(b.league)
    || a.name.localeCompare(b.name, 'ru'));
}

export function favoriteTeamSummary(snapshots, favorite, preferredSeason, now = Date.now()) {
  if (!favorite || typeof favorite.league !== 'string' || !Number.isInteger(favorite.id)) return null;
  const season = footballSeason(snapshots, favorite.league, preferredSeason);
  if (season === null) return {season: null, team: null, standing: null, lastMatches: [], nextMatch: null, hasMatches: false, stale: false, fetchedAt: null};

  const standings = snapshots[`${favorite.league}_${season}_standings`] || null;
  const matchSnapshot = snapshots[`${favorite.league}_${season}_matches`] || null;
  const rows = standings?.items || [];
  const games = matchSnapshot?.items || [];
  const standing = rows.find(row => row.type === 'TOTAL' && row.team?.id === favorite.id) || null;
  const team = standing?.team
    || games.flatMap(match => [match.homeTeam, match.awayTeam]).find(item => item?.id === favorite.id)
    || {id: favorite.id, name: favorite.name};
  const matches = games.filter(match => match.homeTeam?.id === favorite.id || match.awayTeam?.id === favorite.id);
  const played = matches.filter(match => match.status === 'FINISHED' && validScore(match) && Number.isFinite(matchDate(match)))
    .sort((a, b) => matchDate(b) - matchDate(a));
  const upcoming = matches.filter(match => ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED'].includes(match.status)
      && Number.isFinite(matchDate(match)) && matchDate(match) >= now)
    .sort((a, b) => matchDate(a) - matchDate(b))[0] || null;
  const fetchedAt = [standings?.fetchedAt, matchSnapshot?.fetchedAt].filter(Boolean).sort().at(-1) || null;
  const stale = [standings, matchSnapshot].filter(Boolean)
    .some(item => !isFreshSnapshot(item, now));
  return {
    season,
    team,
    standing,
    lastMatches: played.slice(0, 5).map(match => {
      const home = match.homeTeam.id === favorite.id;
      const goalsFor = home ? match.fullTime.home : match.fullTime.away;
      const goalsAgainst = home ? match.fullTime.away : match.fullTime.home;
      return {
        opponent: home ? match.awayTeam : match.homeTeam,
        goalsFor,
        goalsAgainst,
        result: goalsFor > goalsAgainst ? 'Победа' : goalsFor < goalsAgainst ? 'Поражение' : 'Ничья',
        utcDate: match.utcDate,
      };
    }),
    nextMatch: upcoming ? {
      opponent: upcoming.homeTeam.id === favorite.id ? upcoming.awayTeam : upcoming.homeTeam,
      isHome: upcoming.homeTeam.id === favorite.id,
      utcDate: upcoming.utcDate,
    } : null,
    hasMatches: !!matchSnapshot,
    stale,
    fetchedAt,
  };
}
