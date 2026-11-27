(function (g) {
  const date = (d) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const parse = (s) => new Date(s + "T12:00:00");
  const add = (s, n) => {
    const x = parse(s);
    x.setDate(x.getDate() + n);
    return date(x);
  };
  const today = () => date(new Date());
  const monday = (s) => add(s, -((parse(s).getDay() + 6) % 7));
  const range = (s, n) => Array.from({ length: n }, (_, i) => add(s, i));
  const config = (h, d) =>
    [...(h.versions || [])].reverse().find((v) => v.from <= d);
  const active = (h, d) =>
    !!config(h, d) && (!h.archived || d < h.archived) &&
    !(h.pauses || []).some(p => d >= p.from && d < p.to);
  const scheduled = (h, d) => {
    const v = config(h, d);
    return (
      active(h, d) &&
      v.schedule !== "weekly" &&
      (v.schedule === "daily" || v.days.includes((parse(d).getDay() + 6) % 7))
    );
  };
  const val = (s, h, d) => Number(s.logs[h.id]?.[d] || 0);
  const complete = (s, h, d) => {
    const v = config(h, d);
    return !!v && val(s, h, d) >= v.goal;
  };
  const weekly = (s, h, d) => {
    const start = monday(d);
    const ds = range(start, 7).filter(
      (x) => x <= d && active(h, x) && config(h, x).schedule === "weekly",
    );
    const v = ds.length ? config(h, ds[ds.length - 1]) : null;
    return {
      count: ds.filter((x) => complete(s, h, x)).length,
      goal: v?.frequency || 0,
    };
  };
  const daily = (s, d, hs = s.habits) => {
    const list = hs.filter((h) => scheduled(h, d));
    return {
      done: list.filter((h) => complete(s, h, d)).length,
      total: list.length,
    };
  };
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);
  const activity = (s,d,hs=s.habits) => {
    const a = daily(s,d,hs);
    const flexible = hs.filter(h => active(h,d) && config(h,d).schedule === "weekly" && complete(s,h,d)).length;
    return {done: a.done + flexible,total:a.total + flexible};
  };
  function stats(s, from, to, hs = s.habits) {
    let done = 0,
      total = 0,
      streak = 0,
      best = 0,
      actions = 0;
    const days = [];
    for (let d = from; d <= to; d = add(d, 1)) {
      const a = daily(s, d, hs);
      done += a.done;
      total += a.total;
      actions += a.done + hs.filter(h => active(h,d) && config(h,d).schedule === "weekly" && complete(s,h,d)).length;
      const act = activity(s,d,hs);
      days.push({ d, ...act, p: pct(act.done, act.total) });
      if (a.total) {
        streak = a.done === a.total ? streak + 1 : 0;
        best = Math.max(best, streak);
      }
    }
    for (let w = monday(from); w <= to; w = add(w, 7)) {
      const end = add(w, 6);
      if (w < from || end > to) continue;
      for (const h of hs) {
        const x = weekly(s, h, end);
        if (x.goal) {
          done += Math.min(x.count, x.goal);
          total += x.goal;
        }
      }
    }
    return { done, total, p: pct(done, total), best, actions, days };
  }
  function valid(s) {
    if (
      !s ||
      s.schema !== 1 ||
      !Array.isArray(s.habits) ||
      !s.logs ||
      typeof s.logs !== "object" ||
      !s.settings ||
      !["sage", "sand", "ocean", "stone"].includes(s.settings.palette)
    )
      return false;
    const validDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && date(parse(d)) === d;
    const ids = new Set();
    for (const h of s.habits) {
      if (
        !h || typeof h.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(h.id) ||
        ["constructor","prototype","__proto__"].includes(h.id) ||
        ids.has(h.id) ||
        typeof h.name !== "string" ||
        !h.name.trim() ||
        !["check", "count", "duration"].includes(h.type) ||
        !Array.isArray(h.versions) ||
        !h.versions.length
      )
        return false;
      if (h.archived && !validDate(h.archived)) return false;
      if (h.pauses !== undefined && (!Array.isArray(h.pauses) || h.pauses.some(p => !p || !validDate(p.from) || !validDate(p.to) || p.from > p.to))) return false;
      if (h.color !== undefined && (!Number.isInteger(h.color) || h.color < 0 || h.color > 4)) return false;
      ids.add(h.id);
      let previous = "";
      for (const v of h.versions) {
        if (
          !v || !validDate(v.from) || v.from <= previous ||
          !Number.isFinite(v.goal) ||
          v.goal <= 0 ||
          !Number.isFinite(v.step) ||
          v.step <= 0 ||
          !["daily", "days", "weekly"].includes(v.schedule) ||
          !Array.isArray(v.days) ||
          v.days.some((x) => !Number.isInteger(x) || x < 0 || x > 6) ||
          (v.schedule === "days" && !v.days.length) ||
          !Number.isInteger(v.frequency) ||
          v.frequency < 1 ||
          v.frequency > 7
        )
          return false;
        previous = v.from;
      }
    }
    for (const [id, entries] of Object.entries(s.logs)) {
      if (!ids.has(id) || !entries || typeof entries !== "object") return false;
      for (const [d, v] of Object.entries(entries))
        if (
          !validDate(d) ||
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          v < 0
        )
          return false;
    }
    return true;
  }
  g.Core = {
    date,
    parse,
    add,
    today,
    monday,
    range,
    config,
    active,
    scheduled,
    val,
    complete,
    weekly,
    daily,
    activity,
    pct,
    stats,
    valid,
  };
  if (typeof module !== "undefined") module.exports = g.Core;
})(globalThis);
