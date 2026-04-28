# cci — Claude Code & Copilot CLI Inspector

A CLI tool that scans your Claude Code or GitHub Copilot CLI configuration and opens a visual dashboard in the browser.

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

## Copilot CLI mode

`cci` also inspects [GitHub Copilot CLI](https://github.com/github/copilot-cli) configuration. Mode is auto-detected from your home directory (presence of `~/.claude` vs `~/.copilot`); force a specific mode with a flag:

```bash
cci --copilot
cci --claude
```

You can also set `CCI_MODE=copilot-cli` (or `claude-code`) in your environment.

In Copilot CLI mode, the dashboard surfaces:

- **Settings** (`~/.copilot/settings.json`) — model, theme, allowed URLs, enabled plugins
- **Logged-in users**, **trusted folders**, and **session sync** entries (from `~/.copilot/config.json`)
- **MCP Servers** (`~/.copilot/mcp-config.json`)
- **Permissions** — per-folder tool approvals (`~/.copilot/permissions-config.json`); the current working directory is highlighted, missing folders are dimmed
- **Plugins** under `~/.copilot/installed-plugins/<marketplace>/<plugin>/` along with their skills, commands, agents, and hooks
- **Marketplaces** cached under `~/.copilot/marketplace-cache/`

Copilot CLI has no project-level config directory, so the *Project* scope is empty in that mode.

## Flags

| Flag | Description |
|---|---|
| `-h`, `--help` | Show help |
| `-p`, `--print` | Print an inline summary to the terminal instead of opening the dashboard |
| `--copilot` | Force Copilot CLI mode |
| `--claude` | Force Claude Code mode |

## Requirements

Node.js 16+

## License

MIT
