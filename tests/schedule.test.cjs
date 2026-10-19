const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const K = require('../src/calendar-core.js');
const DAY = '2026-10-19';
const create = (model, values = {}) => K.saveEvent(model, { title: '日程', date: DAY, priority: 2, ...values });

test('week timetable anchors Monday and handles Sunday, leap day and year rollover', () => {
  assert.deepEqual(K.weekDays('2026-10-25'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(K.weekDays('2026-01-01')[0], '2025-12-29');
  assert.ok(K.weekDays('2024-02-29').includes('2024-02-29'));
  assert.throws(() => K.weekDays('2026-02-30'));
});

test('legacy events become all-day and timed event metadata survives backup and linked edits', () => {
  const model = C.blankModel();
  const event = create(model);
  for (const key of ['startTime', 'endTime', 'location', 'color']) delete event[key];
  const old = C.validateModel(model).calendarEvents[0];
  assert.equal(old.startTime, null);
  assert.equal(old.endTime, null);
  assert.equal(old.location, '');
  assert.equal(old.color, 'sage');
  const project = K.syncEvent(model, event.id, { kind: 'project', importance: 2 });
  K.saveEvent(model, { title: '讲座', date: DAY, priority: 3, startTime: '09:30', endTime: '11:00', location: ' 三教 2102 ', color: 'lavender' }, event.id);
  const restored = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.equal(restored.calendarEvents[0].startTime, '09:30');
  assert.equal(restored.calendarEvents[0].endTime, '11:00');
  assert.equal(restored.calendarEvents[0].location, '三教 2102');
  assert.equal(restored.calendarEvents[0].color, 'lavender');
  assert.equal(project.title, '讲座');
  K.saveEvent(model, { title: '改名', date: DAY, priority: 1 }, event.id);
  assert.equal(event.startTime, '09:30', 'callers that do not edit time preserve the schedule');
  K.saveEvent(model, { title: '全天', date: DAY, priority: 1, startTime: null, endTime: null }, event.id);
  assert.equal(event.endTime, null);
});

test('schedule accepts partial times but rejects reversed and malformed times atomically', () => {
  const model = C.blankModel();
  const event = create(model, { startTime: '23:00', endTime: '24:00' });
  assert.equal(K.scheduleLayout(model.calendarEvents)[0].end, 1440);
  const before = JSON.stringify(model);
  for (const values of [
    { startTime: '10:00', endTime: '09:00' }, { startTime: '09:00', endTime: '09:00' },
    { startTime: '24:00', endTime: '24:00' }, { startTime: '9:00', endTime: '10:00' },
    { startTime: '09:00', endTime: '24:01' }, { color: 'red;position:fixed' }, { location: {} }
  ]) {
    assert.throws(() => K.saveEvent(model, { title: '错误', date: DAY, priority: 2, ...values }, event.id));
    assert.equal(JSON.stringify(model), before);
    const imported = JSON.parse(before);
    Object.assign(imported.calendarEvents[0], values);
    assert.throws(() => C.validateModel(imported));
  }
});

test('overlapping schedules share columns; adjacent and separate groups use full width', () => {
  const model = C.blankModel();
  create(model);
  const a = create(model, { startTime: '09:00', endTime: '11:00' });
  const b = create(model, { startTime: '09:30', endTime: '10:00' });
  const c = create(model, { startTime: '10:00', endTime: '11:30' });
  const d = create(model, { startTime: '11:30', endTime: '12:00' });
  const before = JSON.stringify(model);
  const layout = K.scheduleLayout(model.calendarEvents);
  assert.equal(layout.length, 4);
  const get = event => layout.find(item => item.event.id === event.id);
  assert.equal(get(a).columns, 2);
  assert.equal(get(b).column, get(c).column);
  assert.equal(get(d).columns, 1);
  for (const x of layout) for (const y of layout) {
    if (x !== y && x.start < y.end && y.start < x.end) assert.notEqual(x.column, y.column);
  }
  assert.equal(JSON.stringify(model), before);
});


test('partial times survive backup and project linking without becoming timetable blocks', () => {
  const model = C.blankModel();
  const a = create(model, { startTime: '09:17', endTime: null });
  const b = create(model, { startTime: null, endTime: '10:43' });
  assert.equal(K.scheduleLayout(model.calendarEvents).length, 0);
  const p = K.syncEvent(model, a.id, { kind: 'project', importance: 2 });
  assert.equal(p.title, a.title);
  const restored = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.equal(restored.calendarEvents[0].startTime, '09:17');
  assert.equal(restored.calendarEvents[1].endTime, '10:43');
  assert.equal(restored.calendarEvents[0].targetId, p.id);
  K.saveEvent(model, { title: b.title, date: DAY, priority: 2, startTime: '09:17' }, b.id);
  assert.equal(K.scheduleLayout(model.calendarEvents).length, 1);
});

test('compact timetable maps 06:00–24:00 to half-height hours and rounds to minutes', () => {
  assert.equal(K.SCHEDULE.hourHeight, 36);
  assert.equal(K.scheduleMinute(0), 360);
  assert.equal(K.scheduleMinute(36), 420);
  assert.equal(K.scheduleMinute(118.2), 557);
  assert.equal(K.scheduleMinute(-100), 360);
  assert.equal(K.scheduleMinute(9000), 1440);
  assert.equal(K.minuteTime(557), '09:17');
  assert.equal(K.minuteTime(1440), '24:00');
  assert.throws(() => K.minuteTime(1441));
});

test('selection, resizing and moves preserve minute precision and valid day bounds', () => {
  assert.deepEqual(K.scheduleRange('create', 557, 558, 557, 643), { start: 557, end: 643 });
  assert.deepEqual(K.scheduleRange('create', 643, 644, 643, 557), { start: 557, end: 643 });
  assert.deepEqual(K.scheduleRange('create', 1440, 1441, 1440, 1440), { start: 1439, end: 1440 });
  assert.deepEqual(K.scheduleRange('start', 557, 643, 557, 700), { start: 642, end: 643 });
  assert.deepEqual(K.scheduleRange('end', 557, 643, 643, 400), { start: 557, end: 558 });
  assert.deepEqual(K.scheduleRange('move', 557, 643, 580, 600), { start: 577, end: 663 });
  assert.deepEqual(K.scheduleRange('move', 557, 643, 580, 0), { start: 360, end: 446 });
  assert.deepEqual(K.scheduleRange('move', 557, 643, 580, 1800), { start: 1354, end: 1440 });
});

test('drag rescheduling preserves notes, color, priority and project identity and updates linked due date', () => {
  const model = C.blankModel();
  const event = create(model, { startTime: '09:17', endTime: '10:43', location: '备注内容', color: 'rose' });
  const project = K.syncEvent(model, event.id, { kind: 'project', importance: 3 });
  const id = event.targetId;
  K.rescheduleEvent(model, event.id, '2026-10-20', { start: 577, end: 663 });
  assert.equal(event.startTime, '09:37');
  assert.equal(event.endTime, '11:03');
  assert.equal(event.location, '备注内容');
  assert.equal(event.color, 'rose');
  assert.equal(event.targetId, id);
  assert.equal(project.due, '2026-10-20');
  const before = JSON.stringify(model);
  assert.throws(() => K.rescheduleEvent(model, event.id, DAY, { start: 700, end: 600 }));
  assert.equal(JSON.stringify(model), before);
});
