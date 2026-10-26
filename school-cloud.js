/* School grades: independent read-only Firebase layer for Vector and Iskra.
   All private grades are fetched from the signed-in user's own Firestore document.
   Local manual-grade storage is never overwritten. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const script = document.querySelector('script[data-school-cloud]');
const appKind = script && script.dataset.schoolCloud === 'vector' ? 'vector' : 'iskra';
const childName = appKind === 'vector' ? 'Матвея' : 'Полины';
const cfg = {
  apiKey: 'AIzaSyCs3gfUXcrlTJLZqxXQ0cgXpfuqNBkNIsU',
  authDomain: 'family-school-grades.firebaseapp.com',
  projectId: 'family-school-grades',
  storageBucket: 'family-school-grades.firebasestorage.app',
  messagingSenderId: '1005917864241',
  appId: '1:1005917864241:web:4192a263b8ad39fdb3f010'
};
// Distinct app names keep Matvey's and Polina's sessions separate on one device.
const fb = initializeApp(cfg, 'school-' + appKind);
const auth = getAuth(fb);
const db = getFirestore(fb);
const state = {
  phase: 'init', user: null, data: null, error: '',
  manual: false, from: '', to: '', loading: false, lastFetch: 0
};
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[ch]);
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
};
const score = value => /^[2-5](?:\.0+)?$/.test(String(value).trim()) ? Number(value) : null;
const markScore = row => score(row.valueCode) ?? score(row.value);
const avg = rows => rows.length
  ? (rows.reduce((n, row) => n + row.n, 0) / rows.length).toFixed(2) : '—';
const forecast = n => n < 2.6 ? 2 : n < 3.6 ? 3 : n < 4.6 ? 4 : 5;
const notify = () => window.dispatchEvent(new CustomEvent('schoolCloudUpdated'));

function errorText(err) {
  if (err && (err.code === 'auth/invalid-credential' ||
    err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found')) {
    return 'Неверная почта или пароль. Проверь данные пользователя Firebase.';
  }
  if (err && err.code === 'auth/too-many-requests') {
    return 'Слишком много попыток входа. Попробуй позже.';
  }
  if (err && err.code === 'permission-denied') {
    return 'Доступ к оценкам запрещён. Проверь Firebase UID и правила Firestore.';
  }
  if (err && err.code === 'unavailable') {
    return 'Сервис временно недоступен. Проверь подключение к интернету.';
  }
  return 'Не удалось подключиться. Проверь интернет и попробуй ещё раз.';
}

function verify(raw) {
  if (!raw || raw.schemaVersion !== 1 || raw.source !== 'petersburgedu' ||
      !Array.isArray(raw.grades) || raw.grades.length > 5000) {
    throw new Error('invalid-school-document');
  }
  const ids = new Set();
  const grades = [];
  for (const row of raw.grades) {
    if (!row || typeof row.id !== 'string' || ids.has(row.id) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        typeof row.subject !== 'string' || typeof row.value !== 'string') {
      throw new Error('invalid-school-grade');
    }
    ids.add(row.id);
    grades.push({
      id: row.id, date: row.date, subject: row.subject.trim() || 'Без предмета',
      value: row.value, valueCode: typeof row.valueCode === 'string' ? row.valueCode : '',
      type: typeof row.type === 'string' ? row.type : ''
    });
  }
  return {
    schoolYear: typeof raw.schoolYear === 'string' ? raw.schoolYear : '',
    syncedAt: typeof raw.syncedAt === 'string' ? raw.syncedAt : '',
    rangeFrom: typeof raw.rangeFrom === 'string' ? raw.rangeFrom : '',
    rangeTo: typeof raw.rangeTo === 'string' ? raw.rangeTo : '',
    grades
  };
}

async function refresh(force = false) {
  const user = auth.currentUser;
  if (!user || state.loading) return;
  if (!force && Date.now() - state.lastFetch < 5 * 60 * 1000) return;
  state.loading = true;
  state.phase = state.data ? 'ready' : 'loading';
  state.error = '';
  notify();
  try {
    // Read only /schoolGrades/{currentUser.uid}; no collection listing.
    const snap = await getDocFromServer(doc(db, 'schoolGrades', user.uid));
    if (auth.currentUser?.uid !== user.uid) return;
    if (!snap.exists()) {
      state.data = null;
      state.phase = 'empty';
      state.error = 'Для этого аккаунта пока нет выгрузки оценок.';
    } else {
      const next = verify(snap.data());
      state.data = next;
      state.phase = 'ready';
      if (!state.from) state.from = /^\d{4}-\d{2}-\d{2}$/.test(next.rangeFrom)
        ? next.rangeFrom : next.schoolYear.slice(0, 4) + '-09-01';
      if (!state.to) state.to = today();
    }
    state.lastFetch = Date.now();
  } catch (err) {
    if (auth.currentUser?.uid !== user.uid) return;
    state.phase = state.data ? 'ready' : 'error';
    state.error = err && String(err.message).startsWith('invalid-school-')
      ? 'Неверный формат данных в базе. Старые записи не изменены.'
      : errorText(err);
  } finally {
    state.loading = false;
    notify();
  }
}

function trend(rows) {
  const sorted = rows.slice().sort((a, b) =>
    a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let total = 0, points = [];
  sorted.forEach((r, i) => {
    total += r.n;
    points.push(total / (i + 1));
  });
  points = points.slice(-45);
  if (points.length < 2) return '<div class="mu sm">График появится, когда оценок станет больше.</div>';
  const lo = Math.max(1.8, Math.min(...points) - .15);
  const hi = Math.min(5.2, Math.max(...points) + .15);
  const coords = points.map((n, i) =>
    (12 + i * 296 / (points.length - 1)).toFixed(1) + ',' +
    (104 - (n - lo) / Math.max(.1, hi - lo) * 85).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 320 120" width="100%" role="img" aria-label="Динамика среднего балла"><polyline fill="none" stroke="var(--ac)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + coords + '"/></svg>';
}

function cloudGrades() {
  const d = state.data;
  const filtered = d.grades.filter(row => row.date >= state.from && row.date <= state.to);
  const numeric = filtered.map(row => ({...row, n: markScore(row)})).filter(row => row.n !== null);
  const group = new Map();
  filtered.forEach(row => {
    if (!group.has(row.subject)) group.set(row.subject, []);
    group.get(row.subject).push(row);
  });
  const ordered = [...group].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
  let s = '<div class="scs-filters"><label>С даты<input type="date" data-sc-date="from" value="' +
    esc(state.from) + '"></label><label>По дату<input type="date" data-sc-date="to" value="' +
    esc(state.to) + '"></label></div>';
  if (state.from > state.to) {
    s += '<p class="scs-warning">Начальная дата позже конечной. Измени период.</p>';
  }
  s += '<div class="hero"><div class="big">' + avg(numeric) +
    '</div><div class="mu">Средний балл · ' + numeric.length +
    ' числовых оценок</div></div>';
  s += '<div class="card"><b>Динамика среднего балла</b>' + trend(numeric) +
    '<div class="mu sm">Все числовые оценки равновесные; официальный школьный средний может отличаться.</div></div>';
  if (!filtered.length) s += '<div class="card">В выбранном периоде оценок пока нет.</div>';
  s += ordered.map(([subject, marks]) => {
    const nums = marks.map(r => score(r.value)).filter(n => n !== null);
    const mean = nums.length ? Number(avg(nums.map(n => ({n})))) : null;
    const chips = marks.slice().sort((a, b) => b.date.localeCompare(a.date) ||
      b.id.localeCompare(a.id)).map(row => {
      const val = markScore(row);
      const tip = [row.date.split('-').reverse().join('.'), row.type].filter(Boolean).join(' · ');
      return '<span class="chip ' + (val === null ? '' : 'c' + val) +
        '" title="' + esc(tip) + '" aria-label="' + esc(tip + ': ' + row.value) +
        '">' + esc(row.value) + '</span>';
    }).join('');
    return '<div class="card sub"><div class="row"><div><b>' + esc(subject) +
      '</b><div class="mu sm">' + (mean === null ? 'Нет числовых оценок' :
      'Средний ' + mean.toFixed(2) + ' · прогноз ' + forecast(mean)) +
      '</div></div></div><div class="chips">' + chips + '</div></div>';
  }).join('');
  s += '<p class="mu sm">Источник: Петербургское образование. Прогноз условный, по равновесным оценкам; школьные коэффициенты здесь не применяются.</p>';
  return s;
}

function summary() {
  if (!state.user || !state.data || !state.from || !state.to) return null;
  const filtered = state.data.grades.filter(row => row.date >= state.from && row.date <= state.to);
  const valid = filtered.map(row => ({...row, n: markScore(row)})).filter(row => row.n !== null);
  const average = valid.length ? valid.reduce((s, row) => s + row.n, 0) / valid.length : 0;
  const groups = new Map();
  valid.forEach(row => {
    const values = groups.get(row.subject) || [];
    values.push(row.n);
    groups.set(row.subject, values);
  });
  const weakest = [...groups].map(([name, values]) => ({
    name, mean: values.reduce((s, n) => s + n, 0) / values.length
  })).sort((a, b) => a.mean - b.mean)[0];
  return {
    average, count: valid.length,
    weakSubject: weakest && weakest.mean < 3.6 ? weakest.name : ''
  };
}

function loginPanel() {
  return '<form id="scs-login" class="scs-form">' +
    '<label>Почта пользователя Firebase<input type="email" name="email" required autocomplete="username"></label>' +
    '<label>Пароль<input type="password" name="password" required autocomplete="current-password"></label>' +
    '<button class="btn" type="submit">Войти и загрузить оценки</button></form>' +
    '<p class="mu sm">Используй аккаунт, созданный для ' + esc(childName) +
    '. Данные входа не сохраняются в коде приложения.</p>';
}

function view(legacy) {
  const title = 'Оценки ' + childName + ' из школьного дневника';
  let body = '<section class="scs" id="school-cloud"><div class="card"><div class="scs-head"><b>' +
    esc(title) + '</b><span class="scs-flag">Только чтение</span></div>';
  if (state.phase === 'init') body += '<p class="mu sm">Подключаем школьный дневник…</p>';
  else if (!state.user) body += loginPanel();
  else {
    body += '<div class="mu sm">Аккаунт: ' + esc(state.user.email || 'Firebase') + '</div>';
    body += '<div class="scs-actions"><button type="button" class="btn g" data-sc-action="refresh" ' +
      (state.loading ? 'disabled' : '') + '>Обновить</button>' +
      '<button type="button" class="btn g" data-sc-action="logout">Выйти</button></div>';
    if (state.data) {
      const d = new Date(state.data.syncedAt);
      const date = Number.isFinite(d.getTime()) ? d.toLocaleString('ru-RU') : 'неизвестно';
      body += '<p class="mu sm">В дневнике: ' + state.data.grades.length +
        ' записей · получено MacBook: ' + esc(date) + '</p>';
    }
  }
  if (state.error) body += '<p class="scs-warning" role="status">' + esc(state.error) + '</p>';
  if (state.phase === 'loading') body += '<p class="mu sm">Загружаем оценки…</p>';
  if (state.phase === 'empty') body += '<p class="mu sm">Проверь привязку UID в сборщике MacBook.</p>';
  body += '</div>';
  if (state.data && state.user) body += cloudGrades();
  body += '<button type="button" class="btn g scs-manual" data-sc-action="manual">' +
    (state.manual ? 'Скрыть ручные оценки' : 'Показать мои прежние ручные оценки') +
    '</button>';
  if (state.manual) {
    body += '<div class="scs-manual-content"><div class="card"><b>Ручные записи</b>' +
      '<p class="mu sm">Отдельный архив. Не смешивается с оценками из дневника.</p></div>' +
      legacy() + '</div>';
  }
  return body + '</section>';
}

const css = document.createElement('style');
css.textContent = '.scs{display:block}.scs .scs-head,.scs .scs-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}.scs .scs-flag{font-size:11px;opacity:.75}.scs .scs-form{display:grid;gap:12px;margin-top:15px}.scs .scs-form label,.scs .scs-filters label{display:grid;gap:6px;font-size:13px;font-weight:600}.scs input{padding:11px;border:1px solid var(--ln);border-radius:11px;background:var(--bg);color:var(--tx);font:inherit;min-width:0;box-sizing:border-box;width:100%}.scs .scs-actions{justify-content:flex-start;margin-top:12px}.scs .scs-filters{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.scs .scs-warning{color:var(--bad);margin:12px 0;font-size:14px}.scs .scs-manual{width:100%;margin:14px 0}.scs .chips{display:flex;gap:6px;flex-wrap:wrap}.scs .chips .chip{cursor:default}.scs .sub{margin:9px 0}@media(max-width:360px){.scs .scs-filters{grid-template-columns:1fr}}';
document.head.appendChild(css);
window.schoolCloud = { view, summary };
notify();

onAuthStateChanged(auth, user => {
  state.user = user;
  state.data = null;
  state.error = '';
  state.loading = false;
  state.lastFetch = 0;
  state.phase = user ? 'loading' : 'signedOut';
  notify();
  if (user) refresh(true);
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'scs-login') return;
  event.preventDefault();
  const form = event.target;
  const email = String(form.elements.email.value || '').trim();
  const password = String(form.elements.password.value || '');
  state.error = '';
  state.phase = 'loading';
  notify();
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    state.phase = 'signedOut';
    state.error = errorText(err);
    notify();
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-sc-action]');
  if (!button) return;
  if (button.dataset.scAction === 'manual') {
    state.manual = !state.manual; notify();
  } else if (button.dataset.scAction === 'refresh') {
    refresh(true);
  } else if (button.dataset.scAction === 'logout') {
    await signOut(auth);
  }
});

document.addEventListener('change', event => {
  if (!event.target.matches('[data-sc-date]')) return;
  const key = event.target.dataset.scDate;
  if (key === 'from' || key === 'to') {
    const value = event.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      state[key] = value;
      notify();
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.user) refresh();
});
