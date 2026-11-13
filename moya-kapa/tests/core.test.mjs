import test from 'node:test';import assert from 'node:assert/strict';import {splitSession,totalForDate,validateBackup,legacyConvert,validKey} from '../core.js';
test('splits across local midnight',()=>{const a=new Date(2026,10,13,23,30).getTime();const p=splitSession(a,a+3600000);assert.equal(p.length,2);assert.equal(p[0].seconds,1800);assert.equal(p[1].seconds,1800)});
test('manual and timer totals',()=>{const a=new Date(2026,10,13,10).getTime();assert.equal(totalForDate([{id:'a',type:'manual',date:'2026-11-13',seconds:600},{id:'b',type:'timer',start:a,end:a+600000}],'2026-11-13'),1200)});
test('rejects invalid dates',()=>{assert.equal(validKey('2026-02-30'),false);assert.equal(validKey('2026-11-13'),true)});
test('legacy conversion',()=>{const d=legacyConvert({days:{'2026-11-12':{seconds:3600,night:true}}});assert.equal(d.sessions[0].seconds,3600);assert.equal(d.nights[0].status,'all')});
test('valid backup',()=>{assert.equal(validateBackup({app:'moya-kapa',version:2,sessions:[],nights:[],settings:{goal:120}}),true)});
test('rejects bad backup',()=>assert.throws(()=>validateBackup({app:'moya-kapa',version:2,sessions:[{id:'x',type:'manual',date:'2026-02-30',seconds:60}],nights:[],settings:{goal:120}})));
