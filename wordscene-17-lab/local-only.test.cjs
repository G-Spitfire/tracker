'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('./engine.js');
const root=__dirname;
const file=name=>fs.readFileSync(path.join(root,name),'utf8');

test('inactivity timeout has one thirty-minute deadline, including a pause',()=>{
 const start=Date.UTC(2026,10,5,9);
 const s=E.start(E.empty(),'new',['alpha','beta','gamma'],[],start);
 E.pause(s,start+5*60000);
 assert.equal(E.timedOut(s,start+29*60000),false);
 assert.equal(E.timedOut(s,start+30*60000),true);
});
test('learning results do not record response duration',()=>{
 const s=E.start(E.empty(),'new',['alpha','beta','gamma'],[],Date.now());
 E.learnNext(s);E.learnNext(s);E.learnNext(s);
 E.answer(s,true,Date.now(),1250);
 assert.equal(Object.hasOwn(s.answers[0],'ms'),false);
});
test('published page has no cloud dependencies and still includes Paper assets',()=>{
 const html=file('index.html');
 assert.doesNotMatch(html,/sync\.js|cloud-firestore\.js|cloud-ui\.mjs/);
 assert.match(html,/paper|style\.css/);
});
test('child profile settings replace multi-account and cloud UI',()=>{
 const app=file('app.js');
 assert.doesNotMatch(app,/cloudAction|switchAccount|currentAccount|accountsScreen/);
 assert.match(app,/Как тебя зовут/);
 assert.match(app,/Сколько тебе лет/);
});
test('two ways of choosing words remain',()=>{
 const app=file('app.js');
 assert.doesNotMatch(app,/case 'themes'/);
 assert.match(app,/Подберём слова для тебя/);
 assert.match(app,/Найди слова или выбери тему/);
 assert.match(app,/case 'manual'/);
 assert.match(app,/case 'auto'/);
});
