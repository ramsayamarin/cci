// Pure data-layer functions shared between browser dashboard and Node tests.
// In the browser, cli.js injects this as a <script> tag (globals).
// In Node, require() picks up the module.exports at the bottom.

const ICONS = {
  user: '\u{1F464}', project: '\u{1F4C1}', plugin: '\u{1F4E6}', skill: '\u26A1', command: '\u{1F4AC}',
  agent: '\u{1F916}', hook: '\u{1FA9D}', mcp: '\u{1F517}', rule: '\u{1F4CF}', claudemd: '\u{1F4C4}',
  settings: '\u2699\uFE0F', marketplace: '\u{1F3EA}', memory: '\u{1F9E0}', 'memory-file': '\u{1F4DD}',
  unlinked: '\u{1F517}', 'all-files': '\u{1F4C2}'
};

function fileIcon(name, isDir) {
  if (isDir) return '\u{1F4C1}';
  var ext = (name.match(/\.([^.]+)$/) || [])[1] || '';
  var map = { md:'\u{1F4DD}', txt:'\u{1F4DD}', json:'\u{1F4CB}', yaml:'\u{1F4CB}', yml:'\u{1F4CB}', toml:'\u{1F4CB}',
    js:'\u{1F4DC}', ts:'\u{1F4DC}', mjs:'\u{1F4DC}', cjs:'\u{1F4DC}', jsx:'\u{1F4DC}', tsx:'\u{1F4DC}',
    py:'\u{1F40D}', rb:'\u{1F48E}', go:'\u{1F535}', rs:'\u{1F980}', java:'\u2615', cs:'\u{1F537}', cpp:'\u2699\uFE0F', c:'\u2699\uFE0F', h:'\u2699\uFE0F',
    html:'\u{1F310}', css:'\u{1F3A8}', scss:'\u{1F3A8}', less:'\u{1F3A8}',
    sh:'\u{1F5A5}\uFE0F', bash:'\u{1F5A5}\uFE0F', zsh:'\u{1F5A5}\uFE0F', ps1:'\u{1F5A5}\uFE0F', bat:'\u{1F5A5}\uFE0F', cmd:'\u{1F5A5}\uFE0F',
    png:'\u{1F5BC}\uFE0F', jpg:'\u{1F5BC}\uFE0F', jpeg:'\u{1F5BC}\uFE0F', gif:'\u{1F5BC}\uFE0F', svg:'\u{1F5BC}\uFE0F', webp:'\u{1F5BC}\uFE0F', ico:'\u{1F5BC}\uFE0F',
    zip:'\u{1F4E6}', tar:'\u{1F4E6}', gz:'\u{1F4E6}',
    pdf:'\u{1F4D5}', doc:'\u{1F4D5}', docx:'\u{1F4D5}',
    lock:'\u{1F512}', env:'\u{1F512}'
  };
  return map[ext.toLowerCase()] || '\u{1F4C4}';
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

var _fileNodeId = 0;
function resetFileNodeId() { _fileNodeId = 0; }

function buildFileChildren(files, parentId) {
  if (!files || !files.length) return [];
  return files.map(function(f) {
    var id = parentId + ':file:' + (_fileNodeId++);
    var icon = fileIcon(f.name, f.type === 'directory');
    var node = { id: id, icon: icon, label: f.name, type: f.type === 'directory' ? 'directory' : 'file', data: f };
    if (f.type === 'directory') {
      node.children = buildFileChildren(f.children || [], id);
    }
    return node;
  });
}

function buildTree(D) {
  resetFileNodeId();
  var tree = [];

  var plugins = D.installedPlugins || [];
  var pluginSkills = D.pluginSkills || [];
  var pluginCommands = D.pluginCommands || [];
  var pluginAgentsData = D.pluginAgents || [];
  var pluginHooksData = D.pluginHooks || [];
  var mcpServers = D.mcpServers || {};
  var activeMcp = D.activeMcpTools || [];
  var allMcp = {};
  Object.entries(mcpServers).forEach(function(e) { allMcp[e[0]] = { config: e[1], tools: [] }; });
  activeMcp.forEach(function(a) { if(!allMcp[a.serverName]) allMcp[a.serverName]={config:null,tools:[]}; allMcp[a.serverName].tools = a.tools||[]; });
  var mkts = D.marketplaces ? Object.entries(D.marketplaces) : [];

  // === USER (Global) ===
  var userNode = { id:'scope-user', icon:ICONS.user, label:'User (Global)', children: [] };

  var userPlugins = plugins.filter(function(p) { return p.scope !== 'project'; });
  var uPlugins = { id:'user-plugins', icon:ICONS.plugin, label:'Plugins', count: userPlugins.length, children: [] };
  userPlugins.forEach(function(p) {
    var name = p.name || 'unknown';
    var mkt = p.marketplace || '';
    var skills = pluginSkills.filter(function(s) { return s.pluginName === name && (s.marketplace || '') === mkt; });
    var cmds = pluginCommands.filter(function(c) { return c.pluginName === name && (c.marketplace || '') === mkt; });
    var agents = pluginAgentsData.filter(function(a) { return a.pluginName === name && (a.marketplace || '') === mkt; });
    var hooks = pluginHooksData.filter(function(h) { return h.pluginName === name && (h.marketplace || '') === mkt; });
    var pluginId = mkt ? 'plugin:' + mkt + ':' + name : 'plugin:' + name;
    var child = { id: pluginId, icon:ICONS.plugin, label: name, type:'plugin', data: p, dimmed: p.enabled === false, children: [] };
    skills.forEach(function(s) { child.children.push({ id:'plugin-skill:'+name+':'+s.name, icon:ICONS.skill, label: '/'+s.name, type:'skill', data: Object.assign({}, s, {source:'plugin', pluginName:name}), children: buildFileChildren(s.files || [], 'plugin-skill:'+name+':'+s.name) }); });
    cmds.forEach(function(c) { child.children.push({ id:'plugin-cmd:'+name+':'+c.name, icon:ICONS.command, label: '/'+c.name, type:'plugin-command', data: Object.assign({}, c, {source:'plugin', pluginName:name}) }); });
    agents.forEach(function(a) { child.children.push({ id:'plugin-agent:'+name+':'+a.name, icon:ICONS.agent, label: a.name, type:'plugin-agent', data: Object.assign({}, a, {source:'plugin', pluginName:name}) }); });
    hooks.forEach(function(h) { child.children.push({ id:'plugin-hook:'+name+':'+h.event, icon:ICONS.hook, label: h.event, type:'plugin-hook', data: Object.assign({}, h, {source:'plugin', pluginName:name}) }); });
    if (p.files && p.files.length) {
      var allFilesNode = { id:'plugin-files:'+name, icon:ICONS['all-files'], label:'All Files', type:'directory', data: { name:'All Files', type:'directory', children: p.files, path: p.installPath }, children: buildFileChildren(p.files, 'plugin-files:'+name) };
      child.children.push(allFilesNode);
    }
    uPlugins.children.push(child);
  });
  userNode.children.push(uPlugins);

  var unlinkedPlugins = plugins.filter(function(p) { return p.scope === 'project' && p.unlinked; });
  var uUnlinked = { id:'user-unlinked-plugins', icon:ICONS.unlinked, label:'Unlinked Plugins', count: unlinkedPlugins.length, children: [] };
  unlinkedPlugins.forEach(function(p) {
    var name = p.name || 'unknown';
    var label = name + (p.projectPath ? '  (' + p.projectPath + ')' : '');
    uUnlinked.children.push({ id:'plugin:unlinked:'+name, icon:ICONS.plugin, label: label, type:'plugin', data: p, children: [] });
  });
  if (unlinkedPlugins.length) userNode.children.push(uUnlinked);

  var userSkills = D.userSkills || [];
  var uSkills = { id:'user-skills', icon:ICONS.skill, label:'Skills', count: userSkills.length, children: [] };
  userSkills.forEach(function(s) {
    var skillNode = { id:'skill:'+s.name, icon:ICONS.skill, label: '/'+s.name, type:'skill', data: Object.assign({}, s, {source:'personal'}), children: buildFileChildren(s.files || [], 'skill:'+s.name) };
    uSkills.children.push(skillNode);
  });
  userNode.children.push(uSkills);

  var userCommands = D.userCommands || [];
  var uCommands = { id:'user-commands', icon:ICONS.command, label:'Commands', count: userCommands.length, children: [] };
  userCommands.forEach(function(c) { uCommands.children.push({ id:'command:'+c.name, icon:ICONS.command, label: '/'+c.name, type:'command', data: Object.assign({}, c, {source:'personal'}) }); });
  userNode.children.push(uCommands);

  var uMcp = { id:'user-mcp', icon:ICONS.mcp, label:'MCP Servers', count: Object.keys(allMcp).length, children: [] };
  Object.entries(allMcp).forEach(function(e) { uMcp.children.push({ id:'mcp:'+e[0], icon:ICONS.mcp, label: e[0], type:'mcp', data: Object.assign({ name: e[0] }, e[1]) }); });
  userNode.children.push(uMcp);

  var uAgents = { id:'user-agents', icon:ICONS.agent, label:'Agents', count: (D.userAgents||[]).length, children: [] };
  (D.userAgents||[]).forEach(function(a) { uAgents.children.push({ id:'agent:'+a.name, icon:ICONS.agent, label: a.name, type:'agent', data: Object.assign({}, a, {scope:'user'}) }); });
  userNode.children.push(uAgents);

  userNode.children.push({ id:'claudemd:user', icon:ICONS.claudemd, label:'CLAUDE.md', type:'claudemd', data: { id:'claudemd:user', label:'User CLAUDE.md', scope:'user', data: D.userClaudeMd } });

  var uRules = { id:'user-rules', icon:ICONS.rule, label:'Rules', count: (D.userRules||[]).length, children: [] };
  (D.userRules||[]).forEach(function(r) { uRules.children.push({ id:'rule:u:'+r.name, icon:ICONS.rule, label: r.name, type:'rule', data: Object.assign({}, r, {scope:'user'}) }); });
  userNode.children.push(uRules);

  var uHooks = { id:'user-hooks', icon:ICONS.hook, label:'Hooks', count: 0, children: [] };
  (D.hookEvents||[]).forEach(function(he) {
    var handlers = D.userSettings && D.userSettings.hooks ? D.userSettings.hooks[he.name] : undefined;
    var arr = handlers ? (Array.isArray(handlers) ? handlers : [handlers]) : [];
    uHooks.count += arr.length;
    var eventNode = { id:'hook:u:'+he.name, icon: he.icon, label: he.name, type:'hook', data: he, dimmed: !arr.length, count: arr.length, children: [] };
    arr.forEach(function(h, i) {
      var label = h.matcher || '(all)';
      eventNode.children.push({ id:'hook:u:'+he.name+':'+i, icon:ICONS.hook, label: label, type:'hook-handler', data: Object.assign({}, h, { event: he.name, scope: 'user', settingsPath: D.userSettingsPath }) });
    });
    uHooks.children.push(eventNode);
  });
  userNode.children.push(uHooks);

  userNode.children.push({ id:'settings:user', icon:ICONS.settings, label:'Settings', type:'settings-layer', data: { scope:'user', label:'User', data: D.userSettings } });

  var mktCats = D.marketplaceCatalogs || {};
  var knownNames = new Set(mkts.map(function(e) { return e[0]; }));
  var installSources = new Set(plugins.map(function(p) { return p.marketplace; }).filter(Boolean));
  var extraMkts = Array.from(installSources).filter(function(n) { return !knownNames.has(n) && mktCats[n]; });
  var mktNode = { id:'marketplaces', icon:ICONS.marketplace, label:'Marketplaces', count: mkts.length + extraMkts.length, children: [] };
  mkts.forEach(function(e) { mktNode.children.push({ id:'mkt:'+e[0], icon:ICONS.marketplace, label: e[0], type:'marketplace', data: Object.assign({name: e[0]}, e[1]) }); });
  extraMkts.forEach(function(name) { mktNode.children.push({ id:'mkt:'+name, icon:ICONS.marketplace, label: name, type:'marketplace', data: {name: name} }); });
  userNode.children.push(mktNode);

  // === PROJECT ===
  var projPath = D.projectPath || 'Current Project';
  var projLabel = projPath.split('\\').pop() || projPath.split('/').pop() || projPath;
  var projNode = { id:'scope-project', icon:ICONS.project, label:'Project (' + projLabel + ')', children: [] };

  var projPlugins = plugins.filter(function(p) { return p.scope === 'project' && p.currentProject; });
  var pPlugins = { id:'proj-plugins', icon:ICONS.plugin, label:'Plugins', count: projPlugins.length, children: [] };
  projPlugins.forEach(function(p) {
    var name = p.name || 'unknown';
    var mkt = p.marketplace || '';
    var pSkillsList = pluginSkills.filter(function(s) { return s.pluginName === name && (s.marketplace || '') === mkt; });
    var pCmds = pluginCommands.filter(function(c) { return c.pluginName === name && (c.marketplace || '') === mkt; });
    var pAgentsList = pluginAgentsData.filter(function(a) { return a.pluginName === name && (a.marketplace || '') === mkt; });
    var pHooksList = pluginHooksData.filter(function(h) { return h.pluginName === name && (h.marketplace || '') === mkt; });
    var pluginId = mkt ? 'plugin:p:' + mkt + ':' + name : 'plugin:p:' + name;
    var child = { id: pluginId, icon:ICONS.plugin, label: name, type:'plugin', data: p, dimmed: p.enabled === false, children: [] };
    pSkillsList.forEach(function(s) { child.children.push({ id:'plugin-skill:p:'+name+':'+s.name, icon:ICONS.skill, label: '/'+s.name, type:'skill', data: Object.assign({}, s, {source:'plugin', pluginName:name}), children: buildFileChildren(s.files || [], 'plugin-skill:p:'+name+':'+s.name) }); });
    pCmds.forEach(function(c) { child.children.push({ id:'plugin-cmd:p:'+name+':'+c.name, icon:ICONS.command, label: '/'+c.name, type:'plugin-command', data: Object.assign({}, c, {source:'plugin', pluginName:name}) }); });
    pAgentsList.forEach(function(a) { child.children.push({ id:'plugin-agent:p:'+name+':'+a.name, icon:ICONS.agent, label: a.name, type:'plugin-agent', data: Object.assign({}, a, {source:'plugin', pluginName:name}) }); });
    pHooksList.forEach(function(h) { child.children.push({ id:'plugin-hook:p:'+name+':'+h.event, icon:ICONS.hook, label: h.event, type:'plugin-hook', data: Object.assign({}, h, {source:'plugin', pluginName:name}) }); });
    if (p.files && p.files.length) {
      var allFilesNode = { id:'plugin-files:p:'+name, icon:ICONS['all-files'], label:'All Files', type:'directory', data: { name:'All Files', type:'directory', children: p.files, path: p.installPath }, children: buildFileChildren(p.files, 'plugin-files:p:'+name) };
      child.children.push(allFilesNode);
    }
    pPlugins.children.push(child);
  });
  projNode.children.push(pPlugins);

  var pSkills = { id:'proj-skills', icon:ICONS.skill, label:'Skills', count: (D.projectSkills||[]).length, children: [] };
  (D.projectSkills||[]).forEach(function(s) {
    var skillNode = { id:'skill:p:'+s.name, icon:ICONS.skill, label: '/'+s.name, type:'skill', data: Object.assign({}, s, {source:'project'}), children: buildFileChildren(s.files || [], 'skill:p:'+s.name) };
    pSkills.children.push(skillNode);
  });
  projNode.children.push(pSkills);

  var pCommands = { id:'proj-commands', icon:ICONS.command, label:'Commands', count: (D.projectCommands||[]).length, children: [] };
  (D.projectCommands||[]).forEach(function(c) { pCommands.children.push({ id:'command:p:'+c.name, icon:ICONS.command, label: '/'+c.name, type:'command', data: Object.assign({}, c, {source:'project'}) }); });
  projNode.children.push(pCommands);

  var pMcp = { id:'proj-mcp', icon:ICONS.mcp, label:'MCP Servers', count: Object.keys((D.projectMcp && D.projectMcp.mcpServers) || {}).length, children: [] };
  Object.entries((D.projectMcp && D.projectMcp.mcpServers) || {}).forEach(function(e) { pMcp.children.push({ id:'mcp:p:'+e[0], icon:ICONS.mcp, label: e[0], type:'mcp', data: { name: e[0], config: e[1], tools: [] } }); });
  projNode.children.push(pMcp);

  var pAgents = { id:'proj-agents', icon:ICONS.agent, label:'Agents', count: (D.projectAgents||[]).length, children: [] };
  (D.projectAgents||[]).forEach(function(a) { pAgents.children.push({ id:'agent:p:'+a.name, icon:ICONS.agent, label: a.name, type:'agent', data: Object.assign({}, a, {scope:'project'}) }); });
  projNode.children.push(pAgents);

  projNode.children.push({ id:'claudemd:project', icon:ICONS.claudemd, label:'CLAUDE.md', type:'claudemd', data: { id:'claudemd:project', label:'Project CLAUDE.md', scope:'project', data: D.projectClaudeMd } });
  projNode.children.push({ id:'claudemd:local', icon:ICONS.claudemd, label:'CLAUDE.local.md', type:'claudemd', data: { id:'claudemd:local', label:'Local CLAUDE.md', scope:'local', data: D.localClaudeMd } });

  var pRules = { id:'proj-rules', icon:ICONS.rule, label:'Rules', count: (D.projectRules||[]).length, children: [] };
  (D.projectRules||[]).forEach(function(r) { pRules.children.push({ id:'rule:p:'+r.name, icon:ICONS.rule, label: r.name, type:'rule', data: Object.assign({}, r, {scope:'project'}) }); });
  projNode.children.push(pRules);

  var pHooks = { id:'proj-hooks', icon:ICONS.hook, label:'Hooks', count: 0, children: [] };
  (D.hookEvents||[]).forEach(function(he) {
    var handlers = D.projectSettings && D.projectSettings.hooks ? D.projectSettings.hooks[he.name] : undefined;
    var arr = handlers ? (Array.isArray(handlers) ? handlers : [handlers]) : [];
    pHooks.count += arr.length;
    var eventNode = { id:'hook:p:'+he.name, icon: he.icon, label: he.name, type:'hook', data: he, dimmed: !arr.length, count: arr.length, children: [] };
    arr.forEach(function(h, i) {
      var label = h.matcher || '(all)';
      eventNode.children.push({ id:'hook:p:'+he.name+':'+i, icon:ICONS.hook, label: label, type:'hook-handler', data: Object.assign({}, h, { event: he.name, scope: 'project', settingsPath: D.projectSettingsPath }) });
    });
    pHooks.children.push(eventNode);
  });
  projNode.children.push(pHooks);

  var pMemory = { id:'proj-memory', icon:ICONS.memory, label:'Auto Memory', count: (D.autoMemory||[]).length, children: [] };
  (D.autoMemory||[]).forEach(function(m) { pMemory.children.push({ id:'memory:'+m.name, icon:ICONS['memory-file'], label: m.name, type:'memory-file', data: m }); });
  projNode.children.push(pMemory);

  projNode.children.push({ id:'settings:project', icon:ICONS.settings, label:'Settings', type:'settings-layer', data: { scope:'project', label:'Project', data: D.projectSettings } });
  projNode.children.push({ id:'settings:local', icon:ICONS.settings, label:'Local Settings', type:'settings-layer', data: { scope:'local', label:'Local', data: D.localSettings } });

  tree.push(userNode);
  tree.push(projNode);

  return tree;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ICONS, fileIcon, formatSize, buildFileChildren, buildTree, resetFileNodeId };
}
