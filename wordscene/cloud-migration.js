/* WordScene cloud migration helpers. No Firebase calls or automatic writes. */
(function(root){
'use strict';
const VERSION=1;
function clone(value){return JSON.parse(JSON.stringify(value))}
function backup(state,uid=null,now=Date.now()){
 if(!root.WordSceneState?.valid(state,500))throw new Error('Invalid WordScene state');
 return {format:'wordscene-backup',version:VERSION,createdAt:new Date(now).toISOString(),uid,progress:clone(state)};
}
function restore(envelope,expectedUid=null){
 if(!envelope||envelope.format!=='wordscene-backup'||envelope.version!==VERSION)throw new Error('Unsupported backup');
 if(expectedUid&&envelope.uid&&envelope.uid!==expectedUid)throw new Error('Backup belongs to another account');
 if(!root.WordSceneState?.valid(envelope.progress,500))throw new Error('Invalid backup progress');
 return clone(envelope.progress);
}
function decide({local,remote,remoteRevision,expectedRevision}){
 if(!Number.isSafeInteger(remoteRevision)||remoteRevision<0)throw new Error('Invalid revision');
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid expected revision');
 if(remoteRevision!==expectedRevision)return 'conflict';
 if(remote&&local)return 'manual-choice';
 if(local)return 'upload';
 if(remote)return 'download';
 return 'empty';
}
const api={backup,restore,decide,VERSION};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WordSceneCloudMigration=api;
})(typeof globalThis!=='undefined'?globalThis:this);
