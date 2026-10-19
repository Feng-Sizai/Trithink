/* Calendar rules: local dates, bedtime statistics and one-way project links. */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.ThreeThingsCore;
  const kinds = ['coffee', 'milkTea', 'other'];
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  function assert(value, message) {
    if (!value) throw new Error(message);
  }
  function shiftDate(day, offset) {
    assert(C.isDate(day) && Number.isInteger(offset), '日期无效');
    const date = new Date(day + 'T12:00:00');
    date.setDate(date.getDate() + offset);
    const result = C.localDate(date);
    assert(C.isDate(result), '日期超出范围');
    return result;
  }
  function monthDays(month) {
    assert(/^\d{4}-\d{2}$/.test(month) && C.isDate(month + '-01'), '月份无效');
    const first = month + '-01';
    const offset = (new Date(first + 'T12:00:00').getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < 42; i++) days.push(shiftDate(first, i - offset));
    return days;
  }
  function weekDays(day) {
    assert(C.isDate(day), '日期无效');
    const offset = (new Date(day + 'T12:00:00').getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => shiftDate(day, i - offset));
  }
  function timeMinutes(time) {
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  }
  const SCHEDULE = Object.freeze({ start: 360, end: 1440, hourHeight: 36, holdMs: 450 });
  function minuteTime(minute) {
    assert(Number.isInteger(minute) && minute >= 0 && minute <= 1440, '时间分钟数无效');
    return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
  }
  function scheduleMinute(offset) {
    return Math.max(SCHEDULE.start, Math.min(SCHEDULE.end, Math.round(SCHEDULE.start + offset * 60 / SCHEDULE.hourHeight)));
  }
  function scheduleCreateRange(anchor, minute) {
    assert([anchor, minute].every(Number.isInteger), '时间分钟数无效');
    const snap = value => Math.max(SCHEDULE.start, Math.min(SCHEDULE.end, Math.round(value / 15) * 15));
    const first = Math.min(snap(anchor), snap(minute), SCHEDULE.end - 15);
    return { start: first, end: Math.max(first + 15, snap(anchor), snap(minute)) };
  }
  function scheduleRange(mode, start, end, anchor, minute) {
    assert([start, end, anchor, minute].every(Number.isInteger), '时间分钟数无效');
    const low = SCHEDULE.start, high = SCHEDULE.end;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    if (mode === 'create') {
      const first = clamp(Math.min(anchor, minute), low, high - 1);
      return { start: first, end: clamp(Math.max(anchor, minute), first + 1, high) };
    }
    assert(start >= 0 && end <= high && end > start, '原日程时间无效');
    if (mode === 'start') return { start: clamp(minute, low, end - 1), end };
    if (mode === 'end') return { start, end: clamp(minute, Math.max(start + 1, low), high) };
    assert(mode === 'move', '日程操作无效');
    const next = clamp(start + minute - anchor, Math.min(low, start), high - (end - start));
    return { start: next, end: next + end - start };
  }
  function scheduleMoveRange(start, end, anchor, minute) {
    const range = scheduleRange('move', start, end, anchor, minute);
    const duration = end - start;
    const first = Math.ceil(Math.min(SCHEDULE.start, start) / 15) * 15;
    const last = Math.floor((SCHEDULE.end - duration) / 15) * 15;
    if (first > last) return { start, end };
    const next = Math.max(first, Math.min(last, Math.round(range.start / 15) * 15));
    return { start: next, end: next + duration };
  }
  function rescheduleEvent(model, id, date, range) {
    const event = eventById(model, id);
    return saveEvent(model, { title: event.title, date, priority: event.priority, startTime: minuteTime(range.start), endTime: minuteTime(range.end) }, id);
  }
  // Connected overlap groups share columns; touching endpoints do not overlap.
  function scheduleLayout(events) {
    const timed = events.filter(event => event.startTime && event.endTime).map(event => ({ event, start: timeMinutes(event.startTime), end: timeMinutes(event.endTime) })).sort((a, b) => a.start - b.start || b.end - a.end || a.event.id.localeCompare(b.event.id));
    const result = [];
    let group = [], ends = [], groupEnd = -1;
    function flush() {
      for (const item of group) result.push({ ...item, columns: ends.length });
      group = []; ends = [];
    }
    for (const item of timed) {
      if (item.start >= groupEnd) flush();
      let column = ends.findIndex(end => end <= item.start);
      if (column < 0) column = ends.length;
      ends[column] = item.end;
      group.push({ ...item, column });
      groupEnd = group.length === 1 ? item.end : Math.max(groupEnd, item.end);
    }
    flush();
    return result;
  }
  // Unwrap the shortest circular arc before averaging, so midnight is continuous.
  function meanBedtime(times) {
    assert(times.length > 0 && times.every(time => timePattern.test(time)), '入睡时刻无效');
    const minutes = times.map(time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))).sort((a, b) => a - b);
    let largestGap = -1;
    let start = 0;
    for (let i = 0; i < minutes.length; i++) {
      const gap = (i === minutes.length - 1 ? minutes[0] + 1440 : minutes[i + 1]) - minutes[i];
      if (gap > largestGap) {
        largestGap = gap;
        start = minutes[(i + 1) % minutes.length];
      }
    }
    const mean = Math.round(minutes.reduce((total, minute) => total + (minute < start ? minute + 1440 : minute), 0) / minutes.length) % 1440;
    return String(Math.floor(mean / 60)).padStart(2, '0') + ':' + String(mean % 60).padStart(2, '0');
  }
  function statistics(model, today) {
    const sleepDays = [3, 2, 1].map(offset => shiftDate(today, -offset));
    const times = sleepDays.map(day => model.routines[day]?.sleepTime).filter(Boolean);
    const drinkDays = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));
    const drinks = Object.fromEntries(kinds.map(kind => [kind, drinkDays.reduce((total, day) => total + (model.routines[day]?.drinks[kind] || 0), 0)]));
    return { sleepDays, drinkDays, recorded: times.length, average: times.length === 3 ? meanBedtime(times) : null, drinks };
  }
  function saveSleep(model, date, time) {
    assert(C.isDate(date) && timePattern.test(time), '请选择有效的日期和入睡时刻');
    C.getRoutine(model, date).sleepTime = time;
  }
  function addDrink(model, date, kind) {
    assert(C.isDate(date) && kinds.includes(kind), '饮品记录无效');
    const routine = C.getRoutine(model, date);
    assert(routine.drinks[kind] < 10000, '当天杯数已达记录上限');
    routine.drinks[kind] += 1;
  }
  function findTarget(model, id) {
    for (const project of model.projects) {
      if (project.id === id) return { kind: 'project', record: project, project };
      for (const stage of project.stages) {
        if (stage.id === id) return { kind: 'stage', record: stage, project, stage };
        const task = stage.tasks.find(item => item.id === id);
        if (task) return { kind: 'task', record: task, project, stage };
      }
    }
    return null;
  }
  function eventById(model, id) {
    const event = model.calendarEvents.find(item => item.id === id);
    assert(event, '找不到日历事件');
    return event;
  }
  function saveEvent(model, values, id, now = new Date().toISOString()) {
    const existing = id ? eventById(model, id) : null;
    const next = {
      id: existing ? existing.id : C.newId('event'),
      title: values.title,
      date: values.date,
      priority: values.priority,
      startTime: values.startTime === undefined ? existing?.startTime ?? null : values.startTime,
      endTime: values.endTime === undefined ? existing?.endTime ?? null : values.endTime,
      location: values.location === undefined ? existing?.location ?? '' : values.location,
      color: values.color === undefined ? existing?.color ?? 'sage' : values.color,
      targetId: existing ? existing.targetId : null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: existing && now < existing.createdAt ? existing.createdAt : now
    };
    // Validate the whole candidate before mutating either side of the link.
    const candidate = { ...model, calendarEvents: model.calendarEvents.filter(item => item.id !== id).concat(next) };
    const clean = C.validateModel(candidate).calendarEvents.find(item => item.id === next.id);
    const target = clean.targetId ? findTarget(model, clean.targetId) : null;
    if (target) Object.assign(target.record, { title: clean.title, priority: clean.priority, due: clean.date, dueTime: clean.endTime === '24:00' ? null : clean.endTime });
    if (existing) Object.assign(existing, clean);else model.calendarEvents.push(clean);
    return existing || clean;
  }
  function replaceLeafInPlans(model, previous, next) {
    for (const plan of Object.values(model.plans)) {
      for (const key of ['selected', 'visible', 'manualSelected']) {
        if (Array.isArray(plan[key])) plan[key] = plan[key].map(id => id === previous ? next : id);
      }
    }
  }
  function syncEvent(model, id, destination) {
    const event = eventById(model, id);
    assert(!findTarget(model, event.targetId), '此事件已同步，请直接编辑事件更新对应事项');
    const record = { id: C.newId('item'), title: event.title, priority: event.priority, due: event.date, dueTime: event.endTime === '24:00' ? null : event.endTime, done: false, completedAt: null };
    if (destination.kind === 'project') {
      // Only legacy callers provide importance; it is no longer shown or used to rank.
      if (destination.importance !== undefined) assert(Number.isInteger(destination.importance) && destination.importance >= 1 && destination.importance <= 3, '历史重要程度无效');
      assert(model.projects.length < C.LIMITS.projects, '项目数量已达上限');
      Object.assign(record, { ...(destination.importance === undefined ? {} : { importance: destination.importance }), stages: [] });
      model.projects.push(record);
    } else {
      const project = model.projects.find(item => item.id === destination.projectId);
      assert(project, '请选择已有项目');
      if (destination.kind === 'stage') {
        assert(model.projects.reduce((count, item) => count + item.stages.length, 0) < C.LIMITS.stages, '阶段数量已达上限');
        record.tasks = [];
        if (!project.stages.length) replaceLeafInPlans(model, project.id, record.id);
        project.stages.push(record);
      } else {
        assert(destination.kind === 'task', '请选择同步层级');
        const stage = project.stages.find(item => item.id === destination.stageId);
        assert(stage, '请选择所属阶段；没有阶段时可先同步为新阶段');
        assert(model.projects.reduce((count, item) => count + item.stages.reduce((total, child) => total + child.tasks.length, 0), 0) < C.LIMITS.tasks, '任务数量已达上限');
        if (!stage.tasks.length) replaceLeafInPlans(model, stage.id, record.id);
        stage.tasks.push(record);
        stage.done = false;
        stage.completedAt = null;
      }
      project.done = false;
      project.completedAt = null;
    }
    event.targetId = record.id;
    return record;
  }
  function deleteTarget(model, id) {
    const target = findTarget(model, id);
    if (!target) return;
    if (target.kind === 'project') model.projects = model.projects.filter(item => item.id !== id);
    if (target.kind === 'stage') target.project.stages = target.project.stages.filter(item => item.id !== id);
    if (target.kind === 'task') target.stage.tasks = target.stage.tasks.filter(item => item.id !== id);
    for (const event of model.calendarEvents) if (!findTarget(model, event.targetId)) event.targetId = null;
  }
  function deleteEvent(model, id, withTarget) {
    assert(typeof withTarget === 'boolean', '请选择是否同时删除对应项目事项');
    const event = eventById(model, id);
    if (withTarget && event.targetId) deleteTarget(model, event.targetId);
    model.calendarEvents = model.calendarEvents.filter(item => item.id !== id);
  }
  function removeEventFromProject(model, id) {
    const event = eventById(model, id);
    if (event.targetId) deleteTarget(model, event.targetId);
    event.targetId = null;
    return event;
  }
  function repeatDates(event, options) {
    assert(C.isDate(event.date), '原日程日期无效');
    const interval = options.interval;
    assert(Number.isInteger(interval) && interval >= 1 && interval <= 36500, '自定义间隔需为 1–36500 的整数天');
    let count;
    if (options.mode === 'count') {
      count = options.count;
      assert(Number.isInteger(count) && count >= 1 && count <= C.LIMITS.calendarEvents, '重复次数需为 1–10000 的整数（不含原日程）');
    } else {
      assert(options.mode === 'until' && C.isDate(options.until) && options.until > event.date, '重复截止日期须晚于原日程日期');
      const days = (new Date(options.until + 'T12:00:00Z') - new Date(event.date + 'T12:00:00Z')) / 86400000;
      count = Math.floor(days / interval);
      assert(count >= 1, '截止日期前没有符合间隔的未来日期');
      assert(count <= C.LIMITS.calendarEvents, '未来日程超过 10000 条，请缩短截止日期或增大间隔');
    }
    return Array.from({ length: count }, (_, i) => shiftDate(event.date, interval * (i + 1)));
  }
  function repeatEvent(model, id, options, now = new Date().toISOString()) {
    const event = eventById(model, id);
    const dates = repeatDates(event, options);
    assert(model.calendarEvents.length + dates.length <= C.LIMITS.calendarEvents, '日程总数将超过 10000 条，请减少重复次数');
    const copies = dates.map(date => ({ ...event, id: C.newId('event'), date, targetId: null, createdAt: now, updatedAt: now }));
    // Batch validation keeps an invalid range or capacity error fully atomic.
    const clean = C.validateModel({ ...model, calendarEvents: model.calendarEvents.concat(copies) }).calendarEvents.slice(model.calendarEvents.length);
    model.calendarEvents.push(...clean);
    return clean;
  }
  function sampleModel(today = C.localDate()) {
    const model = C.sampleModel(today);
    const times = ['23:30', '00:10', '23:50', '00:00', '23:30', '00:30', '00:00'];
    for (let i = 0; i < 7; i++) {
      const day = shiftDate(today, i - 6);
      model.routines[day] = { sleepTime: times[i], drinks: { coffee: i % 2, milkTea: i % 3 === 0 ? 1 : 0, other: i === 5 ? 1 : 0 } };
    }
    model.projects.push({ id: 'p_finished_demo', title: '已完成示例 · 电路原理预习', priority: 3, importance: 2, due: today, done: true, completedAt: new Date(shiftDate(today, -1) + 'T18:00:00').toISOString(), stages: [] });
    saveEvent(model, { title: '高数复习答疑', date: shiftDate(today, 2), priority: 3 });
    saveEvent(model, { title: '整理实践活动资料', date: shiftDate(today, -2), priority: 2 });
    saveEvent(model, { title: '本周读书分享', date: today, priority: 1 });
    return C.validateModel(model);
  }
  const api = Object.freeze({ shiftDate, monthDays, weekDays, timeMinutes, SCHEDULE, minuteTime, scheduleMinute, scheduleCreateRange, scheduleRange, scheduleMoveRange, rescheduleEvent, scheduleLayout, meanBedtime, statistics, saveSleep, addDrink, findTarget, saveEvent, syncEvent, deleteTarget, deleteEvent, removeEventFromProject, repeatDates, repeatEvent, sampleModel });
  root.ThreeThingsCalendar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
