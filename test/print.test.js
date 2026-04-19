const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { printInline } = require('../lib/print');

function emptyData() {
  return {
    installedPlugins: [],
    pluginSkills: [], pluginCommands: [], pluginAgents: [], pluginHooks: [],
    mcpServers: {}, activeMcpTools: [],
    userSkills: [], projectSkills: [],
    userCommands: [], projectCommands: [],
    userAgents: [], projectAgents: [],
    userClaudeMd: { exists: false, content: '', path: '' },
    projectClaudeMd: { exists: false, content: '', path: '' },
    localClaudeMd: { exists: false, content: '', path: '' },
    userRules: [], projectRules: [],
    userSettings: null, projectSettings: null, localSettings: null,
    userSettingsPath: '/home/.claude/settings.json',
    projectSettingsPath: '/proj/.claude/settings.json',
    localSettingsPath: '/proj/.claude/settings.local.json',
    autoMemory: [],
    marketplaces: { 'some-marketplace': { source: {} } },
    marketplaceCatalogs: {},
    projectPath: '/proj',
    homePath: '/home',
    hookEvents: [
      { name: 'PreToolUse', icon: '\u23F3' },
      { name: 'Stop', icon: '\uD83D\uDED1' }
    ]
  };
}

function capture(fn) {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(s); return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return chunks.join('');
}

describe('printInline', () => {
  it('prints User and Project scope headers', () => {
    const out = capture(() => printInline(emptyData(), { color: true }));
    assert.match(out, /User \(Global\)/);
    assert.match(out, /Project/);
  });

  it('excludes the Marketplaces section from output', () => {
    const out = capture(() => printInline(emptyData(), { color: true }));
    assert.ok(!out.includes('Marketplaces'), 'output should not contain Marketplaces');
  });

  it('dims empty sections with ANSI escape codes', () => {
    const out = capture(() => printInline(emptyData(), { color: true }));
    assert.match(out, /\x1b\[2m.*Plugins \(0\).*\x1b\[0m/);
  });

  it('does not dim sections that have handlers', () => {
    const data = emptyData();
    data.userSettings = {
      hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo' }] }] }
    };
    const out = capture(() => printInline(data, { color: true }));
    const hookLineMatch = out.match(/^.*Hooks \(1\).*$/m);
    assert.ok(hookLineMatch, 'Hooks section should be present');
    assert.ok(!hookLineMatch[0].startsWith('\x1b[2m'), 'Hooks section should not be dimmed when it has handlers');
  });

  it('lists plugin items under the Plugins section', () => {
    const data = emptyData();
    data.installedPlugins = [
      { name: 'my-plugin', scope: 'user', enabled: true, marketplace: '', files: [] }
    ];
    const out = capture(() => printInline(data, { color: true }));
    assert.match(out, /\u2514\u2500 my-plugin/);
  });
});
