const assert=require('node:assert/strict');
const {test}=require('node:test');
const {create}=require('../event-baseline.js');
const validate=x=>!!x&&x.version===5&&x.words&&typeof x.words==='object';
function harness(initial){
 const values=new Map([['word-scenes-v5',JSON.stringify(initial)]]);
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 return {migration:create({storage,validate,now:()=>123}),storage};
}
test('creates an immutable verified baseline while preserving local unfinished sessions and the active save byte-for-byte',()=>{
 const original={version:5,words:{mug:{attempts:3}},session:{part:'new',phase:'learn',ids:[0],completed:[],errors:[],partErrors:[],learnIndex:0}},h=harness(original),raw=h.storage.getItem('word-scenes-v5');
 const result=h.migration.prepare('A');assert.equal(result.status,'created');assert.equal(h.storage.getItem('word-scenes-v5'),raw);
 assert.equal(result.baseline.session,null);assert.deepEqual(h.migration.restore('A'),original);
 assert.equal(h.migration.prepare('A').status,'same');
});
test('retains differing active progress and reports a migration mismatch without overwriting the baseline',()=>{
 const first={version:5,words:{mug:{attempts:3}},session:null},h=harness(first);h.migration.prepare('A');
 const second={version:5,words:{book:{attempts:8}},session:null};h.storage.setItem('word-scenes-v5',JSON.stringify(second));
 assert.equal(h.migration.prepare('A').status,'different');
 assert.deepEqual(h.migration.restore('A'),first);assert.deepEqual(JSON.parse(h.storage.getItem('word-scenes-v5')),second);
});
test('archives exact baseline and active bytes on mismatch without selecting or applying a copy',()=>{
 const first={version:5,words:{mug:{started:true,attempts:1}},reviewCycle:[],session:null,mode:'new'};
 const second={version:5,words:{mug:{started:true,attempts:2,schedule:{version:1,firstLearnedAt:1,stage:'daily',days:[],checks:[{id:'check-1',at:1,day:'2026-01-01',clean:true}],interval:0,nextDay:'2026-01-02'}}},reviewCycle:[],session:{part:'new',phase:'learn',ids:[0],completed:[],errors:[],partErrors:[],learnIndex:0},mode:'new'};
 const values=new Map([['word-scenes-v5',JSON.stringify(first)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const api=require('../event-baseline.js').create({storage,validate:x=>require('../state-guard.js').valid(x,500),makeId:()=> 'baseline-one',now:()=>77});
 const baseline=api.prepare('child');const originalBaseline=storage.getItem(baseline.backupKey);storage.setItem('word-scenes-v5',JSON.stringify(second));const activeRaw=storage.getItem('word-scenes-v5');
 const mismatch=api.prepare('child');assert.equal(mismatch.status,'different');assert.equal(storage.getItem('word-scenes-v5'),activeRaw);assert.equal(storage.getItem(baseline.backupKey),originalBaseline);assert.equal(storage.getItem(mismatch.recovery.activeBackupKey),activeRaw);
 assert.equal(storage.getItem(mismatch.recovery.baselineBackupKey),originalBaseline);assert.equal(JSON.parse(storage.getItem(mismatch.recovery.archiveKey)).baselineId,'baseline-one');
});
test('identical legacy progress shares a stable baseline ID across devices regardless of key order or local session',()=>{
 const first={version:5,words:{mug:{attempts:3}},session:{part:'new',phase:'learn',ids:[0],completed:[],errors:[],partErrors:[],learnIndex:0}},second={session:null,words:{mug:{attempts:3}},version:5};
 const a=harness(first),b=harness(second),left=a.migration.prepare('A'),right=b.migration.prepare('A');
 assert.equal(left.baselineId,right.baselineId);assert.equal(a.migration.prepare('A').baselineId,b.migration.prepare('A').baselineId);
});
test('refuses invalid local state without modifying it',()=>{
 const h=harness({version:5,words:null});const raw=h.storage.getItem('word-scenes-v5');
 assert.throws(()=>h.migration.prepare('A'),/Active save is invalid/);assert.equal(h.storage.getItem('word-scenes-v5'),raw);
});
