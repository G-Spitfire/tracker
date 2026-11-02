const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function harness(){
 const source=fs.readFileSync(path.join(__dirname,'../cloud-ui.js'),'utf8');
 const timers=new Map();let id=0,calls=0,reply={status:'same'},lastMessage='';
 const context=vm.createContext({AUTO_BACKUP_ENABLED:true,authReady:true,auth:{currentUser:{uid:'test'}},window:{},saveCloud:{},console,
  syncEngine:{enabled:()=>true,syncOnce:async()=>{calls++;return reply}},message:x=>lastMessage=x,refreshButtons:()=>{},withBusy:f=>f(),
  setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id},clearTimeout:key=>timers.delete(key)});
 vm.runInContext(source.slice(source.indexOf('let backupTask='),source.indexOf('\nexportConflict.onclick'))+'\n'+source.slice(source.indexOf('function scheduleBackup('),source.indexOf("\nwindow.addEventListener('online'")),context);
 return {run:code=>vm.runInContext(code,context),timers,calls:()=>calls,message:()=>lastMessage,setReply:x=>reply=x,button:context.saveCloud};
}
test('continuous answers share one minute deadline instead of postponing it indefinitely',()=>{
 const h=harness();h.run('scheduleBackup()');const first=[...h.timers.keys()][0];
 h.run('scheduleBackup();scheduleBackup()');assert.equal(h.timers.size,1);assert.equal([...h.timers.keys()][0],first);assert.equal(h.timers.get(first).delay,60000);
});
test('finishing a lesson advances a scheduled backup to immediately',()=>{
 const h=harness();h.run('scheduleBackup();scheduleBackup({immediate:true})');assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,0);
});
test('manual save sends now and clears the pending periodic timer',async()=>{
 const h=harness();h.run('scheduleBackup()');await h.button.onclick();assert.equal(h.calls(),1);assert.equal(h.timers.size,0);assert.match(h.message(),/в облаке/);
});
test('an answer arriving during upload requests another backup',async()=>{
 const h=harness();h.setReply({status:'local-changed'});await h.run('runSync()');assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,1000);
});
test('restore pauses automatic writes until the user cancels or completes the choice',async()=>{
 const h=harness();h.run('scheduleBackup()');await h.run('pauseBackup()');
 assert.equal(h.timers.size,0);assert.equal((await h.run('runSync()')).status,'idle');assert.equal(h.calls(),0);
 h.run('resumeBackup()');assert.equal([...h.timers.values()][0].delay,60000);
});
