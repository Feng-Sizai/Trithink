'use strict';
const fs = require('node:fs');
function validBounds(bounds) {
  return bounds && ['x', 'y', 'width', 'height'].every(k => Number.isInteger(bounds[k]) && Math.abs(bounds[k]) <= 100000) && bounds.width >= 480 && bounds.height >= 600 && bounds.width <= 10000 && bounds.height <= 10000;
}
function createWindowStateStore(file) {
  function load(displays = []) {
    try {
      if (fs.statSync(file).size > 4096) return null;
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!validBounds(state.bounds) || typeof state.maximized !== 'boolean') return null;
      const bounds = { ...state.bounds };
      if (displays.length && !displays.some(({ workArea: r }) => Math.min(bounds.x + bounds.width, r.x + r.width) - Math.max(bounds.x, r.x) >= 80 && Math.min(bounds.y + bounds.height, r.y + r.height) - Math.max(bounds.y, r.y) >= 80)) { delete bounds.x; delete bounds.y; }
      return { bounds, maximized: state.maximized };
    } catch (_) { return null; }
  }
  function save(bounds, maximized) {
    if (!validBounds(bounds) || typeof maximized !== 'boolean') return false;
    const temp = file + '.tmp';
    try {
      const safe = Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, bounds[k]]));
      fs.writeFileSync(temp, JSON.stringify({ bounds: safe, maximized }), 'utf8');
      fs.renameSync(temp, file);
      return true;
    } catch (_) { return false; }
  }
  return Object.freeze({ load, save });
}
module.exports = { createWindowStateStore };
