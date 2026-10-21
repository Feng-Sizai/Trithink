'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../src/core.js'), K = require('../src/calendar-core.js'), T = require('../src/tutorial-core.js');
function fixture() {
  const model = C.blankModel();
  const project = { id: 'p_lesson', title: '学习使用三件事', priority: 1, due: null, done: false, stages: [{ id: 's_lesson', title: '入门练习', priority: null, due: null, done: false, tasks: [{ id: 't_lesson', title: '练习', priority: null, due: null, done: false }] }] };
  model.projects.push(project, { id: 'p_original', title: project.title, priority: 1, due: null, done: false, stages: [] });
  const event = K.saveEvent(model, { title: '练习安排时间', date: '2026-10-21', priority: 1, startTime: '09:00', endTime: '10:00' });
  const target = K.syncEvent(model, event.id, { kind: 'task', projectId: project.id, stageId: 's_lesson' });
  const note = C.createNotebookEntry(model, '<p>练习速写</p>');
  const keep = C.createNotebookEntry(model, '<p>原有速写</p>');
  K.addDrink(model, '2026-10-21', 'water');
  return { model: C.validateModel(model), owned: { pid: project.id, sid: 's_lesson', tid: 't_lesson', linkedTid: target.id, eid: event.id, nid: note.id, waterReceipt: { date: '2026-10-21', after: 1 } }, keepId: keep.id };
}
test('practice cleanup removes only owned IDs, clears references and preserves namesakes, notes and unrelated drinks', () => {
  const { model, owned, keepId } = fixture(), original = JSON.stringify(model);
  model.plans['2026-10-21'] = { selected: [owned.tid], visible: [owned.tid], manualOrder: [owned.tid], deferred: [owned.tid] };
  const cleaned = T.clearPractice(model, owned);
  assert.deepEqual(cleaned.projects.map(p => p.id), ['p_original']);
  assert.equal(cleaned.calendarEvents.length, 0);
  assert.deepEqual(cleaned.notebook.entries.map(n => n.id), [keepId]);
  assert.equal(cleaned.routines['2026-10-21'].drinks.water, 0);
  assert.deepEqual(cleaned.plans['2026-10-21'].selected, []);
  delete model.plans['2026-10-21']; assert.equal(JSON.stringify(model), original);
});
test('practice cleanup preserves new work in an owned container and respects later water corrections', () => {
  const { model, owned } = fixture();
  model.projects[0].stages[0].tasks.push({ id: 't_keep', title: '自己新增的任务', priority: null, due: null, done: false });
  model.routines['2026-10-21'].drinks.water = 4;
  const cleaned = T.clearPractice(model, owned);
  assert.equal(cleaned.projects[0].id, owned.pid);
  assert.deepEqual(cleaned.projects[0].stages[0].tasks.map(t => t.id), ['t_keep']);
  assert.equal(cleaned.routines['2026-10-21'].drinks.water, 4);
});
test('practice cleanup leaves containers needed by a separate unfinished draft and is safe to repeat', () => {
  const { model, owned } = fixture();
  model.formDraft = { action: 'save-item', context: { kind: 'task', id: null, stageId: owned.sid }, values: { title: '未完成的真实任务' }, savedAt: '2026-10-21T00:00:00.000Z' };
  const cleaned = T.clearPractice(model, owned);
  assert.equal(cleaned.projects[0].stages[0].id, owned.sid);
  assert.equal(cleaned.formDraft.values.title, '未完成的真实任务');
  assert.deepEqual(T.clearPractice(cleaned, owned), cleaned);
});
test('a missing practice ID never deletes an unrelated same-title project or event', () => {
  const { model } = fixture(); assert.deepEqual(T.clearPractice(model, { pid: 'missing' }), model);
});
test('coach changes sides to remain in the viewport without covering targets', () => {
  const size = { width: 328, height: 250 }, viewport = { width: 1280, height: 900 };
  const left = T.positionCoach({ left: 20, right: 200, top: 200, bottom: 250 }, size, viewport);
  const right = T.positionCoach({ left: 1100, right: 1250, top: 200, bottom: 250 }, size, viewport);
  assert.equal(left.side, 'right'); assert.equal(right.side, 'left');
  assert.ok(left.left >= 222 && right.left + size.width <= 1078);
  const above = T.positionCoach({ left: 200, right: 1080, top: 750, bottom: 800 }, size, viewport);
  assert.equal(above.side, 'above'); assert.ok(above.top + size.height <= 728);
  assert.equal(T.positionCoach({ left: 0, right: 500, top: 0, bottom: 600 }, size, { width: 500, height: 600 }), null);
});

test('cleanup retains an owned task when the user has a separate unsubmitted edit for it', () => {
  const { model, owned } = fixture();
  model.formDraft = { action: 'save-item', context: { kind: 'task', id: owned.tid, stageId: owned.sid }, values: { title: '我正在继续编辑' }, savedAt: '2026-10-21T00:00:00.000Z' };
  const cleaned = T.clearPractice(model, owned);
  assert.ok(cleaned.projects[0].stages[0].tasks.some(task => task.id === owned.tid));
  assert.equal(cleaned.formDraft.values.title, '我正在继续编辑');
});
