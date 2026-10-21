'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const S = require('../src/storage.js');
const day = '2026-10-20', now = new Date(day + 'T12:00:00');
const project = (id, priority = 1, due = null, dueTime = null) => ({ id, title: id, priority, due, dueTime, done: false, stages: [] });
function fixture(n = 5) { const m = C.blankModel(); m.projects = Array.from({ length: n }, (_, i) => project('p' + i, i === 0 ? 3 : i === 1 ? 2 : 1)); return m; }
const sync = m => C.syncAutoProjects(m, day, now);
const defer = (m, id) => C.deferAutomaticTask(m, day, id, now);

test('automatic queue includes every unfinished leaf without manual enrollment', () => {
  const m = fixture(); m.projects[4].stages = [{ id: 's', title: 's', priority: 3, due: null, done: false, tasks: [] }];
  assert.deepEqual(sync(m).visible, ['p0', 's', 'p1']);
  assert.equal(C.automaticQueue(m, day, now).length, 5);
  assert.equal(C.getPlan(m, day).manualSelected.length, 0);
});
test('deferring replaces the card but retains it at the end of the complete pool', () => {
  const m = fixture(); sync(m); defer(m, 'p0');
  assert.deepEqual(sync(m).visible, ['p1', 'p2', 'p3']);
  assert.equal(C.automaticQueue(m, day, now).at(-1).id, 'p0');
  assert.equal(C.automaticQueue(m, day, now).length, 5);
  for (let i = 0; i < 3; i++) assert(!sync(m).visible.includes('p0'));
});
test('fallback includes only enough deferred work to fill three, without clearing the mark', () => {
  const m = fixture(4); defer(m, 'p0'); defer(m, 'p1');
  assert.deepEqual(sync(m).visible, ['p2', 'p3', 'p0']);
  assert.deepEqual(sync(m).deferred, ['p0', 'p1']);
  m.projects.push(project('extra'));
  assert.deepEqual(sync(m).visible, ['p2', 'p3', 'extra']);
});
test('zero, one or two remaining items display without duplicates or invented placeholders', () => {
  for (const count of [0, 1, 2]) { const m = fixture(count); for (const p of m.projects) defer(m, p.id); assert.equal(sync(m).visible.length, count); assert.equal(new Set(sync(m).visible).size, count); }
});
test('completion and deletion refill immediately until all remaining work is exhausted', () => {
  const m = fixture(); sync(m); C.setCompletion(m, 'p0', true); assert.deepEqual(sync(m).visible, ['p1', 'p2', 'p3']);
  m.projects = m.projects.filter(p => p.id !== 'p1'); assert.deepEqual(sync(m).visible, ['p2', 'p3', 'p4']);
  for (const id of ['p2', 'p3', 'p4']) C.setCompletion(m, id, true);
  assert.deepEqual(sync(m).visible, []);
});
test('deferrals survive export, import and repeated reconciliation but not the next date', () => {
  const m = fixture(); defer(m, 'p0'); const copy = S.importJSON(S.exportJSON(m));
  assert.deepEqual(sync(copy).visible, ['p1', 'p2', 'p3']);
  assert.deepEqual(C.syncAutoProjects(copy, '2026-10-21', now).visible, ['p0', 'p1', 'p2']);
  assert.deepEqual(copy.plans['2026-10-21'].deferred, []);
});
test('a deferred item becomes mandatory once below 24h, with exact boundary respected', () => {
  const m = fixture(); m.projects[0].due = '2026-10-21'; m.projects[0].dueTime = '12:00';
  assert(!C.isDeadlineUrgent(m.projects[0], now)); defer(m, 'p0'); assert(!sync(m).visible.includes('p0'));
  const later = new Date('2026-10-20T12:01:00'); assert(C.isDeadlineUrgent(m.projects[0], later));
  assert.equal(C.syncAutoProjects(m, day, later).visible[0], 'p0');
  const before = JSON.stringify(m); assert.throws(() => C.deferAutomaticTask(m, day, 'p0', later), /不能暂缓/); assert.equal(JSON.stringify(m), before);
});
test('overdue and default end-of-day deadlines cannot be deferred, missing deadlines can', () => {
  const m = fixture(); Object.assign(m.projects[0], { due: '2026-10-19' }); Object.assign(m.projects[1], { due: day });
  assert.throws(() => defer(m, 'p0'), /不能暂缓/); assert.throws(() => defer(m, 'p1'), /不能暂缓/); defer(m, 'p2');
  assert(sync(m).deferred.includes('p2'));
});
test('urgent project deadline protects all descendant work, including overridden child dates', () => {
  const m = fixture(); Object.assign(m.projects[0], { priority: 0, due: day, dueTime: '18:00', stages: [{ id: 's', title: 's', priority: null, due: '2026-11-01', done: false, tasks: [] }] });
  const leaf = C.flattenTasks(m).find(t => t.id === 's'); assert(C.isTaskUrgent(m, leaf, now)); assert.equal(sync(m).visible[0], 's'); assert.throws(() => defer(m, 's'), /不能暂缓/);
});
test('manual order and its completed cards stay independent of automatic replenishment', () => {
  const m = fixture(); const p = C.getPlan(m, day); p.mode = 'manual'; p.manualSelected = ['p3', 'p1']; C.setCompletion(m, 'p3', true); sync(m);
  assert.deepEqual(p.manualSelected, ['p3', 'p1']); assert.throws(() => defer(m, 'p0'), /自动模式/);
});
test('invalid daily deferrals fail validation while deleted references are cleaned', () => {
  const m = fixture(); defer(m, 'p0'); m.projects.shift(); assert.deepEqual(sync(m).deferred, []);
  for (const value of ['p1', null, ['../bad']]) { const invalid = JSON.parse(JSON.stringify(m)); invalid.plans[day].deferred = value; assert.throws(() => C.validateModel(invalid)); }
});
