import {totalForDate} from './core.js';
// One-time, user-requested history. Never creates entries for later dates.
export function historyAdditions(sessions){
 return [['2026-11-11',600],['2026-11-12',900],['2026-11-13',1200]].flatMap(([date,target])=>{
  const seconds=target-totalForDate(sessions,date);
  return seconds>0?[{id:'initial-history-20261113-'+date,type:'manual',date,seconds}]:[];
 });
}
