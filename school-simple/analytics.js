/* Pure grade calculations. No DOM, network or application state. */
(function(root){
 'use strict';
 const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
 function overallAverage(subjects,quarter,quarters){
  const range=quarters[Number(quarter)-1];
  if(!range)return 0;
  const averages=subjects.map(subject=>(subject.grades||[])
   .filter(grade=>grade.date>=range.start&&grade.date<=range.end)
   .map(grade=>grade.value))
   .filter(grades=>grades.length)
   .map(mean);
  return mean(averages);
 }
 const api=Object.freeze({overallAverage});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.SchoolAnalytics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
