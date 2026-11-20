'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'words.json'),'utf8'));
test('canonical dictionary keeps all 502 unique words and core fields',()=>{
 assert.equal(catalog.version,1);
 assert.equal(catalog.words.length,502);
 assert.equal(new Set(catalog.words.map(w=>w.id.toLowerCase())).size,502);
 for(const word of catalog.words){assert.ok(word.en&&word.ru&&word.ipa&&word.cue&&word.scene,'missing core content: '+word.en);assert.ok(Array.isArray(word.topics),'topics must be an array: '+word.en)}
});
test('topic memberships refer only to words in the canonical catalog',()=>{
 const ids=new Set(catalog.words.map(w=>w.en.toLowerCase()));
 for(const topic of catalog.topics)for(const word of topic.words)assert.ok(ids.has(word.toLowerCase()),'unknown word '+word+' in '+topic.id);
 for(const word of catalog.words)for(const topicId of word.topics)assert.ok(catalog.topics.some(t=>t.id===topicId),'unknown topic '+topicId+' for '+word.en);
});
