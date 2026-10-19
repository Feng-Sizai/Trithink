'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const now = new Date('2026-10-19T12:00:00');
const task = (id, priority, due = null, dueTime = null) => ({ id, title: id, priority, due, dueTime, done: false, stages: [] });
const ids = tasks => C.sortAutomaticTasks(tasks, now).map(t => t.id);

test('automatic queue places 24–48h below three stars and above two stars', () => {
  const tasks = [task('two', 2), task('daily36', 0, '2026-10-21', '00:00'), task('three', 3), task('daily18', 0, '2026-10-20', '06:00'), task('one', 1), task('daily', 0)];
  assert.deepEqual(ids(tasks), ['daily18', 'three', 'daily36', 'two', 'one', 'daily']);
  assert.equal(tasks[0].id, 'two');
});

test('every star level receives the deadline boost, retaining stars then earlier deadlines within a tier', () => {
  const tasks = [task('normal', 3), ...[0, 1, 2, 3].map(p => task('short' + p, p, '2026-10-20', '06:00'))];
  assert.deepEqual(ids(tasks), ['short3', 'short2', 'short1', 'short0', 'normal']);
  assert.deepEqual(ids([task('later', 1, '2026-10-20', '08:00'), task('earlier', 1, '2026-10-20', '07:00')]), ['earlier', 'later']);
});

test('exactly 24h is below three stars; exactly 48h has no deadline boost', () => {
  const tasks = [task('at48', 0, '2026-10-21', '12:00'), task('at24', 0, '2026-10-20', '12:00'), task('three', 3), task('two', 2), task('under24', 0, '2026-10-20', '11:59'), task('under48', 0, '2026-10-21', '11:59')];
  assert.deepEqual(ids(tasks), ['under24', 'three', 'at24', 'under48', 'two', 'at48']);
});

test('date-only deadlines use local end-of-day and overdue items remain urgent', () => {
  assert.deepEqual(ids([task('three', 3), task('tomorrowEnd', 0, '2026-10-20'), task('todayEnd', 0, '2026-10-19'), task('overdue', 0, '2026-10-18')]), ['overdue', 'todayEnd', 'three', 'tomorrowEnd']);
  assert.deepEqual(ids([task('explicit', 1, '2026-10-20', '24:00'), task('implicit', 1, '2026-10-20')]), ['explicit', 'implicit']);
});

test('outside the deadline window stars win and same stars sort by exact deadline', () => {
  const tasks = [task('undated', 2), task('late', 2, '2026-10-25', '08:00'), task('early', 2, '2026-10-25', '07:59'), task('three', 3), task('one', 1, '2026-10-22')];
  assert.deepEqual(ids(tasks), ['three', 'early', 'late', 'undated', 'one']);
  assert.deepEqual(C.sortTasks([task('short', 0, '2026-10-19'), task('three', 3)]).map(t => t.id), ['three', 'short']);
});

test('automatic visible cards use inherited deadline pairs and respond to time passing', () => {
  const m = C.blankModel();
  m.projects = [task('three', 3), task('two', 2), { ...task('parent', 0, '2026-10-21', '00:00'), stages: [{ id: 'stage', title: 'stage', priority: null, due: null, done: false, tasks: [] }] }];
  const p = C.getPlan(m, '2026-10-19');
  p.selected = ['stage'];
  C.syncAutoProjects(m, '2026-10-19', now);
  assert.deepEqual(p.visible, ['three', 'stage', 'two']);
  C.syncAutoProjects(m, '2026-10-19', new Date('2026-10-20T00:01:00'));
  assert.deepEqual(p.visible, ['stage', 'three', 'two']);
});

test('automatic updates preserve manual choices and completed visible cards', () => {
  const m = C.blankModel();
  m.projects = [task('three', 3), task('short', 0, '2026-10-20', '06:00')];
  const p = C.getPlan(m, '2026-10-19');
  p.mode = 'manual'; p.manualSelected = ['three', 'short'];
  C.syncAutoProjects(m, '2026-10-19', now);
  assert.deepEqual(p.manualSelected, ['three', 'short']);
  p.visible = ['three']; m.projects[0].done = true;
  C.syncAutoProjects(m, '2026-10-19', now);
  assert.deepEqual(p.visible, ['three']);
});
