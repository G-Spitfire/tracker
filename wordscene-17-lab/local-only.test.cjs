'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('./engine.js');
const root=__dirname;
const file=name=>fs.readFileSync(path.join(root,name),'utf8');

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
test('profile UI and handlers are removed without touching stored historical fields',()=>{
 const app=file('app.js');
 assert.doesNotMatch(app,/childProfile|saveChild|childName|childAge|Как тебя зовут|Сколько тебе лет/);
 assert.doesNotMatch(app,/cloudAction|switchAccount|currentAccount|accountsScreen/);
 assert.match(app,/wordscene-17-lab-v1/);
});
test('two ways of choosing words remain',()=>{
 const app=file('app.js');
 assert.doesNotMatch(app,/case 'themes'/);
 assert.match(app,/Подберём слова для тебя/);
 assert.match(app,/Найди слова или выбери тему/);
 assert.match(app,/case 'manual'/);
 assert.match(app,/case 'auto'/);
});
