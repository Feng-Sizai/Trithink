'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../build.config.cjs');
const projectRoot = path.resolve(__dirname, '..');
function readSource(filename) {
  return fs.readFileSync(path.join(projectRoot, config.sourceDirectory, filename), 'utf8').replace(/\r\n/g, '\n');
}
function contentHash(text, encoding = 'base64') {
  return crypto.createHash('sha256').update(text, 'utf8').digest(encoding);
}
function labelledSource(filename) {
  return `/* ===== ${filename} ===== */\n${readSource(filename)}`;
}
function assembleApplication() {
  const fragments = config.application.map(labelledSource).join('\n\n');
  return `(function () {\n  'use strict';\n\n${fragments}\n})();\n`;
}
function buildFrontend() {
  const css = [config.stylesheet, ...config.extraStylesheets].map(readSource).join('\n');
  const js = [...config.libraries.map(labelledSource), assembleApplication()].join('\n;\n').replace(/<\/script/gi, '<\\/script');
  const html = readSource(config.shell).replace('{{SCRIPT_CSP}}', `'sha256-${contentHash(js)}'`).replace('{{STYLE_CSP}}', `'sha256-${contentHash(css)}'`).replace('<!-- APP_STYLES -->', `<style>${css}</style>`).replace('<!-- APP_SCRIPTS -->', `<script>${js}</script>`);
  if (/{{(?:SCRIPT|STYLE)_CSP}}|<!-- APP_(?:STYLES|SCRIPTS) -->/.test(html)) {
    throw new Error('构建失败：页面中仍有未替换的占位符。');
  }
  const directory = path.join(projectRoot, config.outputDirectory);
  const file = path.join(directory, config.outputFilename);
  fs.mkdirSync(directory, {
    recursive: true
  });
  fs.writeFileSync(file, html, 'utf8');
  return {
    file,
    bytes: Buffer.byteLength(html, 'utf8'),
    sha256: contentHash(html, 'hex')
  };
}
module.exports = {
  buildFrontend,
  assembleApplication,
  projectRoot
};
if (require.main === module) console.log(JSON.stringify(buildFrontend()));
