import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
test('preview installs a distinct cache and keeps shell offline despite unavailable art',async()=>{
  const listeners={},stored=new Map();let cacheName;
  const cache={addAll:async assets=>assets.forEach(a=>stored.set(a,{ok:true})),put:async(k,v)=>stored.set(k,v)};
  const self={addEventListener:(n,fn)=>listeners[n]=fn,skipWaiting:async()=>{},registration:{scope:'https://test/moya-kapa/'},location:{origin:'https://test'},clients:{claim:async()=>{},matchAll:async()=>[]}};
  vm.runInNewContext(source,{self,URL,Response,caches:{open:async name=>(cacheName=name,cache),keys:async()=>[],match:async k=>stored.get(k)},fetch:async()=>{throw Error('art unavailable')}});
  let installed;listeners.install({waitUntil:p=>installed=p});await installed;
  assert.match(cacheName,/v2-2/);
  assert.ok(stored.has('./index.html'));
});
