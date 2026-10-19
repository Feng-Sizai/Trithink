'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { projectRoot } = require('./build.cjs');
const desktop = path.join(projectRoot, 'desktop');
const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error('请通过 npm run desktop:setup 执行。');

function run(arguments_) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// Restore locked tools, then install Electron's separately distributed runtime.
run([npmCli, '--prefix', desktop, 'ci']);
run([path.join(desktop, 'node_modules', 'electron', 'install.js')]);
console.log('桌面开发与打包环境已准备。');
