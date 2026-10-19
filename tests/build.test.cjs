'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  buildFrontend
} = require('../scripts/build.cjs');
const {
  verifyHtml
} = require('../scripts/verify-build.cjs');
const {
  prepareDesktop
} = require('../scripts/prepare-desktop.cjs');
test('the offline build is deterministic and retains a valid content policy', () => {
  const first = buildFrontend();
  const html = fs.readFileSync(first.file, 'utf8');
  assert.equal(verifyHtml(html), true);
  assert.equal(buildFrontend().sha256, first.sha256);
  assert.match(html, /三件事/);
});
test('content-policy verification catches modified scripts and styles', () => {
  const html = fs.readFileSync(buildFrontend().file, 'utf8');
  assert.throws(() => verifyHtml(html.replace('<script>', '<script>void 0;')));
  assert.throws(() => verifyHtml(html.replace('<style>', '<style>body { color: red; }')));
});
test('the desktop host receives the exact browser frontend, without a second UI', () => {
  const target = prepareDesktop();
  const built = buildFrontend();
  assert.deepEqual(fs.readFileSync(target), fs.readFileSync(built.file));
});
