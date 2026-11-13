import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../appearance.js');
test('appearance survives reload with every palette and mode',async()=>{
 const {readAppearance,saveAppearance}=await load();
 const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 for(const palette of ['lavender','peach','mint','berry'])for(const theme of ['light','dark']){
  saveAppearance({palette,theme},storage);
  assert.deepEqual(readAppearance(storage),{palette,theme});
 }
});
test('corrupt and unavailable storage falls back safely',async()=>{
 const {readAppearance,saveAppearance}=await load();
 assert.deepEqual(readAppearance({getItem:()=>'{broken'}),{palette:'lavender',theme:'light'});
 const unavailable={getItem(){throw Error()},setItem(){throw Error()}};
 assert.deepEqual(readAppearance(unavailable),{palette:'lavender',theme:'light'});
 assert.doesNotThrow(()=>saveAppearance({palette:'mint',theme:'dark'},unavailable));
 assert.deepEqual(readAppearance({getItem:()=>'{"palette":"bad","theme":"bad"}'}),{palette:'lavender',theme:'light'});
});
