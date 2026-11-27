"use strict";
const C = Core,
  $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#modal");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
const icons = {
  check: "M5 12l4 4L19 6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  today: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  chart: "M4 20V4M4 20h16M8 15l4-5 4 2 4-7",
  book: "M3 5c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2zM12 7v14",
  body: "M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12",
  time: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  water: "M12 3C8 9 5 12 5 15a7 7 0 0 0 14 0c0-3-3-6-7-12z",
  star: "M12 3l2.6 5.6 6.2.8-4.5 4.4 1.1 6.2-5.4-3-5.4 3 1.1-6.2-4.5-4.4 6.2-.8z",
  leaf: "M20 4C8 3 3 8 5 16c8 5 15-2 15-12zM4 20l12-11",
  brain:
    "M12 4v16M12 5C8 1 4 5 5 9c-5 4-1 10 4 9l3 3M12 5c4-4 8 0 7 4 5 4 1 10-4 9l-3 3",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  close: "M6 6l12 12M18 6L6 18",
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[n] || icons.star}"/></svg>`;
const palettes = {
  sage: [
    "#f5f4ee",
    "#fffefa",
    "#26372e",
    "#5a6657",
    "#355740",
    "#e2e9d9",
    "#91a889",
    "#dedfd6",
    "#ad8b56",
  ],
  sand: [
    "#f7f4ed",
    "#fffdf8",
    "#463c2b",
    "#6c604f",
    "#826c49",
    "#eae1ce",
    "#bca67f",
    "#e2d9ca",
    "#a88953",
  ],
  ocean: [
    "#f3f5f6",
    "#ffffff",
    "#293b43",
    "#55666e",
    "#426779",
    "#dce6eb",
    "#8eabb9",
    "#d8e0e3",
    "#779ba9",
  ],
  stone: [
    "#f5f5f2",
    "#ffffff",
    "#343b35",
    "#5b645d",
    "#525b54",
    "#e2e5df",
    "#9aa79c",
    "#dbdfd9",
    "#93917b",
  ],
};
const colors = ["#527755", "#997944", "#527e94", "#8c789b", "#b77961"];
let state = {
    schema: 1,
    habits: [],
    logs: {},
    settings: { palette: "sage", group: false },
  },
  tab = "today",
  selected = C.today(),
  period = 30,
  filter = "all",
  db,
  saveQueue = Promise.resolve(),
  lastToday = C.today();
const id = () =>
  crypto.randomUUID?.() ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("core-personal", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function readDB() {
  return new Promise((resolve, reject) => {
    const r = db.transaction("data").objectStore("data").get("state");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function save() {
  const copy = JSON.parse(JSON.stringify(state));
  saveQueue = saveQueue
    .catch(() => {})
    .then(
      () =>
        new Promise((resolve, reject) => {
          const tx = db.transaction("data", "readwrite");
          tx.objectStore("data").put(copy, "state");
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        }),
    )
    .catch((e) => {
      toast("Ошибка сохранения. Экспортируйте резервную копию.");
      console.error(e);
    });
  return saveQueue;
}
function toast(t) {
  const e = $("#toast");
  e.textContent = t;
  e.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => e.classList.remove("show"), 2800);
}
function theme() {
  const p = palettes[state.settings.palette];
  [
    "bg",
    "surface",
    "ink",
    "muted",
    "accent",
    "soft",
    "mid",
    "line",
    "gold",
  ].forEach((k, i) =>
    document.documentElement.style.setProperty("--" + k, p[i]),
  );
  $("meta[name=theme-color]").content = p[0];
}
const fmt = (d, opts) => C.parse(d).toLocaleDateString("ru-RU", opts);
const short = (d) => fmt(d, { day: "numeric", month: "short" });
const unit = (h, v) =>
  h.type === "duration"
    ? `${v} мин`
    : h.type === "count"
      ? `${v} ${h.unit || "ед."}`
      : `${v} выполн.`;
const ratio = (a) => C.pct(a.done, a.total);
const score = (p) => (p === null ? "—" : p + "%");
function btn(action, label, body, cls = "") {
  return `<button class="${cls}" data-action="${action}" aria-label="${esc(label)}">${body}</button>`;
}
function setValue(h, d, n) {
  if (d > C.today() || !C.active(h, d)) return;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return;
  state.logs[h.id] ??= {};
  state.logs[h.id][d] =
    h.type === "check" ? Number(v > 0) : Math.round(v * 100) / 100;
  save();
  render();
}
function motionKey(el) {
  const habit = el.closest(".habit");
  if(habit) return habit.querySelector(".habitname").dataset.action + ":" + (el.matches(".weekly-progress i") ? "week"+[...el.parentNode.children].indexOf(el) : el.matches(".progress i") ? "progress" : "action");
  const day = el.closest(".day");
  if(day) return day.dataset.action;
  const bar = el.closest(".barcol");
  return bar ? "bar:"+bar.title.split(":")[0] : "";
}
function render() {
  const oldTab = app.dataset.tab;
  const previous = new Map([...app.querySelectorAll(".check,.quick,.progress i,.weekly-progress i,.barfill,.day em i")].map(el => [motionKey(el),{cls:el.className, width:el.style.width, height:el.style.height, text:el.textContent}]));
  const oldScore = app.querySelector(".hero .big")?.textContent;
  const oldTicks = [...app.querySelectorAll(".dial-tick")].map(x=>x.classList.contains("lit"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  theme();
  $("#nav").innerHTML =
    btn(
      "today",
      "Сегодня",
      icon("today") + "Сегодня",
      tab === "today" ? "active" : "",
    ) +
    btn("new", "Новая привычка", icon("plus"), "add") +
    btn(
      "progress",
      "Прогресс",
      icon("chart") + "Прогресс",
      tab === "progress" ? "active" : "",
    );
  app.innerHTML = tab === "today" ? todayView() : progressView();
  app.dataset.tab = tab;
  if (!reduced && oldTab === tab && tab === "today") {
    const ease = "cubic-bezier(.22,1,.36,1)";
    for (const el of app.querySelectorAll(".check,.quick,.progress i,.weekly-progress i,.barfill,.day em i")) {
      const old = previous.get(motionKey(el));
      if (!old) continue;
      if (el.matches(".check") && old.cls !== el.className) {
        el.querySelector("span").animate([{transform:"scale(.78)"},{transform:"scale(1.08)",offset:.65},{transform:"scale(1)"}],{duration:320,easing:ease});
        if(el.classList.contains("done")) el.querySelector("svg").animate([{strokeDashoffset:24,opacity:0},{strokeDashoffset:0,opacity:1}],{duration:350,easing:ease});
      } else if (el.matches(".barfill") && old.height !== el.style.height) {
        el.animate([{height:old.height},{height:el.style.height}],{duration:450,easing:ease});
      } else if (el.style.width && old.width !== el.style.width) {
        el.animate([{width:old.width},{width:el.style.width}],{duration:450,easing:ease});
      } else if (el.matches(".weekly-progress i") && old.cls !== el.className) {
        el.animate([{opacity:.3,transform:"scaleX(.55)"},{opacity:1,transform:"scaleX(1)"}],{duration:300,easing:ease});
      }
    }
    [...app.querySelectorAll(".dial-tick")].forEach((el,i)=>{if(oldTicks[i]!==undefined && oldTicks[i]!==el.classList.contains("lit")) el.animate([{opacity:.3},{opacity:1}],{duration:300,delay:Math.min(180,i*3),easing:ease});});
    const big = app.querySelector(".hero .big");
    if(big && oldScore && oldScore !== big.textContent) big.animate([{opacity:.55,transform:"translateY(3px)"},{opacity:1,transform:"translateY(0)"}],{duration:240,easing:ease});
  } else if(!reduced && oldTab && oldTab !== tab) {
    app.animate([{opacity:.55,transform:"translateY(5px)"},{opacity:1,transform:"translateY(0)"}],{duration:220,easing:"cubic-bezier(.2,.8,.2,1)"});
  }
  const heat = app.querySelector(".heat");
  if (heat) heat.style.setProperty("--heat-weeks", heat.children.length / 7);
}
function header(title) {
  return `<header>${title ? `<h1>${title}</h1>` : '<div><div class="brand">core<i>.</i></div></div>'}${btn("settings", "Настройки", icon("settings"), "iconbtn")}</header>`;
}
function todayView() {
  const now = C.today(),
    week = C.range(C.monday(selected), 7),
    a = C.daily(state, selected),
    hs = state.habits.filter((h) => C.scheduled(h, selected)),
    wh = state.habits.filter(
      (h) =>
        C.active(h, selected) && C.config(h, selected).schedule === "weekly",
    );
  const daynames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  let html =
    header("") +
    `<div class="row between date-heading"><div><h2>${esc(fmt(selected,{day:"numeric",month:"long"}))}</h2><div class="muted">${esc(fmt(selected,{weekday:"long",year:"numeric"}))}</div></div><div class="row date-controls">${btn("prevweek","Предыдущая неделя",icon("left"))}${selected!==now?btn("now","Вернуться к сегодняшнему дню","Сегодня","smallbutton"):""}${btn("nextweek","Следующая неделя",icon("right"))}</div></div><div class="week">${week.map((d,i)=>{
      const p=ratio(C.daily(state,d));
      return `<button class="day ${d===selected?"selected":""} ${p===null?"no-plan":""}" data-action="date:${d}" ${d>now?"disabled":""} aria-label="${short(d)}"><span>${daynames[i]}</span><b>${C.parse(d).getDate()}</b><em><i style="width:${d>now?0:p||0}%"></i></em></button>`;
    }).join("")}</div><div class="hero core-hero"><div class="core-dial" role="img" aria-label="Дневной план: ${score(ratio(a))}"><svg viewBox="0 0 120 120" aria-hidden="true">${Array.from({length:60},(_,i)=>`<line class="dial-tick ${ratio(a)!==null&&i<Math.round(ratio(a)*.6)?"lit":""}" x1="60" x2="60" y1="5" y2="${i%5===0?17:13}" transform="rotate(${i*6} 60 60)"/>`).join("")}</svg><div class="dial-label"><div class="big">${score(ratio(a))}</div><span>ДЕНЬ</span></div></div><div class="hero-summary"><div class="eyebrow">Дневной план</div><b>${a.total?`${a.done} из ${a.total}`:"Нет плана"}</b><div class="muted">${a.total?"привычек выполнено":"на выбранный день"}</div>${wh.length?`<div class="week-summary"><div class="eyebrow">Гибкие привычки · неделя</div><b>${wh.reduce((n,h)=>{const x=C.weekly(state,h,selected);return n+Math.min(x.count,x.goal)},0)} из ${wh.reduce((n,h)=>n+C.weekly(state,h,selected).goal,0)}</b></div>`:""}</div></div><div class="row between section"><h2>Привычки</h2>${btn("group",state.settings.group?"Показать единый список":"Группировать по категориям",state.settings.group?'<svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h16"/></svg>':'<svg viewBox="0 0 24 24"><path d="M4 4h5v5H4zM12 6.5h8M4 15h5v5H4zM12 17.5h8"/></svg>',"iconbtn grouping "+(state.settings.group?"grouped":""))}</div>`;
  if (!hs.length && !wh.length)
    html += `<div class="empty">${state.habits.length ? "На этот день нет запланированных привычек." : "Начните с одного маленького действия."}<br><button class="primary" data-action="new" style="margin-top:14px">Создать привычку</button></div>`;
  const all = state.habits.filter(h => hs.includes(h) || wh.includes(h));
  const renderRows = list => list.map(h => habitRow(h, selected, wh.includes(h))).join("");
  if (all.length) {
    if (state.settings.group) {
      for (const g of new Set(all.map(h => h.category || "Без категории"))) {
        html += `<h3>${esc(g)}</h3><div class="list">${renderRows(all.filter(h => (h.category || "Без категории") === g))}</div>`;
      }
    } else html += `<div class="list">${renderRows(all)}</div>`;
  }
  return html;
}
function habitRow(h, d, w = false) {
  const v = C.config(h, d),
    n = C.val(state, h, d),
    done = C.complete(state, h, d),
    wk = w ? C.weekly(state, h, d) : null;
  return `<div class="habit ${done?"is-done":""}"><div class="glyph" style="color:${colors[h.color] || "var(--accent)"}">${icon(h.icon)}</div><button class="habitname" data-action="entry:${h.id}"><strong>${esc(h.name)}</strong><small>${w ? `${wk.count} из ${wk.goal} за неделю${h.type === "check" ? "" : " · "}` : ""}${h.type === "check" ? (w ? "" : (done ? "Выполнено" : v.schedule==="days"?v.days.map(i=>["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][i]).join(" · "):"Ежедневно")) : `${esc(unit(h, n))} / ${esc(unit(h, v.goal))}`}</small>${w ? `<div class="weekly-progress" aria-hidden="true">${Array.from({length:wk.goal},(_,i)=>`<i class="${i<wk.count?"filled":""}"></i>`).join("")}</div>` : ""}${h.type !== "check" ? `<div class="progress"><i style="width:${Math.min(100, (n / v.goal) * 100)}%"></i></div>` : ""}</button>${h.type === "check" ? btn("toggle:" + h.id, "Отметить " + h.name, `<span>${icon("check")}</span>`, "check " + (done ? "done" : "")) : btn("inc:" + h.id, "Добавить " + v.step, `+${v.step}${h.type === "duration" ? " м" : ""}`, "quick")}</div>`;
}
function progressView() {
  const now = C.today(),
    from = C.add(now, 1 - period),
    hs = state.habits.filter(
      (h) =>
        filter === "all" ||
        filter === "h:" + h.id ||
        filter === "c:" + h.category,
    ),
    s = C.stats(state, from, now, hs),
    old = C.stats(state, C.add(from, -period), C.add(from, -1), hs),
    diff = s.p === null || old.p === null ? null : s.p - old.p;
  const options = [
    '<option value="all">Все привычки</option>',
    ...state.habits.map(
      (h) =>
        `<option value="h:${esc(h.id)}" ${filter === "h:" + h.id ? "selected" : ""}>${esc(h.name)}</option>`,
    ),
    ...[...new Set(state.habits.map((h) => h.category).filter(Boolean))].map(
      (c) =>
        `<option value="c:${esc(c)}" ${filter === "c:" + c ? "selected" : ""}>Категория: ${esc(c)}</option>`,
    ),
  ].join("");
  const heatStart = C.monday(from),
    heatDates = C.range(
      heatStart,
      Math.ceil((period + ((C.parse(from).getDay() + 6) % 7)) / 7) * 7,
    );
  return (
    header("Прогресс") +
    `<div class="segments">${[7, 30, 90].map((n) => btn("period:" + n, n + " дней", n + " дней", period === n ? "active" : "")).join("")}</div><select id="filter" aria-label="Фильтр статистики">${options}</select><div class="panel"><div class="eyebrow">Регулярность</div><div class="row"><div class="big">${score(s.p)}</div>${diff === null ? "" : `<span class="muted">${diff > 0 ? "+" : ""}${diff} п.п.</span>`}</div><details class="metric-help"><summary aria-label="Как считается регулярность">ⓘ Как считается</summary><p class="muted">Дневные планы и завершённые недели. Текущая гибкая недельная цель отображается отдельно.</p></details>${s.days.filter(x=>x.p!==null).length <= 1 && !s.actions ? `<div class="empty chart-empty">История только начинается. Отмечайте привычки, чтобы увидеть динамику.</div>` : `<div class="chart">${s.days.map((x) => `<button data-action="inspect:${x.d}" aria-label="${short(x.d)}: ${score(x.p)}" style="height:${x.p === null ? 0 : Math.max(2, x.p)}%;opacity:${x.p === null ? 0 : 1}"></button>`).join("")}</div><div class="row between muted"><span>${short(from)}</span><span>${short(now)}</span></div>`}<div class="row" style="margin-top:12px"><div class="metric"><span class="muted">Выполнено</span><b>${s.actions}</b></div><div class="metric"><span class="muted">Лучшая серия</span><b>${s.best} дн.</b></div></div><details class="metric-help"><summary aria-label="Как считается серия">ⓘ О серии</summary><p class="muted">Дни с выполнением всего дневного плана; дни отдыха не прерывают серию.</p></details></div><div class="panel activity-panel"><div class="row between"><h2>Активность</h2><span class="muted">${short(from)} — ${short(now)}</span></div><div class="heat-wrap"><div class="heat-labels">${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(x=>`<span>${x}</span>`).join("")}</div><div class="heat ${period===90?"heat-long":""}">${heatDates
      .map((d) => {
        const p = d < from || d > now ? null : ratio(C.activity(state, d, hs));
        return `<button ${d < from || d > now ? "disabled" : ""} data-action="inspect:${d}" aria-label="${short(d)}: ${score(p)}" class="${d===now?"heat-today":""}" style="opacity:${d < from || d > now ? 0.15 : p === null ? 0.42 : 1};background:${p === null ? "var(--line)" : `color-mix(in srgb,var(--accent) ${p}%,var(--soft))`};color:${p!==null&&p>=65?"white":"var(--ink)"}">${C.parse(d).getDate()}</button>`;
      })
      .join(
        "",
      )}</div></div><div class="legend muted">Меньше ${[10, 35, 65, 100].map((p) => `<i style="background:color-mix(in srgb,var(--accent) ${p}%,var(--soft))"></i>`).join("")} Больше</div></div><div class="section"><h2>Мои результаты</h2></div>${
      hs.length
        ? `<div class="list">${hs
            .map((h) => {
              const a = C.stats(state, from, now, [h]);
              const sum = Object.entries(state.logs[h.id] || {})
                .filter(([d]) => d >= from && d <= now)
                .reduce((n, [, v]) => n + v, 0);
              return `<div class="habit"><div class="glyph" style="color:${colors[h.color] || "var(--accent)"}">${icon(h.icon)}</div><button class="habitname" data-action="filterhabit:${h.id}"><strong>${esc(h.name)}</strong><small>${esc(h.type === "duration" && sum >= 60 ? `${Math.floor(sum / 60)} ч ${sum % 60} мин` : unit(h, sum))}${h.archived ? " · архив" : ""}</small><div class="progress"><i style="width:${a.p || 0}%"></i></div></button><b>${score(a.p)}</b></div>`;
            })
            .join("")}</div>`
        : '<div class="empty">Здесь появятся ваши результаты.</div>'
    }`
  );
}
function show(html) {
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
}
function close() {
  modal.close();
}
function formHabit(h) {
  const v = h
    ? C.config(h, C.today())
    : {
        goal: 1,
        step: 1,
        schedule: "daily",
        days: [0, 1, 2, 3, 4, 5, 6],
        frequency: 2,
      };
  show(
    `<h2>${h ? "Редактировать привычку" : "Новая привычка"}</h2><form id="habitform"><label>Название</label><input name="name" required maxlength="70" placeholder="Например, английский" value="${esc(h?.name)}"><label>Тип</label><select name="type" ${h ? "disabled" : ""}><option value="check">Галочка</option><option value="count" ${h?.type === "count" ? "selected" : ""}>Количество</option><option value="duration" ${h?.type === "duration" ? "selected" : ""}>Продолжительность (минуты)</option></select><div id="quantity"><div class="row"><div><label>Цель</label><input type="number" name="goal" min="0.01" step="0.01" value="${v.goal}"></div><div><label>Шаг добавления</label><input type="number" name="step" min="0.01" step="0.01" value="${v.step}"></div></div><div id="unit"><label>Единица измерения</label><input name="unit" maxlength="24" placeholder="страниц" value="${esc(h?.unit)}"></div></div><label>Периодичность</label><select name="schedule"><option value="daily">Каждый день</option><option value="days" ${v.schedule === "days" ? "selected" : ""}>Выбранные дни</option><option value="weekly" ${v.schedule === "weekly" ? "selected" : ""}>N раз в неделю</option></select><div id="days"><label>Дни недели</label><div class="dayspick">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((x, i) => `<label><input type="checkbox" name="days" value="${i}" ${v.days.includes(i) ? "checked" : ""}>${x}</label>`).join("")}</div></div><div id="freq"><label>Раз в неделю</label><input type="number" min="1" max="7" name="frequency" value="${v.frequency}"></div><label>Категория (необязательно)</label><input name="category" maxlength="40" list="categories" value="${esc(h?.category)}" placeholder="Тело, развитие…"><datalist id="categories">${[...new Set(state.habits.map((h) => h.category).filter(Boolean))].map((x) => `<option value="${esc(x)}">`).join("")}</datalist><div class="row"><div><label>Иконка</label><select name="icon">${Object.entries(
      {
        star: "Звезда",
        book: "Книга",
        body: "Спорт",
        time: "Время",
        water: "Вода",
        leaf: "Здоровье",
        brain: "Развитие",
        check: "Галочка",
      },
    )
      .map(
        ([k, n]) =>
          `<option value="${k}" ${h?.icon === k ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></div><div><label>Цвет</label><select name="color">${["Зелёный", "Песочный", "Синий", "Лавандовый", "Терракота"].map((x, i) => `<option value="${i}" ${h?.color === i ? "selected" : ""}>${x}</option>`).join("")}</select></div></div><div class="actions"><button type="button" class="secondary" data-action="close">Отмена</button><button class="primary" type="submit">Сохранить</button></div>${h ? `<button type="button" class="danger full" data-action="archive:${h.id}">В архив</button>` : ""}</form>`,
  );
  const f = $("#habitform");
  function fields() {
    const t = f.elements.type.value,
      q = f.elements.schedule.value;
    $("#quantity").hidden = t === "check";
    $("#unit").hidden = t !== "count";
    $("#days").hidden = q !== "days";
    $("#freq").hidden = q !== "weekly";
  }
  f.onchange = fields;
  fields();
  f.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(f),
      type = h?.type || fd.get("type"),
      schedule = fd.get("schedule"),
      days = fd.getAll("days").map(Number),
      goal = type === "check" ? 1 : Number(fd.get("goal")),
      step = type === "check" ? 1 : Number(fd.get("step"));
    if (
      !fd.get("name").trim() ||
      !Number.isFinite(goal) || goal <= 0 ||
      !Number.isFinite(step) || step <= 0 ||
      (schedule === "days" && !days.length)
    ) {
      toast("Проверьте цель и расписание");
      return;
    }
    const version = {
      from: C.today(),
      goal,
      step,
      schedule,
      days,
      frequency: Number(fd.get("frequency")) || 2,
    };
    const item = h || { id: id(), type, versions: [] };
    Object.assign(item, {
      name: fd.get("name").trim(),
      unit: type === "count" ? fd.get("unit").trim() || "ед." : "",
      category: fd.get("category").trim(),
      icon: fd.get("icon"),
      color: Number(fd.get("color")),
    });
    item.versions = item.versions
      .filter((x) => x.from !== version.from)
      .concat(version);
    if (!h) state.habits.push(item);
    save();
    close();
    render();
  };
}
function entry(h) {
  const d = selected,
    v = C.config(h, d),
    n = C.val(state, h, d);
  show(
    `<h2>${esc(h.name)}</h2><div class="muted">${short(d)} · Цель: ${esc(unit(h, v.goal))}</div>${h.type === "check" ? `<button class="primary full detail" data-action="toggleclose:${h.id}">${n ? "Снять отметку" : "Отметить выполнение"}</button>` : `<form id="entryform"><label>Фактическое значение ${h.type === "duration" ? "(минуты)" : ""}</label><input name="value" type="number" min="0" step="0.01" required value="${n}"><div class="actions"><button type="button" class="secondary" data-action="close">Отмена</button><button class="primary">Сохранить</button></div></form>`}<button class="secondary full detail" data-action="edit:${h.id}">Настроить привычку</button><button class="full" data-action="close">Закрыть</button>`,
  );
  if ($("#entryform"))
    $("#entryform").onsubmit = (e) => {
      e.preventDefault();
      setValue(h, d, Number(new FormData(e.target).get("value")));
      close();
    };
}
function settings() {
  show(
    `<h2>Настройки</h2><div class="eyebrow">Цветовая палитра</div><div class="swatches detail">${Object.entries(
      palettes,
    )
      .map(([k, p]) =>
        btn(
          "palette:" + k,
          k,
          `<i style="background:${p[4]}"></i>${k[0].toUpperCase() + k.slice(1)}`,
          state.settings.palette === k ? "active" : "",
        ),
      )
      .join("")}</div><h3>Управление привычками</h3>${
      state.habits
        .filter((h) => !h.archived)
        .map(
          (h) =>
            `<div class="row between"><span>${esc(h.name)}</span>${btn("edit:" + h.id, "Редактировать " + h.name, "Изменить", "smallbutton")}</div>`,
        )
        .join("") || '<p class="muted">Нет привычек</p>'
    }<h3>Архив</h3>${
      state.habits
        .filter((h) => h.archived)
        .map(
          (h) =>
            `<div class="row between"><span>${esc(h.name)}</span>${btn("restore:" + h.id, "Восстановить " + h.name, "Вернуть", "smallbutton")}</div>`,
        )
        .join("") || '<p class="muted">Архив пуст</p>'
    }<h3>Данные</h3><button class="secondary full" data-action="export">Экспорт резервной копии</button><label for="import">Импорт резервной копии (замена данных)</label><input id="import" type="file" accept="application/json,.json"><p class="notice">Данные хранятся на устройстве. Периодически экспортируйте копию. CORE 1.2.1</p><button class="primary full" data-action="close">Готово</button>`,
  );
  $("#import").onchange = async (e) => {
    try {
      const x = JSON.parse(await e.target.files[0].text());
      if (!C.valid(x)) throw Error("invalid");
      if (!confirm("Заменить все текущие данные резервной копией?")) return;
      state = x;
      filter = "all";
      await save();
      close();
      render();
      toast("Данные восстановлены");
    } catch {
      toast("Некорректная резервная копия");
    }
  };
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const [a, ...parts] = b.dataset.action.split(":"),
    arg = parts.join(":"),
    h = state.habits.find((x) => x.id === arg);
  switch (a) {
    case "today":
    case "progress":
      tab = a;
      render();
      break;
    case "new":
      formHabit();
      break;
    case "close":
      close();
      break;
    case "settings":
      settings();
      break;
    case "group":
      state.settings.group = !state.settings.group;
      save();
      render();
      break;
    case "date":
      selected = arg;
      render();
      break;
    case "now":
      selected = C.today();
      render();
      break;
    case "prevweek":
      selected = C.add(selected, -7);
      render();
      break;
    case "nextweek":
      selected = [C.add(selected, 7), C.today()].sort()[0];
      render();
      break;
    case "toggle":
    case "toggleclose":
      if (h) setValue(h, selected, C.val(state, h, selected) ? 0 : 1);
      if (a === "toggleclose") close();
      break;
    case "inc":
      if (h)
        setValue(
          h,
          selected,
          C.val(state, h, selected) + C.config(h, selected).step,
        );
      break;
    case "entry":
      if (h) entry(h);
      break;
    case "edit":
      if (h) formHabit(h);
      break;
    case "archive":
      if (h && confirm("Переместить привычку в архив? История сохранится.")) {
        h.archived = C.today();
        save();
        close();
        render();
      }
      break;
    case "restore":
      if (h) {
        if (h.archived && h.archived < C.today())
          (h.pauses ??= []).push({from: h.archived, to: C.today()});
        delete h.archived;
        save();
        settings();
        render();
      }
      break;
    case "period":
      period = Number(arg);
      render();
      break;
    case "filterhabit":
      filter = "h:" + arg;
      render();
      break;
    case "inspect":
      selected = arg;
      tab = "today";
      render();
      break;
    case "palette":
      state.settings.palette = arg;
      save();
      render();
      settings();
      break;
    case "export": {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(state, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "CORE-" + C.today() + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "filter") {
    filter = e.target.value;
    render();
  }
});
function refreshDate() {
  const n = C.today();
  if (n !== lastToday) {
    if (modal.open) close();
    if (selected === lastToday) selected = n;
    lastToday = n;
    render();
  }
}
document.addEventListener("visibilitychange", refreshDate);
setInterval(refreshDate, 30000);
async function setupUpdates() {
  try {
    let controlled = !!navigator.serviceWorker.controller;
    let reloadPending = false;
    async function reloadWhenSafe() {
      if (!reloadPending || modal.open || document.visibilityState !== "visible") return;
      reloadPending = false;
      await saveQueue;
      if (modal.open || document.visibilityState !== "visible") { reloadPending = true; return; }
      location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controlled) { reloadPending = true; reloadWhenSafe(); }
      controlled = true;
    });
    modal.addEventListener("close", reloadWhenSafe);
    const registration = await navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"});
    const check = () => {
      if(document.visibilityState === "visible") {
        reloadWhenSafe();
        registration.update().catch(()=>{});
      }
    };
    document.addEventListener("visibilitychange",check);
    window.addEventListener("pageshow",check);
    check();
  } catch(e) { console.error(e); }
}
(async () => {
  try {
    db = await openDB();
    const saved = await readDB();
    if (saved && C.valid(saved)) state = saved;
    else if (saved) toast("Не удалось прочитать данные");
    render();
    if ("serviceWorker" in navigator) setupUpdates();
  } catch (e) {
    app.textContent =
      "Не удалось открыть локальное хранилище. Проверьте настройки браузера.";
    console.error(e);
  }
})();
