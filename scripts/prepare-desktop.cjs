'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildFrontend,
  projectRoot
} = require('./build.cjs');
const {
  verifyBuild
} = require('./verify-build.cjs');
function prepareDesktop() {
  const built = buildFrontend();
  verifyBuild();
  const target = path.join(projectRoot, 'desktop', 'app', 'index.html');
  fs.mkdirSync(path.dirname(target), {
    recursive: true
  });
  fs.copyFileSync(built.file, target);
  fs.copyFileSync(path.join(projectRoot, 'src', 'core.js'), path.join(path.dirname(target), 'core.cjs'));
  return target;
}
module.exports = {
  prepareDesktop
};
if (require.main === module) console.log(`桌面页面已准备：${prepareDesktop()}`);
