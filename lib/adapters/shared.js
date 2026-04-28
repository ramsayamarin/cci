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
    if (SKIP_DIRS.has(name)) continue;
    const fullPath = path.join(dirPath, name);
    if (entry.isDirectory()) {
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

function scanMarketplaceCatalogs(args) {
  const rootDir = args.rootDir;
  const installedPlugins = args.installedPlugins || [];

  const installedByKey = new Set(installedPlugins.map(p => p.name + '@' + p.marketplace));
  const installedByName = {};
  installedPlugins.forEach(p => { if (!installedByName[p.name]) installedByName[p.name] = p.marketplace; });

  const catalogs = {};
  listDirs(rootDir).forEach(mktName => {
    const mktPath = path.join(rootDir, mktName);
    if (!catalogs[mktName]) catalogs[mktName] = { plugins: [], skills: [], agents: [] };
    const entry = catalogs[mktName];

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
        const nestedManifest = readJson(path.join(pPath, '.claude-plugin', 'plugin.json'));
        if (!meta && nestedManifest) meta = nestedManifest;
        let desc = (meta && meta.description) || '';
        if (!desc) {
          const r = readText(path.join(pPath, 'README.md'));
          if (r) {
            const l = r.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('>'));
            if (l) desc = l.trim();
          }
        }
        const name = (meta && meta.name) || pName;
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

  for (const k of Object.keys(catalogs)) {
    const e = catalogs[k];
    if (!e.plugins.length && !e.skills.length && !e.agents.length) delete catalogs[k];
  }
  return catalogs;
}

module.exports = {
  readJson,
  readText,
  listDirs,
  listFiles,
  parseFrontmatter,
  cleanDesc,
  SKIP_DIRS,
  BINARY_EXTS,
  MAX_FILE_SIZE,
  MAX_DEPTH,
  scanDirTree,
  scanSkills,
  scanCommands,
  scanAgents,
  scanRules,
  checkClaudeMd,
  scanMarketplaceCatalogs
};
