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
      targetId: existing ? existing.targetId : null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: existing && now < existing.createdAt ? existing.createdAt : now
    };
    // Validate the whole candidate before mutating either side of the link.
    const candidate = { ...model, calendarEvents: model.calendarEvents.filter(item => item.id !== id).concat(next) };
    const clean = C.validateModel(candidate).calendarEvents.find(item => item.id === next.id);
    const target = clean.targetId ? findTarget(model, clean.targetId) : null;
    if (target) Object.assign(target.record, { title: clean.title, priority: clean.priority, due: clean.date });
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
    const record = { id: C.newId('item'), title: event.title, priority: event.priority, due: event.date, done: false, completedAt: null };
    if (destination.kind === 'project') {
      assert(Number.isInteger(destination.importance) && destination.importance >= 1 && destination.importance <= 3, '请选择重要程度');
      assert(model.projects.length < C.LIMITS.projects, '项目数量已达上限');
      Object.assign(record, { importance: destination.importance, stages: [] });
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
  const api = Object.freeze({ shiftDate, monthDays, meanBedtime, statistics, saveSleep, addDrink, findTarget, saveEvent, syncEvent, deleteTarget, deleteEvent, sampleModel });
  root.ThreeThingsCalendar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
