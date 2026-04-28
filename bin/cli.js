#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { scan } = require('../lib/scan');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: cci [options]

Opens an interactive dashboard showing Claude Code or Copilot CLI configuration.
Mode is auto-detected from your home directory; override with the flags below.

Options:
  -h, --help     Show this help message
  -p, --print    Print an inline summary to the terminal instead of
                 opening the HTML dashboard (excludes marketplaces)
      --copilot  Force Copilot CLI mode (~/.copilot)
      --claude   Force Claude Code mode (~/.claude)`);
  process.exit(0);
}

const VALID_FLAGS = new Set(['--help', '-h', '--print', '-p', '--copilot', '--claude']);
const subcommand = args.find(a => !a.startsWith('-') && !VALID_FLAGS.has(a));
if (subcommand) {
  console.error(`Unknown command: ${subcommand}\nRun cci --help for usage.`);
  process.exit(1);
}

// Scan configuration
const data = scan(undefined, { argv: args });

const wantsPrint = args.some(a => a === '--print' || a === '-p' || a.startsWith('--print=') || a.startsWith('-p='));
if (wantsPrint) {
  require('../lib/print').printInline(data);
  process.exit(0);
}

// Inject into template
const template = fs.readFileSync(path.join(__dirname, '..', 'lib', 'template.html'), 'utf8');
const dashboardModule = fs.readFileSync(path.join(__dirname, '..', 'lib', 'dashboard.js'), 'utf8');
const jsonData = JSON.stringify(data).replace(/<\//g, '<\\/');
const output = template.replace('"__DASHBOARD_MODULE__"', () => dashboardModule)
                       .replace('"__DASHBOARD_DATA__"', () => jsonData);
const outPath = path.join(process.env.TMPDIR || process.env.TEMP || '/tmp', 'cci.html');
fs.writeFileSync(outPath, output);

const platform = process.platform;
try {
  if (platform === 'win32') {
    execSync(`start "" "${outPath}"`, { shell: 'cmd.exe', stdio: 'ignore' });
  } else if (platform === 'darwin') {
    execSync(`open "${outPath}"`, { stdio: 'ignore' });
  } else {
    execSync(`xdg-open "${outPath}"`, { stdio: 'ignore' });
  }
} catch(e) {
  try {
    const winPath = execSync(`cygpath -w "${outPath}"`).toString().trim();
    execSync(`cmd.exe /c start "" "${winPath}"`, { stdio: 'ignore' });
  } catch(e2) {}
}

console.log('Inspector written: ' + outPath);
