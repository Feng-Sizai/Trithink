'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/core.js');
const { createBackupStore } = require('../desktop/local-backup.cjs');
function harness(t, limit = 100) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'three-things-backup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createBackupStore({ directory, Core: C, limit });
  const model = C.blankModel();
  const change = title => { model.projects = [{ id: 'p', title, priority: 1, due: null, done: false, stages: [] }]; return JSON.stringify(model); };
  return { directory, store, change };
}
test('native files persist every distinct save, deduplicate and retain bounded JSON history', t => {
  const { directory, store, change } = harness(t, 3);
  assert.equal(store.load().empty, true);
  for (const title of ['一', '二', '三', '四']) assert.equal(store.save(change(title)).ok, true);
  assert.equal(store.save(change('四')).ok, true);
  const history = fs.readdirSync(path.join(directory, 'history'));
  assert.equal(history.length, 3);
  assert.ok(history.every(name => JSON.parse(fs.readFileSync(path.join(directory, 'history', name))).schemaVersion === 1));
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'previous.json'))).projects[0].title, '三');
  const reopened = createBackupStore({ directory, Core: C });
  assert.equal(JSON.parse(reopened.load().json).projects[0].title, '四');
  assert.equal(fs.existsSync(path.join(directory, 'latest.json.tmp')), false);
});
test('corrupt primary recovers latest history before previous and never trusts invalid JSON', t => {
  const { directory, store, change } = harness(t);
  store.save(change('旧')); store.save(change('最新'));
  fs.writeFileSync(path.join(directory, 'latest.json'), '{broken');
  let recovered = store.load();
  assert.equal(recovered.recovered, true);
  assert.equal(JSON.parse(recovered.json).projects[0].title, '最新');
  for (const name of fs.readdirSync(path.join(directory, 'history'))) fs.writeFileSync(path.join(directory, 'history', name), '{broken');
  recovered = store.load();
  assert.equal(JSON.parse(recovered.json).projects[0].title, '旧');
  fs.writeFileSync(path.join(directory, 'previous.json'), '{broken');
  assert.equal(store.load().empty, true);
  assert.ok(store.load().error);
});
test('invalid or oversized saves preserve last good files; unwritable path reports failure', t => {
  const { directory, store, change } = harness(t);
  store.save(change('安全'));
  const before = fs.readFileSync(path.join(directory, 'latest.json'), 'utf8');
  for (const bad of ['{"schemaVersion":99}', 'x'.repeat(C.LIMITS.json + 1), { path: '../arbitrary' }]) assert.equal(store.save(bad).ok, false);
  assert.equal(fs.readFileSync(path.join(directory, 'latest.json'), 'utf8'), before);
  const blocked = path.join(directory, 'blocked'); fs.writeFileSync(blocked, 'file');
  assert.equal(createBackupStore({ directory: blocked, Core: C }).save(change('失败')).ok, false);
});
test('desktop storage migrates browser data then survives browser clearing and blocked writes', t => {
  const { directory, store, change } = harness(t);
  const values = new Map([['three-things-trial:v1', change('原有资料')]]);
  let blocked = false;
  const context = vm.createContext({ ThreeThingsDesktop: store, localStorage: {
    getItem: key => { if (blocked) throw Error('blocked'); return values.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw Error('blocked'); values.set(key, value); }
  } });
  for (const file of ['core.js', 'storage.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  const within = code => vm.runInContext(code, context);
  assert.equal(within('ThreeThingsStorage.load().model.projects[0].title'), '原有资料');
  assert.ok(fs.existsSync(path.join(directory, 'latest.json')));
  values.clear(); blocked = true;
  assert.equal(within('ThreeThingsStorage.load().model.projects[0].title'), '原有资料');
  assert.equal(within(`(()=>{const m=ThreeThingsStorage.load().model;m.projects[0].title='修改资料';return ThreeThingsStorage.save(m).persistent})()`), true);
  assert.equal(JSON.parse(store.load().json).projects[0].title, '修改资料');
});

test('manual backup always creates a separate validated file and survives automatic history rotation', t => {
  const { directory, store, change } = harness(t, 2); const text = change('手动备份');
  const a = store.manualBackup(text), b = store.manualBackup(text);
  assert(a.ok && b.ok); assert.notEqual(a.file, b.file); assert.equal(JSON.parse(fs.readFileSync(a.file)).projects[0].title, '手动备份');
  for (let i = 0; i < 5; i++) store.save(change(String(i)));
  assert(fs.existsSync(a.file)); assert.equal(fs.readdirSync(path.join(directory, 'manual')).length, 2);
  assert.equal(store.manualBackup('{broken').ok, false); assert.equal(fs.readdirSync(path.join(directory, 'manual')).length, 2);
});
test('view-only saves persist the last page and position without crowding data backup history', t => {
  const { directory, store, change } = harness(t); const m = JSON.parse(change('内容'));
  store.save(JSON.stringify(m)); const historyCount = fs.readdirSync(path.join(directory, 'history')).length;
  for (let i = 0; i < 5; i++) { m.viewState = { page: 'calendar', activeProject: null, calendarDay: '2026-10-20', calendarMonth: '2026-10', showQueue: true, showDone: false, scrollY: i * 100 }; assert(store.save(JSON.stringify(m)).ok); }
  assert.equal(JSON.parse(store.load().json).viewState.scrollY, 400); assert.equal(fs.readdirSync(path.join(directory, 'history')).length, historyCount);
});

test('startup selects application save revisions, ignores mtime changes and skips broken newer files', t => {
  const { directory, store, change } = harness(t);
  store.save(change('旧自动')); const old = store.manualBackup(change('旧手动'));
  store.save(change('最新自动'));
  const future = new Date(Date.now() + 86400000);
  fs.utimesSync(old.file, future, future);
  let reopened = createBackupStore({ directory, Core: C });
  assert.equal(JSON.parse(reopened.load().json).projects[0].title, '最新自动');
  const fresh = reopened.manualBackup(change('最新手动'));
  assert(fresh.ok);
  const bad = path.join(directory, 'manual', 'newer-broken.json');
  fs.writeFileSync(bad, '{broken'); fs.utimesSync(bad, future, future);
  const result = createBackupStore({ directory, Core: C }).load();
  assert.equal(JSON.parse(result.json).projects[0].title, '最新手动');
  assert.equal(result.recovered, true); assert.equal(result.source.kind, '手动备份');
  assert.equal(result.source.name, path.basename(fresh.file)); assert(result.source.savedAt);
  assert(reopened.save(change('再次保存')).ok);
  assert.equal(JSON.parse(createBackupStore({ directory, Core: C }).load().json).projects[0].title, '再次保存');
});
test('legacy canonical data is not replaced by touched arbitrary backups and is stamped on first save', t => {
  const { directory, store, change } = harness(t);
  fs.mkdirSync(path.join(directory, 'manual'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'latest.json'), change('旧版当前数据'));
  const old = path.join(directory, 'manual', 'copied-old.json'); fs.writeFileSync(old, change('更旧备份'));
  const future = new Date(Date.now() + 86400000); fs.utimesSync(old, future, future);
  assert.equal(JSON.parse(store.load().json).projects[0].title, '旧版当前数据');
  const saved = store.save(change('升级后修改'));
  assert(saved.ok); assert(JSON.parse(saved.json).backupMeta.revision > 0);
  assert.equal(JSON.parse(createBackupStore({ directory, Core: C }).load().json).projects[0].title, '升级后修改');
});
test('newer identical manual copies do not report recovery or regress the canonical data', t => {
  const {directory,store,change}=harness(t);const text=change('同一份');store.save(text);const backup=store.manualBackup(text);const recent=new Date(Date.now()+5000);fs.utimesSync(backup.file,recent,recent);const result=store.load();assert.equal(result.recovered,false);assert.equal(JSON.parse(result.json).projects[0].title,'同一份');
});
