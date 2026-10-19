'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const config = require('../build.config.cjs');
function verifyHtml(html) {
  const script = /<script>([\s\S]*)<\/script>/.exec(html);
  const style = /<style>([\s\S]*?)<\/style>/.exec(html);
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(script && style && policy, '构建文件缺少脚本、样式或内容安全策略。');
  for (const [name, text] of [['script', script[1]], ['style', style[1]]]) {
    const hash = crypto.createHash('sha256').update(text, 'utf8').digest('base64');
    assert.ok(policy[1].includes(`${name}-src 'sha256-${hash}'`), `${name} 内容与安全策略哈希不匹配。`);
  }
  assert.ok(!policy[1].includes('unsafe-inline') && !policy[1].includes('unsafe-eval'));
  assert.ok(policy[1].includes("connect-src 'none'"));
  assert.ok(!/{{(?:SCRIPT|STYLE)_CSP}}|<!-- APP_(?:STYLES|SCRIPTS) -->/.test(html));
  return true;
}
function verifyBuild() {
  const filename = path.join(__dirname, '..', config.outputDirectory, config.outputFilename);
  verifyHtml(fs.readFileSync(filename, 'utf8'));
  return filename;
}
module.exports = {
  verifyHtml,
  verifyBuild
};
if (require.main === module) console.log(`构建校验通过：${verifyBuild()}`);
