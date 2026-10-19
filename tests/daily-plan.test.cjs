'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const DAY = '2026-10-17';

function fixture() {
  const model = C.sampleModel(DAY);
  model.projects.push({
    id: 'p_auto', title: '优先级最高的独立项目', priority: 3,
    importance: 3, done: false, stages: []
  });
  return C.validateModel(model);
}

test('legacy plans migrate to automatic mode without filling manual slots', () => {
  const legacy = C.sampleModel(DAY);
  const selected = legacy.plans[DAY].selected.slice();
  const model = C.validateModel(JSON.parse(JSON.stringify(legacy)));
  assert.equal(model.plans[DAY].mode, 'auto');
  assert.deepEqual(model.plans[DAY].manualSelected, []);
  assert.deepEqual(model.plans[DAY].selected, selected);
});

test('manual choices never admit a fourth task or receive automatic projects', () => {
  const model = fixture();
  C.setPlanMode(model, DAY, 'manual');
  for (const id of ['s_proposal', 't_derivative', 't_exercises']) C.setManualTask(model, DAY, id, true);
  const before = model.plans[DAY].manualSelected.slice();
  assert.throws(() => C.setManualTask(model, DAY, 'p_auto', true), /最多选择三项/);
  assert.deepEqual(model.plans[DAY].manualSelected, before);
  C.syncAutoProjects(model, DAY);
  assert.deepEqual(model.plans[DAY].manualSelected, before);
  assert.equal(model.plans[DAY].selected.includes('p_auto'), true);
  C.setManualTask(model, DAY, 't_derivative', false);
  C.setManualTask(model, DAY, 'p_auto', true);
  assert.deepEqual(model.plans[DAY].manualSelected, ['s_proposal', 't_exercises', 'p_auto']);
});

test('manual drag order survives switching modes, backup round trips and other days', () => {
  const model = fixture();
  const automatic = C.syncAutoProjects(model, DAY).visible.slice();
  C.setPlanMode(model, DAY, 'manual');
  for (const id of ['t_exercises', 't_derivative', 's_proposal']) C.setManualTask(model, DAY, id, true);
  C.moveManualTask(model, DAY, 's_proposal', 0);
  const expected = ['s_proposal', 't_exercises', 't_derivative'];
  C.setPlanMode(model, DAY, 'auto');
  C.syncAutoProjects(model, DAY);
  assert.deepEqual(model.plans[DAY].visible, automatic);
  assert.deepEqual(model.plans[DAY].manualSelected, expected);
  C.setPlanMode(model, DAY, 'manual');
  const copy = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.equal(copy.plans[DAY].mode, 'manual');
  assert.deepEqual(copy.plans[DAY].manualSelected, expected);
  const before = JSON.stringify(copy.plans[DAY]);
  assert.deepEqual(C.getPlan(copy, '2026-10-18').manualSelected, []);
  C.setPlanMode(copy, '2026-10-18', 'manual');
  assert.equal(JSON.stringify(copy.plans[DAY]), before);
});

test('completion stays in its manual position and removal does not refill the slot', () => {
  const model = fixture();
  C.setPlanMode(model, DAY, 'manual');
  C.setManualTask(model, DAY, 's_proposal', true);
  C.setManualTask(model, DAY, 't_exercises', true);
  C.setCompletion(model, 's_proposal', true, '2026-10-17T03:00:00.000Z');
  C.syncAutoProjects(model, DAY);
  assert.deepEqual(model.plans[DAY].manualSelected, ['s_proposal', 't_exercises']);
  assert.throws(() => C.setManualTask(model, DAY, 't_notes', true), /尚未完成/);
  C.setCompletion(model, 's_proposal', false);
  assert.deepEqual(model.plans[DAY].manualSelected, ['s_proposal', 't_exercises']);
  C.setManualTask(model, DAY, 's_proposal', false);
  C.syncAutoProjects(model, DAY);
  assert.deepEqual(model.plans[DAY].manualSelected, ['t_exercises']);
});

test('deleted or split parent leaves are cleaned without picking their children', () => {
  const model = fixture();
  C.setPlanMode(model, DAY, 'manual');
  for (const id of ['p_auto', 't_derivative', 's_proposal']) C.setManualTask(model, DAY, id, true);
  model.projects.find(p => p.id === 'p_auto').stages.push({
    id: 's_new', title: '新阶段', priority: null, due: null, done: false, tasks: []
  });
  model.projects[0].stages[1].tasks = [];
  const copy = C.validateModel(model);
  assert.deepEqual(copy.plans[DAY].manualSelected, ['s_proposal']);
  C.syncAutoProjects(copy, DAY);
  assert.deepEqual(copy.plans[DAY].manualSelected, ['s_proposal']);
});

test('invalid manual imports and reorder commands fail without changing the plan', () => {
  const model = fixture();
  C.setManualTask(model, DAY, 't_exercises', true);
  const before = JSON.stringify(model);
  for (const position of [-1, 1, 1.5, '0']) assert.throws(() => C.moveManualTask(model, DAY, 't_exercises', position));
  assert.throws(() => C.moveManualTask(model, DAY, 'missing', 0));
  assert.throws(() => C.setManualTask(model, DAY, 's_limits', true));
  assert.throws(() => C.setPlanMode(model, DAY, 'unexpected'));
  assert.equal(JSON.stringify(model), before);
  for (const extra of [{ mode: 'unexpected' }, { mode: null }, { manualSelected: 't_exercises' }, { manualSelected: ['t_exercises', 't_derivative', 's_proposal', 'p_auto'] }, { manualSelected: ['../file'] }]) {
    const invalid = JSON.parse(before);
    Object.assign(invalid.plans[DAY], extra);
    assert.throws(() => C.validateModel(invalid));
  }
});
