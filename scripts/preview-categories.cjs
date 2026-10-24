'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { buildFrontend } = require('./build.cjs');
const { verifyHtml } = require('./verify-build.cjs');

function buildPreview() {
  const built = buildFrontend();
  const html = fs.readFileSync(built.file, 'utf8').replace('<body>', '<body data-preview="categories">');
  verifyHtml(html);
  const file = path.resolve(__dirname, '../outputs/三件事-项目分类-网页预览.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, 'utf8');
  return file;
}
if (require.main === module) {
  const file = buildPreview();
  console.log('Preview: ' + file);
  if (process.argv.includes('--serve')) {
    const server = http.createServer((request, response) => {
      if (!['GET', 'HEAD'].includes(request.method) || !['/', '/index.html'].includes(request.url.split('?')[0])) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? '' : fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + server.address().port));
    process.on('SIGINT', () => server.close(() => process.exit(0)));
  }
}
module.exports = { buildPreview };
