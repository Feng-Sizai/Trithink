'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = require('../src/core.js');
const K = require('../src/calendar-core.js');
const day = '2026-10-20';
function linked() {
  const model = C.blankModel();
  const event = K.saveEvent(model, { title: '原名称', date: day, priority: 1, startTime: '09:00', endTime: '10:00' });
  const project = K.syncEvent(model, event.id, { kind: 'project' });
  return { model, event, project };
}
test('note/color/start-only edits preserve independently edited project fields; intentional field changes sync selectively', () => {
  const { model, event, project } = linked();
  Object.assign(project, { title: '项目中改名', priority: 3, due: '2026-10-25', dueTime: '15:00' });
  const update = patch => K.saveEvent(model, { ...event, ...patch }, event.id);
  update({ location: '只改备注', color: 'rose', startTime: '09:15' });
  assert.equal(project.title, '项目中改名'); assert.equal(project.priority, 3); assert.equal(project.due, '2026-10-25'); assert.equal(project.dueTime, '15:00');
  update({ title: '日历主动改名' });
  assert.equal(project.title, '日历主动改名'); assert.equal(project.priority, 3); assert.equal(project.dueTime, '15:00');
  update({ endTime: '11:00' }); assert.equal(project.due, day); assert.equal(project.dueTime, '11:00');
});
test('repetition detects existing slots, skips duplicates by default, and permits explicitly requested duplicate copies', () => {
  const { model, event } = linked(); const options = { interval: 1, mode: 'count', count: 3 };
  assert.equal(K.repeatEvent(model, event.id, options).length, 3);
  const preview = K.repeatPreview(model, event.id, options);
  assert.equal(preview.duplicateDates.length, 3); assert.equal(preview.addedDates.length, 0);
  assert.equal(K.repeatEvent(model, event.id, options).length, 0);
  assert.equal(K.repeatEvent(model, event.id, { ...options, skipDuplicates: false }).length, 3);
});
test('short labels reserve non-overlapping columns without altering the real event duration', () => {
  const m = C.blankModel();
  for (const [startTime, endTime] of [['09:00', '09:15'], ['09:15', '09:30'], ['09:30', '09:45']]) K.saveEvent(m, { title: startTime, date: day, priority: 1, startTime, endTime });
  assert.equal(K.scheduleLayout(m.calendarEvents)[0].columns, 1);
  const expanded = K.scheduleLayout(m.calendarEvents, 54);
  assert(expanded.every(item => item.columns === 3)); assert(expanded.every(item => item.end - item.start === 15));
});
test('drink correction changes one kind/date, validates before mutation, and survives export/reopen normalization', () => {
  const m = C.blankModel(); K.addDrink(m, day, 'water'); K.addDrink(m, day, 'coffee');
  K.setDrinkCount(m, day, 'water', 0); K.setDrinkCount(m, '2026-10-19', 'water', 7);
  for (const bad of [-1, 1.5, NaN, 10001, '2']) { const before = JSON.stringify(m); assert.throws(() => K.setDrinkCount(m, day, 'water', bad)); assert.equal(JSON.stringify(m), before); }
  const clean = C.validateModel(JSON.parse(JSON.stringify(m)));
  assert.equal(clean.routines[day].drinks.water, 0); assert.equal(clean.routines[day].drinks.coffee, 1); assert.equal(clean.routines['2026-10-19'].drinks.water, 7);
});
test('group completion can be restored after reopening without dropping names, deadlines or links', () => {
  const m = C.blankModel(); m.projects = [{ id: 'p', title: '完整项目', priority: 1, due: day, done: false, stages: [{ id: 's', title: '阶段', priority: null, due: null, done: false, tasks: ['a','b'].map(id => ({ id, title: id, priority: null, due: null, done: false })) }] }];
  C.setCompletion(m, 'p', true); const reopened = C.validateModel(JSON.parse(JSON.stringify(m))); C.setCompletion(reopened, 'p', false);
  assert(reopened.projects[0].stages[0].tasks.every(t => !t.done && t.completedAt === null)); assert.equal(reopened.projects[0].due, day); assert.equal(reopened.projects[0].title, '完整项目');
});
test('unsubmitted incomplete forms and save metadata are portable optional extensions, never executable markup', () => {
  const m = C.blankModel(); m.backupMeta = { revision: 42, savedAt: '2026-10-20T12:00:00.000Z' };
  m.formDraft = { action: 'calendar-save-event', context: { id: null }, values: { title: '<img src=x onerror=alert(1)>', date: '', priority: '1', endOfDay: 'true' }, savedAt: '2026-10-20T12:00:00.000Z' };
  const restored = C.validateModel(JSON.parse(JSON.stringify(m)));
  assert.equal(restored.calendarEvents.length, 0); assert.equal(restored.formDraft.values.title, m.formDraft.values.title); assert.equal(restored.backupMeta.revision, 42);
  for (const patch of [{ action: 'execute' }, { context: { id: '../file' } }, { values: { title: 'x'.repeat(201) } }]) assert.throws(() => C.validateModel({ ...m, formDraft: { ...m.formDraft, ...patch } }));
  assert.throws(() => C.validateModel({ ...m, backupMeta: { revision: -1, savedAt: 'bad' } }));
});
