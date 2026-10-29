const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const T=require('../topics');const root=path.join(__dirname,'..'),ctx=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(root,'content-500-v14.js'),'utf8'),ctx);ctx.WordSceneContent=ctx.window.WordSceneContent;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const words=JSON.parse(vm.runInContext(html.slice(html.indexOf('const words='),html.indexOf("const KEY="))+';JSON.stringify(words)',ctx));
const names=new Set(words.map(w=>w.en.toLowerCase()));assert.equal(names.size,500);assert.equal(new Set(T.topics.map(t=>t.id)).size,T.topics.length);
for(const t of T.topics){assert.equal(new Set(t.words).size,t.words.length,t.id);assert.ok(t.words.length);for(const en of t.words)assert.ok(names.has(en.toLowerCase()),en)}
for(const w of words)assert.ok(T.forWord(w.en).length,w.en);
assert.ok(T.forWord('chicken').includes('food'));assert.ok(T.forWord('chicken').includes('animals'));assert.deepEqual(T.forWord('CD'),T.forWord('cd'));
console.log('PASS: all 500 words covered, no unknown words or duplicate topic entries, shared memberships and stable casing.');
