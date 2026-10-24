'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function navigation() {
  const context = vm.createContext({ C: require('../src/core.js') });
  vm.runInContext(`
    let model = C.blankModel(), page = 'today', boot = false, editor = null;
    let activeCategory = 'all', activeProject = null, calendarView = 'week', showQueue = false;
    let projectTreeOpen = false, projectTreeCollapsed = false, saved = 0, rendered = 0;
    const expandedCategories = new Set(), listeners = {}, nodes = {};
    const $ = selector => nodes[selector] ||= { hidden: true, innerHTML: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, focus() {} };
    const esc = value => String(value);
    const document = { addEventListener(name, fn) { listeners[name] = fn; } };
    const otherFeaturesPopover = { contains: () => false };
    const main = { focus() {} };
    const ensureCurrentDay = () => {}, captureNotebook = () => true, closeOtherFeatures = () => {};
    const save = () => { saved++; renderCategoryTree(); return { ok: true }; };
    const persistViewState = () => {}, render = () => { rendered++; renderCategoryTree(); };
  `, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/categories.js'), 'utf8'), context);
  const entry = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  vm.runInContext(entry.slice(0, entry.indexOf("document.addEventListener('submit'")), context);
  vm.runInContext(`
    function navigate(destination) {
      const button = { dataset: { page: destination }, disabled: false };
      listeners.click({ target: { closest: () => button } });
    }
  `, context);
  return code => vm.runInContext(code, context);
}

test('clicking My Projects repeatedly collapses and reopens its tree without changing work or saving', () => {
  const run = navigation();
  run("navigate('projects')");
  assert.equal(run('projectTreeOpen'), true);
  run("activeCategory = 'unclassified'; activeProject = 'unchanged'; const before = JSON.stringify(model); const initialSaves = saved; const initialRenders = rendered; navigate('projects')");
  assert.equal(run("nodes['#project-category-tree'].hidden"), true);
  assert.equal(run("nodes['#projects-navigation-toggle'].attributes['aria-expanded']"), 'false');
  assert.equal(run('JSON.stringify(model) === before && saved === initialSaves && rendered === initialRenders'), true);
  assert.equal(run('activeCategory'), 'unclassified');
  run("navigate('projects')");
  assert.equal(run("nodes['#project-category-tree'].hidden"), false);
  assert.equal(run("nodes['#projects-navigation-toggle'].attributes['aria-expanded']"), 'true');
  assert.equal(run('activeProject'), 'unchanged');
});

test('ordinary sidebar refreshes keep the tree collapsed and switching pages resets navigation', () => {
  const run = navigation();
  run("navigate('projects'); navigate('projects'); renderCategoryTree(); render()");
  assert.equal(run('projectTreeOpen'), false);
  run("navigate('calendar')");
  assert.equal(run('projectTreeOpen'), false);
  run("navigate('projects')");
  assert.equal(run('projectTreeOpen'), true);
  assert.equal(run('activeCategory'), 'all');
  run("page = 'detail'; render(); navigate('projects')");
  assert.equal(run('page'), 'projects');
  assert.equal(run('projectTreeOpen'), true);
});

test('category arrows still collapse and reopen children independently of the parent tree', () => {
  const run = navigation();
  run("navigate('projects'); const arrow = { dataset: { action: 'toggle-category', id: 'unclassified' } }; categoryClick(arrow)");
  assert.equal(run("expandedCategories.has('unclassified')"), true);
  run('categoryClick(arrow)');
  assert.equal(run("expandedCategories.has('unclassified')"), false);
  assert.equal(run('projectTreeOpen'), true);
  run("categoryClick(arrow); navigate('projects'); renderCategoryTree(); navigate('projects')");
  assert.equal(run("expandedCategories.has('unclassified')"), true);
  assert.equal(run('projectTreeOpen'), true);
});
