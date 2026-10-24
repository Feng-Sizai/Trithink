'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/core.js');
require('../src/categories-preview.js');
const demo = () => globalThis.ThreeThingsCategoryPreview.sampleModel('2026-10-24');

test('old records migrate to unclassified without changing tasks, plans or notes', () => {
  const old = C.sampleModel('2026-10-24');
  delete old.categories;
  old.projects.forEach(project => delete project.categoryIds);
  const migrated = C.validateModel(old);
  assert.deepEqual(migrated.categories, []);
  assert.equal(C.projectsInCategory(migrated, 'unclassified').length, old.projects.length);
  assert.deepEqual(C.flattenTasks(migrated), C.flattenTasks(old));
  assert.deepEqual(migrated.notebook, old.notebook);
});
test('one project can appear in several categories but stays one project and one task', () => {
  const model = demo();
  const course = C.projectsInCategory(model, 'c_courses').find(p => p.id === 'p_probability');
  const week = C.projectsInCategory(model, 'c_week').find(p => p.id === 'p_probability');
  assert.strictEqual(course, week);
  C.setCompletion(model, 'p_probability_task', true, '2026-10-24T10:00:00Z');
  assert.equal(week.done, true);
  assert.equal(C.completedCount(model), 1);
  assert.equal(model.projects.filter(p => p.id === 'p_probability').length, 1);
  assert.equal(C.projectsInCategory(model, 'c_courses').some(p => p.id === course.id), false);
  assert.equal(C.projectsInCategory(model, 'c_week').some(p => p.id === course.id), false);
});
test('deleting a category retains all projects, progress and other memberships', () => {
  const model = demo();
  const leaves = C.flattenTasks(model);
  C.deleteCategory(model, 'c_courses');
  assert.deepEqual(C.flattenTasks(model), leaves);
  assert.deepEqual(model.projects.find(p => p.id === 'p_probability').categoryIds, ['c_week']);
  assert.equal(C.projectsInCategory(model, 'unclassified').some(p => p.id === 'p_marx'), true);
  assert.equal(model.projects.length, 8);
  assert.doesNotThrow(() => C.validateModel(model));
});
test('category edits and memberships survive backup round trip with unchanged priority', () => {
  const model = demo();
  const originalOrder = C.sortTasks(C.flattenTasks(model)).map(item => item.id);
  const category = C.createCategory(model, '新分类');
  C.renameCategory(model, category.id, '期中复习');
  C.setProjectCategories(model, 'p_physics', ['c_courses', category.id]);
  const restored = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.equal(restored.categories.find(item => item.id === category.id).title, '期中复习');
  assert.deepEqual(restored.projects.find(item => item.id === 'p_physics').categoryIds, ['c_courses', category.id]);
  assert.deepEqual(C.sortTasks(C.flattenTasks(restored)).map(item => item.id), originalOrder);
});
test('invalid membership is rejected before changing a project', () => {
  const model = demo();
  const before = JSON.stringify(model);
  assert.throws(() => C.setProjectCategories(model, 'p_marx', ['missing']));
  assert.throws(() => C.setProjectCategories(model, 'p_marx', ['c_week', 'c_week']));
  assert.equal(JSON.stringify(model), before);
  assert.throws(() => C.createCategory(model, '大学课程'));
  assert.throws(() => C.createCategory(model, '   '));
  assert.throws(() => C.createCategory(model, '未分类'));
  assert.throws(() => C.createCategory(model, '全部项目'));
  assert.throws(() => C.renameCategory(model, 'c_week', '大学课程'));
});
test('imports reject duplicate category ids, invalid membership and malformed categories', () => {
  const model = demo();
  const invalid = mutate => { const copy = JSON.parse(JSON.stringify(model)); mutate(copy); return copy; };
  assert.throws(() => C.validateModel(invalid(m => m.categories.push({ ...m.categories[0] }))));
  assert.throws(() => C.validateModel(invalid(m => m.projects[0].categoryIds = ['missing'])));
  assert.throws(() => C.validateModel(invalid(m => m.categories[0].title = '')));
  assert.throws(() => C.validateModel(invalid(m => m.categories[0].id = m.projects[0].id)));
});
test('preview storage is isolated from existing desktop/browser and calendar records', () => {
  const keys = new Map([['three-things-trial:v1', 'personal-main'], ['three-things-calendar-preview:v1', 'personal-calendar']]);
  const context = vm.createContext({ document: { body: { dataset: { preview: 'categories' } } }, localStorage: { getItem:key => keys.get(key) ?? null, setItem:(key,value) => keys.set(key,value) } });
  for (const file of ['core.js', 'categories-preview.js', 'storage.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  assert.equal(vm.runInContext("ThreeThingsStorage.save(ThreeThingsCategoryPreview.sampleModel('2026-10-24')).ok", context), true);
  assert.equal(keys.get('three-things-trial:v1'), 'personal-main');
  assert.equal(keys.get('three-things-calendar-preview:v1'), 'personal-calendar');
  assert.equal(JSON.parse(keys.get('three-things-categories-preview:v1')).categories.length, 4);
  assert.equal(vm.runInContext('ThreeThingsStorage.load().model.projects.length', context), 8);
});

test('unsubmitted multi-category project drafts survive backups and category deletion', () => {
  const model = demo();
  model.formDraft = { action:'save-item', context:{kind:'project',id:null}, values:{title:'未完成项目',priority:'2',due:'',dueTime:'',categoryIds:['c_courses','c_week']}, savedAt:'2026-10-24T12:00:00.000Z' };
  const restored = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.deepEqual(restored.formDraft.values.categoryIds, ['c_courses','c_week']);
  C.deleteCategory(restored, 'c_courses');
  assert.deepEqual(C.validateModel(restored).formDraft.values.categoryIds, ['c_week']);
  const invalid = JSON.parse(JSON.stringify(model));
  invalid.formDraft.values.categoryIds = ['missing'];
  assert.throws(() => C.validateModel(invalid));
});

test('restored page keeps its selected category and safely drops deleted category expansion', () => {
  const model = demo();
  model.viewState = {page:'projects',activeProject:null,calendarDay:'2026-10-24',calendarMonth:'2026-10',showQueue:false,showDone:false,scrollY:125,categoryId:'c_courses',expandedCategories:['c_courses','c_week']};
  let restored = C.validateModel(JSON.parse(JSON.stringify(model)));
  assert.equal(restored.viewState.categoryId, 'c_courses');
  assert.deepEqual(restored.viewState.expandedCategories, ['c_courses','c_week']);
  C.deleteCategory(restored, 'c_courses');
  restored = C.validateModel(restored);
  assert.equal(restored.viewState.categoryId, 'all');
  assert.deepEqual(restored.viewState.expandedCategories, ['c_week']);
});

test('category choices are captured and restored as a group in the existing draft flow', () => {
  const choices = [{name:'categoryIds',type:'checkbox',value:'c_courses',checked:true},{name:'categoryIds',type:'checkbox',value:'c_week',checked:false}];
  const title = {name:'title',value:'草稿项目',type:'text'};
  const listeners = {};
  const context=vm.createContext({modal:{querySelectorAll:selector=>selector === '[name="categoryIds"]' ? choices : [title,...choices],querySelector:()=>null,addEventListener:(name,fn)=>listeners[name]=fn}});
  vm.runInContext("let model={formDraft:{action:'save-item',context:{kind:'project'},values:{categoryIds:['c_week']}}};let modalAction='save-item',modalContext={kind:'project'};",context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/app/form-drafts.js'),'utf8'),context);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(formValues().categoryIds)',context)), ['c_courses']);
  vm.runInContext('applyFormDraft()',context);
  assert.equal(choices[0].checked,false);
  assert.equal(choices[1].checked,true);
});
