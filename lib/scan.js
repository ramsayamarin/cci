const path = require('path');
const shared = require('./adapters/shared');
const { scanClaude } = require('./adapters/claude');

function scan(projectDir, options) {
  const opts = options || {};
  const home = opts.home || process.env.HOME || process.env.USERPROFILE;
  const cwd = opts.cwd || projectDir || process.cwd();
  // Mode plumbing arrives in Task 2/3; for now always Claude.
  return scanClaude({ home, cwd });
}

module.exports = Object.assign({ scan }, shared);
