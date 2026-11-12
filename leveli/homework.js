/* Homework view and authenticated Firestore transport. Grades are untouched. */
(function(root){
'use strict';
const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function select(items,filter,now=new Date()){
 const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 const target=filter==='tomorrow'?day(next):day(now);
 const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(now.getDay()+6)%7);
 return items.filter(x=>(filter==='all'?x.date>=day(monday):x.date===target)).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.order??Infinity)-(b.order??Infinity));
}
function mount(doc,onChange){
 let filter='today',saveError='',epoch=0,revision=0,state={status:'disconnected',items:[]};
 const status=doc.getElementById('homework-status'),list=doc.getElementById('homework-list');
 if(!status)return;
 const messages={disconnected:'Задания пока не подключены к Leveli. Синхронизация домашних заданий ещё не настроена.',loading:'Загружаем задания…',error:'Не удалось загрузить задания.',stale:'Данные устарели. Показана сохранённая копия.'};
 function render(){
 list.replaceChildren();
 doc.querySelectorAll('[data-homework-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.homeworkFilter===filter)));
 if(!['ready','stale'].includes(state.status)){status.textContent=messages[state.status]||messages.disconnected;return;}
 const rows=select(state.items,filter);
 status.textContent=(saveError|| (state.pending?'Галочки ещё сохраняются. ':''))+(messages[state.status]||'')+' '+(rows.length?`${rows.filter(x=>x.done).length} из ${rows.length} выполнено`:'На выбранную дату заданий нет.');
 let previous='';
 for(const item of rows){
 if(filter==='all'&&previous!==item.date){const h=doc.createElement('h2');h.textContent=item.date;list.append(h);previous=item.date;}
 const row=doc.createElement('div');row.className='subject-entry homework-row';
 const check=doc.createElement('input');check.type='checkbox';check.checked=!!item.done;check.setAttribute('aria-label',`Выполнено: ${item.subject}`);
 check.onchange=async()=>{
 const before=item.done,account=epoch,version=revision;item.done=check.checked;saveError='';render();
 if(!onChange)return;
 try{await onChange(item.id,item.done)}catch(err){
  if(epoch!==account)return;
  const current=state.items.find(x=>x.id===item.id);if(current&&revision===version)current.done=before;
  saveError='Не удалось сохранить галочку. Повторите попытку. ';render();
 }
 };
 const details=doc.createElement('details'),summary=doc.createElement('summary'),name=doc.createElement('strong'),text=doc.createElement('span'),body=doc.createElement('p');
 name.textContent=item.subject;text.textContent=item.text;body.textContent=item.details||'Дополнительных подробностей нет.';
 summary.append(name,text);details.append(summary,body);row.append(check,details);list.append(row);
 }
 }
 doc.querySelectorAll('[data-homework-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.homeworkFilter;render();});
 render();
 return {setState(next){if(next.owner!==state.owner){saveError='';++epoch}++revision;state={...next,items:(next.items||[]).map(item=>({...item}))};render();}};
}
function connect(api,view){
 let uid=null,generation=0,stop=()=>{},items=[],latest=null;
 function publish(status,pending=false){view.setState({owner:uid,status,items,pending})}
 function listen(user){
  const current=++generation;stop();uid=user?.uid||null;items=[];latest=null;
  publish(uid?'loading':'disconnected');if(!uid)return;
  const ref=api.doc(api.db,'schoolHomework',uid);
  stop=api.onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
   if(current!==generation)return;
   if(!snapshot.exists()){items=[];latest=null;publish('disconnected');return;}
   const value=snapshot.data();
   if(value.schemaVersion!==1||!value.items||typeof value.items!=='object'||Array.isArray(value.items)){
    items=[];latest=null;publish('error');return;
   }
   latest=value;
   items=Object.entries(value.items).map(([id,item])=>({...item,id,done:value.progress?.[id]===true}));
   const age=Date.now()-Date.parse(value.syncedAt);
   publish(snapshot.metadata?.fromCache||!Number.isFinite(age)||age>48*3600000||age< -300000?'stale':'ready',!!snapshot.metadata?.hasPendingWrites);
  },()=>{if(current===generation)publish(latest?'stale':'error')});
 }
 const off=api.onAuthStateChanged(api.auth,listen,()=>listen(null));
 return {
  async save(id,done){
   if(!uid||!latest||!Object.hasOwn(latest.items,id)||typeof done!=='boolean')throw Error('homework_unavailable');
   // A nested field update preserves other tasks and concurrent collector changes.
   await api.updateDoc(api.doc(api.db,'schoolHomework',uid),new api.FieldPath('progress',id),done);
  },
  refresh(){listen(uid?{uid}:null)},
  close(){++generation;stop();off();uid=null;items=[];latest=null;publish('disconnected')}
 };
}
if(typeof module==='object')module.exports={day,select,mount,connect};
else if(root.document){
 let connection;const view=mount(root.document,(id,done)=>connection.save(id,done));
 const start=()=>{connection=connect(root.leveliFirebase,view);root.addEventListener('online',()=>connection.refresh())};
 if(root.leveliFirebase)start();else root.addEventListener('leveliFirebaseReady',start,{once:true});
}
})(typeof window==='object'?window:globalThis);
