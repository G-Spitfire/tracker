/* Bounded writing repair: only mistaken words receive two extra checks. */
(function(root){
'use strict';
const bad=result=>result==='incorrect'||result==='forgot';
function needs(p){return p.writingNeedsWork===true||(p.writingNeedsWork===undefined&&bad(p.writing))}
function normalize(value){return String(value).trim().toLowerCase().replace(/\s+/g,' ')}
function prepare(s,record,order=x=>[...x]){
 if(s.writingVersion===2)return;
 s.writingIds??=order(s.ids);s.writingIndex??=0;s.writingChecked??=false;
 s.writingPass=0;s.writingFirstErrors=[];s.writingRetryResults={};s.writingBreak=false;s.writingVersion=2;
 // Preserve a v15 writing session, including an answer already checked.
 for(const i of s.writingIds.slice(0,s.writingIndex+(s.writingChecked?1:0))){const p=record(i);if(bad(p.writing)){s.writingFirstErrors.push(i);p.writingNeedsWork=true}}
}
function practice(s,order=x=>[...x]){
 s.writingVersion=2;s.writingPass=1;s.writingFirstErrors=[...s.ids];s.writingIds=order(s.ids);s.writingIndex=0;s.writingChecked=false;s.writingRetryResults={};s.writingBreak=true;
}
function mark(s,p,i,result){
 if(s.writingChecked||s.writingBreak||!['correct','incorrect','forgot'].includes(result))return false;
 p.writing=result;
 if(!s.writingPass){p.writingNeedsWork=bad(result);if(bad(result)&&!s.writingFirstErrors.includes(i))s.writingFirstErrors.push(i)}
 else{
  const outcomes=s.writingRetryResults[i]??=[];outcomes.push(result);
  p.writingNeedsWork=!(outcomes.length===2&&outcomes.every(x=>x==='correct'));
 }
 s.writingChecked=true;return true;
}
function next(s,order=x=>[...x]){
 if(!s.writingChecked||s.writingBreak)return 'unchanged';
 s.writingChecked=false;s.writingIndex++;
 if(s.writingIndex<s.writingIds.length)return 'word';
 if((!s.writingPass&&s.writingFirstErrors.length)||s.writingPass===1){
  s.writingPass++;s.writingIds=order(s.writingFirstErrors);s.writingIndex=0;s.writingBreak=true;return 'break';
 }
 s.writingDone=true;return 'done';
}
const api={needs,normalize,prepare,practice,mark,next};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneWriting=api;
})(typeof globalThis!=='undefined'?globalThis:this);
