const fs = require('fs');
const path = require('path');
const sh = require('./shared');

function safeIsDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }

function scanCopilot(args) {
  const { home, cwd } = args;
  const root = path.join(home, '.copilot');

  const userSettings = sh.readJson(path.join(root, 'settings.json')) || {};
  const config = sh.readJson(path.join(root, 'config.json')) || {};
  const mcpFile = sh.readJson(path.join(root, 'mcp-config.json')) || {};
  const permsRaw = sh.readJson(path.join(root, 'permissions-config.json')) || {};

  const enabledMap = userSettings.enabledPlugins || {};
  const installedRecords = config.installedPlugins || [];

  const installedPlugins = installedRecords.map(rec => {
    const installPath = rec.cache_path || path.join(root, 'installed-plugins', rec.marketplace || '', rec.name || '');
    const key = rec.name + '@' + rec.marketplace;
    const enabled = Object.prototype.hasOwnProperty.call(enabledMap, key)
      ? enabledMap[key] !== false
      : (rec.enabled !== false);
    const onDisk = safeIsDir(installPath);
    return {
      name: rec.name, marketplace: rec.marketplace, scope: 'user',
      version: rec.version, installedAt: rec.installed_at,
      installPath,
      projectPath: null, unlinked: false, currentProject: false,
      enabled,
      files: onDisk ? sh.scanDirTree(installPath) : []
    };
  });

  const normPath = p => (p || '').replace(/\\/g, '/').toLowerCase();
  const cwdNorm = normPath(cwd);
  const permLocations = Object.entries(permsRaw.locations || {}).map(([folder, entry]) => {
    const approvalsRaw = (entry && entry.tool_approvals) || [];
    return {
      folder,
      exists: safeIsDir(folder),
      isCwd: normPath(folder) === cwdNorm,
      approvals: approvalsRaw.map(a => ({
        kind: a.kind,
        serverName: a.serverName,
        toolName: a.toolName,
        commandIdentifiers: a.commandIdentifiers
      }))
    };
  });

  const marketplaceCatalogs = sh.scanMarketplaceCatalogs({
    rootDir: path.join(root, 'marketplace-cache'),
    installedPlugins
  });

  const pluginSkills = [];
  const pluginCommands = [];
  const pluginAgents = [];
  const pluginHooks = [];

  installedPlugins.forEach(p => {
    if (!safeIsDir(p.installPath)) return;

    // skills/<name>/SKILL.md
    const skillsDir = path.join(p.installPath, 'skills');
    sh.listDirs(skillsDir).forEach(sname => {
      const skillPath = path.join(skillsDir, sname);
      const md = sh.readText(path.join(skillPath, 'SKILL.md'));
      if (md === null) return;
      const fm = sh.parseFrontmatter(md);
      pluginSkills.push({
        name: fm.name || sname,
        description: fm.description || '',
        path: skillPath,
        pluginName: p.name,
        marketplace: p.marketplace,
        files: sh.scanDirTree(skillPath)
      });
    });

    // commands/*.md
    const cmdsDir = path.join(p.installPath, 'commands');
    sh.listFiles(cmdsDir, '.md').forEach(f => {
      const filePath = path.join(cmdsDir, f);
      const md = sh.readText(filePath);
      const fm = sh.parseFrontmatter(md);
      pluginCommands.push({
        name: fm.name || f.replace('.md', ''),
        description: fm.description || '',
        argumentHint: fm['argument-hint'] || '',
        path: filePath,
        pluginName: p.name,
        marketplace: p.marketplace
      });
    });

    // agents/*.md
    const agentsDir = path.join(p.installPath, 'agents');
    sh.listFiles(agentsDir, '.md').forEach(f => {
      const filePath = path.join(agentsDir, f);
      const md = sh.readText(filePath);
      const fm = sh.parseFrontmatter(md);
      pluginAgents.push({
        name: fm.name || f.replace('.md', ''),
        description: fm.description || '',
        model: fm.model || '',
        path: filePath,
        pluginName: p.name,
        marketplace: p.marketplace
      });
    });

    // hooks/hooks.json
    const hooksFile = sh.readJson(path.join(p.installPath, 'hooks', 'hooks.json'));
    if (hooksFile && hooksFile.hooks && typeof hooksFile.hooks === 'object' && !Array.isArray(hooksFile.hooks)) {
      Object.keys(hooksFile.hooks).forEach(evt => {
        pluginHooks.push({
          event: evt,
          description: hooksFile.description || '',
          pluginName: p.name,
          marketplace: p.marketplace
        });
      });
    }
  });

  return {
    mode: 'copilot-cli',

    // Settings (only user-level exists in Copilot CLI)
    userSettings,
    projectSettings: null,
    localSettings: null,
    userSettingsPath: path.join(root, 'settings.json'),
    projectSettingsPath: null,
    localSettingsPath: null,

    // MCP
    userMcpPath: path.join(root, 'mcp-config.json'),
    projectMcpPath: null,
    mcpServers: mcpFile.mcpServers || {},
    projectMcp: null,

    // Plugins (Task 4 fills these)
    installedPlugins,
    marketplaces: userSettings.extraKnownMarketplaces || {},
    blockedPlugins: null,

    // Skills/commands/agents/rules — Copilot has no project scope
    userSkills: [],
    projectSkills: [],
    pluginSkills,
    pluginCommands,
    pluginAgents,
    pluginHooks,
    userCommands: [],
    projectCommands: [],
    userAgents: [],
    projectAgents: [],
    projectRules: [],
    userRules: [],
    autoMemory: [],
    marketplaceCatalogs,

    // CLAUDE.md equivalents — none in Copilot CLI
    userClaudeMd: { exists: false, content: '', path: null },
    projectClaudeMd: { exists: false, content: '', path: null },
    localClaudeMd: { exists: false, content: '', path: null },

    // Paths and metadata
    projectPath: cwd,
    homePath: home,
    generatedAt: new Date().toISOString(),

    // Copilot-specific top-level conveniences
    model: userSettings.model || null,
    trustedFolders: config.trustedFolders || [],
    sessionSync: config.sessionSync || [],
    loggedInUsers: config.loggedInUsers || [],

    // Permissions (Copilot-specific)
    permissions: {
      path: path.join(root, 'permissions-config.json'),
      locations: permLocations
    },

    // Hook events relevant to Copilot CLI
    hookEvents: [
      {
        name: 'session-start',
        description: 'Runs when a Copilot CLI session begins',
        icon: '\u{1F680}'
      }
    ]
  };
}

module.exports = { scanCopilot };
