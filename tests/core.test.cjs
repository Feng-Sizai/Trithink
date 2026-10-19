'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../src/core.js');

// Task inheritance, shared sorting, validation, and actionable leaf rules.
test('model validation preserves selected work and inheritance after a round trip', () => {
  const original = Core.sampleModel('2026-10-17');
  const model = Core.validateModel(JSON.parse(JSON.stringify(original)));
  const tasks = Core.flattenTasks(model);
  const exercise = tasks.find(task => task.id === 't_exercises');
  assert.equal(exercise.priority, 3);
  assert.equal(exercise.importance, 3);
  assert.equal(exercise.due, '2026-10-20');
  assert.equal(tasks.find(task => task.id === 't_derivative').priority, 2);
  assert.equal(tasks.find(task => task.id === 's_proposal').isStage, true);
  assert.equal(tasks.some(task => task.id === 's_limits'), false);
  assert.equal(Core.completedCount(model), 1);
  assert.deepEqual(Core.getPlan(model, '2026-10-18'), {
    selected: [],
    visible: [],
    excludedProjects: [],
    mode: 'auto',
    manualSelected: []
  });
  assert.equal(Core.getPlan(model, '2026-10-17').selected.length, 3);
});
test('priority wins before deadline and legacy importance is ignored', () => {
  const records = [{
    id: 'urgent',
    priority: 3,
    importance: 1,
    due: '2029-01-01'
  }, {
    id: 'important',
    priority: 2,
    importance: 3,
    due: '2027-01-01'
  }, {
    id: 'earlier',
    priority: 2,
    importance: 2,
    due: '2026-01-01'
  }, {
    id: 'later',
    priority: 2,
    importance: 2,
    due: '2026-12-01'
  }, {
    id: 'noDate',
    priority: 2,
    importance: 2,
    due: null
  }];
  const shuffled = [records[4], records[3], records[2], records[1], records[0]];
  assert.deepEqual(Core.sortTasks(shuffled).map(task => task.id), ['urgent', 'earlier', 'later', 'important', 'noDate']);
  assert.equal(shuffled[0].id, 'noDate');
});
test('undated work sorts after every valid date, including the final supported date', () => {
  const records = [{
    id: 'undated',
    priority: 2,
    importance: 2,
    due: null
  }, {
    id: 'finalDate',
    priority: 2,
    importance: 2,
    due: '9999-12-31'
  }, {
    id: 'earlierDate',
    priority: 2,
    importance: 2,
    due: '2026-10-17'
  }];
  assert.equal(Core.isDate('9999-12-31'), true);
  assert.deepEqual(Core.sortTasks(records).map(task => task.id), ['earlierDate', 'finalDate', 'undated']);
});
test('explicit overrides are used; resetting to null restores inheritance', () => {
  const model = Core.sampleModel('2026-10-17');
  const task = model.projects[0].stages[0].tasks[1];
  task.priority = 1;
  task.due = '2026-10-18';
  assert.equal(Core.flattenTasks(model).find(task => task.id === 't_exercises').priority, 1);
  assert.equal(Core.flattenTasks(model).find(task => task.id === 't_exercises').due, '2026-10-18');
  task.priority = null;
  task.due = null;
  assert.equal(Core.flattenTasks(model).find(task => task.id === 't_exercises').priority, 3);
  assert.equal(Core.flattenTasks(model).find(task => task.id === 't_exercises').due, '2026-10-20');
});
test('invalid versions, duplicate IDs, impossible dates and dangerous keys are rejected', () => {
  const mutated = mutation => {
    const model = Core.sampleModel('2026-10-17');
    mutation(model);
    return model;
  };
  assert.throws(() => Core.validateModel(mutated(model => {
    model.schemaVersion = 2;
  })));
  assert.throws(() => Core.validateModel(mutated(model => {
    model.projects[0].stages[0].tasks[0].id = model.projects[0].id;
  })));
  assert.throws(() => Core.validateModel(mutated(model => {
    model.projects[0].stages[0].due = '2026-02-29';
  })));
  assert.throws(() => Core.validateModel(JSON.parse('{"schemaVersion":1,"__proto__":{"polluted":true}}')));
  assert.equal({}.polluted, undefined);
  assert.equal(Core.isDate('2028-02-29'), true);
  assert.equal(Core.isDate('2100-02-29'), false);
  assert.equal(Core.isDate('2026-04-31'), false);
});
test('notebook imports retain formatting and cannot retain active markup or attributes', () => {
  const model = Core.blankModel();
  model.notebook.html = '<h1 onclick="alert(1)">标题</h1><p>正文 &amp; 内容 <strong>加粗</strong></p><script>alert(1)</script><img src=x onerror=alert(2)><iframe src="https://example.com"></iframe>';
  const clean = Core.validateModel(model).notebook.html;
  assert.equal(clean, '<h1>标题</h1><p>正文 &amp; 内容 <strong>加粗</strong></p>');
  assert.equal(Core.sanitizeNotebookHtml(clean), clean);
});
test('deleted work is removed from saved daily plan references without changing other days', () => {
  const model = Core.sampleModel('2026-10-17');
  model.projects[0].stages[0].tasks.pop();
  const valid = Core.validateModel(model);
  assert.deepEqual(valid.plans['2026-10-17'].selected, ['t_derivative', 's_proposal']);
  assert.deepEqual(valid.plans['2026-10-17'].visible, ['t_derivative', 's_proposal']);
  assert.deepEqual(Core.getRoutine(valid, '2026-10-18'), {
    sleepTime: '',
    drinks: {
      coffee: 0,
      milkTea: 0,
      other: 0
    }
  });
});

// Isolated storage contexts exercise recovery without using real browser data.
function storageHarness() {
  const values = new Map();
  let blocked = false;
  const context = vm.createContext({
    localStorage: {
      getItem(key) {
        if (blocked) throw new Error('blocked');
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        if (blocked) throw new Error('blocked');
        values.set(key, value);
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/storage.js'), 'utf8'), context);
  const within = code => vm.runInContext(code, context);
  return {
    values,
    within,
    setBlocked(value) {
      blocked = value;
    }
  };
}
test('storage recovers from a corrupted main record using last good backup', () => {
  const harness = storageHarness();
  assert.equal(harness.within('ThreeThingsStorage.load().isNew'), true);
  assert.equal(harness.within('ThreeThingsStorage.save(ThreeThingsCore.sampleModel()).persistent'), true);
  harness.within('var updated = ThreeThingsStorage.load().model; updated.projects[0].title = "新版标题"; ThreeThingsStorage.save(updated);');
  harness.values.set('three-things-trial:v1', '{broken json');
  assert.equal(harness.within('ThreeThingsStorage.load().recovered'), true);
  assert.equal(harness.within('ThreeThingsStorage.load().model.projects[0].title'), '高等数学期末复习');
});
test('storage failure retains session data and reports that persistence is unavailable', () => {
  const harness = storageHarness();
  harness.setBlocked(true);
  assert.equal(harness.within('ThreeThingsStorage.save(ThreeThingsCore.sampleModel()).ok'), true);
  assert.equal(harness.within('ThreeThingsStorage.load().persistent'), false);
  assert.equal(harness.within('ThreeThingsStorage.load().model.projects.length'), 2);
  assert.equal(harness.within('ThreeThingsStorage.save({schemaVersion:99}).ok'), false);
});
test('storage import/export performs schema and markup validation', () => {
  const harness = storageHarness();
  assert.equal(harness.within('ThreeThingsStorage.importJSON(ThreeThingsStorage.exportJSON(ThreeThingsCore.sampleModel())).schemaVersion'), 1);
  assert.throws(() => harness.within('ThreeThingsStorage.importJSON("{}")'));
});
test('large Chinese backups round-trip when byte size exceeds the old 6 MiB gate', () => {
  const harness = storageHarness();
  const result = harness.within(`
    var large = ThreeThingsCore.blankModel();
    large.projects = [{ id: 'p_large', title: '大型项目', priority: 2, importance: 2, stages: [{
      id: 's_large', title: '大型阶段', priority: null, due: null, done: false,
      tasks: Array.from({length:10000}, (_, index) => ({id:'t_'+index, title:'任'.repeat(200), priority:null, due:null, done:false}))
    }] }];
    large.notebook.html = '<p>' + '笔'.repeat(500000) + '</p>';
    var savedLarge = ThreeThingsStorage.save(large);
    var exportedLarge = ThreeThingsStorage.exportJSON(large);
    var importedLarge = ThreeThingsStorage.importJSON(exportedLarge);
    ({ ok:savedLarge.ok, persistent:savedLarge.persistent, json:exportedLarge, count:importedLarge.projects[0].stages[0].tasks.length });
  `);
  assert.equal(result.ok, true);
  assert.equal(result.persistent, true);
  assert.ok(Buffer.byteLength(result.json, 'utf8') > 6 * 1024 * 1024);
  assert.ok(result.json.length < Core.LIMITS.json);
  assert.equal(result.count, 10000);
});
test('over-cap save/export fail before changing disk or the last in-memory model', () => {
  const harness = storageHarness();
  harness.within('ThreeThingsStorage.save(ThreeThingsCore.sampleModel());');
  const diskBefore = new Map(harness.values);
  const result = harness.within(`
    var overCap = ThreeThingsCore.blankModel();
    overCap.projects = [{ id:'p_cap', title:'容量测试', priority:2, importance:2, stages:[] }];
    var capStages = overCap.projects[0].stages;
    for(var i=0;i<10000;i++) capStages.push({id:'s_'+String(i).padStart(75,'0'), title:'阶'.repeat(200),priority:null,due:null,done:false,tasks:[]});
    for(var i=0;i<10000;i++) capStages[0].tasks.push({id:'t_'+String(i).padStart(75,'0'), title:'任'.repeat(200),priority:null,due:null,done:false});
    var capLeaves = ThreeThingsCore.flattenTasks(overCap).slice(0,19990).map(item=>item.id);
    for(var i=0;i<5;i++) overCap.plans['2026-10-'+String(17+i)] = {selected:capLeaves.slice(), visible:capLeaves.slice(0,3)};
    var overCapLength = JSON.stringify(ThreeThingsCore.validateModel(overCap)).length;
    var capSave = ThreeThingsStorage.save(overCap);
    ({ length:overCapLength, save:capSave });
  `);
  assert.ok(result.length > Core.LIMITS.json);
  assert.equal(result.save.ok, false);
  assert.equal(result.save.persistent, false);
  assert.match(result.save.error, /超出/);
  assert.deepEqual(harness.values, diskBefore);
  assert.throws(() => harness.within('ThreeThingsStorage.exportJSON(overCap)'), /超出/);
  harness.setBlocked(true);
  assert.equal(harness.within('ThreeThingsStorage.load().model.projects[0].title'), '高等数学期末复习');
});

// Automatic selection of projects that have not yet been split into stages.
function emptyProject(id, priority = 3, importance = 3) {
  return {
    id,
    title: '独立项目 ' + id,
    priority,
    importance,
    done: false,
    stages: []
  };
}
test('a project without stages is an executable leaf with its own completion state', () => {
  const model = Core.blankModel();
  model.projects.push(emptyProject('p_empty'));
  assert.deepEqual(Core.flattenTasks(model), [{
    id: 'p_empty',
    projectId: 'p_empty',
    stageId: null,
    title: '独立项目 p_empty',
    priority: 3,
    importance: 3,
    due: null,
    dueTime: null,
    done: false,
    completedAt: null,
    isProject: true,
    isStage: false,
    projectTitle: '独立项目 p_empty',
    stageTitle: ''
  }]);
  model.projects[0].done = true;
  assert.equal(Core.completedCount(model), 1);
  assert.equal(Core.flattenTasks(model, {
    includeDone: false
  }).length, 0);
  model.projects[0].stages.push({
    id: 's_split',
    title: '拆分阶段',
    priority: null,
    due: null,
    done: false,
    tasks: []
  });
  assert.equal(Core.flattenTasks(model)[0].id, 's_split');
  assert.equal(Core.flattenTasks(model)[0].isProject, false);
  assert.equal(Core.completedCount(model), 0);
});
test('automatic projects compete with manually selected tasks by normal priority rules', () => {
  const model = Core.sampleModel('2026-10-17');
  model.projects.push(emptyProject('p_first', 3, 3), emptyProject('p_later', 1, 1));
  const plan = Core.syncAutoProjects(model, '2026-10-17');
  assert.deepEqual(plan.selected, ['t_exercises', 't_derivative', 's_proposal', 'p_first', 'p_later']);
  assert.deepEqual(plan.visible, ['t_exercises', 'p_first', 's_proposal']);
  Core.syncAutoProjects(model, '2026-10-17');
  assert.equal(plan.selected.filter(id => id === 'p_first').length, 1);
});
test('automatic empty projects use stars then deadlines against selected tasks', () => {
  const model = Core.blankModel();
  model.projects = [{
    id: 'p_manual',
    title: '手动选择的项目',
    priority: 2,
    importance: 3,
    done: false,
    stages: [{
      id: 's_manual',
      title: '手动阶段',
      priority: null,
      due: '2026-10-20',
      done: false,
      tasks: [{
        id: 't_later',
        title: '较晚截止',
        priority: null,
        due: '2026-10-22',
        done: false
      }, {
        id: 't_earlier',
        title: '较早截止',
        priority: null,
        due: '2026-10-18',
        done: false
      }]
    }]
  }, emptyProject('p_auto3', 3, 1), emptyProject('p_auto2high', 2, 3), emptyProject('p_auto2low', 2, 1), emptyProject('p_auto1', 1, 3)];
  model.plans['2026-10-17'] = {
    selected: ['t_later', 't_earlier'],
    visible: ['t_later', 't_earlier'],
    excludedProjects: []
  };
  const plan = Core.syncAutoProjects(model, '2026-10-17');
  const selected = new Set(plan.selected);
  assert.deepEqual(Core.sortTasks(Core.flattenTasks(model).filter(task => selected.has(task.id))).map(task => task.id), ['p_auto3', 't_earlier', 't_later', 'p_auto2high', 'p_auto2low', 'p_auto1']);
  assert.deepEqual(plan.visible, ['p_auto3', 't_earlier', 't_later']);
});
test('version 1 backups without project completion or exclusions remain compatible', () => {
  const old = Core.sampleModel('2026-10-17');
  old.projects.push(emptyProject('p_legacy'));
  for (const project of old.projects) delete project.done;
  delete old.plans['2026-10-17'].excludedProjects;
  const valid = Core.validateModel(old);
  assert.equal(valid.schemaVersion, 1);
  assert.equal(valid.projects.every(project => project.done === false), true);
  assert.deepEqual(valid.plans['2026-10-17'].excludedProjects, []);
  valid.projects[2].done = true;
  assert.equal(Core.validateModel(valid).projects[2].done, true);
  old.projects[0].done = 'yes';
  assert.throws(() => Core.validateModel(old));
});
test('completed visible cards wait for explicit continuation while automatic projects queue', () => {
  const model = Core.sampleModel('2026-10-17');
  model.projects[0].stages[0].tasks[1].done = true;
  model.projects.push(emptyProject('p_new'));
  const originalVisible = model.plans['2026-10-17'].visible.slice();
  const plan = Core.syncAutoProjects(model, '2026-10-17');
  assert.deepEqual(plan.visible, originalVisible);
  assert.equal(plan.selected.includes('p_new'), true);
  plan.visible = []; // The controller explicitly discards completed cards on Continue.
  Core.syncAutoProjects(model, '2026-10-17');
  assert.equal(plan.visible[0], 'p_new');
  assert.equal(plan.visible.includes('t_exercises'), false);
});
test('manual project exclusions and automatic selection are local to the requested day', () => {
  const model = Core.sampleModel('2026-10-17');
  model.projects.push(emptyProject('p_skip'), emptyProject('p_done'));
  model.projects[3].done = true;
  const oldDay = JSON.stringify(model.plans['2026-10-17']);
  const current = Core.getPlan(model, '2026-10-18');
  current.excludedProjects = ['p_skip'];
  Core.syncAutoProjects(model, '2026-10-18');
  assert.deepEqual(current.selected, []);
  assert.deepEqual(current.visible, []);
  assert.equal(JSON.stringify(model.plans['2026-10-17']), oldDay);
  const tomorrow = Core.syncAutoProjects(model, '2026-10-19');
  assert.deepEqual(tomorrow.selected, ['p_skip']);
  assert.deepEqual(tomorrow.excludedProjects, []);
  assert.equal(tomorrow.selected.includes('t_derivative'), false);
  current.excludedProjects.push('t_derivative', 'missing');
  assert.deepEqual(Core.validateModel(model).plans['2026-10-18'].excludedProjects, ['p_skip']);
});

// Persistent completion timestamps and aggregated project/stage history.
const TIME_1 = '2026-10-17T01:00:00.000Z';
const TIME_2 = '2026-10-18T02:00:00.000Z';
const TIME_3 = '2026-10-19T03:00:00.000Z';
function historyModel() {
  const model = Core.blankModel();
  model.projects = [{
    id: 'p_history',
    title: '历史项目',
    priority: 3,
    importance: 2,
    done: false,
    stages: [{
      id: 's_first',
      title: '第一阶段',
      priority: null,
      due: null,
      done: false,
      tasks: [{
        id: 't_first',
        title: '任务一',
        priority: null,
        due: null,
        done: false
      }, {
        id: 't_second',
        title: '任务二',
        priority: null,
        due: null,
        done: false
      }]
    }, {
      id: 's_second',
      title: '第二阶段',
      priority: 2,
      due: null,
      done: false,
      tasks: [{
        id: 't_third',
        title: '任务三',
        priority: null,
        due: null,
        done: false
      }, {
        id: 't_fourth',
        title: '任务四',
        priority: null,
        due: null,
        done: false
      }]
    }]
  }];
  return model;
}
test('completion actions persist timestamps, preserve repeated completion, and reset on undo', () => {
  const model = Core.blankModel();
  model.projects.push(emptyProject('p_timestamp'));
  Core.setCompletion(model, 'p_timestamp', true, TIME_1);
  assert.equal(model.projects[0].completedAt, TIME_1);
  Core.setCompletion(model, 'p_timestamp', true, TIME_2);
  assert.equal(model.projects[0].completedAt, TIME_1);
  assert.equal(Core.flattenTasks(model)[0].completedAt, TIME_1);
  const exported = JSON.stringify(Core.validateModel(model));
  assert.equal(Core.validateModel(JSON.parse(exported)).projects[0].completedAt, TIME_1);
  Core.setCompletion(model, 'p_timestamp', false, TIME_2);
  assert.equal(model.projects[0].completedAt, null);
  assert.equal(Core.completedHistory(model).length, 0);
  Core.setCompletion(model, 'p_timestamp', true, TIME_3);
  assert.equal(Core.completedHistory(model)[0].completedAt, TIME_3);
});
test('history aggregates whole projects and completed stages, retaining partial stage task dates', () => {
  const model = historyModel();
  Core.setCompletion(model, 't_first', true, TIME_1);
  Core.setCompletion(model, 't_second', true, TIME_2);
  Core.setCompletion(model, 't_third', true, TIME_3);
  const partial = Core.completedHistory(model);
  assert.deepEqual(partial.map(entry => [entry.id, entry.kind, entry.completedAt]), [['t_third', 'task', TIME_3], ['s_first', 'stage', TIME_2]]);
  assert.deepEqual(partial[1].leafIds, ['t_first', 't_second']);
  assert.equal(model.projects[0].done, false);
  assert.equal(model.projects[0].completedAt, null);
  Core.setCompletion(model, 't_fourth', true, '2026-10-20T04:00:00.000Z');
  const full = Core.completedHistory(model);
  assert.equal(full.length, 1);
  assert.equal(full[0].kind, 'project');
  assert.equal(full[0].completedAt, '2026-10-20T04:00:00.000Z');
  assert.deepEqual(full[0].leafIds, ['t_first', 't_second', 't_third', 't_fourth']);
  assert.equal(full[0].leafCount, 4);
  assert.equal(Core.completedCount(model), 4);
  assert.equal(Core.validateModel(model).projects[0].completedAt, full[0].completedAt);
});
test('legacy completed records stay unknown without inventing historical timestamps', () => {
  const model = historyModel();
  for (const stage of model.projects[0].stages) for (const task of stage.tasks) task.done = true;
  const valid = Core.validateModel(model);
  assert.equal(valid.projects[0].done, true);
  assert.equal(valid.projects[0].completedAt, null);
  assert.equal(Core.completedHistory(valid)[0].completedAt, null);
  Core.setCompletion(valid, 't_first', true, TIME_3);
  assert.equal(valid.projects[0].completedAt, null);
  assert.equal(valid.projects[0].stages[0].tasks[0].completedAt, null);
});
test('finishing the final pending child gives legacy mixed-time ancestors a known current date', () => {
  const model = historyModel();
  for (const stage of model.projects[0].stages) for (const task of stage.tasks) task.done = true;
  model.projects[0].stages[1].tasks[1].done = false;
  const valid = Core.validateModel(model);
  Core.setCompletion(valid, 't_fourth', true, TIME_3);
  assert.equal(valid.projects[0].stages[1].completedAt, TIME_3);
  assert.equal(valid.projects[0].completedAt, TIME_3);
  assert.equal(valid.projects[0].stages[0].completedAt, null);
  assert.equal(Core.completedHistory(valid)[0].completedAt, TIME_3);
  const roundTrip = Core.validateModel(JSON.parse(JSON.stringify(valid)));
  assert.equal(Core.completedHistory(roundTrip)[0].completedAt, TIME_3);
});
test('aggregate undo clears descendants and ancestor dates, and recompletion records the new action', () => {
  const model = historyModel();
  Core.setCompletion(model, 'p_history', true, TIME_1);
  assert.equal(model.projects[0].completedAt, TIME_1);
  Core.setCompletion(model, 't_second', false, TIME_2);
  assert.equal(model.projects[0].done, false);
  assert.equal(model.projects[0].completedAt, null);
  assert.equal(model.projects[0].stages[0].completedAt, null);
  Core.setCompletion(model, 't_second', true, TIME_3);
  assert.equal(model.projects[0].completedAt, TIME_3);
  Core.setCompletion(model, 's_first', false, TIME_3);
  assert.equal(model.projects[0].stages[0].tasks.every(task => !task.done && task.completedAt === null), true);
  assert.equal(model.projects[0].stages[1].completedAt, TIME_1);
  assert.deepEqual(Core.completedHistory(model).map(entry => entry.id), ['s_second']);
  Core.setCompletion(model, 'p_history', false, TIME_3);
  assert.equal(Core.completedHistory(model).length, 0);
});
test('timestamps require real UTC ISO dates and unfinished records cannot retain completion times', () => {
  const model = historyModel();
  model.projects[0].stages[0].tasks[0].completedAt = TIME_1;
  assert.equal(Core.validateModel(model).projects[0].stages[0].tasks[0].completedAt, null);
  for (const invalid of ['2026-02-30T01:00:00.000Z', '2026-10-17T24:00:00.000Z', '2026-10-17T01:00:00+08:00', 'yesterday']) {
    model.projects[0].stages[0].tasks[0].completedAt = invalid;
    assert.throws(() => Core.validateModel(model));
  }
  assert.throws(() => Core.setCompletion(historyModel(), 't_first', true, 'not-a-date'));
  assert.throws(() => Core.setCompletion(historyModel(), 'missing', true, TIME_1));
});
test('deleting pending children derives available dates without inventing a deletion-time completion', () => {
  const unknown = historyModel();
  unknown.projects[0].stages = [unknown.projects[0].stages[0]];
  unknown.projects[0].stages[0].tasks[0].done = true;
  // An old stale parent stamp must not survive its explicit unfinished state.
  unknown.projects[0].completedAt = TIME_3;
  unknown.projects[0].stages[0].completedAt = TIME_3;
  unknown.projects[0].stages[0].tasks.pop();
  const validUnknown = Core.validateModel(unknown);
  assert.equal(validUnknown.projects[0].completedAt, null);
  assert.equal(validUnknown.projects[0].stages[0].completedAt, null);
  const known = historyModel();
  known.projects[0].stages = [known.projects[0].stages[0]];
  Core.setCompletion(known, 't_first', true, TIME_1);
  known.projects[0].stages[0].tasks.pop();
  assert.equal(Core.validateModel(known).projects[0].completedAt, TIME_1);
});

// Dated notebook records, pinning, safe content, and atomic capacity checks.
test('legacy notebook drafts migrate without creating dated history or losing existing content', () => {
  const model = Core.blankModel();
  model.notebook = {
    html: '<h1>原有标题</h1><p>尚未归档的正文</p>'
  };
  const valid = Core.validateModel(model);
  assert.equal(valid.schemaVersion, 1);
  assert.equal(valid.notebook.html, model.notebook.html);
  assert.deepEqual(valid.notebook.entries, []);
  assert.equal(valid.notebook.activeEntryId, null);
});
test('notebook creation preserves draft and date; edits update only changed content with clock guard', () => {
  const model = Core.blankModel();
  model.notebook.html = '<p>保留的草稿</p>';
  const entry = Core.createNotebookEntry(model, undefined, TIME_1);
  assert.equal(entry.html, model.notebook.html);
  assert.equal(model.notebook.activeEntryId, entry.id);
  assert.equal(entry.createdAt, TIME_1);
  assert.equal(entry.updatedAt, TIME_1);
  Core.updateNotebookEntry(model, entry.id, '<h1>新标题</h1><p>修改正文</p>', TIME_3);
  assert.equal(entry.createdAt, TIME_1);
  assert.equal(entry.updatedAt, TIME_3);
  Core.updateNotebookEntry(model, entry.id, entry.html, '2026-10-21T00:00:00.000Z');
  assert.equal(entry.updatedAt, TIME_3);
  Core.updateNotebookEntry(model, entry.id, '<p><br></p>', '2025-01-01T00:00:00.000Z');
  assert.equal(entry.updatedAt, TIME_1);
  assert.equal(model.notebook.html, '<p>保留的草稿</p>');
  assert.throws(() => Core.createNotebookEntry(model, '<p> &nbsp; </p>', TIME_2), /先写下内容/);
  assert.throws(() => Core.createNotebookEntry(model, '<p>&#32;&#x200b;</p>', TIME_2), /先写下内容/);
  assert.equal(model.notebook.entries.length, 1);
});
test('notebook pinning sorts pinned first and then creation date without reordering stored records', () => {
  const model = Core.blankModel();
  const first = Core.createNotebookEntry(model, '<p>较早</p>', TIME_1);
  const second = Core.createNotebookEntry(model, '<p>较晚</p>', TIME_2);
  const third = Core.createNotebookEntry(model, '<p>最新</p>', TIME_3);
  Core.toggleNotebookPin(model, first.id);
  assert.deepEqual(Core.sortedNotebookEntries(model).map(entry => entry.id), [first.id, third.id, second.id]);
  Core.toggleNotebookPin(model, second.id);
  assert.deepEqual(Core.sortedNotebookEntries(model).map(entry => entry.id), [second.id, first.id, third.id]);
  assert.deepEqual(model.notebook.entries.map(entry => entry.id), [first.id, second.id, third.id]);
  assert.equal(first.updatedAt, TIME_1);
  Core.toggleNotebookPin(model, first.id);
  assert.equal(first.pinned, false);
});
test('deleting a notebook entry affects only that entry and preserves the separate draft', () => {
  const model = Core.blankModel();
  model.notebook.html = '<p>草稿不能被删除操作覆盖</p>';
  const first = Core.createNotebookEntry(model, '<p>保留记录</p>', TIME_1);
  const second = Core.createNotebookEntry(model, '<p>删除记录</p>', TIME_2);
  assert.equal(Core.deleteNotebookEntry(model, second.id), second);
  assert.equal(model.notebook.activeEntryId, null);
  assert.deepEqual(model.notebook.entries, [first]);
  assert.equal(model.notebook.html, '<p>草稿不能被删除操作覆盖</p>');
  model.notebook.activeEntryId = first.id;
  assert.equal(Core.deleteNotebookEntry(model, 'missing'), null);
  assert.equal(model.notebook.activeEntryId, first.id);
});
test('notebook backup validation preserves history, sanitizes content, and checks dates and IDs', () => {
  const model = Core.blankModel();
  const entry = Core.createNotebookEntry(model, '<h1 onclick="bad()">安全标题</h1><script>bad()</script><p>正文<img src="https://example.com/a"></p>', TIME_1);
  Core.toggleNotebookPin(model, entry.id);
  const roundTrip = Core.validateModel(JSON.parse(JSON.stringify(model)));
  assert.equal(roundTrip.notebook.activeEntryId, entry.id);
  assert.equal(roundTrip.notebook.entries[0].html, '<h1>安全标题</h1><p>正文</p>');
  assert.equal(roundTrip.notebook.entries[0].pinned, true);
  roundTrip.notebook.activeEntryId = 'note_deleted';
  assert.equal(Core.validateModel(roundTrip).notebook.activeEntryId, null);
  roundTrip.notebook.activeEntryId = '<invalid>';
  assert.throws(() => Core.validateModel(roundTrip));
  roundTrip.notebook.activeEntryId = null;
  roundTrip.notebook.entries[0].updatedAt = '2025-01-01T00:00:00.000Z';
  assert.throws(() => Core.validateModel(roundTrip));
  roundTrip.notebook.entries[0].updatedAt = TIME_2;
  roundTrip.notebook.entries.push({
    ...roundTrip.notebook.entries[0]
  });
  assert.throws(() => Core.validateModel(roundTrip), /编号重复/);
  const harness = storageHarness();
  assert.equal(harness.within(`var noteModel=ThreeThingsCore.blankModel(); var noteRecord=ThreeThingsCore.createNotebookEntry(noteModel,'<p>持久保存</p>','${TIME_1}'); ThreeThingsStorage.save(noteModel).persistent;`), true);
  assert.equal(harness.within('ThreeThingsStorage.importJSON(ThreeThingsStorage.exportJSON(ThreeThingsStorage.load().model)).notebook.activeEntryId'), harness.within('noteRecord.id'));
});
test('notebook count and total content limits fail before mutating existing entries or draft', () => {
  const model = Core.blankModel();
  const fullHtml = '<p>' + '字'.repeat(Core.LIMITS.notebook - 7) + '</p>';
  for (let index = 0; index < 3; index++) Core.createNotebookEntry(model, fullHtml, TIME_1);
  const activeBefore = model.notebook.activeEntryId;
  assert.throws(() => Core.createNotebookEntry(model, fullHtml, TIME_1), /总内容/);
  assert.equal(model.notebook.entries.length, 3);
  assert.equal(model.notebook.activeEntryId, activeBefore);
  const small = Core.createNotebookEntry(model, '<p>小记录</p>', TIME_1);
  const beforeUpdate = JSON.stringify(model.notebook);
  assert.throws(() => Core.updateNotebookEntry(model, small.id, fullHtml, TIME_2), /总内容/);
  assert.equal(JSON.stringify(model.notebook), beforeUpdate);
  assert.throws(() => Core.updateNotebookDraft(model, fullHtml), /总内容/);
  assert.equal(JSON.stringify(model.notebook), beforeUpdate);
  const countModel = Core.blankModel();
  countModel.notebook.entries = Array.from({
    length: Core.LIMITS.notebookEntries
  }, (_, index) => ({
    id: 'note_' + index,
    html: '<p>一条</p>',
    createdAt: TIME_1,
    updatedAt: TIME_1,
    pinned: false
  }));
  assert.throws(() => Core.createNotebookEntry(countModel, '<p>超出数量</p>', TIME_2), /500/);
  assert.equal(countModel.notebook.entries.length, 500);
  model.notebook.entries.push({
    id: 'note_over_total',
    html: fullHtml,
    createdAt: TIME_1,
    updatedAt: TIME_1,
    pinned: false
  });
  assert.throws(() => Core.validateModel(model), /总内容/);
});
test('draft updates sanitize atomically and failed legacy creation adds no fields or history', () => {
  const model = Core.blankModel();
  model.notebook = {
    html: '<p>旧草稿</p>'
  };
  const before = JSON.stringify(model.notebook);
  assert.throws(() => Core.createNotebookEntry(model, '<p><br></p>', TIME_1), /先写下内容/);
  assert.equal(JSON.stringify(model.notebook), before);
  const clean = Core.updateNotebookDraft(model, '<h1 onclick="bad()">草稿标题</h1><p>正文</p><script>bad()</script>');
  assert.equal(clean, '<h1>草稿标题</h1><p>正文</p>');
  assert.equal(model.notebook.html, clean);
  assert.equal(model.notebook.entries, undefined);
  assert.equal(model.notebook.activeEntryId, undefined);
});
