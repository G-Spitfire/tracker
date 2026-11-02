import {FOOTBALL_LEAGUES} from './snapshot_data.mjs';

const PLAYER_ID = /^player-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePlayerCatalog(input) {
  if (!input || input.schemaVersion !== 1 || !ISO_DATE.test(input.checkedAt || '')
      || !Array.isArray(input.players) || input.players.length < 1 || input.players.length > 100) return null;
  const clubs = input.clubs === undefined ? [] : input.clubs;
  if (!Array.isArray(clubs) || clubs.some(club => !club
      || !Number.isInteger(club.id) || club.id < 900000 || club.id > 999999
      || club.league !== 'RPL' || typeof club.name !== 'string' || !club.name.trim()
      || typeof club.city !== 'string' || !club.city.trim()
      || typeof club.source !== 'string' || !club.source.startsWith('https://')
      || typeof club.checkedAt !== 'string' || !ISO_DATE.test(club.checkedAt))) return null;
  if (new Set(clubs.map(club => club.id)).size !== clubs.length) return null;
  const ids = new Set();
  const names = new Set();
  const players = [];
  for (const item of input.players) {
    if (!item || !PLAYER_ID.test(item.id || '') || ids.has(item.id)
        || typeof item.name !== 'string' || !item.name.trim()
        || typeof item.country !== 'string' || !item.country.trim()
        || typeof item.position !== 'string' || !item.position.trim()
        || typeof item.checkedAt !== 'string' || !ISO_DATE.test(item.checkedAt)
        || typeof item.source !== 'string' || !item.source.startsWith('https://')) return null;
    const nameKey=item.name.trim().toLocaleLowerCase('ru');
    if(names.has(nameKey))return null;
    const hasClub = typeof item.club === 'string' && item.club.trim();
    const hasLeague = FOOTBALL_LEAGUES.includes(item.league) || item.league === 'RPL';
    if (hasClub && item.league !== null && !hasLeague) return null;
    if (item.footballDataTeamId !== null && (!Number.isInteger(item.footballDataTeamId) || item.footballDataTeamId < 1)) return null;
    if (item.footballDataTeamName !== null && (typeof item.footballDataTeamName !== 'string' || !item.footballDataTeamName.trim())) return null;
    if (item.league === null && (item.footballDataTeamId !== null || item.footballDataTeamName !== null)) return null;
    if (item.league === 'RPL' && (!Number.isInteger(item.clubId)
        || !clubs.some(club => club.id === item.clubId))) return null;
    if (item.league !== 'RPL' && item.clubId != null) return null;
    ids.add(item.id);
    names.add(nameKey);
    players.push({...item, name:item.name.trim(), country:item.country.trim(), position:item.position.trim(), club:hasClub ? item.club.trim() : null});
  }
  return {...input, clubs, players};
}

export function searchPlayers(players, query) {
  const needle=String(query||'').trim().toLocaleLowerCase('ru');
  return (players||[]).filter(player=>String(player?.name||'').toLocaleLowerCase('ru').includes(needle));
}

function teamObjects(snapshot, league) {
  const items = [];
  for (const data of Object.values(snapshot || {})) {
    if (data?.league !== league || !['standings','matches'].includes(data.endpoint)) continue;
    for (const row of data.items || []) {
      if (data.endpoint === 'standings') items.push(row.team);
      else items.push(row.homeTeam, row.awayTeam);
    }
  }
  const seen = new Set();
  return items.filter(team => team && Number.isInteger(team.id) && !seen.has(team.id) && seen.add(team.id));
}

export function resolvePlayerClub(snapshots, player, clubs = []) {
  if (player?.league === 'RPL') {
    const club = clubs.find(item => item.id === player.clubId);
    return club ? {team:{id:club.id,name:club.name,shortName:club.name},league:'RPL',club} : null;
  }
  if (!player || !FOOTBALL_LEAGUES.includes(player.league)
      || (player.footballDataTeamId == null && !player.footballDataTeamName)) return null;
  const candidates = teamObjects(snapshots, player.league);
  if (Number.isInteger(player.footballDataTeamId)) {
    const team = candidates.find(item => item.id === player.footballDataTeamId);
    return team ? {team, league:player.league} : null;
  }
  const team = candidates.find(item => item.name === player.footballDataTeamName || item.shortName === player.footballDataTeamName);
  return team ? {team, league:player.league} : null;
}

export function mergeTeamCatalog(snapshotTeams, clubs = []) {
  const teams = new Map((snapshotTeams || []).map(team => [`${team.league}:${team.id}`,team]));
  for (const club of clubs) {
    const item = {id:club.id,name:club.name,league:'RPL',season:null,standing:null,city:club.city};
    teams.set(`RPL:${club.id}`,item);
  }
  return [...teams.values()].sort((a,b)=>a.league.localeCompare(b.league)||a.name.localeCompare(b.name,'ru'));
}

export function searchTeams(teams, query) {
  const needle=String(query||'').trim().toLocaleLowerCase('ru');
  return (teams||[]).filter(team=>!needle||`${team.name||''} ${team.city||''} ${team.league||''}`.toLocaleLowerCase('ru').includes(needle));
}
