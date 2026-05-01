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

  it('strips trailing commas in JSONC config files', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.copilot'));
    fs.writeFileSync(path.join(home, '.copilot', 'config.json'),
      '// header\n' +
      '{\n' +
      '  "installedPlugins": [\n' +
      '    { "name": "p1", "marketplace": "mkt", "enabled": true },\n' +
      '  ],\n' +
      '  "trustedFolders": ["/x", "/y",],\n' +
      '}\n');
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.installedPlugins.length, 1);
    assert.equal(data.installedPlugins[0].name, 'p1');
    assert.deepEqual(data.trustedFolders, ['/x', '/y']);
  });

  it('tolerates JSONC line and block comments in config files', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.copilot'));
    // Mimic real Copilot CLI config.json which is JSONC
    fs.writeFileSync(path.join(home, '.copilot', 'config.json'),
      '// This file is managed automatically.\n' +
      '// Do not edit by hand.\n' +
      '{\n' +
      '  /* installed plugins live here */\n' +
      '  "installedPlugins": [\n' +
      '    { "name": "p1", "marketplace": "mkt", "enabled": true } // first one\n' +
      '  ],\n' +
      '  "trustedFolders": ["C:\\\\path\\\\with\\\\//slashes"]\n' +
      '}\n');
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.installedPlugins.length, 1);
    assert.equal(data.installedPlugins[0].name, 'p1');
    // Ensure the // inside the string literal was preserved
    assert.equal(data.trustedFolders[0], 'C:\\path\\with\\//slashes');
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

describe('scanCopilot — plugins', () => {
  function setupPlugin(home, mkt, name, opts) {
    opts = opts || {};
    const root = path.join(home, '.copilot/installed-plugins', mkt, name);
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    writeJson(home, path.join('.copilot/installed-plugins', mkt, name, '.claude-plugin/plugin.json'),
      { name, version: opts.version || '1.0.0', description: opts.desc || '' });
    if (opts.skills) {
      opts.skills.forEach(s => {
        const sd = path.join(root, 'skills', s.dir);
        fs.mkdirSync(sd, { recursive: true });
        fs.writeFileSync(path.join(sd, 'SKILL.md'),
          `---\nname: ${s.name}\ndescription: ${s.desc || ''}\n---\nbody`);
      });
    }
    if (opts.commands) {
      const cd = path.join(root, 'commands'); fs.mkdirSync(cd, { recursive: true });
      opts.commands.forEach(c => {
        fs.writeFileSync(path.join(cd, c.file),
          `---\nname: ${c.name}\ndescription: ${c.desc || ''}\nargument-hint: ${c.hint || ''}\n---`);
      });
    }
    if (opts.agents) {
      const ad = path.join(root, 'agents'); fs.mkdirSync(ad, { recursive: true });
      opts.agents.forEach(a => {
        fs.writeFileSync(path.join(ad, a.file),
          `---\nname: ${a.name}\ndescription: ${a.desc || ''}\nmodel: ${a.model || ''}\n---`);
      });
    }
    if (opts.hooks) {
      writeJson(home, path.join('.copilot/installed-plugins', mkt, name, 'hooks/hooks.json'),
        { description: opts.hooksDesc || '', hooks: opts.hooks });
    }
    return root;
  }

  it('discovers plugins and resolves enabled from settings.enabledPlugins', () => {
    const home = tmp();
    setupPlugin(home, 'mp', 'sp', {});
    setupPlugin(home, 'mp', 'off', {});
    writeJson(home, '.copilot/settings.json', {
      enabledPlugins: { 'sp@mp': true, 'off@mp': false }
    });
    writeJson(home, '.copilot/config.json', {
      installedPlugins: [
        { name: 'sp', marketplace: 'mp', version: '1.0.0', installed_at: '2026-04-01T00:00:00Z',
          enabled: true, cache_path: path.join(home, '.copilot/installed-plugins/mp/sp') },
        { name: 'off', marketplace: 'mp', version: '0.1.0', installed_at: '2026-04-02T00:00:00Z',
          enabled: false, cache_path: path.join(home, '.copilot/installed-plugins/mp/off') }
      ]
    });
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.installedPlugins.length, 2);
    const sp = data.installedPlugins.find(p => p.name === 'sp');
    assert.equal(sp.enabled, true);
    assert.equal(sp.marketplace, 'mp');
    assert.equal(sp.scope, 'user');
    assert.equal(sp.version, '1.0.0');
    assert.equal(sp.installedAt, '2026-04-01T00:00:00Z');
    assert.equal(sp.installPath, path.join(home, '.copilot/installed-plugins/mp/sp'));
    assert.equal(sp.projectPath, null);
    assert.equal(sp.unlinked, false);
    assert.equal(sp.currentProject, false);
    assert.ok(Array.isArray(sp.files));
    const off = data.installedPlugins.find(p => p.name === 'off');
    assert.equal(off.enabled, false);
  });

  it('falls back to record.enabled when settings.enabledPlugins lacks a key', () => {
    const home = tmp();
    setupPlugin(home, 'mp', 'a', {});
    setupPlugin(home, 'mp', 'b', {});
    writeJson(home, '.copilot/settings.json', {});
    writeJson(home, '.copilot/config.json', {
      installedPlugins: [
        { name: 'a', marketplace: 'mp', enabled: true,
          cache_path: path.join(home, '.copilot/installed-plugins/mp/a') },
        { name: 'b', marketplace: 'mp', enabled: false,
          cache_path: path.join(home, '.copilot/installed-plugins/mp/b') }
      ]
    });
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.installedPlugins.find(p => p.name === 'a').enabled, true);
    assert.equal(data.installedPlugins.find(p => p.name === 'b').enabled, false);
  });

  it('discovers skills/commands/agents/hooks under each plugin', () => {
    const home = tmp();
    setupPlugin(home, 'mp', 'sp', {
      skills: [{ dir: 'tdd', name: 'test-driven-development', desc: 'Use TDD' }],
      commands: [{ file: 'run.md', name: 'run', desc: 'Run a thing', hint: '<arg>' }],
      agents: [{ file: 'code-reviewer.md', name: 'code-reviewer', desc: 'Review', model: 'opus' }],
      hooksDesc: 'session hooks',
      hooks: { 'session-start': [{ command: 'run-hook' }] }
    });
    writeJson(home, '.copilot/config.json', {
      installedPlugins: [
        { name: 'sp', marketplace: 'mp', enabled: true,
          cache_path: path.join(home, '.copilot/installed-plugins/mp/sp') }
      ]
    });
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.pluginSkills.length, 1);
    assert.equal(data.pluginSkills[0].name, 'test-driven-development');
    assert.equal(data.pluginSkills[0].pluginName, 'sp');
    assert.equal(data.pluginSkills[0].marketplace, 'mp');

    assert.equal(data.pluginCommands.length, 1);
    assert.equal(data.pluginCommands[0].name, 'run');
    assert.equal(data.pluginCommands[0].argumentHint, '<arg>');
    assert.equal(data.pluginCommands[0].pluginName, 'sp');

    assert.equal(data.pluginAgents.length, 1);
    assert.equal(data.pluginAgents[0].name, 'code-reviewer');
    assert.equal(data.pluginAgents[0].model, 'opus');

    assert.equal(data.pluginHooks.length, 1);
    assert.equal(data.pluginHooks[0].event, 'session-start');
    assert.equal(data.pluginHooks[0].pluginName, 'sp');
    assert.equal(data.pluginHooks[0].description, 'session hooks');
  });

  it('skips contents when cache_path is missing on disk but still lists the plugin', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.copilot'));
    writeJson(home, '.copilot/config.json', {
      installedPlugins: [
        { name: 'ghost', marketplace: 'mp', enabled: true,
          cache_path: path.join(home, '.copilot/installed-plugins/mp/ghost') } // not created
      ]
    });
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.installedPlugins.length, 1);
    assert.deepEqual(data.installedPlugins[0].files, []);
    assert.deepEqual(data.pluginSkills, []);
    assert.deepEqual(data.pluginCommands, []);
    assert.deepEqual(data.pluginAgents, []);
    assert.deepEqual(data.pluginHooks, []);
  });

  it('falls back to a computed installPath when cache_path is missing from the record', () => {
    const home = tmp();
    setupPlugin(home, 'mp', 'noPath', {});
    writeJson(home, '.copilot/config.json', {
      installedPlugins: [
        { name: 'noPath', marketplace: 'mp', enabled: true } // no cache_path
      ]
    });
    const data = scanCopilot({ home, cwd: home });
    assert.equal(data.installedPlugins.length, 1);
    assert.equal(data.installedPlugins[0].installPath,
      path.join(home, '.copilot/installed-plugins/mp/noPath'));
  });
});

describe('scanCopilot — permissions', () => {
  it('parses per-folder tool approvals and flags current cwd vs missing dirs', () => {
    const home = tmp();
    const target = path.join(home, 'projx');
    fs.mkdirSync(target, { recursive: true });
    const missing = path.join(home, 'does', 'not', 'exist');
    writeJson(home, '.copilot/permissions-config.json', {
      locations: {
        [target]: { tool_approvals: [
          { kind: 'mcp', serverName: 'ado', toolName: 'wit_get_work_item' },
          { kind: 'commands', commandIdentifiers: ['git pull', 'npm test'] },
          { kind: 'write' }
        ]},
        [missing]: { tool_approvals: [{ kind: 'write' }] }
      }
    });
    const data = scanCopilot({ home, cwd: target });
    assert.equal(data.permissions.path, path.join(home, '.copilot/permissions-config.json'));
    assert.equal(data.permissions.locations.length, 2);

    const here = data.permissions.locations.find(l => l.folder === target);
    assert.equal(here.exists, true);
    assert.equal(here.isCwd, true);
    assert.equal(here.approvals.length, 3);
    assert.equal(here.approvals[0].kind, 'mcp');
    assert.equal(here.approvals[0].serverName, 'ado');
    assert.equal(here.approvals[0].toolName, 'wit_get_work_item');
    assert.deepEqual(here.approvals[1].commandIdentifiers, ['git pull', 'npm test']);
    assert.equal(here.approvals[2].kind, 'write');

    const gone = data.permissions.locations.find(l => l.folder === missing);
    assert.equal(gone.exists, false);
    assert.equal(gone.isCwd, false);
  });

  it('returns empty locations when permissions-config.json is absent', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.copilot'));
    const data = scanCopilot({ home, cwd: home });
    assert.deepEqual(data.permissions.locations, []);
    assert.equal(data.permissions.path, path.join(home, '.copilot/permissions-config.json'));
  });

  it('matches cwd case-insensitively and tolerates mixed path separators', () => {
    const home = tmp();
    const target = path.join(home, 'CaseDir');
    fs.mkdirSync(target, { recursive: true });
    writeJson(home, '.copilot/permissions-config.json', {
      locations: { [target]: { tool_approvals: [{ kind: 'write' }] } }
    });
    // Pass in cwd with different case to verify normalization
    const data = scanCopilot({ home, cwd: target.toLowerCase() });
    assert.equal(data.permissions.locations[0].isCwd, true);
  });
});

describe('scanCopilot — marketplace catalogs', () => {
  it('walks marketplace-cache and links installed plugins', () => {
    const home = tmp();
    // Install one plugin so the catalog can mark it installed
    writeJson(home, '.copilot/config.json', {
      installedPlugins: [
        { name: 'p1', marketplace: 'mkt', enabled: true,
          cache_path: path.join(home, '.copilot/installed-plugins/mkt/p1') }
      ]
    });

    // Marketplace cache: catalog entries for two plugins (one installed, one not)
    // and a bonus skill at the marketplace level.
    writeJson(home, '.copilot/marketplace-cache/mkt/plugins/p1/.claude-plugin/plugin.json',
      { name: 'p1', description: 'first plugin' });
    writeJson(home, '.copilot/marketplace-cache/mkt/plugins/p2/plugin.json',
      { name: 'p2', description: 'second plugin' });
    fs.mkdirSync(path.join(home, '.copilot/marketplace-cache/mkt/skills/extra'), { recursive: true });
    fs.writeFileSync(path.join(home, '.copilot/marketplace-cache/mkt/skills/extra/SKILL.md'),
      '---\nname: extra\ndescription: Bonus skill\n---');

    const data = scanCopilot({ home, cwd: home });
    assert.ok(data.marketplaceCatalogs.mkt, 'mkt catalog populated');
    const cat = data.marketplaceCatalogs.mkt;
    assert.equal(cat.plugins.length, 2);
    const p1 = cat.plugins.find(p => p.name === 'p1');
    assert.equal(p1.installed, true);
    const p2 = cat.plugins.find(p => p.name === 'p2');
    assert.equal(p2.installed, false);
    assert.equal(cat.skills.length, 1);
    assert.equal(cat.skills[0].name, 'extra');
  });

  it('returns empty catalogs when marketplace-cache is absent', () => {
    const home = tmp();
    fs.mkdirSync(path.join(home, '.copilot'));
    const data = scanCopilot({ home, cwd: home });
    assert.deepEqual(data.marketplaceCatalogs, {});
  });
});
