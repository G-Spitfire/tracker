/* UI contract only: no school transport is configured. */
(function(root){
'use strict';
const day=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function select(items,filter,date,now=new Date()){
 const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 const target=filter==='today'?day(now):filter==='tomorrow'?day(next):date;
 return items.filter(x=>filter==='all'||x.date===target).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.order??Infinity)-(b.order??Infinity));
}
function mount(doc){
 let filter='today',date='',state={status:'disconnected',items:[]};
 const status=doc.getElementById('homework-status'),list=doc.getElementById('homework-list');
 if(!status)return;
 const messages={disconnected:'Задания пока не подключены к Leveli. Синхронизация домашних заданий ещё не настроена.',loading:'Загружаем задания…',error:'Не удалось загрузить задания.',stale:'Данные устарели. Показана сохранённая копия.'};
 function render(){
 list.replaceChildren();
 doc.querySelectorAll('[data-homework-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.homeworkFilter===filter)));
 if(!['ready','stale'].includes(state.status)){status.textContent=messages[state.status]||messages.disconnected;return;}
 const rows=select(state.items,filter,date);
 status.textContent=(messages[state.status]||'')+' '+(rows.length?`${rows.filter(x=>x.done).length} из ${rows.length} выполнено`:'На выбранную дату заданий нет.');
 let previous='';
 for(const item of rows){
 if(filter==='all'&&previous!==item.date){const h=doc.createElement('h2');h.textContent=item.date;list.append(h);previous=item.date;}
 const row=doc.createElement('div');row.className='subject-entry homework-row';
 const check=doc.createElement('input');check.type='checkbox';check.checked=!!item.done;check.setAttribute('aria-label',`Выполнено: ${item.subject}`);
 check.onchange=()=>{item.done=check.checked;status.textContent=(messages[state.status]||'')+' '+`${rows.filter(x=>x.done).length} из ${rows.length} выполнено`;};
 const details=doc.createElement('details'),summary=doc.createElement('summary'),name=doc.createElement('strong'),text=doc.createElement('span'),body=doc.createElement('p');
 name.textContent=item.subject;text.textContent=item.text;body.textContent=item.details||'Дополнительных подробностей нет.';
 summary.append(name,text);details.append(summary,body);row.append(check,details);list.append(row);
 }
 }
 doc.querySelectorAll('[data-homework-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.homeworkFilter;doc.getElementById('homework-date').value='';render();});
 doc.getElementById('homework-date').onchange=e=>{date=e.target.value;filter=date?'date':'today';render();};
 render();
 // Caller owns the authenticated source; this view never reads or writes school data.
 return {setState(next){state={status:next.status,items:(next.items||[]).map(item=>({...item}))};render();}};
}
if(typeof module==='object')module.exports={day,select,mount};
if(root.document)mount(root.document);
})(typeof window==='object'?window:globalThis);
