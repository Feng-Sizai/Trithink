/* Local-only persistence. Main and last-good backup are independently validated. */
(function (root) {
  'use strict';

  const Core = root.ThreeThingsCore;
  if (!Core) throw new Error('请先加载 core.js');

  // Persistent keys remain stable across compatible model extensions.
  const MAIN_KEY = root.document?.body?.dataset.preview === 'calendar' ? 'three-things-calendar-preview:v1' : 'three-things-trial:v1';
  const BACKUP_KEY = MAIN_KEY + ':backup';
  let memoryModel = null;
  let memoryJSON = null;

  // Validated parsing and a separate in-memory copy for storage failures.
  function parse(text) {
    if (typeof text !== 'string' || text.length > Core.LIMITS.json) throw new Error('数据文件为空或超出 8 MB 限制');
    return Core.validateModel(JSON.parse(text));
  }
  function remember(model) {
    memoryModel = model;
    memoryJSON = JSON.stringify(model);
  }
  function copyMemory() {
    return Core.validateModel(JSON.parse(memoryJSON));
  }

  // Load the primary record, recover a valid backup, or open the initial model.
  function load(defaultFactory) {
    let storage;
    try {
      storage = root.localStorage;
    } catch (_) {
      storage = null;
    }
    if (!storage) {
      if (!memoryModel) remember(Core.validateModel(typeof defaultFactory === 'function' ? defaultFactory() : Core.blankModel()));
      return {
        model: copyMemory(),
        persistent: false,
        error: '浏览器未开放本地存储。当前内容暂存于内存，请及时导出备份。'
      };
    }
    let mainText, backupText, mainError;
    try {
      mainText = storage.getItem(MAIN_KEY);
    } catch (_) {
      if (!memoryModel) remember(Core.validateModel(typeof defaultFactory === 'function' ? defaultFactory() : Core.blankModel()));
      return {
        model: copyMemory(),
        persistent: false,
        error: '无法读取本地存储。当前内容暂存于内存，请及时导出备份。'
      };
    }
    if (mainText !== null) {
      try {
        const model = parse(mainText);
        remember(model);
        return {
          model: copyMemory(),
          persistent: true
        };
      } catch (_) {
        mainError = '主数据未通过检查';
      }
    }
    try {
      backupText = storage.getItem(BACKUP_KEY);
    } catch (_) {
      backupText = null;
    }
    if (backupText !== null) {
      try {
        const model = parse(backupText);
        remember(model);
        let persistent = true;
        try {
          storage.setItem(MAIN_KEY, memoryJSON);
        } catch (_) {
          persistent = false;
        }
        return {
          model: copyMemory(),
          persistent,
          recovered: true,
          error: persistent ? '已从上一次有效备份恢复数据。' : '已从备份恢复，但当前无法保存。请导出备份。'
        };
      } catch (_) {/* An invalid backup is never injected into the app. */}
    }
    if (!memoryModel) remember(Core.validateModel(typeof defaultFactory === 'function' ? defaultFactory() : Core.blankModel()));
    return {
      model: copyMemory(),
      persistent: true,
      isNew: !mainError,
      error: mainError ? '本地数据和备份未通过检查，已打开空白工作区。可导入之前导出的备份。' : undefined
    };
  }

  // Validate and check the size before updating memory or persistent records.
  function save(raw) {
    let model;
    try {
      model = Core.validateModel(raw);
    } catch (error) {
      return {
        ok: false,
        persistent: false,
        error: error.message
      };
    }
    const nextJSON = JSON.stringify(model);
    if (nextJSON.length > Core.LIMITS.json) return {
      ok: false,
      persistent: false,
      error: '全部数据超出 8 MB 字符容量限制，本次修改未保存。请减少任务或速写本内容后再试。'
    };
    const previousJSON = memoryJSON;
    remember(model);
    let storage;
    try {
      storage = root.localStorage;
    } catch (_) {
      storage = null;
    }
    if (!storage) return {
      ok: true,
      persistent: false,
      error: '本地存储不可用，内容暂存于内存。请导出备份后再关闭。'
    };
    let backupJSON = previousJSON || nextJSON;
    try {
      const currentText = storage.getItem(MAIN_KEY);
      if (currentText !== null) backupJSON = JSON.stringify(parse(currentText));
    } catch (_) {/* Preserve the last validated in-memory version instead. */}
    let backupFailed = false;
    try {
      storage.setItem(BACKUP_KEY, backupJSON);
    } catch (_) {
      backupFailed = true;
    }
    try {
      storage.setItem(MAIN_KEY, nextJSON);
      return {
        ok: true,
        persistent: true,
        error: backupFailed ? '内容已保存，但自动备份空间不足。建议导出备份。' : undefined
      };
    } catch (_) {
      return {
        ok: true,
        persistent: false,
        error: '无法写入本地存储，可能是空间不足或浏览器限制。内容暂存于内存，请立即导出备份。'
      };
    }
  }

  // Portable backups use the same validation and size budget as local storage.
  function exportJSON(model) {
    // Compact serialization uses the exact same character budget as save/import.
    const json = JSON.stringify(Core.validateModel(model));
    if (json.length > Core.LIMITS.json) throw new Error('全部数据超出 8 MB 字符容量限制，无法导出。请减少任务或速写本内容后再试。');
    return json;
  }
  function importJSON(text) {
    return parse(text);
  }

  // Browser API; CommonJS export is available for local tooling and tests.
  const api = Object.freeze({
    load,
    save,
    exportJSON,
    importJSON
  });
  root.ThreeThingsStorage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
