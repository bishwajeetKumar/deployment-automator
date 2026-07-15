# Deployment Automator

Automates Jules blue/green (B/G) production deployments end to end — build trigger, jet CLI log monitoring, SNOW ticket entry, gaiapools green-app verification, Splunk error-code monitoring, guarded B/G swap with rollback protection, and email notification.

## Contents

| Folder | What it is |
|--------|------------|
| `deployment-automator/` | Claude Cowork plugin — the `jules-deploy` skill, reference docs, jet log monitor script, Playwright MCP config |
| `deployment-automator-app/` | Full-stack version — React deployment console + Node backend embedding the Claude Agent SDK |

## Quick start

**Cowork plugin:** zip the `deployment-automator/` folder as `deployment-automator.plugin` and install it in Claude Cowork, or use it directly with Claude Code. Fill in the `TBD` values in `skills/jules-deploy/references/config.md`.

**React app:** see `deployment-automator-app/README.md`. In short: fill `server/config.json`, then `npm install && npm start` in `server/` (needs `ANTHROPIC_API_KEY`) and `npm install && npm run dev` in `client/`.

## Safety model

No credentials are stored anywhere — all sites (Jules, Splunk, gaiapools, Outlook) are accessed via your own SSO browser session. Only Splunk error codes 0 and 9999 are considered healthy during the 15-minute post-deploy window. The post-swap "prod validation testing complete" prompt is never auto-confirmed, since confirming it triggers a rollback. Every destructive step (build trigger, B/G swap, email send) requires explicit human approval.
