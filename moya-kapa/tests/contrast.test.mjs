import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../app.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const rgb=h=>{h=h.replace('#','');if(h.length===3)h=[...h].map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)};
const lum=c=>rgb(c).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
for(const palette of ['lavender','peach','mint','berry'])for(const theme of ['light','dark']){
 const vars={};for(const [,selector,body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))if(selector.trim().startsWith(':root')&&(!selector.includes('data-palette=')||selector.includes('data-palette='+palette))&&(!selector.includes('data-theme=')||selector.includes('data-theme='+theme)))for(const [,k,v] of body.matchAll(/(--[\w-]+):([^;}]+)/g))vars[k]=v.trim();
 test(`${palette} ${theme}: text and status contrast`,()=>{for(const [fg,bg] of [['--text','--bg'],['--text','--surface'],['--muted','--surface'],['--muted','--bg'],['--muted','--soft'],['--accent','--soft'],['--text','--done'],['--on-accent','--accent'],['--night-yes','--surface'],['--night-no','--surface']]){assert.ok(vars[fg],`${fg} needs a theme token`);const ratio=contrast(vars[fg],vars[bg]);assert.ok(ratio>=4.5,`${fg} on ${bg}: ${ratio.toFixed(2)} needs 4.5`)} });
}
test('locked awards keep readable text',()=>{const rules=[...css.matchAll(/\.award\.locked\{([^}]+)\}/g)];assert.match(rules.at(-1)[1],/opacity:1(?:;|$)/)});
