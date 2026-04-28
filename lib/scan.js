const path = require('path');
const shared = require('./adapters/shared');
const { scanClaude } = require('./adapters/claude');
const { scanCopilot } = require('./adapters/copilot');
const { detectMode } = require('./detect');

function scan(projectDir, options) {
  const opts = options || {};
  const home = opts.home || process.env.HOME || process.env.USERPROFILE;
  const cwd = opts.cwd || projectDir || process.cwd();
  const mode = opts.mode || detectMode({ home, argv: opts.argv || [], env: opts.env });
  if (mode === 'copilot-cli') return scanCopilot({ home, cwd });
  return scanClaude({ home, cwd });
}

module.exports = Object.assign({ scan }, shared);
