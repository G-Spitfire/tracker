const MAX_FAVORITES = 3;
export function favoritesDocumentPath(authUid, targetUid = authUid) {
  if (typeof authUid !== 'string' || authUid.length < 1 || authUid.length > 128 || authUid.includes('/')
      || authUid !== targetUid) {
    throw new Error('Favorites may only be addressed by the authenticated owner UID');
  }
  return ['users', authUid, 'privatePreferences', 'football'];
}

export function normalizeFavorites(value) {
  const normalizeList = items => {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items.filter(item => item && Number.isInteger(item.id) && item.id > 0
      && typeof item.name === 'string' && item.name.trim().length > 0
      && typeof item.league === 'string' && /^[A-Z0-9]{2,4}$/.test(item.league))
      .map(item => ({id:item.id, name:item.name.trim().slice(0,100), league:item.league}))
      .filter(item => { const key=`${item.league}:${item.id}`; if(seen.has(key)) return false; seen.add(key); return true; })
      .slice(0, MAX_FAVORITES);
  };
  return {teams:normalizeList(value?.teams),players:normalizeList(value?.players)};
}

export function mergeFavorites(localValue, remoteValue) {
  const local=normalizeFavorites(localValue), remote=normalizeFavorites(remoteValue);
  const mergeList=(a,b)=>{
    const union=new Map();
    for(const item of [...b,...a])union.set(`${item.league}:${item.id}`,item);
    const values=[...union.values()];
    return values.length<=MAX_FAVORITES?{items:values,conflict:false}:{items:values.slice(0,MAX_FAVORITES),conflict:true};
  };
  const teams=mergeList(local.teams,remote.teams), players=mergeList(local.players,remote.players);
  return {favorites:{teams:teams.items,players:players.items},conflict:teams.conflict||players.conflict};
}

export function createFavoritesDocument(authUid, favorites, {revision = 0, updatedAt, deviceId} = {}) {
  if (!Number.isInteger(revision) || revision < 0 || !Number.isFinite(Date.parse(updatedAt || ''))
      || typeof deviceId !== 'string' || !deviceId || deviceId.length > 80) {
    throw new Error('Favorites sync metadata is invalid');
  }
  favoritesDocumentPath(authUid);
  return {schemaVersion:1,ownerUid:authUid,favorites:normalizeFavorites(favorites),revision,updatedAt,deviceId};
}

// No network writer is exposed. An app integration must add an owner-checked,
// explicitly approved Firestore transaction after its Rules are reviewed.
