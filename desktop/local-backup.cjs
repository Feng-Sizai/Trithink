'use strict';
const fs = require('node:fs');
const path = require('node:path');
function createBackupStore({ directory, Core, limit = 100, manualDirectory = path.join(directory, 'manual') }) {
  const latest = path.join(directory, 'latest.json');
  const previous = path.join(directory, 'previous.json');
  const snapshots = path.join(directory, 'history');
  let serial = 0, highestRevision = 0, initialized = false, mostRecentJSON = null;
  function clean(text) {
    if (typeof text !== 'string' || text.length > Core.LIMITS.json) throw new Error('数据为空或超出容量限制');
    const json = JSON.stringify(Core.validateModel(JSON.parse(text)));
    if (json.length > Core.LIMITS.json) throw new Error('数据超出容量限制');
    return json;
  }
  function read(file) {
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > Core.LIMITS.json * 4) throw new Error('数据文件无效或超出容量限制');
    return clean(fs.readFileSync(file, 'utf8'));
  }
  function content(json, viewOnly = false) {
    const model = JSON.parse(json);
    delete model.backupMeta;
    if (viewOnly) { delete model.viewState; delete model.formDraft; }
    return JSON.stringify(model);
  }
  function history() {
    try { return fs.readdirSync(snapshots).filter(name => /^\d{13}-\d{6}\.json$/.test(name)).sort().reverse(); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  function atomic(file, json) {
    const temp = file + '.tmp';
    let fd;
    try {
      fd = fs.openSync(temp, 'w');
      fs.writeFileSync(fd, json, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(temp, file);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(temp); } catch (_) { /* A renamed temporary file is absent. */ }
    }
  }
  function load() {
    let found = false;
    try {
      let manual = [];
      try { manual = fs.readdirSync(manualDirectory).filter(name => name.endsWith('.json')).map(name => path.join(manualDirectory, name)); }
      catch (error) { if (error.code !== 'ENOENT') found = true; }
      const files = [latest, ...history().map(name => path.join(snapshots, name)), ...manual, previous];
      const candidates = [];
      for (const [priority, file] of files.entries()) {
        try {
          const json = read(file), model = JSON.parse(json), meta = model.backupMeta;
          // Legacy named snapshots carry their creation time in the filename.
          // An arbitrary copied/touched file cannot outrank valid canonical data.
          const stamp = /^(?:manual-)?(\d{13})-\d{6}\.json$/.exec(path.basename(file));
          const legacyTime = stamp ? Math.min(Number(stamp[1]), Date.now()) : file === latest ? Math.min(fs.statSync(file).mtimeMs, Date.now()) : 0;
          if (meta) highestRevision = Math.max(highestRevision, meta.revision);
          candidates.push({ file, priority, json, revision: meta?.revision || 0, savedAt: meta?.savedAt || null, legacyTime });
        } catch (error) { if (error.code !== 'ENOENT') found = true; }
      }
      initialized = true;
      candidates.sort((a, b) => b.revision - a.revision || (a.revision ? String(b.savedAt).localeCompare(String(a.savedAt)) : b.legacyTime - a.legacyTime) || a.priority - b.priority);
      const selected = candidates[0];
      if (!selected) return { ok: true, empty: true, error: found ? '本机数据文件未通过检查，请导入有效备份。' : undefined };
      mostRecentJSON = selected.json;
      const canonical = candidates.find(item => item.file === latest);
      return {
        ok: true, json: selected.json,
        recovered: selected.file !== latest && (!canonical || content(selected.json) !== content(canonical.json)),
        source: { name: path.basename(selected.file), kind: selected.file === latest ? '当前数据' : selected.file === previous ? '上一份数据' : path.dirname(selected.file) === manualDirectory ? '手动备份' : '自动历史备份', savedAt: selected.savedAt, revision: selected.revision }
      };
    } catch (_) { return { ok: false, error: '无法读取本机备份目录。' }; }
  }
  function stamp(json) {
    const model = JSON.parse(json);
    if (highestRevision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('保存序号已超出范围，请导出数据');
    model.backupMeta = { revision: ++highestRevision, savedAt: new Date().toISOString() };
    return clean(JSON.stringify(model));
  }
  function save(text) {
    let json;
    try { json = clean(text); } catch (error) { return { ok: false, persistent: false, error: error.message }; }
    let dataChanged = true;
    try {
      fs.mkdirSync(snapshots, { recursive: true });
      if (!initialized) load();
      let latestJSON = null;
      try { latestJSON = read(latest); } catch (_) { /* Keep a valid recovery below. */ }
      if (latestJSON && JSON.parse(latestJSON).backupMeta && content(latestJSON) === content(json)) return { ok: true, persistent: true, json: latestJSON };
      dataChanged = !latestJSON || content(latestJSON, true) !== content(json, true);
      json = stamp(json);
      if (dataChanged && mostRecentJSON) atomic(previous, mostRecentJSON);
      atomic(latest, json);
      mostRecentJSON = json;
    } catch (_) { return { ok: false, persistent: false, error: '无法写入本机数据文件，本次修改未保存。请检查磁盘空间或导出备份。' }; }
    try {
      if (dataChanged) {
        // Keep history names monotonic when the system clock moves backwards.
        const last = Number(history()[0]?.slice(0, 13)) || 0;
        const filename = String(Math.max(Date.now(), last + 1)) + '-' + String(serial++ % 1000000).padStart(6, '0') + '.json';
        atomic(path.join(snapshots, filename), json);
        for (const name of history().slice(limit)) fs.unlinkSync(path.join(snapshots, name));
      }
      return { ok: true, persistent: true, json };
    } catch (_) { return { ok: true, persistent: true, json, error: '本机数据已保存，但历史备份未能完成。请导出一份备份。' }; }
  }
  function manualBackup(text) {
    try {
      if (!initialized) load();
      const json = stamp(clean(text));
      fs.mkdirSync(manualDirectory, { recursive: true });
      let file;
      do { file = path.join(manualDirectory, 'manual-' + Date.now() + '-' + String(serial++).padStart(6, '0') + '.json'); } while (fs.existsSync(file));
      atomic(file, json);
      return { ok: true, file: fs.realpathSync(file) };
    } catch (_) { return { ok: false, error: '无法写入手动备份，请检查备份目录或磁盘空间。' }; }
  }
  return Object.freeze({ load, save, manualBackup });
}
module.exports = { createBackupStore };
