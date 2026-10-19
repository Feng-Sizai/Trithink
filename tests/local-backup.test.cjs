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
