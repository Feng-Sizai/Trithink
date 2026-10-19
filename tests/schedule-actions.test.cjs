'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('../src/core.js');
const K = require('../src/calendar-core.js');
const make = (model, date = '2026-10-19') => K.saveEvent(model, { title: '重复日程', date, priority: 3, startTime: '09:17', endTime: '10:43', location: '备注', color: 'rose' });

test('future repetition excludes original and supports daily, weekly and custom intervals', () => {
  const model = C.blankModel(), e = make(model);
  assert.deepEqual(K.repeatDates(e, { interval: 1, mode: 'count', count: 3 }), ['2026-10-20', '2026-10-21', '2026-10-22']);
  assert.deepEqual(K.repeatDates(e, { interval: 7, mode: 'count', count: 2 }), ['2026-10-26', '2026-11-02']);
  assert.deepEqual(K.repeatDates(e, { interval: 3, mode: 'count', count: 3 }), ['2026-10-22', '2026-10-25', '2026-10-28']);
});
test('repeat cutoff includes matching endpoint, ignores remainder and handles leap/year boundaries', () => {
  assert.deepEqual(K.repeatDates({ date: '2026-10-19' }, { interval: 7, mode: 'until', until: '2026-11-02' }), ['2026-10-26', '2026-11-02']);
  assert.deepEqual(K.repeatDates({ date: '2026-10-19' }, { interval: 7, mode: 'until', until: '2026-11-01' }), ['2026-10-26']);
  assert.deepEqual(K.repeatDates({ date: '2024-02-28' }, { interval: 1, mode: 'until', until: '2024-03-01' }), ['2024-02-29', '2024-03-01']);
  assert.deepEqual(K.repeatDates({ date: '2026-12-31' }, { interval: 1, mode: 'count', count: 2 }), ['2027-01-01', '2027-01-02']);
  assert.deepEqual(K.repeatDates({ date: '2026-03-07' }, { interval: 1, mode: 'until', until: '2026-03-09' }), ['2026-03-08', '2026-03-09']);
});
test('future copies preserve display metadata but have independent identities and project links', () => {
  const model = C.blankModel(), e = make(model);
  const project = K.syncEvent(model, e.id, { kind: 'project', importance: 2 });
  const original = structuredClone(e);
  const copies = K.repeatEvent(model, e.id, { interval: 7, mode: 'count', count: 2 });
  assert.equal(model.calendarEvents.length, 3);
  assert.equal(new Set(model.calendarEvents.map(e => e.id)).size, 3);
  assert.deepEqual(e, original);
  assert.equal(model.projects.length, 1);
  for (const copy of copies) {
    assert.equal(copy.targetId, null);
    for (const key of ['title', 'priority', 'startTime', 'endTime', 'location', 'color']) assert.equal(copy[key], e[key]);
  }
  K.saveEvent(model, { title: '单独修改', date: copies[0].date, priority: 1 }, copies[0].id);
  K.deleteEvent(model, copies[1].id, false);
  assert.equal(e.title, original.title);
  assert.equal(project.title, original.title);
  assert.equal(C.validateModel(JSON.parse(JSON.stringify(model))).calendarEvents.length, 2);
});
test('invalid recurrence, overflow and exhausted capacity never produce partial copies', () => {
  const model = C.blankModel(), e = make(model);
  const before = JSON.stringify(model);
  for (const options of [
    { interval: 0, mode: 'count', count: 2 }, { interval: 1.5, mode: 'count', count: 2 },
    { interval: 1, mode: 'count', count: 0 }, { interval: 1, mode: 'count', count: 10001 },
    { interval: 1, mode: 'until', until: e.date }, { interval: 7, mode: 'until', until: '2026-10-20' },
    { interval: 1, mode: 'until', until: '2026-02-30' }, { interval: 1, mode: 'other', count: 2 }
  ]) { assert.throws(() => K.repeatEvent(model, e.id, options)); assert.equal(JSON.stringify(model), before); }
  const edgeModel = C.blankModel(), edge = make(edgeModel, '9999-12-30');
  assert.throws(() => K.repeatEvent(edgeModel, edge.id, { interval: 1, mode: 'count', count: 2 }));
  assert.equal(edgeModel.calendarEvents.length, 1);
  const full = C.blankModel(), seed = make(full);
  full.calendarEvents = Array.from({ length: C.LIMITS.calendarEvents }, (_, n) => ({ ...seed, id: 'event_' + n }));
  assert.throws(() => K.repeatEvent(full, 'event_0', { interval: 1, mode: 'count', count: 1 }), /10000/);
  assert.equal(full.calendarEvents.length, C.LIMITS.calendarEvents);
});
test('removing project item preserves calendar events and clears descendant links only', () => {
  const model = C.blankModel(), event = make(model);
  const project = K.syncEvent(model, event.id, { kind: 'project', importance: 2 });
  const stageEvent = make(model), stage = K.syncEvent(model, stageEvent.id, { kind: 'stage', projectId: project.id });
  const taskEvent = make(model); K.syncEvent(model, taskEvent.id, { kind: 'task', projectId: project.id, stageId: stage.id });
  const otherEvent = make(model), other = K.syncEvent(model, otherEvent.id, { kind: 'project', importance: 1 });
  K.removeEventFromProject(model, event.id);
  assert.equal(model.calendarEvents.length, 4);
  assert.deepEqual(model.projects.map(p => p.id), [other.id]);
  assert.equal(event.targetId, null);
  assert.equal(stageEvent.targetId, null);
  assert.equal(taskEvent.targetId, null);
  assert.equal(otherEvent.targetId, other.id);
  assert.equal(C.validateModel(model).calendarEvents.length, 4);
});
function toastRuntime() {
  let now = 0, next = 0;
  const timers = new Map(), classes = new Set();
  const el = { textContent: '', classList: { add: n => classes.add(n), remove: n => classes.delete(n), toggle: (n, on) => on ? classes.add(n) : classes.delete(n) } };
  const context = vm.createContext({ $: () => el, setTimeout: (f, ms) => { const id = ++next; timers.set(id, { f, at: now + ms }); return id; }, clearTimeout: id => timers.delete(id) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/records.js'), 'utf8'), context);
  return { el, classes, show: (text, error = false) => context.toast(text, error), advance(ms) {
    const target = now + ms;
    while (true) { const pending = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]; if (!pending) break; now = pending[1].at; timers.delete(pending[0]); pending[1].f(); }
    now = target;
  } };
}
test('toast remains for five seconds then fades and clears content', () => {
  const t = toastRuntime(); t.show('已保存'); t.advance(4999);
  assert.equal(t.el.textContent, '已保存'); assert.equal(t.classes.has('toast-fading'), false);
  t.advance(1); assert.equal(t.classes.has('toast-fading'), true);
  t.advance(350); assert.equal(t.el.textContent, '');
});
test('new toast cancels older fade timers and restarts five-second display', () => {
  const t = toastRuntime(); t.show('旧提示', true); t.advance(4000); t.show('新提示'); t.advance(1500);
  assert.equal(t.el.textContent, '新提示'); assert.equal(t.classes.has('toast-fading'), false); assert.equal(t.classes.has('error'), false);
  t.advance(3500); assert.equal(t.classes.has('toast-fading'), true); t.show('又一条'); t.advance(400);
  assert.equal(t.el.textContent, '又一条'); assert.equal(t.classes.has('toast-fading'), false);
});
