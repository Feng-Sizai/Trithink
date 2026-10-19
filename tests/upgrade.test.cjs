'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const config = require('../desktop/electron-builder.cjs');

test('upgrade keeps the 0.3.0 installer identity, installation directory and shortcut', () => {
  // electron-builder 26.15.3 generated the legacy NSIS GUID with UUIDv5.
  const namespace = Buffer.from('50e065bc313411e69bab38c9862bdaf3', 'hex');
  const digest = crypto.createHash('sha1').update(namespace).update('local.three-things.desktop').digest();
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const hex = digest.subarray(0, 16).toString('hex');
  const legacyGuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  assert.equal(config.appId, 'local.three-things.desktop');
  assert.equal(config.nsis.guid, legacyGuid);
  assert.equal(config.productName, '三件事');
  assert.equal(config.nsis.shortcutName, '三件事');
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.allowToChangeInstallationDirectory, false);
  assert.equal(config.nsis.createDesktopShortcut, 'always');
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.nsis.runAfterFinish, false);
});
