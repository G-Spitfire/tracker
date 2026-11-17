/* Aspect data boundary. Browser global + CommonJS for dependency-free tests. */
(function (root, factory) {
  const api = factory();
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
      types: ['subject', 'routine', 'event'].map(name => ({
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
        const activity = !event && (catalogs.activities.find(v => v.name === record.name) ||
          catalogs.activities.find(v => v.id === record.subjectId));
        const typeId = activity?.typeId || (event ? 'type-event' : 'type-subject');
        const {id: ignoredId, kind, cls, classes, teacher, teachers, teacherId, teacherIds,
          room, roomId, name, subjectId, start, end, group, ...details} = record;
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
          subjectId: entry.activityId, start: entry.start, end: entry.end,
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
    if (!document || document.schemaVersion !== 1 || !document.catalogs ||
        !document.days || typeof document.days !== 'object' || Array.isArray(document.days))
      throw Error('Неподдерживаемая модель данных Аспект');
    const c = document.catalogs;
    for (const kind of ['groups', 'staff', 'rooms', 'types', 'activities']) {
      if (!Array.isArray(c[kind])) throw Error('Нет справочника: ' + kind);
      const ids = c[kind].map(v => v.id);
      if (ids.some(v => typeof v !== 'string' || !v) || new Set(ids).size !== ids.length)
        throw Error('Некорректные ID справочника: ' + kind);
    }
    const has = (kind, id) => c[kind].some(v => v.id === id);
    for (const activity of c.activities) if (!has('types', activity.typeId)) throw Error('Неизвестный тип активности');
    for (const [date, day] of Object.entries(document.days)) {
      if (!validDate(date) || !Array.isArray(day.entries)) throw Error('Некорректный день');
      const seen = new Set();
      for (const e of day.entries) {
        if (typeof e.id !== 'string' || !e.id || seen.has(e.id)) throw Error('Некорректный ID записи');
        seen.add(e.id);
        if (!has('types', e.typeId) || (e.activityId && !has('activities', e.activityId)) ||
            (e.roomId && !has('rooms', e.roomId))) throw Error('Нарушена связь записи');
        for (const [field, kind] of [['staffIds', 'staff'], ['groupIds', 'groups']]) {
          if (!Array.isArray(e[field]) || new Set(e[field]).size !== e[field].length ||
              e[field].some(id => !has(kind, id))) throw Error('Нарушена связь: ' + field);
        }
        if (!e.groupIds.length || !Number.isInteger(e.start) || !Number.isInteger(e.end) ||
            e.start < 0 || e.end > 1440 || e.start >= e.end) throw Error('Некорректная запись');
      }
      for (const staffId of Object.keys(day.absences || {})) if (!has('staff', staffId)) throw Error('Неизвестный отсутствующий');
    }
    return document;
  }
  function openStorage(native) {
    let document;
    const saved = native.getItem(KEY);
    if (saved !== null) document = validate(JSON.parse(saved));
    else {
      const snapshot = {};
      for (const key of KEYS) { const raw = native.getItem(key); if (raw !== null) snapshot[key] = JSON.parse(raw); }
      document = validate(encode(snapshot));
      native.setItem(KEY, JSON.stringify(document));
      // Old keys remain untouched as a migration fallback; after this point they are not read.
    }
    function write(snapshot) {
      const next = validate(encode(snapshot, document));
      native.setItem(KEY, JSON.stringify(next));
      document = next; // Only publish the new in-memory state after storage succeeds.
    }
    return {
      getItem(key) {
        if (!KEYS.includes(key)) return native.getItem(key);
        const snapshot = decode(document);
        return key in snapshot ? JSON.stringify(snapshot[key]) : null;
      },
      setItem(key, value) {
        if (!KEYS.includes(key)) return native.setItem(key, value);
        const snapshot = decode(document);
        snapshot[key] = JSON.parse(value);
        write(snapshot);
      },
      removeItem(key) {
        if (!KEYS.includes(key)) return native.removeItem(key);
        const snapshot = decode(document);
        delete snapshot[key];
        write(snapshot);
      },
      document: () => clone(document)
    };
  }
  return {KEY, KEYS, STORE, REFS, DIRECTORY, GROUP_NAMES, id, assignments, encode, decode, validate, openStorage};
});
