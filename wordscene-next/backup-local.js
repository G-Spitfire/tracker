/* Explicit adult-controlled local backup. Never reads the original WordScene key. */
(function(root){
'use strict';
const FORMAT='wordscene-next-local',VERSION=1,MAX_FILE_BYTES=5*1024*1024;
function exportState(state,count,now=Date.now()){
 if(!root.WordSceneState?.valid(state,count)||state.version!==5)throw new Error('invalid-local-state');
 return JSON.stringify({format:FORMAT,version:VERSION,wordCount:count,exportedAt:new Date(now).toISOString(),state});
}
function importState(raw,count){
 if(typeof raw!=='string'||raw.length>MAX_FILE_BYTES)throw new Error('file-too-large');
 let source;try{source=JSON.parse(raw)}catch{throw new Error('invalid-json')}
 if(!source||source.format!==FORMAT||source.version!==VERSION||source.wordCount!==count)throw new Error('wrong-app-or-version');
 if(!root.WordSceneState?.valid(source.state,count)||source.state.version!==5)throw new Error('invalid-local-state');
 return source.state;
}
const api={exportState,importState,FORMAT,VERSION,MAX_FILE_BYTES};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this);
