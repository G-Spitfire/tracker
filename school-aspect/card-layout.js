/* Presentation only. Preserve all lesson data and complete titles. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AspectCards=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
function teacherVariants(names){
 const full=names.map(clean).filter(Boolean);
 const initial=s=>s?Array.from(s)[0]+'.':'';
 const variants=[
  full.join(' + '),
  full.map(n=>{const w=n.split(' ');return w.length>1?w[0]+' '+initial(w[1]):n}).join(' + '),
  full.map(n=>{const w=n.split(' ');return w.length>1?initial(w[0])+' '+initial(w[1]):n}).join(' + ')
 ];
 return [...new Set(variants)];
}
function draw(content,data,teacher,layout){
 content.replaceChildren();content.dataset.template=layout;
 const doc=content.ownerDocument;
 const fields=[['name',data.name],['time',data.time],['teacher',teacher],['room',data.room],['group',data.group]];
 for(const [key,value] of fields){if(!value)continue;const el=doc.createElement(key==='name'?'strong':'span');el.className='adaptive-'+key;el.textContent=value;content.appendChild(el);}
}
function fits(content){
 const box=content.getBoundingClientRect();if(box.width<1||box.height<1)return false;
 const parts=[];
 for(const el of content.children){
  const range=content.ownerDocument.createRange();range.selectNodeContents(el);
  const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);
  if(!rects.length)continue;
  for(const r of rects){
   if(r.left<box.left-.5||r.right>box.right+.5||r.top<box.top-.5||r.bottom>box.bottom+.5)return false;
   for(const p of parts)if(p.el!==el&&r.left<p.r.right-.5&&r.right>p.r.left+.5&&r.top<p.r.bottom-.5&&r.bottom>p.r.top+.5)return false;
   parts.push({el,r});
  }
 }
 return true;
}
function apply(card){
 const content=card.querySelector('.adaptive-content');if(!content)return false;
 const data={name:card.dataset.cardName||'',time:card.dataset.cardTime||'',room:card.dataset.cardRoom||'',group:card.dataset.cardGroup||''};
 let names=[];try{names=JSON.parse(card.dataset.cardTeachers||'[]')}catch(_){}
 const teachers=teacherVariants(names);
 const height=card.getBoundingClientRect().height;
 card.dataset.textSize=height<54?'small':height<105?'medium':'large';
 // One fixed reading order for every card: title, teacher, then time and room.
 // Only the teacher's spelling may be shortened; fields never change positions.
 for(let i=0;i<Math.max(1,teachers.length);i++){
  draw(content,data,teachers[i]||'','vertical');
  if(fits(content)){card.dataset.layout='vertical';card.dataset.teacherLevel=String(i);delete card.dataset.compact;return false;}
 }
 draw(content,data,teachers[teachers.length-1]||'','vertical');
 card.dataset.layout='overflow';card.dataset.compact='true';
 return true;
}
function fitAll(board){let count=0;for(const card of board.querySelectorAll('.lesson'))if(apply(card))count++;return count;}
return {teacherVariants,fitAll,apply,fits};
});
