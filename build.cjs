'use strict';

// Compatibility entry: both `node build.cjs` and `npm run build` still work.
const { buildFrontend } = require('./scripts/build.cjs');

console.log(JSON.stringify(buildFrontend()));
