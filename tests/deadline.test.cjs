'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const K = require('../src/calendar-core.js');
const S = require('../src/storage.js');
function fixture() {
  return { ...C.blankModel(), projects: [{ id: 'p', title: '精确截止', priority: 1, due: '2026-10-20', dueTime: '18:25', done: false, stages: [
    { id: 's', title: '继承阶段', priority: null, due: null, done: false, tasks: [
      { id: 't', title: '继承任务', priority: null, due: null, done: false }
    ] }
  ] }] };
}
test('deadline clock inherits with its owning date, overrides and resets atomically', () => {
  const m = C.validateModel(fixture());
  assert.equal(C.flattenTasks(m)[0].dueTime, '18:25');
  const s = m.projects[0].stages[0], t = s.tasks[0];
  s.due = '2026-10-21';
  assert.deepEqual(C.effectiveDeadline(t, s, m.projects[0]), { due: '2026-10-21', dueTime: null });
  s.dueTime = '08:10';
  assert.equal(C.flattenTasks(m)[0].dueTime, '08:10');
  t.due = '2026-10-22'; t.dueTime = '00:00';
  assert.equal(C.flattenTasks(m)[0].dueTime, '00:00');
  t.due = null; t.dueTime = null;
  assert.equal(C.flattenTasks(m)[0].dueTime, '08:10');
});
test('legacy backups default to end of day, exact clocks and sorting survive backup', () => {
  const m = fixture(); m.projectSort = 'due';
  const clean = S.importJSON(S.exportJSON(C.validateModel(m)));
  assert.equal(clean.projectSort, 'due');
  assert.equal(C.flattenTasks(clean)[0].dueTime, '18:25');
  delete m.projects[0].dueTime; delete m.projectSort;
  assert.equal(C.validateModel(m).projects[0].dueTime, null);
  assert.equal(C.validateModel(m).projectSort, 'priority');
  m.projects[0].dueTime = '24:00';
  assert.equal(C.validateModel(m).projects[0].dueTime, null);
  assert.equal(C.validateModel(m).projects[0].importance, undefined);
});
test('invalid deadline clocks, date-less clocks and invalid sorting are rejected', () => {
  for (const clock of ['25:00', '12:60', '8:10', 1200]) {
    const m = fixture(); m.projects[0].dueTime = clock;
    assert.throws(() => C.validateModel(m), /截止时刻/);
  }
  const m = fixture(); m.projects[0].due = null;
  assert.throws(() => C.validateModel(m), /截止时刻/);
  m.projects[0].dueTime = null; m.projectSort = 'importance';
  assert.throws(() => C.validateModel(m), /排序/);
});
test('sort modes respect minute precision and default midnight, never legacy importance', () => {
  const records = [
    { id: 'end', priority: 1, due: '2026-10-20', importance: 3 },
    { id: 'early', priority: 1, due: '2026-10-20', dueTime: '09:15', importance: 1 },
    { id: 'late', priority: 1, due: '2026-10-20', dueTime: '09:16', importance: 3 },
    { id: 'urgent', priority: 3, due: null },
    { id: 'none', priority: 1, due: null }
  ];
  assert.deepEqual(C.sortTasks(records).map(t => t.id), ['urgent', 'early', 'late', 'end', 'none']);
  assert.deepEqual(C.sortTasks(records, 'due').map(t => t.id), ['early', 'late', 'end', 'urgent', 'none']);
  assert.equal(records[0].id, 'end');
});
test('calendar sync requires no importance, follows end clock and normalizes 24:00', () => {
  const m = C.blankModel();
  const e = K.saveEvent(m, { title: '会议', date: '2026-10-20', priority: 1, startTime: '09:00', endTime: '10:35' });
  const p = K.syncEvent(m, e.id, { kind: 'project' });
  assert.equal(p.dueTime, '10:35'); assert.equal(p.importance, undefined);
  K.saveEvent(m, { ...e, endTime: '24:00' }, e.id);
  assert.equal(p.dueTime, null);
  assert.equal(C.validateModel(m).projects[0].dueTime, null);
});
