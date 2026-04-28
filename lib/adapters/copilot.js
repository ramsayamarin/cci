const path = require('path');
const sh = require('./shared');

function scanCopilot(args) {
  const { home, cwd } = args;
  const root = path.join(home, '.copilot');

  const userSettings = sh.readJson(path.join(root, 'settings.json')) || {};
  const config = sh.readJson(path.join(root, 'config.json')) || {};
  const mcpFile = sh.readJson(path.join(root, 'mcp-config.json')) || {};

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
    installedPlugins: [],
    marketplaces: userSettings.extraKnownMarketplaces || {},
    blockedPlugins: null,

    // Skills/commands/agents/rules — Copilot has no project scope
    userSkills: [],
    projectSkills: [],
    pluginSkills: [],
    pluginCommands: [],
    pluginAgents: [],
    pluginHooks: [],
    userCommands: [],
    projectCommands: [],
    userAgents: [],
    projectAgents: [],
    projectRules: [],
    userRules: [],
    autoMemory: [],
    marketplaceCatalogs: {},

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

    // Permissions stub (Task 5 populates locations)
    permissions: {
      path: path.join(root, 'permissions-config.json'),
      locations: []
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
