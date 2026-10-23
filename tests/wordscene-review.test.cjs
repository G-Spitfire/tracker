'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../wordscene/review-engine.js');
const at=d=>Date.parse(d+'T12:00:00+03:00');
const learn=(date='2026-10-01')=>{const p={trained:false,sessions:3,attempts:22,errors:4};R.introduce(p,at(date));return p};
const check=(p,date,clean=true,id=date)=>R.finish(p,{id,at:at(date),directions:{0:clean,1:true}});
let p=learn();assert.equal(R.due(p,at('2026-10-01')),false);assert(R.due(p,at('2026-10-02')));
assert(!R.optional(p,at('2026-10-01')+29*60000));assert(R.optional(p,at('2026-10-01')+30*60000));
check(p,'2026-10-01',true,'same-day');assert.equal(p.schedule.days.length,0);assert(!R.optional(p,at('2026-10-01')+60*60000));
check(p,'2026-10-02');const unchanged=JSON.stringify(p);check(p,'2026-10-02');assert.equal(JSON.stringify(p),unchanged,'Event replay must be idempotent');check(p,'2026-10-02',true,'extra');assert.equal(p.schedule.days.length,1);
for(let d=3;d<=8;d++)check(p,`2026-10-0${d}`);assert.equal(p.schedule.stage,'spaced');assert.equal(p.schedule.nextDay,'2026-10-11');
check(p,'2026-10-09',true,'early');assert.equal(p.schedule.nextDay,'2026-10-11','An early voluntary check cannot advance an interval');
check(p,'2026-10-11');assert.equal(p.schedule.nextDay,'2026-10-18');check(p,'2026-10-18');assert.equal(p.schedule.nextDay,'2026-11-01');check(p,'2026-11-01');assert.equal(p.schedule.nextDay,'2026-12-01');
check(p,'2026-12-01',false);assert.equal(p.schedule.stage,'repair');check(p,'2026-12-01',true,'correction');assert.equal(p.schedule.stage,'repair');check(p,'2026-12-02');assert.equal(p.schedule.stage,'repair');check(p,'2026-12-03');assert.equal(p.schedule.stage,'spaced');assert.equal(p.schedule.nextDay,'2026-12-06');
p=learn();check(p,'2026-10-02');check(p,'2026-10-20');assert.equal(p.schedule.days.length,2,'A gap never creates fictitious review days');assert.equal(p.schedule.nextDay,'2026-10-21');assert.equal(p.sessions,3);assert.equal(p.attempts,22);
p=learn();for(let d=2;d<=7;d++)check(p,`2026-10-0${d}`);check(p,'2026-10-08',false);assert.equal(p.schedule.stage,'daily');check(p,'2026-10-09');assert.equal(p.schedule.stage,'daily');check(p,'2026-10-10');assert.equal(p.schedule.stage,'spaced');
p={trained:true,attempts:71,errors:9,sessions:8,lastAt:at('2026-09-01')};R.ensure(p,at('2026-10-23'));assert.equal(p.attempts,71);assert.equal(p.schedule.firstLearnedAt,null);assert.equal(p.schedule.days.length,0);assert(R.due(p,at('2026-10-23')));check(p,'2026-10-23');assert.equal(p.schedule.days.length,1);
assert.equal(R.addDays('2026-12-31',1),'2027-01-01');assert.equal(R.addDays('2028-02-28',1),'2028-02-29');
const now=at('2026-10-23'),records=[learn('2026-10-22'),learn('2026-10-20'),learn('2026-10-01')];records[0].needsWork=true;records[2].schedule.stage='spaced';records[2].schedule.nextDay='2026-10-01';assert.deepEqual(R.queue(records,now),[0,1,2]);
// Integration: execute the actual app script with synthetic storage and clock.
const html=fs.readFileSync(require('node:path').join(__dirname,'../wordscene/index.html'),'utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1],engine=fs.readFileSync(require('node:path').join(__dirname,'../wordscene/review-engine.js'),'utf8');
function app(seed){let clock=now;const storage=new Map(seed?[['word-scenes-v5',JSON.stringify(seed)]]:[]),nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',style:{},setAttribute(){},append(){}});return nodes.get(id)};class Clock extends Date{constructor(...a){super(...a.length?a:[clock])}static now(){return clock}}const c={Date:Clock,document:{getElementById:node,querySelector:()=>null,addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},window:{scrollTo(){}},performance:{now:()=>1},navigator:{},location:{protocol:'file:'},setTimeout(){},clearTimeout(){},console};vm.createContext(c);vm.runInContext(engine,c);vm.runInContext(source,c);return {run:x=>vm.runInContext(x,c),storage,node,move:d=>clock=at(d)}}
let a=app({version:5,words:Object.fromEntries(Array.from({length:25},(_,i)=>{const code=source.slice(0,source.indexOf('const KEY='));const w=vm.runInNewContext(code+'words');return [w[i].en,{trained:true,sessions:3,attempts:8,errors:1}]})),session:null});
assert.equal(a.run('requiredIds().length'),25);a.run("startSelected('new')");assert.equal(a.run('s.part'),'review');assert.equal(a.run('s.ids.length'),15);assert(a.storage.has('word-scenes-v5-before-review-v1'));
a=app({version:5,words:{mug:{trained:true,sessions:3,attempts:8,errors:1},fist:{trained:true,sessions:2}},session:null});a.run(`s={id:'pair-test',schedulerVersion:1,part:'review',mode:'review',phase:'test',ids:[0,1],newIds:[],queue:[{i:0,dir:1},{i:1,dir:1},{i:0,dir:0},{i:1,dir:0}],pos:0,completed:[],errors:[],partErrors:[],reviewProgress:{}};test=()=>{}`);
for(let i=0;i<3;i++)a.run('s.revealed=true;s.feedback=false;s.cardTime=1;grade(true)');assert.equal(a.run('record(0).sessions'),4);assert.equal(a.run('record(1).sessions'),2);assert.equal(a.run('requiredIds().includes(0)'),false);assert.equal(a.run('requiredIds().includes(1)'),true);
const resumed=app(JSON.parse(a.storage.get('word-scenes-v5')));assert.equal(resumed.run('s.pos'),3);resumed.run('s.revealed=true;s.feedback=false;s.cardTime=1;grade(true)');assert.equal(resumed.run('record(0).sessions'),4);assert.equal(resumed.run('record(1).sessions'),3);assert.equal(resumed.run('requiredIds().length'),0);resumed.run("continueWith('auto')");assert.equal(resumed.run('s.part'),'new');
// Leaving an unfinished approach preserves its queue rather than bypassing the gate.
a.run('endApproach()');assert.equal(a.run('s.id'),'pair-test');assert.equal(a.run('s.pos'),3);
// Several pairs on one day cannot promote daily consolidation.
assert.equal(resumed.run('record(0).schedule.days.length'),1);
console.log('WordScene review engine and app integration: all checks passed');
// An error followed by a successful retry remains a failed independent check.
a=app({version:5,words:{mug:{trained:true,sessions:0},fist:{trained:true,sessions:0}},session:null});a.run(`s={id:'error-test',schedulerVersion:1,part:'review',mode:'review',phase:'test',ids:[0,1],newIds:[],queue:[{i:0,dir:1},{i:1,dir:1},{i:0,dir:0},{i:1,dir:0}],pos:0,completed:[],errors:[],partErrors:[],reviewProgress:{}};test=()=>{}`);
a.run('s.revealed=true;s.cardTime=1;grade(false)');assert.equal(a.run('s.queue.length'),5);a.run('advance()');for(let i=0;i<4;i++)a.run('s.revealed=true;s.feedback=false;s.cardTime=1;grade(true)');assert.equal(a.run('record(0).schedule.checks[0].clean'),false);assert.equal(a.run('record(0).schedule.checks[0].directions[1]'),false);assert.equal(a.run('requiredIds().length'),0);a.move('2026-10-24');assert.equal(a.run('requiredIds().length'),2);
// Re-evaluate the daily gate at every new-word entry, including a day boundary.
a.run("s={phase:'between',part:'review',newIds:[2,3,4,5,6]};beginNew()");assert.equal(a.run('s.part'),'review');
// Legacy pending review: preserve counters and do not fabricate direction-level answers.
a=app({version:5,words:{mug:{trained:true,sessions:3,attempts:8}},session:{id:'old-review',part:'review',phase:'test',mode:'review',ids:[0],queue:[{i:0,dir:0}],pos:0,completed:[],errors:[],partErrors:[],revealed:true}});a.run('s.cardTime=1;grade(true)');assert.equal(a.run('record(0).sessions'),4);assert.equal(a.run('record(0).schedule.checks[0].directions'),null);
console.log('Retry evidence, next-day gate and legacy pending review: passed');
