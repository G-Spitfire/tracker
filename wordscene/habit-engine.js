/* Regularity is independent of correctness and the word review schedule. */
(function(root){
'use strict';
function day(at=Date.now()){const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function shift(date,n){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10)}
function ensure(data,at=Date.now()){return data.habit??=( {version:1,since:day(at),days:{}} )}
function stats(h,at=Date.now()){
 const today=day(at),days=Object.keys(h.days).filter(k=>k<=today&&h.days[k].qualified).sort();
 let best=0,run=0,previous=null;for(const d of days){run=previous&&shift(previous,1)===d?run+1:1;best=Math.max(best,run);previous=d}
 const done=!!h.days[today]?.qualified,last=days.at(-1),current=last===today||last===shift(today,-1)?run:0;
 return {today,done,last,current,best,total:days.length,returning:!!last&&last<shift(today,-1)};
}
function record(h,{kind,word,available=5,at=Date.now()}){
 const today=day(at),d=h.days[today]??={reviews:[],newDone:false,qualified:false,praised:false};
 if(kind==='new')d.newDone=true;
 else if(kind==='review'&&word&&!d.reviews.includes(word))d.reviews.push(word);
 const goal=Math.max(1,Math.min(5,available));
 if(!d.qualified&&(d.newDone||d.reviews.length>=goal)){d.qualified=true;return true}return false;
}
function takePraise(h,at=Date.now()){
 const st=stats(h,at),d=h.days[st.today];if(!d?.qualified||d.praised)return null;d.praised=true;
 const n=st.current,milestone=[3,7,14,30].includes(n);
 const title=n===1?'Первый день есть!':n+' '+(n%10===1&&n%100!==11?'день':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'дня':'дней')+' подряд!';
 const text=n===7?'Ты находила время для английского всю неделю.':n===14?'Уже две недели ты каждый день возвращаешься к английскому.':n===30?'Тридцать дней занятий — шаг за шагом!':n===3?'Ты возвращаешься к словам. Уже третий день подряд!':d.newDone?'Сегодня ты позанималась английским. Ещё один шаг!':'Сегодня ты повторила знакомые слова. Ещё один день в копилку!';
 return {day:st.today,title,text,milestone,count:n};
}
const api={day,shift,ensure,stats,record,takePraise};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneHabit=api;
})(typeof globalThis!=='undefined'?globalThis:this);
