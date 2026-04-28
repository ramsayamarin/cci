const fs = require('fs');
const path = require('path');

const VALID_MODES = new Set(['claude-code', 'copilot-cli']);

function safeIsDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

function detectMode(opts) {
  const { home, argv = [], env = process.env } = opts || {};
  if (argv.includes('--copilot')) return 'copilot-cli';
  if (argv.includes('--claude')) return 'claude-code';
  if (env && VALID_MODES.has(env.CCI_MODE)) return env.CCI_MODE;
  const hasClaude = home && safeIsDir(path.join(home, '.claude'));
  const hasCopilot = home && safeIsDir(path.join(home, '.copilot'));
  if (hasCopilot && !hasClaude) return 'copilot-cli';
  return 'claude-code';
}

module.exports = { detectMode };
