'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const base=__dirname;
const importer=path.join(base,'tools/import_words.py');
test('CSV import adds a word, patches one field, preserves IDs and rejects invalid SVG',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wordscene-import-'));
 try{
  const catalog=path.join(dir,'words.json');
  fs.copyFileSync(path.join(base,'words.json'),catalog);
  const csv=path.join(dir,'updates.csv');
  fs.writeFileSync(csv,'action,en,ru,ipa,cue,scene,topics,props,layout\nadd,example,пример,/ɪɡˈzɑːmpəl/,экзамен,Пример на экзамене,school,1f4d6;1f4dd,meet\nupdate,apple,,,аппликация,Новая сцена,,,\n','utf8');
  const run=(extra=[])=>spawnSync('python3',[importer,csv,'--catalog',catalog,'--illustrations',path.join(base,'illustrations.js'),...extra],{encoding:'utf8'});
  const before=fs.readFileSync(catalog,'utf8');
  const check=run(['--check']);
  assert.equal(check.status,0,check.stderr);
  assert.equal(fs.readFileSync(catalog,'utf8'),before,'--check must not write');
  const applied=run();
  assert.equal(applied.status,0,applied.stderr);
  const data=JSON.parse(fs.readFileSync(catalog,'utf8'));
  assert.equal(data.words.length,503);
  assert.equal(data.words.find(w=>w.en==='apple').scene,'Новая сцена');
  assert.equal(data.words.find(w=>w.en==='apple').id,'apple');
  assert.equal(data.words.find(w=>w.en==='example').id,'example');
  assert.ok(data.topics.find(t=>t.id==='school').words.includes('example'));
  fs.writeFileSync(csv,'action,en,props\nupdate,apple,does-not-exist\n','utf8');
  const bad=run(['--check']);
  assert.notEqual(bad.status,0,'unknown SVG symbol should fail');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
