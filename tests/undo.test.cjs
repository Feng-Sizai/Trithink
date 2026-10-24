'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const K = require('../src/calendar-core.js');
function harness() {
  const context = vm.createContext({});
  for (const file of ['core.js', 'calendar-core.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  vm.runInContext(`
    const C=ThreeThingsCore, K=ThreeThingsCalendar;
    let model=C.blankModel(), lastGood=C.validateModel(model), today='2026-10-19', memoryOnly=false, editor=null, editorNoteId=null, boot=false;
    let calendarDeleteUndo=null,scheduleGesture=null,blocked=false,persistedJSON='',renderCount=0;
    const modal={open:false},listeners={},nodes={};
    const document={addEventListener:(name,fn)=>listeners[name]=fn};
    const $=name=>nodes[name]||(nodes[name]={innerHTML:''});
    const flat=()=>C.flattenTasks(model),routine=()=>C.getRoutine(model,today);
    const S={save:raw=>{if(blocked)return{ok:false,persistent:false,error:'disk blocked'};persistedJSON=JSON.stringify(raw);return{ok:true,persistent:true}}};
    const render=()=>renderCount++,renderCategoryTree=()=>{},destroyEditor=()=>true,cancelScheduleGesture=()=>{scheduleGesture=null},closeScheduleMenu=()=>{},captureNotebook=()=>true;
    let lastToast='';
  `, context);
  for (const file of ['records.js', 'undo.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8'), context);
  vm.runInContext(`toast=(message)=>{lastToast=message};save(undefined,{recordUndo:false});`, context);
  return code => vm.runInContext(code, context);
}
test('undo restores linked projects and calendar records together and persists each restoration', () => {
  const run = harness();
  run(`const event=K.saveEvent(model,{title:'关联日程',date:today,priority:1,startTime:'09:17',endTime:'10:43'});K.syncEvent(model,event.id,{kind:'project'});save();`);
  const original = run('JSON.stringify(model)');
  run(`K.deleteEvent(model,event.id,true);save();`);
  assert.equal(run('model.projects.length'), 0);
  assert.equal(run('undoLastOperation()'), true);
  assert.equal(run('JSON.stringify(model)'), original);
  assert.equal(run('persistedJSON'), original);
  assert.equal(run('undoLastOperation()'), true);
  assert.equal(run('model.projects.length+model.calendarEvents.length'), 0);
});
test('failed save does not enter history; failed undo keeps both current model and undo entry', () => {
  const run = harness();
  run(`model.projects.push({id:'p',title:'原项目',priority:1,done:false,stages:[]});save();model.projects[0].title='改名';save();`);
  run(`blocked=true;model.projects[0].title='失败修改';save();`);
  assert.equal(run('model.projects[0].title'), '改名');
  const count = run('undoEntries.length');
  assert.equal(run('undoLastOperation()'), false);
  assert.equal(run('model.projects[0].title'), '改名');
  assert.equal(run('undoEntries.length'), count);
  run('blocked=false;undoLastOperation()');
  assert.equal(run('model.projects[0].title'), '原项目');
});
test('unchanged and navigation saves do not consume undo; shortcut leaves text undo untouched', () => {
  const run = harness();
  run(`model.projects.push({id:'p',title:'原项目',priority:1,done:false,stages:[]});save();save();save(undefined,{recordUndo:false});`);
  assert.equal(run('undoEntries.length'), 1);
  run(`let prevented=false;const key={ctrlKey:true,key:'z',target:{closest:()=>true},preventDefault:()=>{prevented=true}};listeners.keydown(key);`);
  assert.equal(run('prevented'), false);
  assert.equal(run('model.projects.length'), 1);
  run(`key.target.closest=()=>null;listeners.keydown(key);`);
  assert.equal(run('prevented'), true);
  assert.equal(run('model.projects.length'), 0);
});
test('create snapping uses quarter hours in either direction with a fifteen minute minimum', () => {
  for (const [anchor,minute,expected] of [
    [557,643,{start:555,end:645}], [643,557,{start:555,end:645}],
    [557,558,{start:555,end:570}], [1440,1440,{start:1425,end:1440}],
    [350,361,{start:360,end:375}]
  ]) assert.deepEqual(K.scheduleCreateRange(anchor, minute), expected);
  assert.deepEqual(K.scheduleRange('end',557,643,643,644),{start:557,end:644});
  assert.deepEqual(K.scheduleRange('move',557,643,580,581),{start:558,end:644});
});

test('long-press movement snaps its start to quarter hours and preserves exact duration', () => {
  assert.deepEqual(K.scheduleMoveRange(557,643,600,610), { start:570,end:656 });
  assert.deepEqual(K.scheduleMoveRange(540,600,570,560), { start:525,end:585 });
  assert.deepEqual(K.scheduleMoveRange(557,643,600,0), { start:360,end:446 });
  assert.deepEqual(K.scheduleMoveRange(557,643,600,1800), { start:1350,end:1436 });
  assert.deepEqual(K.scheduleMoveRange(7,1440,700,710), { start:7,end:1440 });
  assert.deepEqual(K.scheduleRange('end',557,643,643,644), { start:557,end:644 });
});
