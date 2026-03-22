# cci — Claude Code Inspector

A CLI tool that scans your Claude Code configuration and opens a visual dashboard in the browser.

<img src="assets/cci-demo.png" alt="cci dashboard screenshot" width="680">

## Install

```bash
npm install -g claude-cci
```

Or run without installing:

```bash
npx claude-cci
```

## Usage

```bash
cci
```

Run from any project directory. It reads your Claude Code setup and opens a self-contained HTML dashboard in your default browser.

## What it shows

Scans `~/.claude/`, `~/.claude.json`, and the current project's `.claude/` directory:

- **Plugins** — installed plugins, marketplaces, blocked plugins
- **Skills** — user and project-scoped skills
- **MCP Servers** — user and project-scoped MCP server configs
- **Agents** — custom agents at user and project level
- **CLAUDE.md** — user, project, and local instruction files
- **Rules** — glob-scoped instruction rules
- **Hooks** — configured hook events
- **Auto Memory** — memory files Claude has written for your project
- **Settings** — user, project, and local settings with precedence view

## Requirements

Node.js 16+

## License

MIT
