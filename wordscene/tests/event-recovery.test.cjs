const assert=require('node:assert/strict');
const {test}=require('node:test');
const guard=require('../state-guard.js'),review=require('../review-engine.js'),habit=require('../habit-engine.js');
const baselineApi=require('../event-baseline.js'),outboxApi=require('../event-outbox.js'),ledgerApi=require('../event-ledger.js'),learningApi=require('../learning-events.js'),reducerApi=require('../event-reducer.js');
test('replays a durable confirmed event after a crash between journaling and snapshot save',()=>{
 const session={part:'new',phase:'learn',ids:[0],completed:[],errors:[],partErrors:[],learnIndex:0};
 const initial={version:5,words:{},reviewCycle:[],session,mode:'new',habit:{version:1,since:'2026-01-01',days:{}}};
 const values=new Map([['word-scenes-v5',JSON.stringify(initial)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 let id=0;const validate=x=>guard.valid(x,500),baselines=baselineApi.create({storage,validate,makeId:()=>`base-${++id}`,now:()=>123});
 const baseline=baselines.prepare('A'),profile=()=> 'A';
 const outbox=outboxApi.create({storage,uid:profile,deviceId:()=>storage.getItem(learningApi.DEVICE_KEY)||'missing',baselineId:()=>baseline.baselineId,makeId:()=>`evt-${++id}`,now:()=>200});
 const ledger=ledgerApi.create({storage,profile});
 const learning=learningApi.create({storage,outbox,ledger,profile:()=> 'user:A',makeId:()=>`device-${++id}`});
 learning.record({kind:'answer',wordId:'mug',sessionId:'session-1',actionId:'answer-1',payload:{direction:1,correct:true,easy:true,elapsedSeconds:2}});
 // Simulate the state snapshot not being written, then a successful server ack.
 outbox.acknowledge(outbox.list().map(e=>e.eventId));
 assert.equal(JSON.parse(storage.getItem('word-scenes-v5')).words.mug,undefined);
 const materializer=reducerApi.create({review,habit,validate});
 const recovered=materializer.reduce({baseline:baseline.baseline,baselineId:baseline.baselineId,events:ledger.list(),uid:'A',localState:JSON.parse(storage.getItem('word-scenes-v5'))});
 assert.equal(recovered.words.mug.attempts,1);assert.equal(recovered.words.mug.times[1][0],2);assert.deepEqual(recovered.session,session);
});
