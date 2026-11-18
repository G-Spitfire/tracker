/* Aspect data boundary. Browser global + CommonJS for dependency-free tests. */
(function (root, factory) {
  const api = factory();
  api.board = typeof module === 'object' && module.exports ? require('./board.js') : root.AspectBoard;
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AspectModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'aspect_document_v1';
  const STORE = 'school_real_week_v14';
  const REFS = 'school_directory_refs_v20';
  const DIRECTORY = 'school_directory_v20';
  const KEYS = [STORE, REFS, DIRECTORY, 'school_week_config_v12',
    'school_week_schedule_v14', 'school_colors_v12', 'school_subjects_v19'];
  const GROUP_NAMES = ['1А класс', '1Б класс', '2 класс', '3 класс', '4 класс', 'Preschool'];
  const NONE = 'Не назначен';
  const clone = value => JSON.parse(JSON.stringify(value));
  const unique = values => [...new Set(values)];
  function id(prefix = 'ex') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return prefix + '-' + crypto.randomUUID();
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  }
  function assignments(record, names) {
    const teachers = unique(names.filter(n => n && n !== NONE));
    return {...record, teachers, teacher: teachers[0] || NONE, teacherIds: [], teacherId: null};
  }
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date + 'T12:00:00Z')) &&
    new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date;
  function encode(snapshot, previous) {
    const refs = snapshot[REFS] || {};
    const directory = snapshot[DIRECTORY] || {subjects: [], colors: {}};
    const catalogs = {
      groups: previous?.catalogs.groups || GROUP_NAMES.map((name, i) => ({id: 'group-' + i, name})),
      staff: clone(refs.teacher || []), rooms: clone(refs.room || []),
      types: previous ? clone(previous.catalogs.types).map(t => ({...t, color: directory.colors?.[t.id.replace(/^type-/, '')] || t.color})) : ['subject', 'routine', 'event'].map(name => ({
        id: 'type-' + name, name, color: directory.colors?.[name] || ({subject:'#cfe3f8',routine:'#ffe79b',event:'#ccebd9'}[name])
      })),
      activities: (directory.subjects || []).map(item => {
        const {type, ...rest} = item;
        return {...rest, typeId: 'type-' + (type || 'subject')};
      })
    };
    // Resolve explicit UI choices by name at the boundary, never by array position.
    // Existing IDs are a fallback for a catalog rename, not an override of a new choice.
    const reference = (kind, name, oldId) => {
      if (!name || name === NONE) return null;
      const list = catalogs[kind];
      let item = list.find(v => v.name === name);
      if (!item && oldId) item = list.find(v => v.id === oldId);
      if (!item) { item = {id: id(kind), name, archived: false}; list.push(item); }
      return item.id;
    };
    const days = {};
    for (const [date, day] of Object.entries(snapshot[STORE] || {})) {
      if (!validDate(date)) throw Error('Некорректная дата: ' + date);
      const {extras = [], events = [], absences = {}, ...metadata} = day;
      const records = [...extras, ...events];
      const seen = new Set();
      const entries = records.map(record => {
        if (record.id === undefined || record.id === null || record.id === '') throw Error('У записи нет ID');
        const entryId = String(record.id);
        if (seen.has(entryId)) throw Error('Повторяющийся ID записи: ' + entryId);
        seen.add(entryId);
        if (!Number.isInteger(record.start) || !Number.isInteger(record.end) ||
            record.start < 0 || record.end > 1440 || record.start >= record.end)
          throw Error('Некорректное время записи: ' + entryId);
        const event = record.kind === 'event';
        const indices = event ? record.classes : [record.cls];
        if (!Array.isArray(indices) || !indices.length ||
            indices.some(i => !Number.isInteger(i) || !catalogs.groups[i]))
          throw Error('Некорректная группа записи: ' + entryId);
        const staffNames = Array.isArray(record.teachers) ? record.teachers : [record.teacher];
        const staffIds = unique(staffNames.filter(n => n && n !== NONE).map(name => {
          // Look up the old ID by matching the corresponding name, never by position
          // in a newly shortened array.
          const known = catalogs.staff.find(v => v.name === name);
          return reference('staff', name, known?.id || (name === record.teacher ? record.teacherId : null));
        }));
        const activity = (event ? catalogs.activities.find(v => v.id === record.subjectId) : catalogs.activities.find(v => v.name === record.name)) || catalogs.activities.find(v => v.id === record.subjectId);
        const typeId = activity?.typeId || record.typeId || (event ? 'type-event' : 'type-subject');
        const {id: ignoredId, kind, cls, classes, teacher, teachers, teacherId, teacherIds,
          room, roomId, name, subjectId, typeId: ignoredType, start, end, group, ...details} = record;
        return {id: entryId, typeId, activityId: activity?.id || null,
          title: activity ? null : (name || ''), groupIds: unique(indices.map(i => catalogs.groups[i].id)),
          staffIds, roomId: reference('rooms', room, roomId), start, end,
          subgroup: group || 'all', event, details};
      });
      const absent = {};
      for (const [key, reason] of Object.entries(absences)) {
        const item = catalogs.staff.find(v => v.id === key || v.name === key);
        const staffId = item?.id || reference('staff', key);
        if (staffId) absent[staffId] = reason;
      }
      days[date] = {entries, absences: absent, metadata};
    }
    const settings = {};
    for (const key of KEYS) if (![STORE, REFS, DIRECTORY].includes(key) && key in snapshot)
      settings[key] = clone(snapshot[key]);
    return {schemaVersion: 1, catalogs, days, settings,
      directoryMetadata: Object.fromEntries(Object.entries(directory).filter(([key]) => !['subjects', 'colors'].includes(key)))};
  }
  function decode(document) {
    validate(document);
    const c = document.catalogs;
    const nameOf = (list, id, fallback = NONE) => list.find(v => v.id === id)?.name || fallback;
    const store = {};
    for (const [date, day] of Object.entries(document.days)) {
      const extras = [], events = [];
      for (const entry of day.entries) {
        const teachers = entry.staffIds.map(id => nameOf(c.staff, id));
        const activity = c.activities.find(v => v.id === entry.activityId);
        const classes = entry.groupIds.map(id => c.groups.findIndex(v => v.id === id));
        const record = {...entry.details, id: entry.id, name: activity?.name || entry.title || '',
          subjectId: entry.activityId, typeId: entry.typeId, start: entry.start, end: entry.end,
          group: entry.subgroup, teacher: teachers[0] || NONE, teachers,
          teacherId: entry.staffIds[0] || null, teacherIds: [...entry.staffIds],
          room: nameOf(c.rooms, entry.roomId), roomId: entry.roomId};
        if (entry.event) events.push({...record, kind: 'event', classes});
        else extras.push({...record, cls: classes[0]});
      }
      store[date] = {...day.metadata, extras, events, absences: {...day.absences}};
    }
    return {...clone(document.settings), [STORE]: store,
      [REFS]: {teacher: clone(c.staff), room: clone(c.rooms)},
      [DIRECTORY]: {...document.directoryMetadata, subjects: c.activities.map(item => {
        const {typeId, ...rest} = item;
        return {...rest, type: typeId.replace(/^type-/, '')};
      }), colors: Object.fromEntries(c.types.map(t => [t.id.replace(/^type-/, ''), t.color]))}};
  }
  function validate(document) {
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!object(document) || !object(document.settings) || !object(document.directoryMetadata)) throw Error('Повреждена структура документа.');
    const safe = value => { if (!value || typeof value !== 'object') return; for (const [key, item] of Object.entries(value)) { if (['__proto__','constructor','prototype'].includes(key)) throw Error('Недопустимое поле документа.'); safe(item); } };
    safe(document);

    if (!document || document.schemaVersion !== 1 || !document.catalogs ||
        !document.days || typeof document.days !== 'object' || Array.isArray(document.days))
      throw Error('Неподдерживаемая модель данных Аспект');
    const c = document.catalogs;
    for (const kind of ['groups', 'staff', 'rooms', 'types', 'activities']) {
      if (!Array.isArray(c[kind]) || c[kind].some(v => !object(v) || typeof v.name !== 'string' || !v.name.trim())) throw Error('Нет справочника: ' + kind);
      const ids = c[kind].map(v => v.id);
      if (ids.some(v => typeof v !== 'string' || !v) || new Set(ids).size !== ids.length)
        throw Error('Некорректные ID справочника: ' + kind);
    }
    for (const kind of ['groups','staff','rooms','types','activities']) {
      const names=c[kind].map(v=>v.name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru'));
      if(new Set(names).size!==names.length) throw Error('Повторяющиеся названия справочника: '+kind);
    }
    for(const t of c.types) if(!/^#[0-9a-f]{6}$/i.test(t.color)) throw Error('Некорректный цвет типа активности');
    const has = (kind, id) => c[kind].some(v => v.id === id);
    for (const activity of c.activities) if (!has('types', activity.typeId)) throw Error('Неизвестный тип активности');
    for (const [date, day] of Object.entries(document.days)) {
      if (!validDate(date) || !object(day) || !Array.isArray(day.entries) || !object(day.absences) || !object(day.metadata)) throw Error('Некорректный день');
      const seen = new Set();
      for (const e of day.entries) {
        if (!object(e) || !object(e.details) || typeof e.event !== 'boolean' || !['all','a','b'].includes(e.subgroup) || (e.title !== null && typeof e.title !== 'string')) throw Error('Некорректная структура записи.');
        if (typeof e.id !== 'string' || !e.id || seen.has(e.id)) throw Error('Некорректный ID записи');
        seen.add(e.id);
        if (!has('types', e.typeId) || (e.activityId && !has('activities', e.activityId)) ||
            (e.roomId && !has('rooms', e.roomId))) throw Error('Нарушена связь записи');
        if(e.activityId && c.activities.find(a=>a.id===e.activityId).typeId!==e.typeId) throw Error('Тип записи не соответствует названию активности');
        for (const [field, kind] of [['staffIds', 'staff'], ['groupIds', 'groups']]) {
          if (!Array.isArray(e[field]) || new Set(e[field]).size !== e[field].length ||
              e[field].some(id => !has(kind, id))) throw Error('Нарушена связь: ' + field);
        }
        if (!e.groupIds.length || !Number.isInteger(e.start) || !Number.isInteger(e.end) ||
            e.start < 0 || e.end > 1440 || e.start >= e.end) throw Error('Некорректная запись');
      }
      for (const [staffId, reason] of Object.entries(day.absences || {})) if (typeof reason !== 'string' || !has('staff', staffId)) throw Error('Неизвестный отсутствующий');
    }
    const cfg = document.settings['school_week_config_v12'];
    if (cfg !== undefined) {
      if (!object(cfg)) throw Error('Повреждены настройки.');
      for (const field of ['hours','home','teacherNames','customLists']) if (cfg[field] !== undefined && !object(cfg[field])) throw Error('Повреждены настройки: ' + field);
      const clock = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (cfg.display && (!object(cfg.display) || !clock(cfg.display.start) || !clock(cfg.display.end) || cfg.display.start >= cfg.display.end)) throw Error('Некорректный диапазон доски.');
      for (const [key, hours] of Object.entries(cfg.hours || {})) {
        if (!c.staff.some(v => v.id === key || v.name === key) || !object(hours)) throw Error('Некорректный график сотрудника.');
        for (const [weekday, range] of Object.entries(hours)) if (!/^[0-6]$/.test(weekday) || (range !== null && (!Array.isArray(range) || range.length !== 2 || !range.every(clock) || range[0] >= range[1]))) throw Error('Некорректное рабочее время.');
      }
    }
    for (const [key, value] of Object.entries(document.settings)) {
      if (!KEYS.includes(key) || [STORE,REFS,DIRECTORY].includes(key)) throw Error('Неизвестный раздел настроек.');
      if (key === 'school_subjects_v19' && (!Array.isArray(value) || value.some(v=>typeof v !== 'string'))) throw Error('Повреждён список названий.');
      if (key === 'school_colors_v12' && !Array.isArray(value)) throw Error('Повреждена палитра.');
      if (key === 'school_week_schedule_v14' && !object(value)) throw Error('Повреждён шаблон недели.');
    }
    return document;
  }
  const ENTRY_FIELDS=['id','typeId','activityId','title','groupIds','staffIds','roomId','start','end','subgroup','event','details'];
  function serialize(document){
    const data=clone(document);
    for(const day of Object.values(data.days))day.entries=day.entries.map(entry=>ENTRY_FIELDS.map(key=>entry[key]));
    return JSON.stringify({storageVersion:1,data});
  }
  function deserialize(raw){
    const value=JSON.parse(raw);
    if(value.storageVersion!==undefined){
      if(value.storageVersion!==1||!value.data?.days)throw Error('Неподдерживаемая версия хранилища.');
      for(const day of Object.values(value.data.days)){
        if(!Array.isArray(day.entries))throw Error('Повреждены записи хранилища.');
        day.entries=day.entries.map(row=>{if(!Array.isArray(row)||row.length!==ENTRY_FIELDS.length)throw Error('Повреждена запись хранилища.');return Object.fromEntries(ENTRY_FIELDS.map((key,i)=>[key,row[i]]))});
      }
      return validate(value.data);
    }
    return validate(value); // Existing stage 1 document.
  }
  function openStorage(native, options = {}) {
    let raw = native.getItem(KEY), document, undo = null, pending = null;
    let booting = !!options.guarded, writable = !options.guarded, stale = false;
    if (raw !== null) document = deserialize(raw);
    else {
      const snapshot = {};
      for (const key of KEYS) { const value = native.getItem(key); if (value !== null) snapshot[key] = JSON.parse(value); }
      document = validate(encode(snapshot));
      if (!booting) { raw = serialize(document); native.setItem(KEY, raw); }
    }
    const problem = message => { const e = Error(message); e.name = 'AspectStorageError'; return e; };
    function check() {
      if (!writable || stale) throw problem('Сохранение недоступно в этой вкладке. Закройте другую вкладку приложения и обновите страницу.');
      if (native.getItem(KEY) !== raw) { stale = true; undo = null; throw problem('Данные изменились в другой вкладке. Обновите страницу перед сохранением.'); }
    }
    function persist(next, recordUndo = false) {
      validate(next);
      if (booting) { document = next; return; }
      check();
      const serialized = serialize(next);
      if (serialized === raw) return;
      try { native.setItem(KEY, serialized); }
      catch (e) { throw problem('Изменения не сохранены. Хранилище недоступно или переполнено. Прежние данные сохранены. Скачайте резервную копию.'); }
      if (recordUndo) undo = {document, expected: serialized};
      else undo = null; // Never undo over an intervening catalog/settings/restore operation.
      document = next; raw = serialized;
    }
    function write(snapshot) {
      if (pending) { pending.snapshot = snapshot; return; }
      persist(validate(encode(snapshot, document)));
    }
    function snapshot() { return pending ? pending.snapshot : decode(document); }
    function finish(transaction) {
      if (transaction.error) throw transaction.error;
      const next = validate(encode(transaction.snapshot, document));
      const changedSchedule = JSON.stringify(next.days) !== JSON.stringify(document.days);
      if (JSON.stringify(next) !== JSON.stringify(document)) persist(next, changedSchedule);
    }
    return {
      getItem(key) {
        if (!KEYS.includes(key)) return native.getItem(key);
        const value = snapshot(); return key in value ? JSON.stringify(value[key]) : null;
      },
      setItem(key, value) {
        if (!KEYS.includes(key)) return native.setItem(key, value);
        try { const next = clone(snapshot()); next[key] = JSON.parse(value); write(next); }
        catch (e) { if (pending) pending.error = e; throw e; }
      },
      removeItem(key) {
        if (!KEYS.includes(key)) return native.removeItem(key);
        const next = clone(snapshot()); delete next[key]; write(next);
      },
      atomic(action) {
        if (pending) return action();
        const transaction = {snapshot: decode(document), error: null}; pending = transaction;
        const abort = e => { pending = null; throw e; };
        const done = value => { pending = null; finish(transaction); return value; };
        try {
          const value = action();
          return value && typeof value.then === 'function' ? value.then(done, abort) : done(value);
        } catch (e) { return abort(e); }
      },
      activate(allowed) {
        const initialized = document;
        booting = false; writable = allowed;
        if (allowed) persist(initialized);
        else if (raw !== null) document = deserialize(raw);
      },
      inTransaction: () => !!pending,
      canWrite: () => writable && !stale,
      canUndo: () => !!undo && writable && !stale && native.getItem(KEY) === raw,
      undo() {
        check();
        if (!undo || undo.expected !== raw) throw problem('Отмена недоступна. После перезагрузки или другой операции отменить изменение нельзя.');
        const previous = undo.document;
        persist(previous, false);
      },
      exportBackup() { checkFresh(); return JSON.stringify({format:'aspect-backup', version:1, document:clone(document)}, null, 2); },
      restoreBackup(text) { const next = parseBackup(text); persist(next, false); },
      replace(next) { persist(clone(validate(next)), false); },
      applySchedule(next) { persist(clone(validate(next)), true); },
      document: () => clone(document),
      invalidate() { stale = true; undo = null; }
    };
    function checkFresh() { if (native.getItem(KEY) !== raw) throw problem('Данные изменились в другой вкладке. Обновите страницу перед экспортом.'); }
  }
  function parseBackup(text) {
    let value;
    try { value = JSON.parse(text); } catch (_) { throw Error('Файл не является корректным JSON.'); }
    if (!value || value.format !== 'aspect-backup' || value.version !== 1)
      throw Error('Неподдерживаемый формат резервной копии. Нужна копия Аспект версии 1.');
    return clone(validate(value.document));
  }
  return {KEY, KEYS, STORE, REFS, DIRECTORY, GROUP_NAMES, id, assignments, encode, decode, validate, openStorage, parseBackup, serialize, deserialize};
});
