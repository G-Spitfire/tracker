'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function functionSource(name, next) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('\nfunction ' + next + '(', start);
  assert.ok(start >= 0 && end > start, 'Cannot locate function ' + name);
  return source.slice(start, end);
}
function setup(extra = {}) {
  const TODAY = new Date(2026, 10, 19, 12);
  const state = { child: 0, quarter: '2', chart: 'line', hw: 'week' };
  const kids = [{ subjects: [], lessons: [], schedule: [], tasks: [] }];
  const context = {
    TODAY, state, kids, Date, Math, Set, Map,
    iso: d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'),
    mean: a => a.length ? a.reduce((sum,n) => sum+n,0)/a.length : 0,
    fmt: n => n.toFixed(2).replace('.', ','),
    inQuarter: d => d >= '2026-11-01' && d <= '2026-12-31',
    kpiIcon: () => '',
    recentUpdatesPanel: () => '<section class="updates-panel"></section>',
    diaryUpdatedAt: '2026-11-19T12:00:00+03:00',
    snapshotAgeMs: () => 0,
    btns: () => '',
    escapeHTML: s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
    ...extra
  };
  context.gradeData = () => context.kids[context.state.child].subjects.flatMap(s => s.grades).filter(g => context.inQuarter(g.date));
  context.score = () => context.mean(context.kids[context.state.child].subjects.map(s => s.grades.filter(g => context.inQuarter(g.date))).filter(a => a.length).map(a => context.mean(a.map(g => g.value))));
  vm.createContext(context);
  vm.runInContext(functionSource('holidayInfo','home') + '\n' + functionSource('home','grades') + '\n' + functionSource('homework','syncStatus'), context);
  return context;
}
test('home: unweighted subject means drive KPI, delta, and line chart', () => {
  const c = setup();
  c.kids[0].subjects = [
    {name:'A', grades:[{value:5,date:'2026-11-18'},{value:5,date:'2026-11-18'},{value:5,date:'2026-11-19'}]},
    {name:'B', grades:[{value:3,date:'2026-11-18'}]}
  ];
  c.kids[0].lessons = [
    {from:'2026-11-17T09:00'},{from:'2026-11-18T09:00'},{from:'2026-11-19T09:00'}
  ];
  const html = vm.runInContext('home()', c);
  assert.match(html, /Средний балл<\/span>.*?4,00/s);
  assert.match(html, /Учебных дней подряд/);
  assert.match(html, /<polyline[^>]+points="24,66 342,66"/, 'line graph uses subject-weighted mean on both dates');
});
test('home: no-grade school day counts towards streak', () => {
  const c = setup();
  c.kids[0].subjects = [{name:'A',grades:[{value:5,date:'2026-11-17'}]}];
  c.kids[0].lessons = [{from:'2026-11-17T09:00'},{from:'2026-11-18T09:00'},{from:'2026-11-19T09:00'}];
  const html = vm.runInContext('home()',c);
  assert.match(html, /Без троек и двоек<\/span>.*?<strong class="stat-value">2<\/strong>/s, 'Today is not yet a completed school day');
});
test('homework: next five actual scheduled days, skipping weekends', () => {
  const c = setup();
  const dates=['2026-11-20','2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27'];
  c.kids[0].schedule=dates.map(d=>({from:d+'T09:00'}));
  c.kids[0].tasks=dates.map(d=>({subject:'Математика',text:'Задание '+d,nextLessonDate:d}));
  const html=vm.runInContext('homework()',c);
  assert.match(html,/Задание 2026-11-20/);
  assert.match(html,/Задание 2026-11-26/);
  assert.doesNotMatch(html,/Задание 2026-11-27/);
  assert.match(html,/Официальная дата сдачи в источнике не предоставляется/);
});
test('homework: unknown next lesson only in all view', () => {
  const c=setup();
  c.kids[0].tasks=[{subject:'Русский',text:'Упражнение 7',nextLessonDate:null}];
  assert.doesNotMatch(vm.runInContext('homework()',c),/Упражнение 7/);
  c.state.hw='all';
  assert.match(vm.runInContext('homework()',c),/Упражнение 7/);
});

test('home: seven-day change compares cumulative subject means', () => {
  const c=setup();
  c.kids[0].subjects=[
    {name:'A',grades:[{value:4,date:'2026-11-10'},{value:5,date:'2026-11-18'}]},
    {name:'B',grades:[{value:3,date:'2026-11-10'},{value:5,date:'2026-11-19'}]}
  ];
  const html=vm.runInContext('home()',c);
  assert.ok(html.includes('↑ +0,75'), 'seven-day delta should be +0.75');
  assert.ok(html.includes('За 7 дней'));
});
test('home: seven-day change is unavailable without a baseline', () => {
  const c=setup();
  c.kids[0].subjects=[{name:'A',grades:[{value:5,date:'2026-11-18'}]}];
  const html=vm.runInContext('home()',c);
  assert.ok(html.includes('<strong class="stat-value">—</strong>'), 'no baseline shows dash');
  assert.ok(html.includes('За 7 дней'));
});

test('homework: scheduled day without assignments shows neutral empty state', () => {
 const c=setup({dataSource:'live'}); c.state.hw='tomorrow';
 c.kids[0].schedule=[{subjectId:'m',from:'2026-11-20T09:00'}];
 const html=vm.runInContext('homework()',c);
 assert.match(html,/Домашних заданий пока нет/); assert.doesNotMatch(html,/homework-doodle/);
});
test('homework: nearest school day skips days without lessons', () => {
 const c=setup({dataSource:'live'}); c.state.hw='tomorrow';
 c.kids[0].schedule=[{subjectId:'m',from:'2026-11-23T09:00'}];
 c.kids[0].tasks=[{subject:'Математика',text:'Номер 12',nextLessonDate:'2026-11-23'}];
 const html=vm.runInContext('homework()',c);
 assert.match(html,/понедельник, 23 ноября/);
 assert.match(html,/Номер 12/);
 assert.doesNotMatch(html,/Свободный день!/);
});
test('homework: cached data retains assignments and neutral empty states', () => {
 const c=setup({dataSource:'cached',syncWarning:'Нет связи'}); c.state.hw='tomorrow';
 c.kids[0].schedule=[{subjectId:'m',from:'2026-11-20T09:00'}];
 assert.match(vm.runInContext('homework()',c),/Домашних заданий пока нет/);
 c.kids[0].tasks=[{subject:'Математика',text:'Номер 5',nextLessonDate:'2026-11-20'}];
 const html=vm.runInContext('homework()',c);
 assert.match(html,/Номер 5/); assert.doesNotMatch(html,/homework-celebration/);
});

test('homework: missing schedule does not falsely celebrate a free day', () => {
 const c=setup({dataSource:'live'}); c.state.hw='tomorrow';
 const html=vm.runInContext('homework()',c);
 assert.match(html,/Расписание на этот день пока неизвестно/);
 assert.doesNotMatch(html,/homework-celebration/);
});
