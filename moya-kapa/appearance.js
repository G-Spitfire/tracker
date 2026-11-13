const KEY='moya-kapa-appearance';
export function readAppearance(storage){
 let value;try{value=JSON.parse((storage||globalThis.localStorage).getItem(KEY)||'null')}catch{}
 return {palette:['lavender','peach','mint','berry'].includes(value?.palette)?value.palette:'lavender',theme:['light','dark'].includes(value?.theme)?value.theme:'light'};
}
export function saveAppearance(value,storage){try{(storage||globalThis.localStorage).setItem(KEY,JSON.stringify(value))}catch{}}
export function applyAppearance(value){
 document.documentElement.dataset.palette=value.palette;
 document.documentElement.dataset.theme=value.theme;
 document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
}
// Apply before the document is painted, independently of the timer/database.
if(typeof document!=='undefined')applyAppearance(readAppearance());
