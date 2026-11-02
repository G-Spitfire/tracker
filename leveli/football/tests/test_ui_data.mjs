import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSnapshot, snapshotsFromDocuments, isValidSnapshotCache, isFreshSnapshot, localSnapshotFileNames, snapshotsFromLocalFiles, snapshotSeasons, favoriteTeamCatalog, favoriteTeamSummary} from '../snapshot_data.mjs';
import {favoritesDocumentPath, normalizeFavorites, mergeFavorites, createFavoritesDocument, readStoredFavorites, writeStoredFavorites} from '../favorites_sync.mjs';
import {normalizePlayerCatalog, searchPlayers, resolvePlayerClub, mergeTeamCatalog, searchTeams} from '../player_data.mjs';

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
test('favorite teams persist across reload and remain separated by local profile key',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const selected={teams:[{id:51,name:'Liverpool',league:'PL'},{id:72,name:'Barcelona',league:'PD'}],players:[]};
  assert.equal(writeStoredFavorites(storage,'guest',selected),true);
  assert.deepEqual(readStoredFavorites(storage,'guest'),selected);
  assert.deepEqual(readStoredFavorites(storage,'another-user'),{teams:[],players:[]});
});
test('stable catalog player IDs are accepted by the existing favorites store',()=>{
  const favorite={teams:[],players:[{id:'player-erling-haaland',name:'Эрлинг Холанд',league:'PL'}]};
  assert.deepEqual(normalizeFavorites(favorite),favorite);
  const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  writeStoredFavorites(storage,'guest',favorite);
  assert.deepEqual(readStoredFavorites(storage,'guest'),favorite);
});

test('local files load six leagues and expose only real available seasons',()=>{
  const expected=['PL','PD','SA','BL1','FL1','CL'];
  const names=[...expected.map(league=>league+'_2026_matches.json'),'PL_2025_standings.json','PL_2026_standings.json','CL_2026_standings.json','notes.json'];
  const accepted=localSnapshotFileNames(names);
  assert.equal(accepted.length,8);
  assert.deepEqual(localSnapshotFileNames(['CL_2026_standings.json']),[]);
  const files=accepted.filter(name=>name!=='notes.json').map(name=>{
    const [league,year,endpoint]=name.replace('.json','').split('_');
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

function snapshot(league,season,endpoint,items,fetchedAt=at){return {schemaVersion:1,source:'football-data.org',league,season,endpoint,fetchedAt,items};}
test('favorite team catalog spans competitions and can find Champions League teams from matches only',()=>{
  const snapshots={
    PL_2026_standings:snapshot('PL',2026,'standings',[{type:'TOTAL',position:2,points:18,team:{id:10,name:'Arsenal'}}]),
    PL_2026_matches:snapshot('PL',2026,'matches',[]),
    CL_2026_matches:snapshot('CL',2026,'matches',[{id:1,homeTeam:{id:20,name:'Real Madrid'},awayTeam:{id:21,name:'Inter'}}]),
  };
  const catalog=favoriteTeamCatalog(snapshots,['PL','PD','SA','BL1','FL1','CL'],2026);
  assert.ok(catalog.some(team=>team.league==='PL'&&team.id===10&&team.standing.position===2));
  assert.ok(catalog.some(team=>team.league==='CL'&&team.id===20&&team.name==='Real Madrid'));
  assert.equal(favoriteTeamSummary(snapshots,{id:20,name:'Real Madrid',league:'CL'},2026).standing,null);
});
test('favorite team summary uses its own league despite a different active filter and returns five real results',()=>{
  const games=Array.from({length:6},(_,index)=>({
    id:index+1,status:'FINISHED',utcDate:`2026-09-${String(index+1).padStart(2,'0')}T18:00:00Z`,
    homeTeam:{id:index%2?31:30,name:index%2?'Opponent':'Chosen Club'},
    awayTeam:{id:index%2?30:31,name:index%2?'Chosen Club':'Opponent'},
    fullTime:{home:index+1,away:index},
  }));
  const snapshots={
    PL_2026_standings:snapshot('PL',2026,'standings',[{type:'TOTAL',position:4,points:12,team:{id:1,name:'Another league'}}]),
    SA_2026_standings:snapshot('SA',2026,'standings',[{type:'TOTAL',position:3,points:20,team:{id:30,name:'Chosen Club'}}]),
    SA_2026_matches:snapshot('SA',2026,'matches',games),
  };
  const summary=favoriteTeamSummary(snapshots,{id:30,name:'Chosen Club',league:'SA'},2026,Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(summary.season,2026);
  assert.equal(summary.standing.position,3);
  assert.equal(summary.lastMatches.length,5);
  assert.equal(summary.lastMatches[0].opponent.name,'Opponent');
  assert.equal(summary.lastMatches[0].result,'Поражение');
  assert.equal(summary.nextMatch,null);
});
test('missing or stale team snapshots stay explicit and never manufacture table or match values',()=>{
  const missing=favoriteTeamSummary({}, {id:45,name:'Saved team',league:'FL1'},2026);
  assert.equal(missing.season,null);
  const staleAt='2026-10-28T00:00:00Z';
  const snapshots={FL1_2026_matches:snapshot('FL1',2026,'matches',[],staleAt)};
  const summary=favoriteTeamSummary(snapshots,{id:45,name:'Saved team',league:'FL1'},2026,Date.parse(at));
  assert.equal(summary.standing,null);
  assert.equal(summary.lastMatches.length,0);
  assert.equal(summary.nextMatch,null);
  assert.equal(summary.stale,true);
});

const catalogRaw=JSON.parse(readFileSync(new URL('../players-catalog.json',import.meta.url),'utf8'));
test('player catalog contains current, sourced profiles without fabricated statistics',()=>{
  const catalog=normalizePlayerCatalog(catalogRaw);
  assert.ok(catalog);
  assert.equal(catalog.players.length,60);
  assert.equal(new Set(catalog.players.map(player=>player.id)).size,60);
  assert.equal(new Set(catalog.players.map(player=>player.name.toLocaleLowerCase('ru'))).size,60);
  for(const player of catalog.players){
    assert.match(player.id,/^player-[a-z0-9-]+$/);
    assert.match(player.source,/^https:\/\//);
    assert.equal(player.checkedAt,'2026-11-01');
    assert.equal('goals' in player,false);
    assert.equal('assists' in player,false);
  }
  for(const name of ['Килиан Мбаппе','Эрлинг Холанд','Ламин Ямаль','Джуд Беллингем','Винисиус Жуниор','Гарри Кейн','Мохамед Салах'])
    assert.ok(catalog.players.some(player=>player.name===name),`missing ${name}`);
  for(const id of ['player-kylian-mbappe','player-vinicius-junior','player-jude-bellingham','player-federico-valverde','player-thibaut-courtois','player-arda-guler','player-lamine-yamal','player-raphinha','player-pedri','player-gavi','player-dani-olmo','player-fermin-lopez','player-gabriel-jesus','player-rodri','player-erling-haaland','player-phil-foden','player-rayan-cherki','player-jeremy-doku','player-ruben-dias','player-harry-kane','player-jamal-musiala','player-joshua-kimmich','player-michael-olise','player-alphonso-davies','player-luis-diaz','player-achraf-hakimi','player-vitinha','player-khvicha-kvaratskhelia','player-ousmane-dembele','player-desire-doue','player-joao-neves','player-lautaro-martinez','player-nicolo-barella','player-alessandro-bastoni','player-federico-dimarco','player-marcus-thuram','player-jan-oblak','player-julian-alvarez','player-ademola-lookman','player-alex-baena','player-cristian-romero','player-mohamed-salah'])
    assert.ok(catalog.players.some(player=>player.id===id),`legacy ID changed or missing: ${id}`);
  for(const name of ['Лионель Месси','Криштиану Роналду','Букайо Сака','Вирджил ван Дейк','Максим Глушенков','Игорь Дивеев','Константин Тюкавин','Бителло'])
    assert.ok(catalog.players.some(player=>player.name===name),`missing ${name}`);
  assert.ok(normalizePlayerCatalog({schemaVersion:1,checkedAt:catalog.checkedAt,players:catalog.players.filter(player=>player.league!=='RPL')}));
  const duplicate=[...catalogRaw.players,{...catalogRaw.players[0],id:'player-duplicate-name'}];
  assert.equal(normalizePlayerCatalog({...catalogRaw,players:duplicate}),null);
  assert.deepEqual(searchPlayers(catalog.players,'яМаль').map(player=>player.id),['player-lamine-yamal']);
  assert.deepEqual(searchPlayers(catalog.players,'месси').map(player=>player.id),['player-lionel-messi']);
  assert.equal(searchPlayers(catalog.players,'нет такого игрока').length,0);
});
test('player calendar link requires a verified club ID or exact provider name',()=>{
  const catalog=normalizePlayerCatalog(catalogRaw);
  const realId=catalog.players.find(player=>player.id==='player-kylian-mbappe');
  const psg=catalog.players.find(player=>player.id==='player-vitinha');
  const snapshots={
    PD_2026_standings:snapshot('PD',2026,'standings',[{type:'TOTAL',position:1,points:10,team:{id:86,name:'Real Madrid CF',shortName:'Real Madrid'}}]),
    FL1_2026_matches:snapshot('FL1',2026,'matches',[{id:1,homeTeam:{id:524,name:'Paris Saint-Germain FC',shortName:'Paris SG'},awayTeam:{id:99,name:'Other FC'}}]),
  };
  assert.equal(resolvePlayerClub(snapshots,realId).team.id,86);
  assert.equal(resolvePlayerClub(snapshots,psg).team.id,524);
  assert.equal(resolvePlayerClub({},psg),null);
  assert.equal(resolvePlayerClub(snapshots,{...psg,footballDataTeamName:'Paris Saint-Germain'}),null);
  assert.equal(resolvePlayerClub(snapshots,catalog.players.find(player=>player.id==='player-mohamed-salah')),null);
});

test('Zenit and Dynamo are searchable without RPL match snapshots and keep honest missing-data state',()=>{
  const catalog=normalizePlayerCatalog(catalogRaw);
  const teams=mergeTeamCatalog([],catalog.clubs);
  assert.deepEqual(searchTeams(teams,'зенит').map(team=>[team.id,team.city]),[[900001,'Санкт-Петербург']]);
  assert.deepEqual(searchTeams(teams,'динамо').map(team=>[team.id,team.city]),[[900002,'Москва']]);
  assert.deepEqual(searchTeams(teams,'санкт').map(team=>team.id),[900001]);
  assert.equal(teams.length,2);
  const glushenkov=catalog.players.find(player=>player.id==='player-maxim-glushenkov');
  const tyukavin=catalog.players.find(player=>player.id==='player-konstantin-tyukavin');
  assert.equal(resolvePlayerClub({},glushenkov,catalog.clubs).team.id,900001);
  assert.equal(resolvePlayerClub({},tyukavin,catalog.clubs).team.id,900002);
});

test('Russian club favorites use the existing favorite schema and survive reload',()=>{
  const saved={teams:[{id:900001,name:'Зенит',league:'RPL'},{id:900002,name:'Динамо',league:'RPL'}],players:[
    {id:'player-maxim-glushenkov',name:'Максим Глушенков',league:'RPL'},
    {id:'player-konstantin-tyukavin',name:'Константин Тюкавин',league:'RPL'}
  ]};
  const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  assert.equal(writeStoredFavorites(storage,'guest',saved),true);
  assert.deepEqual(readStoredFavorites(storage,'guest'),saved);
  const capped=normalizeFavorites({...saved,teams:[...saved.teams,{id:900003,name:'Other',league:'RPL'},{id:900004,name:'Fourth',league:'RPL'}]});
  assert.deepEqual(capped.teams,[...saved.teams,{id:900003,name:'Other',league:'RPL'}]);
});
