const fs = require('fs');
const path = require('path');
const shared = require('./shared');

const {
  readJson, readText, listDirs, listFiles, parseFrontmatter, cleanDesc,
  scanDirTree, scanSkills, scanCommands, scanAgents, scanRules, checkClaudeMd,
  scanMarketplaceCatalogs
} = shared;

/**
 * Scan all Claude Code configuration from the filesystem.
 * @param {object} obj - Configuration object
 * @param {string} obj.home - Home directory (for ~/.claude/)
 * @param {string} obj.cwd - Project directory to scan
 * @returns {object} Dashboard data object with mode: 'claude-code'
 */
function scanClaude({ home, cwd }) {
  // 1. Config files
  const userSettings = readJson(path.join(home, '.claude', 'settings.json'));
  const projectSettings = readJson(path.join(cwd, '.claude', 'settings.json'));
  const localSettings = readJson(path.join(cwd, '.claude', 'settings.local.json'));

  const installedPlugins = [];
  const normPath = p => (p||'').replace(/\\/g, '/').toLowerCase();
  const cwdNorm = normPath(cwd);

  // Claude plugins
  const pluginsRaw = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
  const enabledPlugins = userSettings?.enabledPlugins || {};
  if (pluginsRaw && pluginsRaw.plugins) {
    Object.entries(pluginsRaw.plugins).forEach(([key, entries]) => {
      const [pluginName, marketplace] = key.split('@');
      entries.forEach(e => {
        const scope = e.scope || 'user';
        const pp = e.projectPath || null;
        let unlinked = false;
        let currentProject = false;
        if (scope === 'project' && pp) {
          const ppExists = (() => { try { return fs.statSync(pp).isDirectory(); } catch(e) { return false; } })();
          unlinked = !ppExists;
          currentProject = normPath(pp) === cwdNorm;
        }
        const enabled = enabledPlugins[key] !== false;
        installedPlugins.push({
          name: pluginName, marketplace, scope,
          version: e.version, installedAt: e.installedAt,
          installPath: e.installPath,
          projectPath: pp, unlinked, currentProject, enabled,
          files: e.installPath ? scanDirTree(e.installPath) : []
        });
      });
    });
  }

  const marketplaces = readJson(path.join(home, '.claude', 'plugins', 'known_marketplaces.json'));
  const blockedPlugins = readJson(path.join(home, '.claude', 'plugins', 'blocklist.json'));

  const claudeJson = readJson(path.join(home, '.claude.json'));
  const mcpServers = claudeJson?.mcpServers || {};
  const projectMcpFile = readJson(path.join(cwd, '.mcp.json'));
  // Project-scoped MCP servers stored in ~/.claude.json under projects[cwd].mcpServers
  const cwdFwd = cwd.replace(/\\/g, '/');
  const cwdBck = cwd.replace(/\//g, '\\');
  const projEntry = claudeJson?.projects?.[cwdFwd] || claudeJson?.projects?.[cwdBck] || {};
  const projClaudeMcp = projEntry.mcpServers || {};
  const projectMcp = Object.keys(projClaudeMcp).length
    ? { ...(projectMcpFile || {}), mcpServers: { ...projClaudeMcp, ...(projectMcpFile?.mcpServers || {}) } }
    : projectMcpFile;

  // 2. Skills
  const userSkills = scanSkills(path.join(home, '.claude', 'skills'), true);
  const projectSkills = scanSkills(path.join(cwd, '.claude', 'skills'), false);

  // 2b. Commands
  const userCommands = scanCommands(path.join(home, '.claude', 'commands'));
  const projectCommands = scanCommands(path.join(cwd, '.claude', 'commands'));

  // 2c. Flag commands that originated from skills (content hash matching)
  const crypto = require('crypto');
  const promptHashToSkill = {};
  [...userSkills, ...projectSkills].forEach(s => {
    const promptsDir = path.join(s.path, 'prompts');
    listFiles(promptsDir, '.md').forEach(f => {
      const content = readText(path.join(promptsDir, f));
      if (content) {
        const hash = crypto.createHash('md5').update(content).digest('hex');
        promptHashToSkill[hash] = s.name;
      }
    });
  });
  [userCommands, projectCommands].forEach(cmds => {
    cmds.forEach(c => {
      const content = readText(c.path);
      if (content) {
        const hash = crypto.createHash('md5').update(content).digest('hex');
        if (promptHashToSkill[hash]) c.originSkill = promptHashToSkill[hash];
      }
    });
  });

  // 3. Plugin contents (skills, commands, agents, hooks)
  const pluginSkills = [];
  const pluginCommands = [];
  const pluginAgents = [];
  const pluginHooks = [];
  installedPlugins.forEach(p => {
    if (!p.installPath) return;
    const skillsDir = path.join(p.installPath, 'skills');
    listDirs(skillsDir).forEach(sname => {
      const md = readText(path.join(skillsDir, sname, 'SKILL.md'));
      const fm = parseFrontmatter(md);
      const pluginSkillPath = path.join(skillsDir, sname);
      pluginSkills.push({
        name: fm.name || sname,
        description: fm.description || '',
        path: pluginSkillPath,
        pluginName: p.name,
        marketplace: p.marketplace,
        files: scanDirTree(pluginSkillPath)
      });
    });
    const cmdsDir = path.join(p.installPath, 'commands');
    listFiles(cmdsDir, '.md').forEach(f => {
      const md = readText(path.join(cmdsDir, f));
      const fm = parseFrontmatter(md);
      pluginCommands.push({
        name: fm.name || f.replace('.md',''),
        description: fm.description || '',
        argumentHint: fm['argument-hint'] || '',
        path: path.join(cmdsDir, f),
        pluginName: p.name,
        marketplace: p.marketplace
      });
    });
    const agentsDir = path.join(p.installPath, 'agents');
    listFiles(agentsDir, '.md').forEach(f => {
      const md = readText(path.join(agentsDir, f));
      const fm = parseFrontmatter(md);
      pluginAgents.push({
        name: fm.name || f.replace('.md',''),
        description: fm.description || '',
        model: fm.model || '',
        path: path.join(agentsDir, f),
        pluginName: p.name,
        marketplace: p.marketplace
      });
    });
    const hooksFile = readJson(path.join(p.installPath, 'hooks', 'hooks.json'));
    if (hooksFile && hooksFile.hooks) {
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

  // 4. Agents
  const userAgents = scanAgents(path.join(home, '.claude', 'agents'));
  const projectAgents = scanAgents(path.join(cwd, '.claude', 'agents'));

  // 5. CLAUDE.md files
  const userClaudeMd = checkClaudeMd(path.join(home, '.claude', 'CLAUDE.md'));
  const projectClaudeMd = (() => {
    const p1 = checkClaudeMd(path.join(cwd, 'CLAUDE.md'));
    if (p1.exists) return p1;
    return checkClaudeMd(path.join(cwd, '.claude', 'CLAUDE.md'));
  })();
  const localClaudeMd = checkClaudeMd(path.join(cwd, 'CLAUDE.local.md'));

  // 6. Rules
  const userRules = scanRules(path.join(home, '.claude', 'rules'));
  const projectRules = scanRules(path.join(cwd, '.claude', 'rules'));

  // 7. Auto memory
  const autoMemory = [];
  const projectKey = cwd.replace(/\\/g, '/').replace(/[/:]/g, '-');
  const memDirs = [
    path.join(home, '.claude', 'projects', projectKey, 'memory'),
    path.join(home, '.claude', 'projects', cwd.replace(/\\/g, '-').replace(/:/g, '-'), 'memory'),
  ];
  for (const memDir of memDirs) {
    listFiles(memDir, '.md').forEach(f => {
      const content = readText(path.join(memDir, f));
      autoMemory.push({
        name: f, preview: content ? content.slice(0, 500) : '', path: path.join(memDir, f)
      });
    });
    if (autoMemory.length) break;
  }

  // 8. Marketplace catalogs
  const marketplaceCatalogs = scanMarketplaceCatalogs({
    rootDir: path.join(home, '.claude', 'plugins', 'marketplaces'),
    installedPlugins
  });

  // 9. Hook events (static)
  const hookEvents = [
    {name:"PreToolUse",description:"Runs before a tool is executed",icon:"\u23F3",matcherInput:"tool name"},
    {name:"PostToolUse",description:"Runs after a tool completes",icon:"\u2705",matcherInput:"tool name"},
    {name:"Notification",description:"Runs when Claude wants to notify the user",icon:"\uD83D\uDD14",matcherInput:"notification type"},
    {name:"Stop",description:"Runs when Claude finishes its response",icon:"\uD83D\uDED1",matcherInput:"stop reason"},
    {name:"SubagentStop",description:"Runs when a subagent finishes",icon:"\uD83E\uDD16",matcherInput:"stop reason"},
    {name:"SessionStart",description:"Runs when a new session begins",icon:"\uD83D\uDE80"},
    {name:"SessionStop",description:"Runs when a session ends",icon:"\uD83C\uDFC1"}
  ];

  return {
    mode: 'claude-code',
    userSettings, projectSettings, localSettings,
    userSettingsPath: path.join(home, '.claude', 'settings.json'),
    projectSettingsPath: path.join(cwd, '.claude', 'settings.json'),
    localSettingsPath: path.join(cwd, '.claude', 'settings.local.json'),
    userMcpPath: path.join(home, '.claude.json'),
    projectMcpPath: path.join(cwd, '.mcp.json'),
    installedPlugins, marketplaces, blockedPlugins,
    mcpServers, projectMcp,
    userSkills, projectSkills, pluginSkills, pluginCommands, pluginAgents, pluginHooks,
    userCommands, projectCommands,
    userAgents, projectAgents,
    userClaudeMd, projectClaudeMd, localClaudeMd,
    projectRules, userRules, autoMemory, marketplaceCatalogs,
    projectPath: cwd,
    homePath: home,
    generatedAt: new Date().toISOString(),
    hookEvents
  };
}

module.exports = { scanClaude };
