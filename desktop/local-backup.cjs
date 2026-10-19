'use strict';
const fs = require('node:fs');
const path = require('node:path');
function createBackupStore({ directory, Core, limit = 100 }) {
  const latest = path.join(directory, 'latest.json');
  const previous = path.join(directory, 'previous.json');
  const snapshots = path.join(directory, 'history');
  let serial = 0;
  function clean(text) {
    if (typeof text !== 'string' || text.length > Core.LIMITS.json) throw new Error('数据为空或超出容量限制');
    const json = JSON.stringify(Core.validateModel(JSON.parse(text)));
    if (json.length > Core.LIMITS.json) throw new Error('数据超出容量限制');
    return json;
  }
  function read(file) {
    if (fs.statSync(file).size > Core.LIMITS.json * 4) throw new Error('数据文件超出容量限制');
    return clean(fs.readFileSync(file, 'utf8'));
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
      try { fs.unlinkSync(temp); } catch (_) { /* An already renamed temporary file is absent. */ }
    }
  }
  function load() {
    let found = false;
    try {
      const files = [latest, ...history().map(name => path.join(snapshots, name)), previous];
      for (const file of files) {
        try {
          const json = read(file);
          return { ok: true, json, recovered: file !== latest };
        } catch (error) { if (error.code !== 'ENOENT') found = true; }
      }
      return { ok: true, empty: true, error: found ? '本机数据文件未通过检查，请导入有效备份。' : undefined };
    } catch (_) { return { ok: false, error: '无法读取本机自动备份目录。' }; }
  }
  function save(text) {
    let json;
    try { json = clean(text); } catch (error) { return { ok: false, persistent: false, error: error.message }; }
    try {
      fs.mkdirSync(snapshots, { recursive: true });
      const current = load();
      let latestJSON = null;
      try { latestJSON = read(latest); } catch (_) { /* Preserve a valid recovery file below. */ }
      if (latestJSON === json) return { ok: true, persistent: true };
      if (current.json) atomic(previous, current.json);
      atomic(latest, json);
    } catch (_) { return { ok: false, persistent: false, error: '无法写入本机数据文件，本次修改未保存。请检查磁盘空间或导出备份。' }; }
    try {
      const filename = String(Date.now()) + '-' + String(serial++ % 1000000).padStart(6, '0') + '.json';
      atomic(path.join(snapshots, filename), json);
      for (const name of history().slice(limit)) fs.unlinkSync(path.join(snapshots, name));
      return { ok: true, persistent: true };
    } catch (_) { return { ok: true, persistent: true, error: '本机数据已保存，但历史备份未能完成。请导出一份备份。' }; }
  }
  return Object.freeze({ load, save });
}
module.exports = { createBackupStore };
