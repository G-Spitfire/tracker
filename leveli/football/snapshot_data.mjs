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


const LOCAL_SNAPSHOT_FILE = /^([A-Z0-9]+)_(\\d{4})_(standings|matches|scorers)\\.json$/;

export function localSnapshotFileNames(files) {
  if (!Array.isArray(files)) return [];
  return [...new Set(files.filter(name => typeof name === 'string' && LOCAL_SNAPSHOT_FILE.test(name)))].sort();
}

export function snapshotsFromLocalFiles(files) {
  const snapshots = {};
  for (const file of files || []) {
    const match = LOCAL_SNAPSHOT_FILE.exec(file?.name || '');
    if (!match) continue;
    const [, league, seasonText, endpoint] = match;
    const season = Number(seasonText);
    const data = normalizeSnapshot(file.data, {league, season, endpoint});
    if (!data) continue;
    const id = `${league}_${season}_${endpoint}`;
    snapshots[id] = data;
  }
  return snapshots;
}
