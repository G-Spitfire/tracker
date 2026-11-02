const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.join(__dirname,'..');
function harness(saved){
 const values=new Map(saved?[['word-scenes-v5',JSON.stringify(saved)]]:[]);let writes=0,scheduled=0;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,String(v));writes++},removeItem:k=>values.delete(k)};
 const context=vm.createContext({localStorage:storage,console,Date,performance:{now:()=>0},setTimeout:()=>1,clearTimeout:()=>{},queueMicrotask:()=>{},navigator:{},document:{addEventListener:()=>{}}});
 context.window=context;context.addEventListener=()=>{};
 for(const file of ['review-engine.js','habit-engine.js','state-guard.js','writing-engine.js','topics.js','content-500-v14.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context);
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 vm.runInContext(script.slice(0,script.indexOf("$('brand-berry').innerHTML=")),context);
 context.WordSceneCloudBackup={enabled:true,schedule:()=>scheduled++};
 return {run:code=>vm.runInContext(code,context),storage,writes:()=>writes,scheduled:()=>scheduled};
}
test('viewing unstarted words and the home page never creates 500 saved records',()=>{
 const h=harness();h.run('shell=()=>{};save()');const writes=h.writes();
 h.run('freshIds();trainedIds();requiredIds();optionalIds();topicStats("all");home();home()');
 assert.equal(h.run('Object.keys(data.words).length'),0);assert.equal(h.writes(),writes);
});
test('unchanged saves do not write or schedule a backup; changed answers still save immediately',()=>{
 const h=harness();h.run('save()');const writes=h.writes(),scheduled=h.scheduled();
 h.run('save();save()');assert.equal(h.writes(),writes);assert.equal(h.scheduled(),scheduled);
 h.run('record(0).attempts++;save()');assert.equal(h.writes(),writes+1);assert.equal(h.scheduled(),scheduled+1);
 assert.equal(JSON.parse(h.storage.getItem('word-scenes-v5')).words.mug.attempts,1);
});
test('a stale tab cannot overwrite a newer save even when its own state is unchanged',()=>{
 const h=harness();h.run('save()');const newer=JSON.stringify({version:5,words:{mug:{attempts:7}}});
 h.storage.setItem('word-scenes-v5',newer);assert.equal(h.run('save()'),false);
 assert.equal(h.storage.getItem('word-scenes-v5'),newer);assert.equal(h.run('storageBlock'),'conflict');
});
test('existing progress, unknown legacy fields and interrupted sessions survive normalization',()=>{
 const session={part:'new',phase:'learn',ids:[0],newIds:[0],learnIndex:0,completed:[],errors:[],partErrors:[]};
 const saved={version:5,reviewVersion:1,words:{mug:{started:true,attempts:9,errors:2,legacyExtra:{keep:true}}},session,legacyRoot:'keep'};
 const h=harness(saved);h.run('save()');const current=JSON.parse(h.storage.getItem('word-scenes-v5'));
 assert.equal(current.words.mug.attempts,9);assert.equal(current.words.mug.errors,2);
 assert.deepEqual(current.words.mug.legacyExtra,{keep:true});assert.equal(current.legacyRoot,'keep');assert.deepEqual(current.session,session);
 assert.equal(Object.keys(current.words).length,1);
});
test('dictionary search retains matching card nodes and filters without creating progress',()=>{
 const h=harness();
 const result=h.run(`(()=>{
  const children=[],count={textContent:''},practice={innerHTML:''};
  const list={get firstChild(){return children[0]||null},querySelector:()=>null,insertBefore(row,cursor){const old=children.indexOf(row);if(old>=0)children.splice(old,1);children.splice(cursor?children.indexOf(cursor):children.length,0,row)}};
  document.getElementById=id=>({'word-count':count,'word-list':list,'writing-practice':practice})[id];
  let created=0;
  document.createElement=()=>{created++;const row={get nextSibling(){return children[children.indexOf(row)+1]||null},remove(){children.splice(children.indexOf(row),1)}};return {set innerHTML(value){},firstElementChild:row}};
  wordQuery='cat';updateList();const firstCount=count.textContent;const retained=children[1];
  wordQuery='catch';updateList();
  return {firstCount,finalCount:count.textContent,created,reused:children[0]===retained,records:Object.keys(data.words).length};
 })()`);
 assert.equal(result.firstCount,'Показано: 2 из 500 слов');assert.equal(result.finalCount,'Показано: 1 из 500 слов');
 assert.equal(result.created,2);assert.equal(result.reused,true);assert.equal(result.records,0);
});
test('the stricter guard accepts every saved phase of a complete real lesson',()=>{
 const h=harness();
 h.run('learn=()=>{};test=()=>{};roundResult=()=>{};writing=()=>{};result=()=>{};startSelected()');
 const check=()=>assert.equal(h.run('WordSceneState.valid(JSON.parse(localStorage.getItem(KEY)),words.length)'),true);
 check();for(let i=0;i<5;i++){h.run('sceneHidden=true;nextLearn()');check()}
 for(let direction=0;direction<2;direction++){
  for(let round=0;round<3;round++){
   for(let word=0;word<5;word++){h.run('s.revealed=true;grade(true)');check()}
   if(round<2){h.run('startRound()');check()}
  }
  h.run('nextDirection()');check();
 }
 for(let i=0;i<5;i++){h.run("W.mark(s,record(s.writingIds[s.writingIndex]),s.writingIds[s.writingIndex],'correct');save();nextWriting()");check()}
 assert.equal(h.run('s.phase'),'result');assert.equal(h.run('trainedIds().length'),5);
});
