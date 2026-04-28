const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectMode } = require('../lib/detect');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cci-detect-')); }

describe('detectMode', () => {
  it('honors --copilot flag', () => {
    assert.equal(detectMode({ home: tmp(), argv: ['--copilot'] }), 'copilot-cli');
  });
  it('honors --claude flag', () => {
    assert.equal(detectMode({ home: tmp(), argv: ['--claude'] }), 'claude-code');
  });
  it('flag wins over env', () => {
    assert.equal(detectMode({ home: tmp(), argv: ['--claude'], env: { CCI_MODE: 'copilot-cli' } }), 'claude-code');
  });
  it('honors CCI_MODE env', () => {
    assert.equal(detectMode({ home: tmp(), argv: [], env: { CCI_MODE: 'copilot-cli' } }), 'copilot-cli');
  });
  it('ignores invalid CCI_MODE', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.claude'));
    assert.equal(detectMode({ home, argv: [], env: { CCI_MODE: 'garbage' } }), 'claude-code');
  });
  it('auto-detects copilot when only ~/.copilot exists', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.copilot'));
    assert.equal(detectMode({ home, argv: [], env: {} }), 'copilot-cli');
  });
  it('auto-detects claude when only ~/.claude exists', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.claude'));
    assert.equal(detectMode({ home, argv: [], env: {} }), 'claude-code');
  });
  it('defaults to claude-code when both exist (legacy behavior)', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.claude'));
    fs.mkdirSync(path.join(home, '.copilot'));
    assert.equal(detectMode({ home, argv: [], env: {} }), 'claude-code');
  });
  it('defaults to claude-code when neither exists', () => {
    assert.equal(detectMode({ home: tmp(), argv: [], env: {} }), 'claude-code');
  });
  it('handles missing home gracefully', () => {
    assert.equal(detectMode({ argv: [], env: {} }), 'claude-code');
  });
});
