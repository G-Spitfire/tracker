const {test}=require('node:test');
const assert=require('node:assert/strict');
const {day,select}=require('../homework.js');
test('local lesson-day filters include year rollover and retain completed tasks',()=>{
 const now=new Date(2026,11,31,23,59);
 const items=[{text:'Задание',id:'b',date:'2027-01-01',order:2,done:true},{text:'Задание',id:'a',date:'2026-12-31'},{text:'Задание',id:'c',date:'2027-01-01',order:1}];
 assert.equal(day(now),'2026-12-31');
 assert.deepEqual(select(items,'today',now).map(x=>x.id),['a']);
 assert.deepEqual(select(items,'tomorrow',now).map(x=>x.id),['c','b']);
 assert.deepEqual(select(items,'all',now).map(x=>x.id),['a','c','b']);
 assert.equal(items[0].id,'b');
});

test('all shows current lesson week and future, preserves legacy attachment placeholders, source and checks',()=>{
 const now=new Date(2026,10,12,12);
 const items=[{id:'old',date:'2026-09-01',text:'Старая'},{id:'sunday',date:'2026-11-08',text:'Прошлая неделя'},
 {id:'monday',date:'2026-11-09',text:'Текущая неделя',done:true},{id:'today',date:'2026-11-12',text:'Задание'},
 {id:'future',date:'2026-12-01',text:'Задание во вложении',done:true},
 {id:'none',date:'2026-11-12',text:'Домашнее задание: не задано.'},{id:'blank',date:'2026-11-12',text:'  '},
 {id:'mixed',date:'2026-11-12',text:'Домашнее задание: не задано.\n\nЗадание во вложении'},
 {id:'real',date:'2026-11-12',text:'Объяснить, почему решение не задано'}];
 // Legacy cloud markers can have attachments omitted by the old uploader.
 // Only ingestion has enough evidence to exclude absence; the view keeps them.
 const before=structuredClone(items);
 assert.deepEqual(select(items,'all',now).map(x=>x.id),['monday','today','none','blank','mixed','real','future']);
 assert.deepEqual(items,before);
 assert.equal(select(items,'today',now).length,5);
});
