import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSnapshot, snapshotsFromDocuments, isValidSnapshotCache, isFreshSnapshot, localSnapshotFileNames, snapshotsFromLocalFiles, snapshotSeasons} from '../snapshot_data.mjs';
import {favoritesDocumentPath, normalizeFavorites, mergeFavorites, createFavoritesDocument} from '../favorites_sync.mjs';

const at='2026-10-30T18:00:00Z';
test('reads grouped Firestore standings and restores stage metadata',()=>{
  const value=normalizeSnapshot({schemaVersion:1,source:'football-data.org',league:'PL',season:2026,
    endpoint:'standings',fetchedAt:at,items:[{type:'TOTAL',stage:'LEAGUE_STAGE',group:null,table:[
      {position:1,team:{id:8,name:'Test'},points:9,goalsFor:5,goalsAgainst:2,goalDifference:3}
    ]}]});
  assert.equal(value.items.length,1); assert.equal(value.items[0].type,'TOTAL');
  assert.equal(value.items[0].team.id,8); assert.equal(value.items[0].stage,'LEAGUE_STAGE');
});
test('accepts normalized standings and Firestore-wrapped match scores',()=>{
  const table=normalizeSnapshot({schemaVersion:1,source:'football-data.org',league:'PL',season:2026,
    endpoint:'standings',fetchedAt:at,items:[{type:'TOTAL',team:{id:1,name:'A'},points:4}]});
  assert.equal(table.items[0].points,4);
  const matches=normalizeSnapshot({schemaVersion:1,source:'football-data.org',league:'PL',season:2026,
    endpoint:'matches',fetchedAt:at,items:[{id:1,homeTeam:{id:1},awayTeam:{id:2},score:{fullTime:{home:2,away:1}}}]});
  assert.deepEqual(matches.items[0].fullTime,{home:2,away:1});
});
test('rejects malformed or mismatched snapshot docs',()=>{
  const base={schemaVersion:1,source:'football-data.org',league:'PL',season:2026,endpoint:'matches',fetchedAt:at,items:[]};
  assert.equal(normalizeSnapshot({...base,league:'UNKNOWN'}),null);
  assert.equal(normalizeSnapshot(base,{endpoint:'standings'}),null);
  assert.equal(normalizeSnapshot({...base,fetchedAt:'bad'}),null);
  assert.equal(isValidSnapshotCache({schemaVersion:1,snapshots:{bad:{}}}),false);
});
test('freshness keeps stale valid cache readable and rejects future/invalid timestamps',()=>{
  const now=Date.parse(at),snapshot={fetchedAt:at};
  assert.equal(isFreshSnapshot(snapshot,now+35*3600_000),true);
  assert.equal(isFreshSnapshot(snapshot,now+37*3600_000),false);
  assert.equal(isFreshSnapshot({fetchedAt:'bad'},now),false);
  const cache={schemaVersion:1,snapshots:{PL_2026_matches:{schemaVersion:1,source:'football-data.org',league:'PL',season:2026,endpoint:'matches',fetchedAt:at,items:[]}}};
  assert.equal(isValidSnapshotCache(cache),true);
  assert.equal(isValidSnapshotCache({...cache,snapshots:{wrong_key:cache.snapshots.PL_2026_matches}}),false);
});
test('Firebase discovery includes available historical seasons without guessing current year',()=>{
  const row={schemaVersion:1,source:'football-data.org',league:'PL',season:2024,endpoint:'standings',fetchedAt:at,items:[{type:'TOTAL',team:{id:7,name:'Older Club'},points:6}]};
  const docs=snapshotsFromDocuments([{id:'PL_2024_standings',data:()=>row},{id:'PL_2024_matches',data:()=>({...row,endpoint:'matches'})},{id:'bad-id',data:()=>row}]);
  assert.deepEqual(Object.keys(docs),['PL_2024_standings','PL_2024_matches']);
  assert.equal(docs.PL_2024_standings.season,2024);
});
test('favorites document paths are bound to authenticated UID',()=>{
  assert.deepEqual(favoritesDocumentPath('authUid_123'),['users','authUid_123','privatePreferences','football']);
  assert.throws(()=>favoritesDocumentPath('owner','other'),/authenticated owner UID/);
});
test('favorite validation is bounded and same-device state can be merged',()=>{
  const item=(id)=>({id,name:`Team ${id}`,league:'PL'});
  const norm=normalizeFavorites({teams:[item(1),item(1),item(2),item(3),item(4)],players:'invalid'});
  assert.deepEqual(norm.teams.map(row=>row.id),[1,2,3]); assert.deepEqual(norm.players,[]);
  const merged=mergeFavorites({teams:[item(1)]},{teams:[item(2)]});
  assert.equal(merged.conflict,false); assert.equal(merged.favorites.teams.length,2);
  const conflict=mergeFavorites({teams:[item(1),item(2),item(3)]},{teams:[item(4)]});
  assert.equal(conflict.conflict,true);
});
test('favorites payload is owner-bound and does not accept untrusted metadata',()=>{
  const payload=createFavoritesDocument('owner-uid',{teams:[{id:4,name:'Club',league:'PL'}]},
    {revision:2,updatedAt:at,deviceId:'local-device'});
  assert.equal(payload.ownerUid,'owner-uid'); assert.equal(payload.favorites.teams[0].id,4);
  assert.throws(()=>createFavoritesDocument('owner-uid',{}, {revision:-1,updatedAt:at,deviceId:'x'}));
});

test('local files load six leagues and expose only real available seasons',()=>{
  const expected=['PL','PD','SA','BL1','FL1','CL'];
  const names=[...expected.map(league=>league+'_2026_matches.json'),'PL_2025_standings.json','PL_2026_standings.json','notes.json'];
  const accepted=localSnapshotFileNames(names);
  assert.equal(accepted.length,8);
  const files=accepted.filter(name=>name!=='notes.json').map(name=>{
    const [,league,year,endpoint]=/^([A-Z0-9]+)_(\\d{4})_(standings|matches)\\.json$/.exec(name);
    const base={schemaVersion:1,source:'football-data.org',league,season:Number(year),endpoint,fetchedAt:at};
    if(endpoint==='standings')base.items=[{type:'TOTAL',team:{id:100+expected.indexOf(league),name:league},points:12,goalsFor:null,goalsAgainst:null}];
    else base.items=[];
    return {name,data:base};
  });
  const snapshots=snapshotsFromLocalFiles(files);
  assert.deepEqual(expected.map(league=>snapshots[league+'_2026_matches']?.league),expected);
  assert.deepEqual(snapshotSeasons(snapshots,'PL'),[2026,2025]);
  assert.deepEqual(snapshotSeasons(snapshots,'CL'),[2026]);
  assert.equal(snapshots.PL_2026_standings.items[0].goalsFor,null);
  assert.equal(snapshotSeasons(snapshots,'UNKNOWN').length,0);
});
test('local snapshot loader rejects a file whose contents do not match its filename',()=>{
  const files=[{name:'PL_2026_matches.json',data:{schemaVersion:1,source:'football-data.org',league:'PL',season:2025,endpoint:'matches',fetchedAt:at,items:[]}}];
  assert.deepEqual(snapshotsFromLocalFiles(files),{});
});
