const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { scan, parseFrontmatter, scanCommands } = require('../lib/scan');

// Helper: create a temp directory tree for testing
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cci-test-'));
}

function writeFile(base, relPath, content) {
  const full = path.join(base, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function writeJson(base, relPath, obj) {
  writeFile(base, relPath, JSON.stringify(obj, null, 2));
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- parseFrontmatter ---

describe('parseFrontmatter', () => {
  it('parses name and description', () => {
    const fm = parseFrontmatter('---\nname: test\ndescription: A test command\n---\nBody');
    assert.equal(fm.name, 'test');
    assert.equal(fm.description, 'A test command');
  });

  it('returns empty object for no frontmatter', () => {
    const fm = parseFrontmatter('Just some text');
    assert.deepEqual(fm, {});
  });

  it('returns empty object for null input', () => {
    const fm = parseFrontmatter(null);
    assert.deepEqual(fm, {});
  });

  it('parses boolean values', () => {
    const fm = parseFrontmatter('---\nenabled: true\ndisabled: false\n---');
    assert.equal(fm.enabled, true);
    assert.equal(fm.disabled, false);
  });

  it('strips quotes from values', () => {
    const fm = parseFrontmatter('---\nname: "quoted value"\n---');
    assert.equal(fm.name, 'quoted value');
  });

  it('handles argument-hint field', () => {
    const fm = parseFrontmatter('---\nargument-hint: <branch>\n---');
    assert.equal(fm['argument-hint'], '<branch>');
  });

  it('handles CRLF line endings', () => {
    const fm = parseFrontmatter('---\r\nname: crlf-test\r\ndescription: Works with CRLF\r\n---\r\nBody');
    assert.equal(fm.name, 'crlf-test');
    assert.equal(fm.description, 'Works with CRLF');
  });
});

// --- scanCommands ---

describe('scanCommands', () => {
  let tmp;

  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { rmrf(tmp); });

  it('scans .md files with frontmatter', () => {
    writeFile(tmp, 'deploy.md', '---\nname: deploy\ndescription: Deploy to prod\nargument-hint: <env>\n---\nDeploy steps here\nLine 2\nLine 3');
    const cmds = scanCommands(tmp);
    assert.equal(cmds.length, 1);
    assert.equal(cmds[0].name, 'deploy');
    assert.equal(cmds[0].description, 'Deploy to prod');
    assert.equal(cmds[0].argumentHint, '<env>');
    assert.equal(cmds[0].lines, 8);
  });

  it('falls back to filename when no frontmatter name', () => {
    writeFile(tmp, 'my-command.md', 'No frontmatter here');
    const cmds = scanCommands(tmp);
    assert.equal(cmds[0].name, 'my-command');
  });

  it('returns empty array for nonexistent directory', () => {
    const cmds = scanCommands(path.join(tmp, 'nope'));
    assert.deepEqual(cmds, []);
  });

  it('only scans .md files', () => {
    writeFile(tmp, 'command.md', '---\nname: real\n---');
    writeFile(tmp, 'notes.txt', 'not a command');
    const cmds = scanCommands(tmp);
    assert.equal(cmds.length, 1);
    assert.equal(cmds[0].name, 'real');
  });
});

// --- scan() parameterization ---

describe('scan() with injected paths', () => {
  let home, cwd;

  beforeEach(() => {
    home = makeTempDir();
    cwd = makeTempDir();
    // Minimal directory structure
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  });

  afterEach(() => {
    rmrf(home);
    rmrf(cwd);
  });

  it('uses injected home path, not real HOME', () => {
    const result = scan(null, { home, cwd });
    assert.equal(result.homePath, home);
    assert.ok(result.userSettingsPath.startsWith(home));
  });

  it('uses injected cwd path', () => {
    const result = scan(null, { home, cwd });
    assert.equal(result.projectPath, cwd);
    assert.ok(result.projectSettingsPath.startsWith(cwd));
  });

  it('reads user settings from injected home', () => {
    writeJson(home, '.claude/settings.json', { model: 'opus' });
    const result = scan(null, { home, cwd });
    assert.equal(result.userSettings.model, 'opus');
  });

  it('reads project settings from injected cwd', () => {
    writeJson(cwd, '.claude/settings.json', { model: 'sonnet' });
    const result = scan(null, { home, cwd });
    assert.equal(result.projectSettings.model, 'sonnet');
  });

  it('scans user commands from injected home', () => {
    writeFile(home, '.claude/commands/greet.md', '---\nname: greet\ndescription: Say hello\n---\nHello!');
    const result = scan(null, { home, cwd });
    assert.equal(result.userCommands.length, 1);
    assert.equal(result.userCommands[0].name, 'greet');
  });

  it('scans project commands from injected cwd', () => {
    writeFile(cwd, '.claude/commands/build.md', '---\nname: build\n---\nBuild steps');
    const result = scan(null, { home, cwd });
    assert.equal(result.projectCommands.length, 1);
    assert.equal(result.projectCommands[0].name, 'build');
  });

  it('detects skill-originated commands via content hash', () => {
    const content = '---\nname: from-skill\n---\nThis came from a skill';
    // Create skill with prompt file matching command content
    writeFile(home, '.claude/skills/my-skill/SKILL.md', '---\nname: my-skill\n---');
    writeFile(home, '.claude/skills/my-skill/prompts/from-skill.md', content);
    // Create command with identical content
    writeFile(home, '.claude/commands/from-skill.md', content);
    const result = scan(null, { home, cwd });
    assert.equal(result.userCommands[0].originSkill, 'my-skill');
  });

  it('does not flag non-matching commands as skill-originated', () => {
    writeFile(home, '.claude/skills/my-skill/SKILL.md', '---\nname: my-skill\n---');
    writeFile(home, '.claude/skills/my-skill/prompts/prompt.md', 'Skill content');
    writeFile(home, '.claude/commands/different.md', 'Different content');
    const result = scan(null, { home, cwd });
    assert.equal(result.userCommands[0].originSkill, undefined);
  });

  it('includes hookEvents in output', () => {
    const result = scan(null, { home, cwd });
    assert.ok(Array.isArray(result.hookEvents));
    assert.equal(result.hookEvents.length, 7);
    const names = result.hookEvents.map(h => h.name);
    assert.ok(names.includes('PreToolUse'));
    assert.ok(names.includes('Stop'));
    assert.ok(names.includes('SessionStart'));
  });
});
