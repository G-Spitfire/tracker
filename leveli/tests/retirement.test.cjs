'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
test('Leveli school-only app keeps its entry points without retired modules',()=>{
 const html=fs.readFileSync(path.join(root,'leveli/index.html'),'utf8');
 assert.match(html,/data-page="home"/);
 assert.match(html,/data-page="profile"/);
 assert.match(html,/id="school-results"/);
 assert.match(html,/id="school-subjects"/);
 assert.match(html,/id="school-period"/);
 assert.doesNotMatch(html,/(?:wordscene|learning\.js|preferences\.js|state-guard\.js|cloud-firestore\.js|data-tab=)/i);
 for(const m of html.matchAll(/<script[^>]*src="([^"?]+)/g)){
  if(!m[1].startsWith('http'))assert.ok(fs.existsSync(path.resolve(root,'leveli',m[1])),m[1]);
 }
 const sw=fs.readFileSync(path.join(root,'leveli/sw.js'),'utf8');
 const match=sw.match(/const FILES=(\[[^;]+\])/);
 assert.ok(match,'Service worker precache list is present');
 const files=vm.runInNewContext(match[1]);
 for(const file of files)assert.ok(fs.existsSync(path.resolve(root,'leveli',file)),file);
 assert.doesNotMatch(sw,/(?:learning\.js|preferences\.js|state-guard\.js|cloud-firestore\.js)/);
});
