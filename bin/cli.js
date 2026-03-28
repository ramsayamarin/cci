#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { scan } = require('../lib/scan');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: cci

Opens an interactive dashboard showing all Claude Code configuration.`);
  process.exit(0);
}

const subcommand = args.find(a => !a.startsWith('-'));
if (subcommand) {
  console.error(`Unknown command: ${subcommand}\nRun cci --help for usage.`);
  process.exit(1);
}

// Scan configuration
const data = scan();

// Inject into template
const template = fs.readFileSync(path.join(__dirname, '..', 'lib', 'template.html'), 'utf8');
const jsonData = JSON.stringify(data).replace(/<\//g, '<\\/');
const output = template.replace('"__DASHBOARD_DATA__"', () => jsonData);
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
