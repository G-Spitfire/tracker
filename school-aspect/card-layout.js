/* Presentation only: measured text flow. Never changes schedule data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AspectCards=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
 function teacherVariants(names){
  const initial=s=>/^\p{L}/u.test(s)?Array.from(s)[0]+'.':s;
  const words=names.map(n=>clean(n).split(' '));
  return [...new Set([
   names.map(clean).join(' + '),
   words.map(w=>w.length>1?[w[0],...w.slice(1).map(initial)].join(' '):w[0]).join(' + '),
   words.map(w=>w.map(initial).join(' ')).join(' + ')
  ])];
 }
 const templates={
  inline:[['group','name','time','teacher','room']],
  paired:[['group','name','time'],['teacher','room']],
  title:[['group','name'],['teacher','time','room']],
  three:[['group','name'],['teacher'],['time','room']],
  narrow:[['name'],['group','teacher'],['time','room']],
  stacked:[['group','name'],['teacher'],['time'],['room']]
 };
 const cache=new Map();
 function draw(content,data,template,teacher){
  content.replaceChildren();content.dataset.template=template;
  const doc=content.ownerDocument;
  for(const row of templates[template]){
   const line=doc.createElement('span');line.className='adaptive-line';
   for(const key of row){const value=key==='teacher'?teacher:data[key];if(!value)continue;const el=doc.createElement(key==='name'?'strong':'span');el.className='adaptive-'+key;el.textContent=value;line.appendChild(el);}
   if(line.childNodes.length)content.appendChild(line);
  }
 }
 // Check actual text fragments, not just an element's scrollWidth: a wrapped
 // lower line can be outside a short card even when its width fits perfectly.
 function fits(content){
  const limit=content.getBoundingClientRect();if(limit.width<=0||limit.height<=0)return false;
  const fragments=[];
  for(const el of content.querySelectorAll('.adaptive-line > *')){
   const range=content.ownerDocument.createRange();range.selectNodeContents(el);
   for(const r of range.getClientRects())if(r.width&&r.height){
    if(r.left<limit.left-.25||r.right>limit.right+.25||r.top<limit.top-.25||r.bottom>limit.bottom+.25)return false;
    for(const prior of fragments)if(prior.element!==el&&r.left<prior.right-.25&&prior.left<r.right-.25&&r.top<prior.bottom-.25&&prior.top<r.bottom-.25)return false;
    fragments.push({element:el,left:r.left,right:r.right,top:r.top,bottom:r.bottom});
   }
  }
  return fragments.length>0;
 }
 function apply(card){
  const content=card.querySelector('.adaptive-content');if(!content)return false;
  const data={name:card.dataset.cardName,time:card.dataset.cardTime,room:card.dataset.cardRoom,group:card.dataset.cardGroup};
  const variants=teacherVariants(JSON.parse(card.dataset.cardTeachers||'[]'));
  const r=content.getBoundingClientRect(),key=JSON.stringify([data,variants,Math.floor(r.width*4)/4,Math.floor(r.height*4)/4]);
  card.removeAttribute('data-compact');
  let plan=cache.get(key);
  if(plan){draw(content,data,plan.template,plan.teacher);if(!fits(content)){cache.delete(key);plan=null;}}
  if(!plan){
   // Full names get every layout opportunity before any abbreviation is tried.
   outer:for(const teacher of variants)for(const template of Object.keys(templates)){
    draw(content,data,template,teacher);if(fits(content)){plan={template,teacher};break outer;}
   }
   if(plan){if(cache.size>1500)cache.clear();cache.set(key,plan);}
  }
  if(plan){card.dataset.layout=plan.template;card.dataset.teacherLevel=String(variants.indexOf(plan.teacher));return false;}
  // Explicit compact fallback. Omit entire fields/words, never clip a line or
  // shrink its font. Full data remain in the button's accessible name/editor.
  card.dataset.compact='true';card.dataset.layout='compact';delete card.dataset.teacherLevel;
  const compact={...data,name:data.name+' …'};
  for(const partial of [
   {...compact,room:''},
   {...compact,teacher:'',room:data.room},
   {...compact,teacher:'',room:''},
   {...compact,time:'',room:''}
  ])for(const teacher of partial.teacher===''?['']:variants)for(const template of Object.keys(templates)){
   draw(content,partial,template,teacher);if(fits(content))return true;
  }
  const words=clean(data.name).split(' ');
  while(words.length){for(const template of Object.keys(templates)){draw(content,{...data,name:words.join(' ')+' …',time:'',room:''},template,'');if(fits(content))return true;}words.pop();}
  draw(content,{name:'…',group:'',time:'',room:''},'inline','');
  if(!fits(content)){content.replaceChildren();card.dataset.layout='compact-empty';}
  return true;
 }
 function fitAll(board){let compact=0;for(const card of board.querySelectorAll('.lesson'))if(apply(card))compact++;return compact;}
 return {teacherVariants,fitAll,apply,fits};
});
