import {normalizeGrade,normalizeSchoolDocument,averageGrade} from "./grades.js";
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const records=[
  {type:"Работа на уроке",valueCode:"5/5",subject:"Математика"},
  {type:"Домашнее задание",valueCode:"3/5",subject:"Математика"},
  {type:"1 четверть",valueCode:"4/5",subject:"Математика"},
  {type:"Посещаемость",valueCode:"493",subject:"Математика"},
  {type:"Посещаемость",valueCode:"496",subject:"Математика"},
  {type:"Посещаемость",valueCode:"494",subject:"Математика"},
  {type:"Неизвестный тип",valueCode:"999"}
];
const result=normalizeSchoolDocument({grades:records});
assert(result.current.length===2,"current count");
assert(result.finals.length===1 && result.finals[0].quarter===1,"final count/quarter");
assert(result.attendance.length===3,"attendance count");
assert(result.other.length===1,"other count");
assert(averageGrade(result.entries)===4,"average excludes final and attendance");
assert(averageGrade(result.finals)===null,"no current grades => null");
assert(normalizeGrade({type:"Посещаемость",valueCode:"5/5"}).kind==="attendance","attendance priority");
console.log("Leveli grades tests passed");
