const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ICONS, buildTree, fileIcon, formatSize } = require('../lib/dashboard');

// Helper: find a node by id in a tree
function findNode(id, nodes) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findNode(id, n.children);
      if (f) return f;
    }
  }
  return null;
}

// Minimal data object for buildTree - empty config
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
    marketplaceCatalogs: {},
    projectPath: '/proj',
    homePath: '/home',
    hookEvents: [
      { name: 'PreToolUse', description: 'Runs before a tool is executed', icon: '\u23F3', matcherInput: 'tool name' },
      { name: 'PostToolUse', description: 'Runs after a tool completes', icon: '\u2705', matcherInput: 'tool name' },
      { name: 'Notification', description: 'Runs when Claude wants to notify the user', icon: '\uD83D\uDD14', matcherInput: 'notification type' },
      { name: 'Stop', description: 'Runs when Claude finishes its response', icon: '\uD83D\uDED1', matcherInput: 'stop reason' },
      { name: 'SubagentStop', description: 'Runs when a subagent finishes', icon: '\uD83E\uDD16', matcherInput: 'stop reason' },
      { name: 'SessionStart', description: 'Runs when a new session begins', icon: '\uD83D\uDE80' },
      { name: 'SessionStop', description: 'Runs when a session ends', icon: '\uD83C\uDFC1' }
    ]
  };
}

// --- ICONS ---

describe('ICONS', () => {
  it('has all expected keys', () => {
    const expected = ['user', 'project', 'plugin', 'skill', 'command', 'agent', 'hook', 'mcp', 'rule', 'claudemd', 'settings', 'marketplace', 'memory', 'memory-file', 'unlinked', 'all-files'];
    for (const key of expected) {
      assert.ok(ICONS[key], `ICONS.${key} should exist`);
      assert.ok(ICONS[key].length > 0, `ICONS.${key} should not be empty`);
    }
  });
});

// --- fileIcon ---

describe('fileIcon', () => {
  it('returns folder icon for directories', () => {
    assert.equal(fileIcon('src', true), '\u{1F4C1}');
  });

  it('returns correct icon for known extensions', () => {
    assert.equal(fileIcon('app.js', false), '\u{1F4DC}');
    assert.equal(fileIcon('README.md', false), '\u{1F4DD}');
    assert.equal(fileIcon('config.json', false), '\u{1F4CB}');
  });

  it('returns default icon for unknown extensions', () => {
    assert.equal(fileIcon('data.xyz', false), '\u{1F4C4}');
  });
});

// --- formatSize ---

describe('formatSize', () => {
  it('formats bytes', () => { assert.equal(formatSize(500), '500 B'); });
  it('formats KB', () => { assert.equal(formatSize(2048), '2.0 KB'); });
  it('formats MB', () => { assert.equal(formatSize(1048576), '1.0 MB'); });
  it('returns empty for falsy non-zero', () => { assert.equal(formatSize(null), ''); });
});

// --- buildTree: basic structure ---

describe('buildTree basic structure', () => {
  it('returns two root nodes: user and project', () => {
    const tree = buildTree(emptyData());
    assert.equal(tree.length, 2);
    assert.equal(tree[0].id, 'scope-user');
    assert.equal(tree[1].id, 'scope-project');
  });

  it('user node has correct icon', () => {
    const tree = buildTree(emptyData());
    assert.equal(tree[0].icon, ICONS.user);
  });

  it('project node label includes directory name', () => {
    const tree = buildTree(emptyData());
    assert.ok(tree[1].label.includes('proj'));
  });

  it('user node always has category folders', () => {
    const tree = buildTree(emptyData());
    const user = tree[0];
    const ids = user.children.map(c => c.id);
    assert.ok(ids.includes('user-plugins'));
    assert.ok(ids.includes('user-skills'));
    assert.ok(ids.includes('user-commands'));
    assert.ok(ids.includes('user-mcp'));
    assert.ok(ids.includes('user-agents'));
    assert.ok(ids.includes('user-rules'));
    assert.ok(ids.includes('user-hooks'));
  });
});

// --- buildTree: hooks ---

describe('buildTree hooks', () => {
  it('creates all 7 hook event nodes under user hooks', () => {
    const tree = buildTree(emptyData());
    const uHooks = findNode('user-hooks', tree);
    assert.equal(uHooks.children.length, 7);
  });

  it('creates all 7 hook event nodes under project hooks', () => {
    const tree = buildTree(emptyData());
    const pHooks = findNode('proj-hooks', tree);
    assert.equal(pHooks.children.length, 7);
  });

  it('hook events with no handlers are dimmed', () => {
    const tree = buildTree(emptyData());
    const uHooks = findNode('user-hooks', tree);
    for (const event of uHooks.children) {
      assert.equal(event.dimmed, true, `${event.label} should be dimmed when no handlers`);
    }
  });

  it('hook events with no handlers have count 0', () => {
    const tree = buildTree(emptyData());
    const uHooks = findNode('user-hooks', tree);
    for (const event of uHooks.children) {
      assert.equal(event.count, 0);
    }
  });

  it('hook events with handlers are not dimmed', () => {
    const D = emptyData();
    D.userSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo test' }] }]
      }
    };
    const tree = buildTree(D);
    const pre = findNode('hook:u:PreToolUse', tree);
    assert.equal(pre.dimmed, false);
  });

  it('hook event count reflects number of handlers', () => {
    const D = emptyData();
    D.userSettings = {
      hooks: {
        PreToolUse: [
          { matcher: 'Write', hooks: [{ type: 'command', command: 'echo 1' }] },
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo 2' }] }
        ]
      }
    };
    const tree = buildTree(D);
    const pre = findNode('hook:u:PreToolUse', tree);
    assert.equal(pre.count, 2);
    assert.equal(pre.children.length, 2);
  });

  it('parent hooks folder aggregates total handler count', () => {
    const D = emptyData();
    D.userSettings = {
      hooks: {
        PreToolUse: [
          { matcher: 'Write', hooks: [{ type: 'command', command: 'echo 1' }] },
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo 2' }] }
        ],
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo done' }] }]
      }
    };
    const tree = buildTree(D);
    const uHooks = findNode('user-hooks', tree);
    assert.equal(uHooks.count, 3);
  });

  it('hook handler nodes have correct type and data', () => {
    const D = emptyData();
    D.userSettings = {
      hooks: {
        PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'npm test' }] }]
      }
    };
    const tree = buildTree(D);
    const handler = findNode('hook:u:PostToolUse:0', tree);
    assert.equal(handler.type, 'hook-handler');
    assert.equal(handler.label, 'Write');
    assert.equal(handler.data.event, 'PostToolUse');
    assert.equal(handler.data.scope, 'user');
    assert.equal(handler.data.settingsPath, '/home/.claude/settings.json');
  });

  it('handler with empty matcher shows (all) label', () => {
    const D = emptyData();
    D.userSettings = {
      hooks: {
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo done' }] }]
      }
    };
    const tree = buildTree(D);
    const handler = findNode('hook:u:Stop:0', tree);
    assert.equal(handler.label, '(all)');
  });

  it('single handler object (not array) is normalized', () => {
    const D = emptyData();
    D.userSettings = {
      hooks: {
        Stop: { matcher: '', hooks: [{ type: 'command', command: 'echo stop' }] }
      }
    };
    const tree = buildTree(D);
    const stop = findNode('hook:u:Stop', tree);
    assert.equal(stop.count, 1);
    assert.equal(stop.children.length, 1);
  });

  it('hook event nodes use event-specific icon, not generic hook icon', () => {
    const D = emptyData();
    const tree = buildTree(D);
    const pre = findNode('hook:u:PreToolUse', tree);
    assert.equal(pre.icon, '\u23F3'); // hourglass, not hook
    assert.notEqual(pre.icon, ICONS.hook);
  });

  it('hook handler nodes use generic hook icon', () => {
    const D = emptyData();
    D.userSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo' }] }]
      }
    };
    const tree = buildTree(D);
    const handler = findNode('hook:u:PreToolUse:0', tree);
    assert.equal(handler.icon, ICONS.hook);
  });

  it('project hooks use project settings path', () => {
    const D = emptyData();
    D.projectSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo' }] }]
      }
    };
    const tree = buildTree(D);
    const handler = findNode('hook:p:PreToolUse:0', tree);
    assert.equal(handler.data.scope, 'project');
    assert.equal(handler.data.settingsPath, '/proj/.claude/settings.json');
  });
});

// --- buildTree: commands ---

describe('buildTree commands', () => {
  it('user commands appear with correct count', () => {
    const D = emptyData();
    D.userCommands = [
      { name: 'deploy', description: 'Deploy', path: '/commands/deploy.md' },
      { name: 'test', description: 'Test', path: '/commands/test.md' }
    ];
    const tree = buildTree(D);
    const uCmds = findNode('user-commands', tree);
    assert.equal(uCmds.count, 2);
    assert.equal(uCmds.children.length, 2);
  });

  it('command nodes use command icon', () => {
    const D = emptyData();
    D.userCommands = [{ name: 'deploy', description: '', path: '' }];
    const tree = buildTree(D);
    const cmd = findNode('command:deploy', tree);
    assert.equal(cmd.icon, ICONS.command);
  });

  it('command labels are prefixed with /', () => {
    const D = emptyData();
    D.userCommands = [{ name: 'deploy', description: '', path: '' }];
    const tree = buildTree(D);
    const cmd = findNode('command:deploy', tree);
    assert.equal(cmd.label, '/deploy');
  });

  it('project commands use source project', () => {
    const D = emptyData();
    D.projectCommands = [{ name: 'build', description: '', path: '' }];
    const tree = buildTree(D);
    const cmd = findNode('command:p:build', tree);
    assert.equal(cmd.data.source, 'project');
  });
});

// --- buildTree: skills ---

describe('buildTree skills', () => {
  it('user skills appear with correct count', () => {
    const D = emptyData();
    D.userSkills = [{ name: 'review', description: '', path: '', files: [] }];
    const tree = buildTree(D);
    const uSkills = findNode('user-skills', tree);
    assert.equal(uSkills.count, 1);
  });

  it('skill nodes use skill icon', () => {
    const D = emptyData();
    D.userSkills = [{ name: 'review', description: '', path: '', files: [] }];
    const tree = buildTree(D);
    const skill = findNode('skill:review', tree);
    assert.equal(skill.icon, ICONS.skill);
  });
});

// --- buildTree: plugins ---

describe('buildTree plugins', () => {
  it('disabled plugin is dimmed', () => {
    const D = emptyData();
    D.installedPlugins = [{ name: 'test-plugin', scope: 'user', enabled: false }];
    const tree = buildTree(D);
    const plugin = findNode('plugin:test-plugin', tree);
    assert.equal(plugin.dimmed, true);
  });

  it('enabled plugin is not dimmed', () => {
    const D = emptyData();
    D.installedPlugins = [{ name: 'test-plugin', scope: 'user', enabled: true }];
    const tree = buildTree(D);
    const plugin = findNode('plugin:test-plugin', tree);
    assert.equal(plugin.dimmed, false);
  });
});

// --- buildTree: consistent icons ---

describe('buildTree icon consistency', () => {
  it('all category folders use centralized ICONS', () => {
    const tree = buildTree(emptyData());
    const user = tree[0];
    const iconMap = {
      'user-plugins': ICONS.plugin,
      'user-skills': ICONS.skill,
      'user-commands': ICONS.command,
      'user-mcp': ICONS.mcp,
      'user-agents': ICONS.agent,
      'user-rules': ICONS.rule,
      'user-hooks': ICONS.hook,
    };
    for (const [id, expected] of Object.entries(iconMap)) {
      const node = findNode(id, tree);
      assert.equal(node.icon, expected, `${id} should use ICONS constant`);
    }
  });

  it('CLAUDE.md nodes always use claudemd icon (never circles)', () => {
    const tree = buildTree(emptyData());
    const claudeUser = findNode('claudemd:user', tree);
    const claudeProj = findNode('claudemd:project', tree);
    const claudeLocal = findNode('claudemd:local', tree);
    assert.equal(claudeUser.icon, ICONS.claudemd);
    assert.equal(claudeProj.icon, ICONS.claudemd);
    assert.equal(claudeLocal.icon, ICONS.claudemd);
  });

  it('settings nodes always use settings icon (never circles)', () => {
    const tree = buildTree(emptyData());
    const settingsUser = findNode('settings:user', tree);
    const settingsProj = findNode('settings:project', tree);
    const settingsLocal = findNode('settings:local', tree);
    assert.equal(settingsUser.icon, ICONS.settings);
    assert.equal(settingsProj.icon, ICONS.settings);
    assert.equal(settingsLocal.icon, ICONS.settings);
  });
});

// --- buildTree: agents ---

describe('buildTree agents', () => {
  it('user agents appear with count', () => {
    const D = emptyData();
    D.userAgents = [{ name: 'helper', description: '', path: '' }];
    const tree = buildTree(D);
    const uAgents = findNode('user-agents', tree);
    assert.equal(uAgents.count, 1);
    assert.equal(uAgents.children[0].icon, ICONS.agent);
  });
});

// --- buildTree: memory ---

describe('buildTree memory', () => {
  it('memory files appear with correct count and icon', () => {
    const D = emptyData();
    D.autoMemory = [{ name: 'user_role.md', preview: '', path: '' }];
    const tree = buildTree(D);
    const mem = findNode('proj-memory', tree);
    assert.equal(mem.count, 1);
    assert.equal(mem.children[0].icon, ICONS['memory-file']);
  });
});
