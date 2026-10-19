'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  spawnSync
} = require('node:child_process');
const {
  projectRoot,
  buildFrontend
} = require('./build.cjs');
const {
  verifyBuild
} = require('./verify-build.cjs');
function sourceFiles(directory) {
  return fs.readdirSync(directory, {
    withFileTypes: true
  }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'app'].includes(entry.name) && path.basename(directory) === 'desktop') return [];
      return sourceFiles(filename);
    }
    return /\.(?:js|cjs)$/.test(entry.name) ? [filename] : [];
  });
}
function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const files = [...['src', 'scripts', 'tests', 'desktop'].flatMap(name => sourceFiles(path.join(projectRoot, name))), path.join(projectRoot, 'build.cjs'), path.join(projectRoot, 'build.config.cjs')];
files.forEach(filename => runNode(['--check', filename]));
console.log(`语法检查通过：${files.length} 个文件。`);
runNode(['--test']);
console.log(JSON.stringify(buildFrontend()));
console.log(`构建校验通过：${verifyBuild()}`);
