const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanCopilot } = require('../lib/adapters/copilot');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cci-copilot-')); }
function writeJson(base, rel, obj) {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj));
}

describe('scanCopilot — settings, config, mcp', () => {
  it('reads settings.json, config.json, mcp-config.json into shared schema', () => {
    const home = tmp();
    writeJson(home, '.copilot/settings.json', {
      theme: 'auto',
      model: 'claude-opus-4.7',
      enabledPlugins: { 'foo@mkt': true },
      extraKnownMarketplaces: { mkt: { source: { source: 'github', repo: 'a/b' } } }
    });
    writeJson(home, '.copilot/config.json', {
      loggedInUsers: [{ host: 'https://github.com', login: 'me' }],
      trustedFolders: ['C:\\repo\\x', '/home/me/repo/y'],
      installedPlugins: [],
      sessionSync: [{ origin: 'a/b', level: 'user' }]
    });
    writeJson(home, '.copilot/mcp-config.json', {
      mcpServers: { ado: { command: 'agency', args: ['mcp', 'ado'] } }
    });

    const data = scanCopilot({ home, cwd: home });

    // Mode flag
    assert.equal(data.mode, 'copilot-cli');

    // User settings surfaced
    assert.equal(data.userSettings.theme, 'auto');
    assert.equal(data.userSettings.model, 'claude-opus-4.7');

    // Convenience top-level fields
    assert.equal(data.model, 'claude-opus-4.7');
    assert.deepEqual(data.trustedFolders, ['C:\\repo\\x', '/home/me/repo/y']);
    assert.deepEqual(data.sessionSync, [{ origin: 'a/b', level: 'user' }]);
    assert.deepEqual(data.loggedInUsers, [{ host: 'https://github.com', login: 'me' }]);

    // MCP from mcp-config.json
    assert.ok(data.mcpServers.ado);
    assert.equal(data.mcpServers.ado.command, 'agency');

    // Marketplaces taken from extraKnownMarketplaces
    assert.equal(data.marketplaces.mkt.source.repo, 'a/b');

    // Project scope empty (no project-level Copilot config exists)
    assert.equal(data.projectSettings, null);
    assert.equal(data.localSettings, null);
    assert.deepEqual(data.projectSkills, []);
    assert.deepEqual(data.projectCommands, []);
    assert.deepEqual(data.projectAgents, []);
    assert.deepEqual(data.projectRules, []);
    assert.equal(data.projectClaudeMd.exists, false);
    assert.equal(data.localClaudeMd.exists, false);
    assert.equal(data.userClaudeMd.exists, false);
    assert.deepEqual(data.userRules, []);
    assert.deepEqual(data.autoMemory, []);

    // Plugins arrays empty (Task 4)
    assert.deepEqual(data.installedPlugins, []);
    assert.deepEqual(data.pluginSkills, []);

    // Permissions stub (locations populated in Task 5)
    assert.ok(data.permissions);
    assert.equal(data.permissions.path, path.join(home, '.copilot', 'permissions-config.json'));
    assert.deepEqual(data.permissions.locations, []);

    // Hook events: Copilot has only session-start
    assert.equal(data.hookEvents.length, 1);
    assert.equal(data.hookEvents[0].name, 'session-start');

    // Paths
    assert.equal(data.userSettingsPath, path.join(home, '.copilot', 'settings.json'));
    assert.equal(data.userMcpPath, path.join(home, '.copilot', 'mcp-config.json'));
    assert.equal(data.projectSettingsPath, null);
    assert.equal(data.projectMcpPath, null);
    assert.equal(data.homePath, home);
    assert.equal(data.projectPath, home);
    assert.ok(data.generatedAt);
  });

  it('handles a completely empty ~/.copilot dir without crashing', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.copilot'));

    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.mode, 'copilot-cli');
    assert.deepEqual(data.userSettings, {});
    assert.equal(data.model, null);
    assert.deepEqual(data.trustedFolders, []);
    assert.deepEqual(data.sessionSync, []);
    assert.deepEqual(data.loggedInUsers, []);
    assert.deepEqual(data.mcpServers, {});
    assert.deepEqual(data.marketplaces, {});
    assert.deepEqual(data.installedPlugins, []);
  });

  it('handles missing ~/.copilot entirely (no crash)', () => {
    const home = tmp(); // no .copilot dir
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.mode, 'copilot-cli');
    assert.deepEqual(data.userSettings, {});
    assert.equal(data.model, null);
    assert.deepEqual(data.trustedFolders, []);
  });
});
