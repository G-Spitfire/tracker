/* Node 18+ : node --test wordscene-17-lab/engine.test.cjs */
const test=require('node:test'), assert=require('node:assert/strict'),E=require('./engine.js');
const t=(day,extra=0)=>new Date(day+'T12:00:00Z').getTime()+extra;
function lesson(p,ids=['apple','cat','dog'],start=t('2026-11-04'),fail=()=>false){
 const s=E.start(p,'new',ids,[],start);
 for(let i=0;i<ids.length;i++)E.learnNext(s,start+100+i);
 let n=0;while(s.stage==='recall'&&n<200){
  const item=s.items[s.index];E.answer(s,!fail(item,s),start+300+n,n+1);n++;
 }
 assert.equal(s.stage,'complete');return {s,p:E.completed(p,s,start+10000)};
}
test('new words require 3-15/30/unlimited depending on level',()=>{
 const p=E.empty();assert.equal(E.eligible(p,['a','b']),false);
 assert.equal(E.eligible(p,Array.from({length:15},(_,i)=>'w'+i)),true);
 assert.equal(E.eligible(p,Array.from({length:16},(_,i)=>'w'+i)),false);
 p.level='experienced';assert.equal(E.eligible(p,Array.from({length:30},(_,i)=>'w'+i)),true);
});
test('three complete two-sided passes before introduction',()=>{
 const p=E.empty(),{s,p:out}=lesson(p);
 assert.equal(s.answers.length,18);assert.equal(s.round,3);
 assert.equal(Object.keys(p.words).length,0);assert.equal(out.words.apple.origin,'learned');
 assert.equal(out.words.apple.schedule.nextDay,'2026-11-05');
});
test('third pass errors generate bounded extra passes',()=>{
 const p=E.empty(),{s}=lesson(p,['apple','cat','dog'],t('2026-11-04'),(_,s)=>s.round===3&&s.extra===0);
 assert.equal(s.extra,1);
 assert.equal(s.answers.length,24);
});
test('cancel and expired sessions do not touch persisted progress',()=>{
 const p=E.empty(),s=E.start(p,'new',['a','b','c'],['d'],t('2026-11-04'));
 E.learnNext(s,t('2026-11-04',100));
 assert.equal(Object.keys(p.words).length,0);
 assert.equal(E.timedOut(s,t('2026-11-04',1800100)),true);
 assert.throws(()=>E.completed(p,s,t('2026-11-04',1800100)));
 assert.equal(Object.keys(p.words).length,0);
});
test('repeat updates schedule only after full two-direction session',()=>{
 const learned=lesson(E.empty()).p;
 const s=E.start(learned,'review',['apple','cat','dog'],[],t('2026-11-05'));let n=0;
 while(s.stage==='recall'){E.answer(s,true,t('2026-11-05',100+n++),100)}
 assert.equal(learned.words.apple.schedule.days.length,0);
 const p2=E.completed(learned,s,t('2026-11-05',2000));
 assert.equal(p2.words.apple.schedule.days.length,1);
 assert.equal(E.completed(p2,s,t('2026-11-05',2500)).sessions.length,2);
});
test('seven daily checks then 3/7/14/30 intervals and mastery',()=>{
 let r=E.newSchedule(t('2026-11-01'));
 for(let d=2;d<=8;d++){r=E.scheduler(r,true,t('2026-11-'+String(d).padStart(2,'0')))}
 assert.equal(r.stage,'spaced');assert.equal(r.nextDay,'2026-11-11');
 for(const day of ['2026-11-11','2026-11-18','2026-12-02','2027-01-01'])r=E.scheduler(r,true,t(day));
 assert.ok(r.masteredAt);assert.equal(r.nextDay,'2027-01-31');
});
test('error in spaced stage triggers repair and returns to 3 day cycle',()=>{
 let r=E.newSchedule(t('2026-11-01'));
 for(let d=2;d<=8;d++)r=E.scheduler(r,true,t('2026-11-'+String(d).padStart(2,'0')));
 r=E.scheduler(r,false,t('2026-11-11'));assert.equal(r.stage,'repair');
 r=E.scheduler(r,true,t('2026-11-12'));r=E.scheduler(r,true,t('2026-11-13'));
 assert.equal(r.stage,'spaced');assert.equal(r.nextDay,'2026-11-16');
});
test('mastery is current: a mistake removes it until a new 30-day interval succeeds',()=>{
 let r=E.newSchedule(t('2026-11-01'));
 for(let d=2;d<=8;d++)r=E.scheduler(r,true,t('2026-11-'+String(d).padStart(2,'0')));
 for(const date of ['2026-11-11','2026-11-18','2026-12-02','2027-01-01'])r=E.scheduler(r,true,t(date));
 const firstMasteredAt=r.masteredAt;
 assert.equal(E.status({origin:'learned',schedule:r}),'mastered');
 r=E.scheduler(r,false,t('2027-01-31'));
 assert.equal(E.status({origin:'learned',schedule:r}),'learning');
 r=E.scheduler(r,true,t('2027-02-01'));
 r=E.scheduler(r,true,t('2027-02-02'));
 assert.equal(r.stage,'spaced');
 assert.equal(E.status({origin:'learned',schedule:r}),'learning');
 for(const date of ['2027-02-05','2027-02-12','2027-02-26'])r=E.scheduler(r,true,t(date));
 assert.equal(E.status({origin:'learned',schedule:r}),'learning');
 r=E.scheduler(r,true,t('2027-03-28'));
 assert.equal(E.status({origin:'learned',schedule:r}),'mastered');
 assert.equal(r.masteredAt,firstMasteredAt);
});
test('single inactivity deadline: a pause never starts a second deadline',()=>{
 const base=t('2026-11-04');
 let s=E.start(E.empty(),'new',['a','b','c'],[],base);
 E.pause(s,base+20*60000);
 assert.equal(E.timedOut(s,base+30*60000-1),false);
 assert.equal(E.timedOut(s,base+30*60000),true);
 s=E.start(E.empty(),'new',['a','b','c'],[],base);
 E.action(s,base+19*60000);
 E.pause(s,base+20*60000);
 assert.equal(E.timedOut(s,base+49*60000-1),false);
 assert.equal(E.timedOut(s,base+49*60000),true);
});

test('mandatory review rejects a partial queue and duplicate IDs',()=>{
 const p=E.empty(),at=t('2026-11-05');
 for(const id of ['apple','cat'])p.words[id]={origin:'known',schedule:E.newSchedule(t('2026-11-03')),history:[]};
 assert.deepEqual(E.due(p,at),['apple','cat']);
 assert.throws(()=>E.start(p,'review',['apple'],[],at),/every due word/);
 assert.throws(()=>E.start(p,'review',['apple','apple'],[],at),/every due word/);
 assert.equal(E.start(p,'review',['cat','apple'],[],at).ids.length,2);
});


test('review covers an overdue queue of 35 words without trimming or unlocking new words early',()=>{
 const p=E.empty(),at=t('2026-11-20');
 for(let i=0;i<35;i++){
  const id='word'+String(i).padStart(2,'0');
  p.words[id]={origin:'known',schedule:{...E.newSchedule(t('2026-11-02')),nextDay:i%2?'2026-11-17':'2026-11-19'},history:[]};
 }
 const ids=E.due(p,at);
 assert.equal(ids.length,35);
 assert.throws(()=>E.start(p,'review',ids.slice(0,30),[],at),/every due word/);
 assert.throws(()=>E.start(p,'new',['a','b','c'],[],at),/Complete due reviews first/);
 const s=E.start(p,'review',ids,[],at);
 assert.equal(s.items.length,70);
 let n=0;while(s.stage==='recall')E.answer(s,true,at+100+n++);
 const out=E.completed(p,s,at+10000);
 assert.equal(out.sessions.at(-1).ids.length,35);
 assert.equal(E.due(out,at).length,0);
});

test('missed first checks remain highest-priority even after more than one day',()=>{
 const p=E.empty(),now=t('2026-11-20');
 p.words.old={origin:'learned',firstLearnedAt:t('2026-11-10'),schedule:E.newSchedule(t('2026-11-10')),history:[]};
 p.words.repair={origin:'learned',schedule:{...E.newSchedule(t('2026-11-01')),stage:'repair',nextDay:'2026-11-11'},history:[{at:t('2026-11-11'),ok:false}]};
 p.words.recent={origin:'learned',firstLearnedAt:t('2026-11-19'),schedule:E.newSchedule(t('2026-11-19')),history:[]};
 assert.deepEqual(E.due(p,now).slice(0,2),['old','recent']);
});

test('automatic screening stops on exactly the 50th assessed word',()=>{
 const s=E.beginSelection();
 for(let i=0;i<49;i++)assert.equal(E.selectionAnswer(s,'word'+i,true),false);
 assert.equal(s.seen.length,49);
 assert.equal(E.selectionAnswer(s,'word49',true),true);
 assert.equal(s.seen.length,50);
 assert.throws(()=>E.selectionAnswer(s,'word50',false),/Selection closed or duplicate/);
 assert.equal(s.known.length,50);
});

test('level upgrade requires three confirmed lessons and the 80 percent aggregate',()=>{
 const p=E.empty(),learnStart=t('2026-11-01');
 for(let lessonIndex=0;lessonIndex<3;lessonIndex++){
  const ids=Array.from({length:10},(_,i)=>'lesson'+lessonIndex+'-'+i);
  const at=learnStart+lessonIndex*86400000;
  p.sessions.push({id:'new-'+lessonIndex,mode:'new',ids,at,successful:10});
  for(let i=0;i<ids.length;i++)p.words[ids[i]]={
   origin:'learned',firstLearnedAt:at,schedule:E.newSchedule(at),
   history:[{at:at+86400000,ok:i<8}]
  };
 }
 E.recalcLevel(p);
 assert.equal(p.level,'experienced');
 assert.equal(p.levels.length,1);
 E.recalcLevel(p);
 assert.equal(p.levels.length,1);
});

test('unconfirmed lessons and an aggregate below threshold do not upgrade',()=>{
 const p=E.empty(),at=t('2026-11-01');
 for(let j=0;j<3;j++){
  const ids=Array.from({length:10},(_,i)=>'set'+j+'-'+i);
  p.sessions.push({id:'set'+j,mode:'new',ids,at:at+j*86400000,successful:10});
  for(let i=0;i<ids.length;i++)p.words[ids[i]]={origin:'learned',schedule:E.newSchedule(at),history:j===2?[]:[{at:at+(j+1)*86400000,ok:i<6}]};
 }
 E.recalcLevel(p);
 assert.equal(p.level,'novice');
 for(const id of p.sessions[2].ids)p.words[id].history.push({at:at+4*86400000,ok:true});
 E.recalcLevel(p);
 assert.equal(p.level,'novice');
});

test('completed lesson is idempotent for the same session id',()=>{
 const {s,p}=lesson(E.empty(),['alpha','beta','gamma']);
 const sessions=p.sessions.length,revision=p.revision;
 const replay=E.completed(p,s,t('2026-11-04',12000));
 assert.equal(replay.sessions.length,sessions);
 assert.equal(replay.revision,revision);
});
