'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=__dirname;
const catalog=JSON.parse(fs.readFileSync(path.join(base,'words.json'),'utf8'));
test('every canonical word renders a complete SVG scene without changing the catalog',()=>{
 const before=JSON.stringify(catalog.words.map(w=>w.en));
 const ctx={window:{WordSceneCatalog:catalog,addEventListener(){}},console};
 ctx.window.window=ctx.window;
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(base,'illustrations.js'),'utf8'),ctx,{filename:'illustrations.js'});
 assert.equal(typeof ctx.window.WordSceneIllustrations.render,'function');
 const missing=[];
 for(const w of catalog.words){
  try{
   const svg=ctx.window.WordSceneIllustrations.render(w);
   if(!svg.startsWith('<svg')||!svg.includes('</svg>')||!svg.includes('viewBox='))missing.push(w.en+': invalid SVG');
  }catch(e){missing.push(w.en+': '+e.message)}
 }
 assert.deepEqual(missing,[],'all 502 scenes should render');
 assert.equal(JSON.stringify(catalog.words.map(w=>w.en)),before,'rendering must not add words');
 assert.equal(catalog.words.length,502);
});
