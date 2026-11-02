(function(){
'use strict';
let uid=null;
const names={news:'Что нового',school:'Школа',learning:'WordScene',awards:'Достижения',football:'Футбол'};
const key=()=> 'leveli-preferences-v1:'+encodeURIComponent(uid||'guest');
let settings={theme:'lilac',hidden:[]};
function read(){try{const value=JSON.parse(localStorage.getItem(key())||'null');settings={theme:['lilac','blue','mint'].includes(value?.theme)?value.theme:'lilac',hidden:Array.isArray(value?.hidden)?value.hidden.filter(x=>x in names):[]}}catch{settings={theme:'lilac',hidden:[]}}}
function apply(){document.body.dataset.theme=settings.theme;document.getElementById('theme').value=settings.theme;document.querySelectorAll('[data-home-card]').forEach(card=>card.hidden=settings.hidden.includes(card.dataset.homeCard));const container=document.getElementById('card-settings');container.replaceChildren();for(const [id,name] of Object.entries(names)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=!settings.hidden.includes(id);input.addEventListener('change',()=>{settings.hidden=input.checked?settings.hidden.filter(x=>x!==id):[...settings.hidden,id];save();apply()});label.append(input,document.createTextNode(name));container.append(label)}}
function save(){try{localStorage.setItem(key(),JSON.stringify(settings));document.getElementById('settings-status').textContent='Настройки сохранены на этом устройстве.'}catch{document.getElementById('settings-status').textContent='Не удалось сохранить настройки. Они действуют до закрытия страницы.'}}
function init(){read();apply();document.getElementById('theme').addEventListener('change',event=>{settings.theme=event.target.value;save();apply()});window.addEventListener('leveliIdentity',event=>{const next=event.detail.uid;if(next===uid)return;uid=next;read();apply()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
