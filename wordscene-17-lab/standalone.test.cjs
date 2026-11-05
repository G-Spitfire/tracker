'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('WordScene 17 HTML and PWA have no runtime dependency on WordScene 16',()=>{
 const html=read('index.html'),sw=read('sw.js'),art=read('legacy-art.js'),manifest=read('manifest.webmanifest');
 for(const [name,src] of [['HTML',html],['SW',sw],['art',art],['manifest',manifest]]) {
  assert.doesNotMatch(src,/\.\.\/wordscene\//,name+' references legacy WordScene');
 }
 for(const name of ['content.js','topics.js','assets/mug-scene.png','assets/icon-192.png','assets/icon-512.png']) {
  assert.ok(fs.existsSync(path.join(root,name)),name+' missing locally');
 }
 assert.match(html,/\.\/content\.js\?v=21/);
 assert.match(html,/\.\/topics\.js\?v=21/);
 assert.match(sw,/wordscene-17-lab-cache-v\\d+/);
 assert.match(manifest,/\.\/assets\/icon-192\.png/);
 assert.doesNotMatch(html,/Лаборатория/);
});

test('vendored dictionary and topics initialize independently of WordScene 16 directory',()=>{
 const context={console};
 context.window=context; // Browser globalThis and window refer to the same object.
 vm.createContext(context);
 vm.runInContext(read('content.js'),context,{filename:'content.js'});
 vm.runInContext(read('topics.js'),context,{filename:'topics.js'});
 const cards=context.window.WordSceneContent?.cards;
 assert.ok(Array.isArray(cards)&&cards.length>0,'dictionary must expose cards');
 const topics=context.window.WordSceneTopics?.topics;
 assert.ok(Array.isArray(topics)&&topics.length>0,'topics must load');
 assert.equal(typeof context.window.WordSceneTopics.forWord,'function');
});

test('upstream media licensing and attribution preserved',()=>{
 for(const name of ['ATTRIBUTION.md','IPA-LICENSE.txt','TWEMOJI-LICENSE.txt'])
  assert.ok(fs.existsSync(path.join(root,name)),name+' missing');
});

test('service worker activation removes v19 and v20 caches but preserves unrelated apps',async()=>{
 const listeners={};
 const removed=[];
 const oldKeys=['wordscene-17-lab-cache-v19','wordscene-17-lab-cache-v20','wordscene-17-lab-cache-v21','wordscene-17-lab-cache-v22','wordscene-cache-v16','unrelated'];
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
 assert.deepEqual(removed.sort(),['wordscene-17-lab-cache-v19','wordscene-17-lab-cache-v20','wordscene-17-lab-cache-v21','wordscene-17-lab-cache-v22']);
});

