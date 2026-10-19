'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/core.js');
const K = require('../src/calendar-core.js');
function fixture(priority = 2) {
  return C.validateModel({ ...C.blankModel(), projects: [{ id: 'p', title: '顺序项目', priority, importance: 2, due: null, done: false, stages: [
    { id: 's1', title: '第一阶段', priority: null, due: null, done: false, tasks: [
      { id: 'a', title: '靠前任务', priority: null, due: '2026-12-30', done: false },
      { id: 'b', title: '靠后任务', priority: null, due: '2026-10-20', done: false }
    ] },
    { id: 's2', title: '第二阶段', priority: null, due: null, done: false, tasks: [
      { id: 'c', title: '后阶段任务', priority: null, due: '2026-10-19', done: false }
    ] }
  ] }] });
}
test('zero-star daily urgency survives inheritance, sync, repeats and backup', () => {
  const model = fixture(0);
  model.projects[0].stages[0].tasks[1].priority = 0;
  assert.ok(C.flattenTasks(model).every(t => t.priority === 0));
  const event = K.saveEvent(model, { title: '日常安排', date: '2026-10-19', priority: 0, startTime: '09:00', endTime: '10:00' });
  const project = K.syncEvent(model, event.id, { kind: 'project', importance: 2 });
  assert.equal(project.priority, 0);
  K.repeatEvent(model, event.id, { interval: 1, mode: 'count', count: 2 });
  const imported = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.ok(imported.calendarEvents.every(e => e.priority === 0));
  assert.ok(C.flattenTasks(imported).every(t => t.priority === 0));
});
test('zero urgency remains distinct from inheritance while importance remains 1–3', () => {
  const model = fixture(3);
  model.projects[0].stages[0].tasks[0].priority = 0;
  const clean = C.validateModel(model), flat = C.flattenTasks(clean);
  assert.equal(flat.find(t => t.id === 'a').priority, 0);
  assert.equal(flat.find(t => t.id === 'b').priority, 3);
  clean.projects[0].importance = 0;
  assert.throws(() => C.validateModel(clean), /重要程度/);
  for (const value of [-1, 4, 0.5]) {
    const bad = fixture(); bad.projects[0].priority = value;
    assert.throws(() => C.validateModel(bad));
    assert.throws(() => K.saveEvent(fixture(), { title: '错误', date: '2026-10-19', priority: value }));
  }
});
test('project lead uses display order for equal stars, without changing global deadline order', () => {
  const model = fixture(), leaves = C.flattenTasks(model);
  const before = JSON.stringify(leaves);
  assert.equal(C.projectLeadTask(leaves).id, 'a');
  assert.equal(C.sortTasks(leaves)[0].id, 'c');
  assert.equal(JSON.stringify(leaves), before);
  model.projects[0].stages[1].tasks[0].priority = 3;
  assert.equal(C.projectLeadTask(C.flattenTasks(model)).id, 'c');
});
test('project lead updates after stage/task reorder, completion and urgency edits', () => {
  const model = fixture(), lead = () => C.projectLeadTask(C.flattenTasks(model));
  model.projects[0].stages.reverse(); assert.equal(lead().id, 'c');
  model.projects[0].stages.reverse(); model.projects[0].stages[0].tasks.reverse(); assert.equal(lead().id, 'b');
  C.setCompletion(model, 'b', true); assert.equal(lead().id, 'a');
  C.setCompletion(model, 'a', true); assert.equal(lead().id, 'c');
  C.setCompletion(model, 'c', true); assert.equal(lead(), null);
  C.setCompletion(model, 'a', false); assert.equal(lead().id, 'a');
});
test('zero-star options do not override inherit selection and all labels remain defined', () => {
  const context = vm.createContext({ priorityLabels: ['日常', '普通', '重要', '极重要'] });
  for (const name of ['dialogs.js', 'task-views.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app', name), 'utf8'), context);
  const selected = html => html.match(/<option[^>]*selected[^>]*>/g) || [];
  assert.deepEqual(selected(context.priorityOptions(null, true)), ['<option value="" selected>']);
  assert.deepEqual(selected(context.priorityOptions(0, true)), ['<option value="0" selected>']);
  for (const n of [0, 1, 2, 3]) assert.ok(!context.stars(n).includes('undefined'));
  assert.ok(context.stars(0).includes('日常'));
  assert.ok(context.stars(3).includes('极重要'));
  assert.ok(context.compactStars(2).includes('★★'));
  assert.ok(!context.compactStars(2).includes('急'));
});
