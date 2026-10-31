const assert=require('node:assert/strict');
const {test}=require('node:test');
const review=require('../review-engine.js');
const habit=require('../habit-engine.js');
const guard=require('../state-guard.js');
const {create}=require('../event-reducer.js');
const reducer=create({review,habit,validate:x=>guard.valid(x,500)});
const baseline={version:5,words:{},reviewCycle:[],session:null,mode:'new',habit:{version:1,since:'2026-01-01',days:{}}};
const ev=(eventId,deviceId,kind,wordId,payload,uid='A')=>({schemaVersion:2,eventId,uid,baselineId:'base-A',deviceId,kind,wordId,payload,createdAt:100});
const shared=[
 ev('a-answer','phone-A','answer','mug',{direction:1,correct:true,easy:true,elapsedSeconds:2.2}),
 ev('b-answer','tablet-B','answer','mug',{direction:0,correct:false,easy:false,elapsedSeconds:null}),
 ev('c-new','phone-A','new-completion','mug',{day:'2026-10-31',firstLearnedAt:100,needsWork:false}),
 ev('d-review','tablet-B','review-check','mug',{day:'2026-11-01',directions:[true,false],clean:false,available:1})
];
test('combines independent device outcomes deterministically regardless of delivery order',()=>{
 const forward=reducer.reduce({baseline,events:shared,uid:'A',baselineId:'base-A'}),reverse=reducer.reduce({baseline,events:[...shared].reverse(),uid:'A',baselineId:'base-A'});
 assert.deepEqual(forward,reverse);assert.equal(forward.words.mug.attempts,2);assert.equal(forward.words.mug.errors,1);
 assert.equal(forward.words.mug.sessions,2);assert.equal(forward.words.mug.needsWork,true);assert.equal(forward.words.mug.schedule.checks.length,1);
});
test('repeated delivery does not double counts or schedule checks',()=>{
 const once=reducer.reduce({baseline,events:shared,uid:'A',baselineId:'base-A'}),twice=reducer.reduce({baseline,events:[...shared,...shared],uid:'A',baselineId:'base-A'});
 assert.deepEqual(twice,once);
});
test('preserves a local unfinished lesson while merging confirmed remote outcomes',()=>{
 const local={...baseline,session:{part:'new',phase:'learn',ids:[0],completed:[],errors:[],partErrors:[],learnIndex:0}};
 const merged=reducer.reduce({baseline,events:shared,uid:'A',baselineId:'base-A',localState:local});
 assert.deepEqual(merged.session,local.session);assert.equal(merged.words.mug.attempts,2);
});
test('clears only known writing errors and retains a concurrent unseen error',()=>{
 const legacy={...baseline,words:{mug:{writing:'incorrect',writingNeedsWork:true}}};
 const initialError=ev('write-error-A','phone-A','writing-check','mug',{pass:0,result:'forgot',needsWork:true,sessionId:'first'});
 const resolution=ev('write-resolve-A','tablet-B','writing-check','mug',{pass:2,result:'correct',needsWork:false,sessionId:'repair',resolves:['baseline:mug','write-error-A']});
 const simultaneousError=ev('write-error-B','phone-C','writing-check','mug',{pass:0,result:'incorrect',needsWork:true,sessionId:'parallel'});
 const cleared=reducer.reduce({baseline:legacy,events:[initialError,resolution],uid:'A',baselineId:'base-A'});
 assert.equal(cleared.words.mug.writingNeedsWork,false);assert.equal(cleared.words.mug.writing,'correct');
 const kept=reducer.reduce({baseline:legacy,events:[initialError,resolution,simultaneousError],uid:'A',baselineId:'base-A'});
 assert.equal(kept.words.mug.writingNeedsWork,true);
});
test('rejects mixed-account or colliding event sets before materializing',()=>{
 assert.throws(()=>reducer.reduce({baseline,events:[...shared,ev('foreign','tablet-C','answer','book',{direction:0,correct:true,easy:true,elapsedSeconds:null},'B')],uid:'A',baselineId:'base-A'}),/another profile/);
 assert.throws(()=>reducer.reduce({baseline,events:[...shared,{...shared[0],payload:{...shared[0].payload,correct:false}}],uid:'A',baselineId:'base-A'}),/collision/);
 const mismatched={...ev('other-base','tablet-C','answer','book',{direction:0,correct:true,easy:true,elapsedSeconds:null} ),baselineId:'base-B'};
 assert.throws(()=>reducer.reduce({baseline,events:[mismatched],uid:'A',baselineId:'base-A'}),/different baseline/);
});
