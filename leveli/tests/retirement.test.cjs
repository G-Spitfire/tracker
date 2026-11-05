'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
test('Leveli remains installable after retiring WordScene 16 and opens WordScene 17',()=>{
 const html=fs.readFileSync(path.join(root,'leveli/index.html'),'utf8');
 assert.match(html,/location.href='\.\.\/wordscene-17-lab\/'/);
 for(const m of html.matchAll(/<script[^>]*src="([^"?]+)/g))if(!m[1].startsWith('http'))assert.ok(fs.existsSync(path.resolve(root,'leveli',m[1])),m[1]);
 const sw=fs.readFileSync(path.join(root,'leveli/sw.js'),'utf8');
 const files=vm.runInNewContext(sw.match(/const FILES=(\[[^;]+\])/)[1]);
 for(const f of files)assert.ok(fs.existsSync(path.resolve(root,'leveli',f)),f);
 assert.doesNotMatch(html+sw,/\.\.\/wordscene\//);
});
