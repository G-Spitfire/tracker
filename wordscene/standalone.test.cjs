'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('WordScene 17 HTML and PWA have no runtime dependency on WordScene 16',()=>{
 const html=read('index.html'),sw=read('sw.js'),art=read('illustrations.js'),manifest=read('manifest.webmanifest');
 for(const [name,src] of [['HTML',html],['SW',sw],['art',art],['manifest',manifest]]) {
  assert.doesNotMatch(src,/\.\.\/wordscene\//,name+' references legacy WordScene');
 }
 for(const name of ['words.json','catalog.js','illustrations.js','assets/mug-scene.png','assets/icon-192.png','assets/icon-512.png']) {
  assert.ok(fs.existsSync(path.join(root,name)),name+' missing locally');
 }
 assert.match(html,/\.\/catalog\.js\?v=1/);
 assert.match(html,/\.\/illustrations\.js\?v=2/);
 assert.doesNotMatch(html,/legacy-art\.js/);
 assert.doesNotMatch(html,/\.\/(?:content|topics|seed)\.js/);
 assert.match(sw,/wordscene-17-lab-cache-v\d+/);
 assert.match(manifest,/\.\/assets\/icon-192\.png/);
 assert.doesNotMatch(html,/Лаборатория/);
});

test('vendored dictionary and topics initialize independently of WordScene 16 directory',()=>{
 const catalog=JSON.parse(read('words.json'));
 assert.equal(catalog.version,1);
 assert.equal(catalog.words.length,502);
 assert.ok(catalog.topics.length>1);
 assert.equal(new Set(catalog.words.map(w=>w.id.toLowerCase())).size,catalog.words.length,'word IDs must be unique');
 assert.ok(catalog.words.every(w=>w.en&&w.ru&&w.ipa&&w.cue&&w.scene&&Array.isArray(w.topics)),'all cards must keep core learning content');
 const context={console};context.window=context;context.WordSceneCatalog=catalog;vm.createContext(context);
 vm.runInContext(read('illustrations.js'),context,{filename:'illustrations.js'});
 assert.equal(typeof context.WordSceneIllustrations.render,'function');
 assert.ok(Object.keys(context.WordSceneIllustrations.symbols).length>0,'illustration symbols must load');
});

test('upstream media licensing and attribution preserved',()=>{
 for(const name of ['ATTRIBUTION.md','IPA-LICENSE.txt','TWEMOJI-LICENSE.txt'])
  assert.ok(fs.existsSync(path.join(root,name)),name+' missing');
});

test('service worker activation removes old caches including v45 but preserves current and unrelated apps',async()=>{
 const listeners={};
 const removed=[];
 const oldKeys=['wordscene-17-lab-cache-v19','wordscene-17-lab-cache-v20','wordscene-17-lab-cache-v21','wordscene-17-lab-cache-v22','wordscene-17-lab-cache-v45','wordscene-17-lab-cache-v46','wordscene-cache-v16','unrelated'];
 const context={
  self:{addEventListener:(type,cb)=>{listeners[type]=cb},clients:{claim:async()=>{}}},
  caches:{keys:async()=>oldKeys,delete:async(key)=>{removed.push(key);return true}},
  URL,Promise
 };
 vm.createContext(context);
 vm.runInContext(read('sw.js'),context);
 assert.equal(typeof listeners.activate,'function');
 let pending;
 listeners.activate({waitUntil:p=>{pending=p}});
 await pending;
 assert.deepEqual(removed.sort(),['wordscene-17-lab-cache-v19','wordscene-17-lab-cache-v20','wordscene-17-lab-cache-v21','wordscene-17-lab-cache-v22','wordscene-17-lab-cache-v45','wordscene-17-lab-cache-v46']);
});

