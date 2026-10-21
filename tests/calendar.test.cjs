'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../src/core.js');
const K = require('../src/calendar-core.js');
const DAY = '2026-10-18';

test('calendar weeks start on Monday and correctly cross leap days and year boundaries', () => {
  assert.equal(K.shiftDate('2024-03-01', -1), '2024-02-29');
  assert.equal(K.shiftDate('2026-01-01', -1), '2025-12-31');
  const days = K.monthDays('2026-10');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2026-09-28');
  assert.equal(new Set(days).size, 42);
  assert.throws(() => K.monthDays('2026-13'));
});
test('bedtime average unwraps midnight and rounds to the nearest minute', () => {
  assert.equal(K.meanBedtime(['23:30', '00:30', '01:00']), '00:20');
  assert.equal(K.meanBedtime(['00:10', '23:50', '00:00']), '00:00');
  assert.equal(K.meanBedtime(['22:00', '22:30', '23:00']), '22:30');
  assert.throws(() => K.meanBedtime(['24:00']));
});
test('statistics require all three previous dates, exclude today from sleep and include today in seven-day drinks', () => {
  const model = C.blankModel();
  K.saveSleep(model, DAY, '18:00');
  for (const [date, time] of [['2026-10-15', '23:30'], ['2026-10-16', '00:30']]) K.saveSleep(model, date, time);
  assert.equal(K.statistics(model, DAY).average, null);
  assert.equal(K.statistics(model, DAY).recorded, 2);
  K.saveSleep(model, '2026-10-17', '01:00');
  K.addDrink(model, '2026-10-11', 'coffee');
  K.addDrink(model, '2026-10-12', 'coffee');
  K.addDrink(model, DAY, 'milkTea');
  K.addDrink(model, '2026-10-19', 'other');
  const before = JSON.stringify(model);
  const stats = K.statistics(model, DAY);
  assert.equal(stats.average, '00:20');
  assert.deepEqual(stats.drinks, { coffee: 1, milkTea: 1, other: 0, water: 0 });
  assert.equal(JSON.stringify(model), before, 'reading statistics must not create empty routine records');
});
test('backfill preserves other dates and drinks; append operation refuses invalid categories', () => {
  const model = K.sampleModel(DAY);
  const previous = structuredClone(model.routines[DAY]);
  K.saveSleep(model, '2026-10-01', '23:40');
  K.addDrink(model, '2026-10-01', 'coffee');
  K.saveSleep(model, '2026-10-01', '00:20');
  assert.equal(model.routines['2026-10-01'].drinks.coffee, 1);
  assert.deepEqual(model.routines[DAY], previous);
  const before = JSON.stringify(model);
  assert.throws(() => K.addDrink(model, DAY, 'invalid'));
  assert.throws(() => K.saveSleep(model, '2026-02-30', '23:00'));
  assert.equal(JSON.stringify(model), before);
});
test('old backups gain optional calendar and project deadline without losing notebook or plans', () => {
  const old = C.sampleModel(DAY);
  delete old.calendarEvents;
  const clean = C.validateModel(old);
  assert.deepEqual(clean.calendarEvents, []);
  assert.equal(clean.projects[0].due, null);
  assert.equal(clean.notebook.html, old.notebook.html);
  assert.deepEqual(clean.plans[DAY].selected, old.plans[DAY].selected);
});
test('one-way project sync copies title, urgency, date and chosen importance; later edits update only that target', () => {
  const model = C.blankModel();
  const event = K.saveEvent(model, { title: '答疑', date: DAY, priority: 3 });
  const project = K.syncEvent(model, event.id, { kind: 'project', importance: 1 });
  assert.equal(project.importance, 1);
  assert.equal(project.due, DAY);
  project.title = '项目侧修改';
  assert.equal(event.title, '答疑');
  K.saveEvent(model, { title: '新答疑', date: '2026-10-20', priority: 1 }, event.id);
  assert.equal(project.title, '新答疑');
  assert.equal(project.priority, 1);
  assert.equal(project.due, '2026-10-20');
  assert.equal(project.importance, 1);
  assert.throws(() => K.syncEvent(model, event.id, { kind: 'project', importance: 2 }), /已同步/);
  const exported = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.equal(exported.calendarEvents[0].targetId, project.id);
});
test('synced events can create a stage or a task and retain manual plan slots when splitting leaves', () => {
  const model = C.validateModel(C.sampleModel(DAY));
  const stageEvent = K.saveEvent(model, { title: '新增阶段', date: DAY, priority: 2 });
  const stage = K.syncEvent(model, stageEvent.id, { kind: 'stage', projectId: 'p_math' });
  const plan = C.getPlan(model, DAY);
  plan.manualSelected = [stage.id];
  plan.manualOrder = [stage.id];
  plan.deferred = [stage.id];
  const taskEvent = K.saveEvent(model, { title: '新增任务', date: DAY, priority: 3 });
  const task = K.syncEvent(model, taskEvent.id, { kind: 'task', projectId: 'p_math', stageId: stage.id });
  assert.deepEqual(plan.manualSelected, [task.id]);
  assert.deepEqual(plan.manualOrder, [task.id]);
  assert.deepEqual(plan.deferred, [task.id]);
  K.saveEvent(model, { title: '阶段更新', date: '2026-10-21', priority: 1 }, stageEvent.id);
  assert.equal(stage.title, '阶段更新');
  assert.equal(task.due, DAY, 'an explicit task date overrides its parent');
  assert.equal(C.validateModel(model).calendarEvents.length, 2);
});
test('deadlines inherit project to stage to task, and an explicit child deadline wins', () => {
  const model = C.validateModel(C.sampleModel(DAY));
  const p = model.projects[0];
  p.due = '2026-10-30';
  p.stages[0].due = null;
  assert.equal(C.flattenTasks(model).find(t => t.id === 't_exercises').due, p.due);
  p.stages[0].due = '2026-10-25';
  assert.equal(C.flattenTasks(model).find(t => t.id === 't_exercises').due, '2026-10-25');
  p.stages[0].tasks[1].due = '2026-10-20';
  assert.equal(C.flattenTasks(model).find(t => t.id === 't_exercises').due, '2026-10-20');
});
test('deletion explicitly retains or removes the linked target, and removes dangling links to descendants', () => {
  const model = C.blankModel();
  const e1 = K.saveEvent(model, { title: '保留', date: DAY, priority: 1 });
  const p1 = K.syncEvent(model, e1.id, { kind: 'project', importance: 1 });
  K.deleteEvent(model, e1.id, false);
  assert.ok(K.findTarget(model, p1.id));
  const e2 = K.saveEvent(model, { title: '删除', date: DAY, priority: 1 });
  const p2 = K.syncEvent(model, e2.id, { kind: 'project', importance: 2 });
  const e3 = K.saveEvent(model, { title: '其下阶段', date: DAY, priority: 2 });
  K.syncEvent(model, e3.id, { kind: 'stage', projectId: p2.id });
  K.deleteEvent(model, e2.id, true);
  assert.equal(K.findTarget(model, p2.id), null);
  assert.equal(e3.targetId, null);
  assert.equal(model.projects.length, 1);
});
test('calendar imports reject invalid dates, duplicate ids, bad links and unsafe payloads', () => {
  const model = K.sampleModel(DAY);
  for (const change of [m => { m.calendarEvents[0].date = '2026-02-30'; }, m => { m.calendarEvents[0].id = m.projects[0].id; }, m => { m.calendarEvents[0].priority = 4; }, m => { m.calendarEvents[0].targetId = {}; }]) {
    const bad = structuredClone(model);
    change(bad);
    assert.throws(() => C.validateModel(bad));
  }
  const event = K.saveEvent(model, { title: '<img src=x onerror=alert(1)>', date: DAY, priority: 1 });
  assert.equal(event.title, '<img src=x onerror=alert(1)>', 'plain text is escaped at the UI boundary');
  const before = JSON.stringify(model);
  assert.throws(() => K.saveEvent(model, { title: '无效', date: 'invalid', priority: 2 }, event.id));
  assert.equal(JSON.stringify(model), before);
});
test('preview storage never reads or overwrites the normal program keys, and a cleared preview stays empty', () => {
  const values = new Map([['three-things-trial:v1', 'real data sentinel']]);
  const accessed = [];
  const sandbox = {
    document: { body: { dataset: { preview: 'calendar' } } },
    localStorage: {
      getItem(key) { accessed.push(key); return values.get(key) ?? null; },
      setItem(key, value) { accessed.push(key); values.set(key, value); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/storage.js'), 'utf8'), sandbox);
  const storage = sandbox.ThreeThingsStorage;
  assert.equal(storage.load().isNew, true);
  assert.equal(storage.save(sandbox.ThreeThingsCore.sampleModel(DAY)).ok, true);
  assert.equal(storage.save(sandbox.ThreeThingsCore.blankModel()).ok, true);
  assert.equal(storage.load().model.projects.length, 0);
  assert.notEqual(storage.load().isNew, true);
  assert.equal(values.get('three-things-trial:v1'), 'real data sentinel');
  assert.ok(accessed.every(key => key.startsWith('three-things-calendar-preview:v1')));
});
