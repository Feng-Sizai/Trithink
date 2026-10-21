'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const DAY = '2026-10-20';
function fixture(count = 6) { const m = C.blankModel(); m.projects = Array.from({ length: count }, (_, i) => ({ id: 'p' + i, title: 'p' + i, priority: i === 0 ? 3 : i === 1 ? 2 : 1, due: null, done: false, stages: [] })); return m; }
const order = m => C.currentQueue(m, DAY).map(t => t.id);
test('manual mode initially uses the entire current automatic queue', () => {
  const m = fixture(); const auto = order(m); C.setPlanMode(m, DAY, 'manual'); assert.deepEqual(order(m), auto); assert.equal(order(m).length, 6); assert.deepEqual(C.getPlan(m, DAY).manualOrder, []);
});
test('manual changes can promote any later item into the leading three', () => {
  const m = fixture(); C.setPlanMode(m, DAY, 'manual'); C.moveManualTask(m, DAY, 'p5', 0); assert.deepEqual(order(m), ['p5', 'p0', 'p1', 'p2', 'p3', 'p4']); assert.equal(m.plans[DAY].visible[0], 'p5');
});
test('completion and new work update the same manually ordered unfinished pool', () => {
  const m = fixture(); C.setPlanMode(m, DAY, 'manual'); C.moveManualTask(m, DAY, 'p5', 0); C.setCompletion(m, 'p5', true); m.projects.push({ id: 'new', title: 'new', priority: 3, done: false, stages: [] }); C.syncAutoProjects(m, DAY); assert(!order(m).includes('p5')); assert(order(m).includes('new')); assert.equal(order(m)[0], 'p0'); assert.equal(order(m).length, 6);
});
test('manual changes remain shared when switching to auto and back', () => {
  const m = fixture(); C.setPlanMode(m, DAY, 'manual'); C.moveManualTask(m, DAY, 'p5', 0); C.setPlanMode(m, DAY, 'auto'); assert.equal(order(m)[0], 'p5'); C.setPlanMode(m, DAY, 'manual'); assert.equal(order(m)[0], 'p5');
});
test('manual full order survives validation and new day starts with automatic rules', () => {
  const m = fixture(); C.setPlanMode(m, DAY, 'manual'); C.moveManualTask(m, DAY, 'p5', 0); const copy = C.validateModel(JSON.parse(JSON.stringify(m))); assert.equal(order(copy)[0], 'p5'); assert.deepEqual(C.getPlan(copy, '2026-10-21').manualOrder, []); assert.equal(C.getPlan(copy, '2026-10-21').mode, 'auto');
});
test('a deferred item moves behind every other item even with two or three left', () => {
  for (const count of [2, 3, 6]) { const m = fixture(count); C.deferAutomaticTask(m, DAY, 'p0'); assert.equal(order(m).at(-1), 'p0'); assert.equal(order(m).length, count); C.deferAutomaticTask(m, DAY, 'p1'); assert.equal(order(m).at(-1), 'p1'); C.deferAutomaticTask(m, DAY, 'p0'); assert.equal(order(m).at(-1), 'p0'); }
});
test('deleted IDs are cleaned and invalid manual positions fail without changing the queue', () => {
  const m = fixture(); C.setPlanMode(m, DAY, 'manual'); const before = JSON.stringify(m); for (const pos of [-1, 6, 1.2, '0']) assert.throws(() => C.moveManualTask(m, DAY, 'p0', pos)); assert.equal(JSON.stringify(m), before); m.projects.pop(); C.syncAutoProjects(m, DAY); assert(!order(m).includes('p5')); const bad = JSON.parse(JSON.stringify(m)); bad.plans[DAY].manualOrder = ['../bad']; assert.throws(() => C.validateModel(bad));
});

test('default reset clears every daily override and preserves data and other days', () => {
  const m = fixture(); C.deferAutomaticTask(m, DAY, 'p0'); C.setPlanMode(m, DAY, 'manual'); C.moveManualTask(m, DAY, 'p4', 0); C.setPlanMode(m, DAY, 'auto');
  const p = C.getPlan(m, DAY); p.excludedProjects = ['p1']; p.manualSelected = ['p2'];
  C.deferAutomaticTask(m, '2026-10-19', 'p2'); const yesterday = JSON.stringify(m.plans['2026-10-19']), projects = JSON.stringify(m.projects);
  C.resetAutomaticQueue(m, DAY); assert.deepEqual(order(m), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
  for (const key of ['deferred', 'excludedProjects', 'manualOrder', 'manualSelected']) assert.deepEqual(p[key], []);
  assert.equal(JSON.stringify(m.projects), projects); assert.equal(JSON.stringify(m.plans['2026-10-19']), yesterday);
});
test('deferral still moves a manually reordered automatic queue item to the end', () => {
  const m = fixture(); C.setPlanMode(m, DAY, 'manual'); C.moveManualTask(m, DAY, 'p5', 0); C.setPlanMode(m, DAY, 'auto'); C.deferAutomaticTask(m, DAY, 'p5');
  assert.equal(order(m).at(-1), 'p5'); assert.equal(order(m)[0], 'p0'); C.setPlanMode(m, DAY, 'manual'); assert.equal(order(m).at(-1), 'p5');
});
test('shared overrides survive reopening in auto mode until explicitly reset', () => {
  const m = fixture(); C.setPlanMode(m, DAY, 'manual'); C.moveManualTask(m, DAY, 'p5', 0); C.setPlanMode(m, DAY, 'auto');
  const copy = C.validateModel(JSON.parse(JSON.stringify(m))); C.syncAutoProjects(copy, DAY); assert.equal(order(copy)[0], 'p5');
  C.resetAutomaticQueue(copy, DAY); assert.equal(order(copy)[0], 'p0'); assert.deepEqual(C.getPlan(copy, DAY).visible, ['p0', 'p1', 'p2']);
});
