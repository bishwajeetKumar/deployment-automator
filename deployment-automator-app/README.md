# Deployment Automator — React app

Full-stack version of the Jules deployment automator: a React deployment console backed by a Node server that runs the agent via the Claude Agent SDK, with the `jules-deploy` skill and Playwright MCP bundled.

## Architecture

```
client/  React (Vite) console — pool picker, parameters, phase timeline,
         live log stream, approval gates, result banner
server/  Express + WebSocket — embeds @anthropic-ai/claude-agent-sdk
         └── plugin/   the deployment-automator plugin (skill + references + jet log script)
```

Flow: the React form collects pools / action / release branch / SNOW ticket / DL → the server starts an agent session loaded with the `jules-deploy` skill and Playwright MCP → the agent drives Jules, jet CLI, gaiapools, Splunk, and Outlook → every human decision (build trigger, unallowed error codes, B/G swap, email send, SSO logins) surfaces in the UI as an approval gate → result banner + email at the end.

Safety guards are enforced in the skill and system prompt: SSO only (no stored credentials), only error codes 0/9999 allowed in the 15-min Splunk window, and the post-swap "prod validation testing complete" prompt is never confirmed (rollback protection).

## Prerequisites

- Node 18+
- `ANTHROPIC_API_KEY` in your environment
- jet CLI installed and on PATH
- Chrome (used by Playwright MCP with a persistent profile at `~/.deployment-automator/browser-profile` so your SSO session survives between runs)

## Setup

```bash
# 1. server
cd server
npm install
# edit config.json — fill in the TBD values (Jules URL, pipeline, Splunk URL, DL)
ANTHROPIC_API_KEY=sk-ant-... npm start        # http://localhost:8787

# 2. client (new terminal)
cd client
npm install
npm run dev                                    # http://localhost:5173
```

Open http://localhost:5173, pick pools (e.g. na-5z, na-5t), set the action (REDEPLOY or BUILD, DEPLOY), release branch, SNOW ticket and DL, then Start deployment.

## UI protocol (how the agent talks to the console)

- `PHASE: <n> — <title>` lines drive the timeline.
- `APPROVAL_REQUIRED: <question>` pauses the run and renders Approve/Deny buttons; your answer is streamed back as `APPROVED` / `DENIED: <reason>`.
- Tool calls not on the allowlist (e.g. arbitrary Bash) surface as separate permission cards.
- `RESULT: SUCCESS` / `RESULT: FAILED — <reason>` sets the final banner.

## Security notes

- No credentials are stored anywhere; all sites use your SSO browser session. When a login page appears the run pauses and asks you to sign in manually.
- The agent's auto-allowed tools are read-only tools + the Playwright MCP. Bash and file writes require your click-through approval in the UI.
- Everything runs locally on your machine; the only external call is to the Anthropic API.
