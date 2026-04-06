const fs = require('fs');
const path = require('path');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return null; }
}
function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch(e) { return null; }
}
function listDirs(p) {
  try { return fs.readdirSync(p, {withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name); } catch(e) { return []; }
}
function listFiles(p, ext) {
  try { return fs.readdirSync(p).filter(f=> !ext || f.endsWith(ext)); } catch(e) { return []; }
}
function parseFrontmatter(text) {
  if (!text) return {};
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const obj = {};
  m[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx+1).trim();
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) val = val.slice(1,-1);
      obj[key] = val;
    }
  });
  return obj;
}

function cleanDesc(s) {
  return (s||'').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').replace(/`/g, '').replace(/^>\s*/gm,'').slice(0, 200);
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.cache', '.venv', '.env', '.tox', '.mypy_cache']);
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
  '.pdf', '.psd', '.ai']);
const MAX_FILE_SIZE = 50 * 1024; // 50KB
const MAX_DEPTH = 5;

function scanDirTree(dirPath, depth) {
  if (depth === undefined) depth = 0;
  if (depth >= MAX_DEPTH) return [];
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch(e) { return []; }
  const results = [];
  entries.sort((a, b) => {
    // directories first, then alphabetical
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.') && SKIP_DIRS.has(name)) continue;
    if (SKIP_DIRS.has(name)) continue;
    const fullPath = path.join(dirPath, name);
    if (entry.isDirectory()) {
      if (name.startsWith('.')) continue; // skip all dot-directories
      const children = scanDirTree(fullPath, depth + 1);
      results.push({ name, type: 'directory', path: fullPath, children });
    } else {
      const ext = path.extname(name).toLowerCase();
      const isBinary = BINARY_EXTS.has(ext);
      let size = 0;
      try { size = fs.statSync(fullPath).size; } catch(e) {}
      let content = null;
      if (!isBinary && size <= MAX_FILE_SIZE) {
        try { content = fs.readFileSync(fullPath, 'utf8'); } catch(e) {}
      }
      results.push({ name, type: 'file', path: fullPath, size, content, binary: isBinary || undefined });
    }
  }
  return results;
}

function scanSkills(dir, skipDashboard) {
  return listDirs(dir).filter(d => !skipDashboard || d !== 'dashboard').filter(name => {
    return readText(path.join(dir, name, 'SKILL.md')) !== null;
  }).map(name => {
    const md = readText(path.join(dir, name, 'SKILL.md'));
    const fm = parseFrontmatter(md);
    const skillPath = path.join(dir, name);
    return {
      name: fm.name || name,
      description: fm.description || '',
      path: skillPath,
      disableModelInvocation: fm['disable-model-invocation'] === true,
      allowedTools: fm['allowed-tools'] || '',
      argumentHint: fm['argument-hint'] || '',
      files: scanDirTree(skillPath)
    };
  });
}

function scanCommands(dir) {
  return listFiles(dir, '.md').map(f => {
    const content = readText(path.join(dir, f));
    const fm = parseFrontmatter(content);
    return {
      name: fm.name || f.replace('.md',''),
      description: fm.description || '',
      argumentHint: fm['argument-hint'] || '',
      lines: content ? content.split('\n').length : 0,
      path: path.join(dir, f)
    };
  });
}

function scanAgents(dir) {
  return listFiles(dir, '.md').map(f => {
    const content = readText(path.join(dir, f));
    const fm = parseFrontmatter(content);
    return {
      name: fm.name || f.replace('.md',''),
      description: fm.description || '',
      model: fm.model || '',
      tools: fm.tools || '',
      path: path.join(dir, f),
      content: content || ''
    };
  });
}

function scanRules(dir) {
  return listFiles(dir, '.md').map(f => {
    const content = readText(path.join(dir, f));
    const fm = parseFrontmatter(content);
    return { name: f.replace('.md',''), paths: fm.paths || null, content: content || '', path: path.join(dir, f) };
  });
}

function checkClaudeMd(p) {
  const content = readText(p);
  return { exists: content !== null, content: content || '', path: p };
}

const home = process.env.HOME || process.env.USERPROFILE;

/**
 * Scan all Claude Code configuration from the filesystem.
 * @param {string} [projectDir] - Project directory to scan (defaults to cwd)
 * @returns {object} Dashboard data object
 */
function scan(projectDir) {
  const cwd = projectDir || process.cwd();

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
  const installedByKey = new Set(installedPlugins.map(p => p.name + '@' + p.marketplace));
  const installedByName = {};
  installedPlugins.forEach(p => { if (!installedByName[p.name]) installedByName[p.name] = p.marketplace; });
  const marketplaceCatalogs = {};
  const mktRoots = [
    path.join(home, '.claude', 'plugins', 'marketplaces')
  ];

  for (const mktRoot of mktRoots) {
    listDirs(mktRoot).forEach(mktName => {
      const mktPath = path.join(mktRoot, mktName);

      if (!marketplaceCatalogs[mktName]) {
        marketplaceCatalogs[mktName] = { plugins: [], skills: [], agents: [] };
      }
      const entry = marketplaceCatalogs[mktName];

      const existingPluginNames = new Set(entry.plugins.map(p => p.name));

      const plugSubdir = path.join(mktPath, 'plugins');
      let plugDir = mktPath;
      try { if (fs.statSync(plugSubdir).isDirectory()) plugDir = plugSubdir; } catch(e) { plugDir = null; }
      if (plugDir) {
        listDirs(plugDir).filter(d => !d.startsWith('.')).forEach(pName => {
          if (existingPluginNames.has(pName)) return;
          const pPath = path.join(plugDir, pName);
          let meta = null;
          for (const f of ['manifest.json', 'plugin.json', 'package.json']) {
            const j = readJson(path.join(pPath, f));
            if (j) { meta = j; break; }
          }
          let desc = meta?.description || '';
          if (!desc) { const r = readText(path.join(pPath, 'README.md')); if (r) { const l = r.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>')); if (l) desc = l.trim(); } }
          const name = meta?.name || pName;
          const exactMatch = installedByKey.has(pName + '@' + mktName);
          const nameMatch = !exactMatch && !!installedByName[pName];
          entry.plugins.push({
            name, description: cleanDesc(desc),
            installed: exactMatch || nameMatch,
            installedFrom: nameMatch ? installedByName[pName] : null
          });
        });
      }

      const existingSkillNames = new Set(entry.skills.map(s => s.name));
      const skillsSubdir = path.join(mktPath, 'skills');
      try {
        if (fs.statSync(skillsSubdir).isDirectory()) {
          listDirs(skillsSubdir).filter(d => !d.startsWith('.')).forEach(sName => {
            if (existingSkillNames.has(sName)) return;
            const md = readText(path.join(skillsSubdir, sName, 'SKILL.md'));
            const fm = parseFrontmatter(md);
            entry.skills.push({ name: fm.name || sName, description: cleanDesc(fm.description) });
          });
        }
      } catch(e) {}

      const existingAgentNames = new Set(entry.agents.map(a => a.name));
      const agentsSubdir = path.join(mktPath, 'agents');
      try {
        if (fs.statSync(agentsSubdir).isDirectory()) {
          listFiles(agentsSubdir, '.md').forEach(f => {
            const aName = f.replace('.md','');
            if (existingAgentNames.has(aName)) return;
            const md = readText(path.join(agentsSubdir, f));
            const fm = parseFrontmatter(md);
            entry.agents.push({ name: fm.name || aName, description: cleanDesc(fm.description) });
          });
        }
      } catch(e) {}
    });
  }

  // Remove empty catalogs
  for (const k of Object.keys(marketplaceCatalogs)) {
    const e = marketplaceCatalogs[k];
    if (!e.plugins.length && !e.skills.length && !e.agents.length) delete marketplaceCatalogs[k];
  }

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

module.exports = { scan };
