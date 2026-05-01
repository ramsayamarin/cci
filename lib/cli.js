const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { scan } = require('./scan');

const HELP_TEXT = `Usage: cci   - opens Claude Code dashboard (~/.claude)
       cpi   - opens GitHub Copilot CLI dashboard (~/.copilot)

Options:
  -h, --help     Show this help message
  -p, --print    Print an inline summary to the terminal instead of
                 opening the HTML dashboard (excludes marketplaces)`;

const VALID_FLAGS = new Set(['--help', '-h', '--print', '-p']);

function run(argv, opts) {
  const args = argv || [];
  const mode = opts && opts.mode;

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const subcommand = args.find(a => !a.startsWith('-') && !VALID_FLAGS.has(a));
  if (subcommand) {
    console.error(`Unknown command: ${subcommand}\nRun --help for usage.`);
    process.exit(1);
  }

  const data = scan(undefined, { argv: args, mode });

  const wantsPrint = args.some(a => a === '--print' || a === '-p' || a.startsWith('--print=') || a.startsWith('-p='));
  if (wantsPrint) {
    require('./print').printInline(data);
    process.exit(0);
  }

  const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const dashboardModule = fs.readFileSync(path.join(__dirname, 'dashboard.js'), 'utf8');
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
  } catch (e) {
    try {
      const winPath = execSync(`cygpath -w "${outPath}"`).toString().trim();
      execSync(`cmd.exe /c start "" "${winPath}"`, { stdio: 'ignore' });
    } catch (e2) {}
  }

  console.log('Inspector written: ' + outPath);
}

module.exports = { run };
