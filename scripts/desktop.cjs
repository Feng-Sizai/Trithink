'use strict';

const path = require('node:path');
const {
  spawnSync
} = require('node:child_process');
const {
  prepareDesktop
} = require('./prepare-desktop.cjs');
const {
  projectRoot
} = require('./build.cjs');
const action = process.argv[2];
if (!['start', 'package'].includes(action)) throw new Error('请使用 npm run desktop:dev 或 npm run desktop:package。');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('请通过 npm run 执行桌面命令，以使用当前 Node.js 对应的 npm。');
console.log(`桌面页面已准备：${prepareDesktop()}`);
const result = spawnSync(process.execPath, [npmCli, '--prefix', path.join(projectRoot, 'desktop'), 'run', action], {
  cwd: projectRoot,
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status || (result.signal ? 1 : 0);
