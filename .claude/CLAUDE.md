# cci — Project Context

## What this is
A CLI tool that scans Claude Code configuration and opens a visual dashboard in the browser.

## Publishing
- **GitHub:** https://github.com/ramsayamarin/cci
- **npm:** https://www.npmjs.com/package/claude-cci
- **Launch command:** `cci` (installed via `npm install -g claude-cci` or `npx claude-cci`)

## To publish a new version to npm
Just run:
```bash
npm version patch && git push origin main --follow-tags
```
That's it. GitHub Actions automatically publishes to npm when a version tag is pushed.

## How the auto-publish works
- Workflow file: `.github/workflows/publish.yml`
- Triggers on any tag matching `v*`
- Uses a granular npm access token stored as `NPM_TOKEN` in GitHub Actions secrets
- Token expires **June 20, 2026** — after that, go to npmjs.com → Access Tokens → generate a new granular token with Bypass 2FA checked, then update the secret at https://github.com/ramsayamarin/cci/settings/secrets/actions

## npm account
- Username: `ramsay`
- Email: ramsayamarin@gmail.com
