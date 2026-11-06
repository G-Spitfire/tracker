'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('./engine.js');
const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');

test('displayed candidate is counted once, and may still be graded',()=>{
 const sel=E.beginSelection('auto');
 sel.seen.push('apple');
 assert.equal(E.selectionAnswer(sel,'apple',true),false);
 assert.deepEqual(sel.seen,['apple']);
 assert.deepEqual(sel.known,['apple']);
 assert.throws(()=>E.selectionAnswer(sel,'apple',false),/duplicate/);
});
test('selection stops after the 50th displayed candidate is graded',()=>{
 const sel=E.beginSelection('auto');
 sel.seen=Array.from({length:49},(_,i)=>'word'+i);
 sel.seen.push('last');
 assert.equal(E.selectionAnswer(sel,'last',true),true);
 assert.equal(sel.seen.length,50);
});
test('selection grade supports legacy state where current word is not yet in seen',()=>{
 const sel=E.beginSelection('auto');
 assert.equal(E.selectionAnswer(sel,'apple',false),false);
 assert.deepEqual(sel.seen,['apple']);
});
test('interrupted selection does not save familiar words',()=>{
 const source=app.match(/function stopSelection\(\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(source);
 assert.doesNotMatch(source,/saveFamiliar|store\(/);
});
test('dictionary return retains search while opening from home resets it',()=>{
 assert.match(app,/case 'dictionaryOpen':query='';dictionaryFilter='all';return dictionaryView\(\);case 'dictionary':return dictionaryView\(\)/);
});
test('home scroll cue keeps listening after the first scroll',()=>{
 assert.match(app,/addEventListener\?\.\('scroll',updateCue,\{passive:true\}\)/);
 assert.doesNotMatch(app,/addEventListener\?\.\('scroll',updateCue,\{passive:true,once:true\}\)/);
});
test('auto selection has counters but no graphical progress bar',()=>{
 const section=app.split('function selectionScreen(){')[1].split('function renderSelection()')[0];
 assert.match(section,/Просмотрено:/);
 assert.doesNotMatch(section,/ws-paper-track/);
});
test('exiting session uses a Paper dialog instead of native confirmation',()=>{
 assert.doesNotMatch(app,/window\.confirm\(/);
 assert.match(app,/ws-paper-exit-confirm/);
 assert.match(app,/case 'stopPractice':return confirmExit\(true\)/);
});

const css=fs.readFileSync(path.join(__dirname,'style.css'),'utf8');
test('removed manual scrolling hints leave no dead markup or CSS selectors',()=>{
 assert.doesNotMatch(app,/ws-manual-(?:scroll|topics)-note/);
 assert.doesNotMatch(css,/ws-manual-(?:scroll|topics)-note/);
});
test('Paper confirmation supports Escape and focus trapping',()=>{
 const dialog=app.split('function confirmExit(practice=false){')[1].split('function confirmCancel()')[0];
 assert.match(dialog,/event.key==='Escape'/);
 assert.match(dialog,/event.key!=='Tab'/);
 assert.match(dialog,/previousFocus\?\.focus\?\.\(\)/);
});
test('approved 44px minimum applies to four touch targets',()=>{
 for(const selector of ['.ws-paper-dream-toggle','.ws-manual-v3 .ws-manual-all','.ws-manual-v3 .ws-manual-summary-toggle','.ws-progress-page .progress-switch button']){
  assert.ok(css.includes(selector));
 }
 assert.match(css,/\.ws-progress-page \.progress-switch button\{min-height:44px;min-width:44px\}/);
});
